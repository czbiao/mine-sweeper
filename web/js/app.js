// 生成设备ID
function generateDeviceId() {
  let deviceId = localStorage.getItem('mine_sweeper_device_id');
  if (!deviceId) {
    deviceId = 'device_' + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('mine_sweeper_device_id', deviceId);
  }
  return deviceId;
}

const deviceId = generateDeviceId();
document.getElementById('device-id').textContent = deviceId;

// 游戏状态
let currentMode = 'single';
let currentDifficulty = 'beginner';
let currentUserId = null;
let currentRoomId = null;
let ws = null;
let gameTimer = null;
let gameStartTime = null;

// 难度配置
const difficultyConfig = {
  beginner: { rows: 9, cols: 9, mines: 10 },
  intermediate: { rows: 16, cols: 16, mines: 40 },
  expert: { rows: 16, cols: 30, mines: 99 },
  custom: null
};

// 初始化
async function init() {
  await createUser();
  setupEventListeners();
  loadLeaderboard();
}

// 创建用户
async function createUser() {
  try {
    const response = await fetch('/api/user/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: deviceId })
    });
    const data = await response.json();
    currentUserId = data.user.id;
    console.log('用户创建成功:', currentUserId);
  } catch (error) {
    console.error('创建用户失败:', error);
  }
}

// 设置事件监听
function setupEventListeners() {
  // 模式切换
  document.querySelectorAll('.mode-switch button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-switch button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMode = btn.dataset.mode;
      
      document.getElementById('single-mode-panel').classList.toggle('hidden', currentMode !== 'single');
      document.getElementById('multi-mode-panel').classList.toggle('hidden', currentMode !== 'multi');
    });
  });

  // 难度选择
  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentDifficulty = btn.dataset.difficulty;
      
      document.getElementById('custom-settings').classList.toggle('hidden', currentDifficulty !== 'custom');
    });
  });

  // 开始单机游戏
  document.getElementById('start-single').addEventListener('click', startSingleGame);

  // 创建房间
  document.getElementById('create-room').addEventListener('click', createRoom);

  // 加入房间
  document.getElementById('join-room').addEventListener('click', joinRoom);

  // 准备按钮
  document.getElementById('ready-btn').addEventListener('click', toggleReady);

  // 开始游戏按钮
  document.getElementById('start-game-btn').addEventListener('click', startMultiplayerGame);

  // 排行榜难度切换
  document.getElementById('leaderboard-difficulty').addEventListener('change', loadLeaderboard);

  // 重新开始
  document.getElementById('restart-btn').addEventListener('click', () => {
    if (currentMode === 'single') {
      startSingleGame();
    }
  });
}

// 开始单机游戏
async function startSingleGame() {
  let config = difficultyConfig[currentDifficulty];
  
  if (currentDifficulty === 'custom') {
    config = {
      rows: parseInt(document.getElementById('custom-rows').value),
      cols: parseInt(document.getElementById('custom-cols').value),
      mines: parseInt(document.getElementById('custom-mines').value)
    };
  }

  // 创建游戏
  const response = await fetch('/api/game/record', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: currentUserId,
      mode: 'single',
      difficulty: currentDifficulty,
      rows: config.rows,
      cols: config.cols,
      mines: config.mines,
      time_seconds: 0,
      won: false
    })
  });
  const data = await response.json();

  // 初始化前端游戏
  initGameBoard(config.rows, config.cols, config.mines);
  startTimer();
  
  document.getElementById('restart-btn').classList.remove('hidden');
  document.getElementById('game-result').classList.add('hidden');
}

// 初始化游戏棋盘
function initGameBoard(rows, cols, mines) {
  const board = document.getElementById('game-board');
  board.innerHTML = '';
  
  const grid = document.createElement('div');
  grid.className = 'board-grid';
  grid.style.gridTemplateColumns = `repeat(${cols}, 30px)`;
  grid.style.gridTemplateRows = `repeat(${rows}, 30px)`;
  
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const cell = document.createElement('button');
      cell.className = 'cell';
      cell.dataset.row = i;
      cell.dataset.col = j;
      
      cell.addEventListener('click', () => handleCellClick(i, j));
      cell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        handleCellFlag(i, j);
      });
      
      grid.appendChild(cell);
    }
  }
  
  board.appendChild(grid);
  document.getElementById('mines-count').textContent = mines;
}

// 处理点击
async function handleCellClick(row, col) {
  // TODO: 调用后端API
  // 暂时用前端模拟
  console.log('点击格子:', row, col);
}

// 处理标记
function handleCellFlag(row, col) {
  console.log('标记格子:', row, col);
}

// 计时器
function startTimer() {
  gameStartTime = Date.now();
  if (gameTimer) clearInterval(gameTimer);
  
  gameTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - gameStartTime) / 1000);
    document.getElementById('timer').textContent = elapsed;
  }, 1000);
}

function stopTimer() {
  if (gameTimer) {
    clearInterval(gameTimer);
    gameTimer = null;
  }
}

// WebSocket连接
function connectWebSocket() {
  ws = new WebSocket(`ws://${location.host}/ws`);

  ws.onopen = () => {
    console.log('WebSocket连接成功');
    ws.send(JSON.stringify({
      type: 'auth',
      device_id: deviceId
    }));
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleWebSocketMessage(data);
  };

  ws.onerror = (error) => {
    console.error('WebSocket错误:', error);
  };

  ws.onclose = () => {
    console.log('WebSocket连接关闭');
  };
}

// 处理WebSocket消息
function handleWebSocketMessage(data) {
  switch (data.type) {
    case 'auth_success':
      currentUserId = data.user_id;
      break;
      
    case 'room_update':
      updateRoomInfo(data.room, data.players);
      break;
      
    case 'game_start':
      startMultiplayerGameBoard(data);
      break;
      
    case 'game_update':
      updateMultiplayerBoard(data);
      break;
      
    case 'game_over':
      showGameResult(data);
      break;
      
    case 'error':
      alert(data.message);
      break;
  }
}

// 创建房间
async function createRoom() {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    connectWebSocket();
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // 先通过API创建房间
  const response = await fetch('/api/room/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: currentUserId,
      difficulty: currentDifficulty
    })
  });
  const data = await response.json();
  
  if (data.success) {
    currentRoomId = data.room.id;
    
    // 通过WebSocket加入房间
    ws.send(JSON.stringify({
      type: 'join_room',
      room_id: currentRoomId
    }));
    
    document.getElementById('room-info').classList.remove('hidden');
    document.getElementById('display-room-code').textContent = data.room.room_code;
  }
}

// 加入房间
async function joinRoom() {
  const roomCode = document.getElementById('room-code-input').value.trim().toUpperCase();
  if (!roomCode) {
    alert('请输入房间码');
    return;
  }
  
  const response = await fetch('/api/room/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      room_code: roomCode,
      user_id: currentUserId
    })
  });
  const data = await response.json();
  
  if (data.success) {
    currentRoomId = data.room.id;
    
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      connectWebSocket();
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    ws.send(JSON.stringify({
      type: 'join_room',
      room_id: currentRoomId
    }));
    
    document.getElementById('room-info').classList.remove('hidden');
    document.getElementById('display-room-code').textContent = data.room.room_code;
  } else {
    alert(data.error || '加入房间失败');
  }
}

// 更新房间信息
function updateRoomInfo(room, players) {
  const playersList = document.getElementById('players-list');
  playersList.innerHTML = '';
  
  players.forEach(player => {
    const item = document.createElement('div');
    item.className = 'player-item';
    if (player.user_id === room.host_user_id) item.classList.add('host');
    if (player.ready) item.classList.add('ready');
    
    item.innerHTML = `
      <span>${player.nickname}</span>
      <span class="ready-status">${player.ready ? '✓ 已准备' : '未准备'}</span>
    `;
    playersList.appendChild(item);
  });
  
  // 房主显示开始按钮
  const startBtn = document.getElementById('start-game-btn');
  if (room.host_user_id === currentUserId) {
    const allReady = players.length >= 2 && players.every(p => p.ready);
    startBtn.classList.toggle('hidden', !allReady);
  } else {
    startBtn.classList.add('hidden');
  }
}

// 准备/取消准备
function toggleReady() {
  ws.send(JSON.stringify({
    type: 'player_ready',
    ready: true  // TODO: 切换状态
  }));
}

// 开始多人游戏
function startMultiplayerGame() {
  ws.send(JSON.stringify({
    type: 'start_game'
  }));
}

// 开始多人游戏棋盘
function startMultiplayerGameBoard(data) {
  initGameBoard(data.rows, data.cols, data.mines);
  startTimer();
}

// 更新多人游戏棋盘
function updateMultiplayerBoard(data) {
  const cell = document.querySelector(`.cell[data-row="${data.row}"][data-col="${data.col}"]`);
  if (cell) {
    cell.classList.add('revealed');
    if (data.value === -1) {
      cell.classList.add('mine');
      cell.textContent = '💣';
    } else if (data.value > 0) {
      cell.textContent = data.value;
      cell.dataset.value = data.value;
    }
  }
  
  if (data.gameOver) {
    stopTimer();
    document.getElementById('game-result').classList.remove('hidden');
  }
}

// 显示游戏结果
function showGameResult(data) {
  const resultEl = document.getElementById('game-result');
  resultEl.classList.remove('hidden', 'win', 'lose');
  
  if (data.won) {
    resultEl.classList.add('win');
    resultEl.textContent = `🎉 恭喜获胜！用时 ${data.time_seconds} 秒`;
  } else {
    resultEl.classList.add('lose');
    resultEl.textContent = '💥 游戏结束';
  }
}

// 加载排行榜
async function loadLeaderboard() {
  const difficulty = document.getElementById('leaderboard-difficulty').value;
  
  try {
    const response = await fetch(`/api/leaderboard/single/${difficulty}`);
    const data = await response.json();
    
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '';
    
    data.forEach((item, index) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span>${index + 1}. ${item.nickname}</span>
        <span>${item.best_time}秒</span>
      `;
      list.appendChild(li);
    });
    
    if (data.length === 0) {
      list.innerHTML = '<li>暂无记录</li>';
    }
  } catch (error) {
    console.error('加载排行榜失败:', error);
  }
}

// 启动
init();
