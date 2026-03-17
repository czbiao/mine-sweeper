const express = require('express');
const path = require('path');
const db = require('./db/database');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../web')));

// 创建设备用户
app.post('/api/user/create', (req, res) => {
  try {
    const { device_id, nickname } = req.body;
    if (!device_id) {
      return res.status(400).json({ error: 'device_id is required' });
    }
    const user = db.createUser(device_id, nickname);
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取用户信息
app.get('/api/user/:id', (req, res) => {
  try {
    const user = db.getUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 保存游戏记录
app.post('/api/game/record', (req, res) => {
  try {
    const { user_id, mode, difficulty, rows, cols, mines, time_seconds, won } = req.body;
    const result = db.saveGameRecord(user_id, mode, difficulty, rows, cols, mines, time_seconds, won);
    
    // 如果赢了，更新排行榜
    if (won && mode === 'single') {
      db.updateLeaderboard(user_id, mode, difficulty, time_seconds);
    }
    
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取排行榜
app.get('/api/leaderboard/:mode/:difficulty', (req, res) => {
  try {
    const { mode, difficulty } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    const leaderboard = db.getLeaderboard(mode, difficulty, limit);
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 创建房间
app.post('/api/room/create', (req, res) => {
  try {
    const { user_id, difficulty, rows, cols, mines } = req.body;
    
    const difficultyMap = {
      beginner: { rows: 9, cols: 9, mines: 10 },
      intermediate: { rows: 16, cols: 16, mines: 40 },
      expert: { rows: 16, cols: 30, mines: 99 }
    };
    
    const settings = difficultyMap[difficulty] || { rows: 9, cols: 9, mines: 10 };
    const finalRows = rows || settings.rows;
    const finalCols = cols || settings.cols;
    const finalMines = mines || settings.mines;
    
    const room = db.createRoom(user_id, difficulty, finalRows, finalCols, finalMines);
    res.json({ success: true, room });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 加入房间
app.post('/api/room/join', (req, res) => {
  try {
    const { room_code, user_id } = req.body;
    
    if (!room_code || !user_id) {
      return res.status(400).json({ error: 'room_code and user_id are required' });
    }
    
    const room = db.getRoomByCode(room_code.toUpperCase());
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    if (room.status !== 'waiting') {
      return res.status(400).json({ error: 'Game already started' });
    }
    
    const players = db.getRoomPlayers(room.id);
    if (players.length >= 4) {
      return res.status(400).json({ error: 'Room is full' });
    }
    
    // 检查是否已加入
    const existingPlayer = players.find(p => p.user_id === user_id);
    if (!existingPlayer) {
      const position = players.length + 1;
      db.addPlayerToRoom(room.id, user_id, position);
    }
    
    const updatedRoom = db.getRoomById(room.id);
    const updatedPlayers = db.getRoomPlayers(room.id);
    
    res.json({ success: true, room: updatedRoom, players: updatedPlayers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取房间信息
app.get('/api/room/:id', (req, res) => {
  try {
    const room = db.getRoomById(req.params.id);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    const players = db.getRoomPlayers(room.id);
    res.json({ room, players });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = app;
