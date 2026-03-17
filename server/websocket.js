const WebSocket = require('ws');
const db = require('./db/database');
const gameManager = require('./game/GameManager');

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server, path: '/ws' });

  // 存储连接: userId -> ws
  const connections = new Map();
  // 房间 -> 玩家连接集合
  const roomConnections = new Map();

  wss.on('connection', (ws) => {
    let currentUserId = null;
    let currentRoomId = null;

    console.log('新的WebSocket连接');

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        console.log('收到消息:', data);

        switch (data.type) {
          case 'auth':
            handleAuth(ws, data, (userId) => {
              currentUserId = userId;
              connections.set(userId, ws);
            });
            break;

          case 'join_room':
            handleJoinRoom(ws, data, currentUserId, (roomId) => {
              currentRoomId = roomId;
              if (!roomConnections.has(roomId)) {
                roomConnections.set(roomId, new Set());
              }
              roomConnections.get(roomId).add(ws);
              broadcastRoomUpdate(roomId);
            });
            break;

          case 'leave_room':
            handleLeaveRoom(currentRoomId, currentUserId, ws);
            currentRoomId = null;
            break;

          case 'player_ready':
            handlePlayerReady(currentRoomId, currentUserId, data.ready);
            broadcastRoomUpdate(currentRoomId);
            break;

          case 'start_game':
            handleStartGame(currentRoomId, currentUserId);
            break;

          case 'reveal_cell':
            handleRevealCell(currentRoomId, currentUserId, data.row, data.col);
            break;

          case 'flag_cell':
            handleFlagCell(currentRoomId, currentUserId, data.row, data.col);
            break;
        }
      } catch (error) {
        console.error('处理消息错误:', error);
        ws.send(JSON.stringify({ type: 'error', message: error.message }));
      }
    });

    ws.on('close', () => {
      if (currentRoomId && currentUserId) {
        handleLeaveRoom(currentRoomId, currentUserId, ws);
      }
      if (currentUserId) {
        connections.delete(currentUserId);
      }
    });
  });

  // 处理用户认证
  function handleAuth(ws, data, callback) {
    const { device_id, nickname } = data;
    const user = db.createUser(device_id, nickname);
    ws.send(JSON.stringify({ 
      type: 'auth_success', 
      user_id: user.id,
      nickname: user.nickname 
    }));
    callback(user.id);
  }

  // 处理加入房间
  function handleJoinRoom(ws, data, userId, callback) {
    const { room_id } = data;
    const room = db.getRoomById(room_id);
    
    if (!room) {
      ws.send(JSON.stringify({ type: 'error', message: '房间不存在' }));
      return;
    }

    if (room.status !== 'waiting') {
      ws.send(JSON.stringify({ type: 'error', message: '游戏已开始' }));
      return;
    }

    const players = db.getRoomPlayers(room.id);
    const existingPlayer = players.find(p => p.user_id === userId);

    if (!existingPlayer) {
      if (players.length >= 4) {
        ws.send(JSON.stringify({ type: 'error', message: '房间已满' }));
        return;
      }
      const position = players.length + 1;
      db.addPlayerToRoom(room.id, userId, position);
    }

    callback(room.id);
  }

  // 处理离开房间
  function handleLeaveRoom(roomId, userId, ws) {
    if (!roomId) return;

    const room = db.getRoomById(roomId);
    if (!room) return;

    db.removePlayerFromRoom(roomId, userId);

    // 如果房主离开，删除房间
    if (room.host_user_id === userId) {
      db.deleteRoom(roomId);
      gameManager.removeMultiplayerGame(roomId);
      broadcastToRoom(roomId, { type: 'room_deleted', message: '房主已离开房间' });
      roomConnections.delete(roomId);
      return;
    }

    const players = db.getRoomPlayers(roomId);
    if (players.length === 0) {
      db.deleteRoom(roomId);
      gameManager.removeMultiplayerGame(roomId);
      roomConnections.delete(roomId);
    } else {
      broadcastRoomUpdate(roomId);
    }
  }

  // 处理玩家准备
  function handlePlayerReady(roomId, userId, ready) {
    db.updatePlayerReady(roomId, userId, ready);
  }

  // 处理开始游戏
  function handleStartGame(roomId, userId) {
    const room = db.getRoomById(roomId);
    if (!room || room.host_user_id !== userId) {
      return;
    }

    const players = db.getRoomPlayers(roomId);
    const readyPlayers = players.filter(p => p.ready);

    if (readyPlayers.length < 2) {
      broadcastToRoom(roomId, { 
        type: 'error', 
        message: '至少需要2人准备才能开始' 
      });
      return;
    }

    // 创建游戏实例
    const gameData = gameManager.createMultiplayerGame(
      roomId, 
      room.rows, 
      room.cols, 
      room.mines
    );

    // 初始化每个玩家的状态
    players.forEach(player => {
      gameData.players.set(player.user_id, {
        revealed: [],
        flagged: [],
        finished: false,
        score: 0
      });
    });

    db.updateRoomStatus(roomId, 'playing');

    // 广播游戏开始
    broadcastToRoom(roomId, {
      type: 'game_start',
      rows: room.rows,
      cols: room.cols,
      mines: room.mines,
      players: players.map(p => ({ 
        user_id: p.user_id, 
        nickname: p.nickname,
        ready: p.ready 
      }))
    });
  }

  // 处理翻开格子
  function handleRevealCell(roomId, userId, row, col) {
    const roomData = gameManager.getMultiplayerGame(roomId);
    if (!roomData) return;

    const { game, players } = roomData;
    const playerState = players.get(userId);
    if (!playerState) return;

    const result = game.reveal(row, col);
    
    // 更新玩家状态
    if (!playerState.revealed) playerState.revealed = [];
    playerState.revealed.push({ row, col });

    if (result.gameOver) {
      playerState.finished = true;
      
      if (result.won) {
        // 计分：胜者3分
        playerState.score = 3;
      } else {
        playerState.score = 0;
      }
      
      db.updatePlayerScore(roomId, userId, playerState.score);
      db.updatePlayerFinished(roomId, userId, true);

      // 检查是否所有人都完成
      const allFinished = Array.from(players.values()).every(p => p.finished);
      if (allFinished) {
        // 计算最终得分
        const scores = [];
        players.forEach((state, uid) => {
          scores.push({ user_id: uid, score: state.score });
        });
        
        // 排序确定排名
        scores.sort((a, b) => b.score - a.score);
        
        broadcastToRoom(roomId, {
          type: 'game_over',
          won: result.won,
          time_seconds: result.timeSeconds,
          scores,
          leaderboard: scores
        });

        db.updateRoomStatus(roomId, 'finished');
      }
    }

    // 广播游戏更新（只发送必要信息）
    broadcastToRoom(roomId, {
      type: 'game_update',
      user_id: userId,
      row,
      col,
      value: result.gameOver ? game.board[row][col] : game.board[row][col],
      gameOver: result.gameOver,
      won: result.won,
      time_seconds: result.timeSeconds
    });
  }

  // 处理标记格子
  function handleFlagCell(roomId, userId, row, col) {
    const roomData = gameManager.getMultiplayerGame(roomId);
    if (!roomData) return;

    const { game, players } = roomData;
    const playerState = players.get(userId);
    if (!playerState) return;

    const result = game.flag(row, col);
    
    // 更新玩家状态
    if (!playerState.flagged) playerState.flagged = [];
    const existing = playerState.flagged.find(f => f.row === row && f.col === col);
    if (existing) {
      playerState.flagged = playerState.flagged.filter(f => !(f.row === row && f.col === col));
    } else {
      playerState.flagged.push({ row, col });
    }

    broadcastToRoom(roomId, {
      type: 'flag_update',
      user_id: userId,
      row,
      col,
      flagged: result.flagged
    });
  }

  // 广播房间更新
  function broadcastRoomUpdate(roomId) {
    const room = db.getRoomById(roomId);
    if (!room) return;

    const players = db.getRoomPlayers(roomId);

    broadcastToRoom(roomId, {
      type: 'room_update',
      room: {
        id: room.id,
        room_code: room.room_code,
        host_user_id: room.host_user_id,
        status: room.status,
        difficulty: room.difficulty
      },
      players: players.map(p => ({
        user_id: p.user_id,
        nickname: p.nickname,
        position: p.position,
        ready: p.ready,
        score: p.score,
        finished: p.finished
      }))
    });
  }

  // 向房间内所有玩家广播
  function broadcastToRoom(roomId, message) {
    const conns = roomConnections.get(roomId);
    if (!conns) return;

    const messageStr = JSON.stringify(message);
    conns.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
      }
    });
  }

  console.log('WebSocket服务已启动');
}

module.exports = setupWebSocket;
