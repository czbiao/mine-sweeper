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

// 前端游戏状态（单机模式）
let gameState = {
  rows: 9,
  cols: 9,
  mines: 10,
  board: [],
  revealed: [],
  flagged: [],
  gameOver: false,
  won: false,
  firstClick: true
};

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

  // 初始化前端游戏状态
  gameState = {
    rows: config.rows,
    cols: config.cols,
    mines: config.mines,
    board: [],
    revealed: [],
    flagged: [],
    gameOver: false,
    won: false,
    firstClick: true
  };

  // 初始化棋盘
  for (let i = 0; i < config.rows; i++) {
    gameState.board[i] = [];
    gameState.revealed[i] = [];
    gameState.flagged[i] = [];
    for (let j = 0; j < config.cols; j++) {
      gameState.board[i][j] = 0;
      gameState.revealed[i][j] = false;
      gameState.flagged[i][j] = false;
    }
  }

  // 创建游戏记录
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

  // 渲染棋盘
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

// 处理点击 - 前端扫雷逻辑
function handleCellClick(row, col) {
  if (gameState.gameOver || gameState.flagged[row][col]) return;
  if (gameState.revealed[row][col]) return;

  // 第一次点击时生成雷区
  if (gameState.firstClick) {
    placeMines(row, col);
    gameState.firstClick = false;
  }

  // 翻开格子
  revealCell(row, col);
  
  // 检查胜利
  if (gameState.gameOver) return;
  
  if (checkWin()) {
    gameState.gameOver = true;
    gameState.won = true;
    stopTimer();
    const timeSeconds = Math.floor((Date.now() - gameStartTime) / 1000);
    showGameResult(true, timeSeconds);
    saveGameResult(timeSeconds, true);
  }
}

// 放置地雷（确保第一次点击不踩雷）
function placeMines(excludeRow, excludeCol) {
  let minesPlaced = 0;
  while (minesPlaced < gameState.mines) {
    const row = Math.floor(Math.random() * gameState.rows);
    const col = Math.floor(Math.random() * gameState.cols);
    
    // 排除第一次点击的位置及其周围
    const isExcluded = Math.abs(row - excludeRow) <= 1 && Math.abs(col - excludeCol) <= 1;
    
    if (gameState.board[row][col] !== -1 && !isExcluded) {
      gameState.board[row][col] = -1;
      minesPlaced++;
    }
  }

  // 计算每个格子周围的雷数
  for (let i = 0; i < gameState.rows; i++) {
    for (let j = 0; j < gameState.cols; j++) {
      if (gameState.board[i][j] !== -1) {
        gameState.board[i][j] = countMines(i, j);
      }
    }
  }
}

// 计算周围雷数
function countMines(row, col) {
  let count = 0;
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      if (i === 0 && j === 0) continue;
      const newRow = row + i;
      const newCol = col + j;
      if (newRow >= 0 && newRow < gameState.rows && newCol >= 0 && newCol < gameState.cols) {
        if (gameState.board[newRow][newCol] === -1) count++;
      }
    }
  }
  return count;
}

// 翻开格子
function revealCell(row, col) {
  if (row < 0 || row >= gameState.rows || col < 0 || col >= gameState.cols) return;
  if (gameState.revealed[row][col] || gameState.flagged[row][col]) return;

  gameState.revealed[row][col] = true;

  const cell = document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
  if (!cell) return;

  cell.classList.add('revealed');

  // 踩雷
  if (gameState.board[row][col] === -1) {
    cell.classList.add('mine');
    cell.textContent = '💣';
    gameState.gameOver = true;
    stopTimer();
    revealAllMines();
    const timeSeconds = Math.floor((Date.now() - gameStartTime) / 1000);
    showGameResult(false, timeSeconds);
    saveGameResult(timeSeconds, false);
    return;
  }

  // 显示数字或空白
  if (gameState.board[row][col] > 0) {
    cell.textContent = gameState.board[row][col];
    cell.dataset.value = gameState.board[row][col];
  } else {
    // 空白格自动展开
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        if (i === 0 && j === 0) continue;
        revealCell(row + i, col + j);
      }
    }
  }
}

// 标记格子
function handleCellFlag(row, col) {
  if (gameState.gameOver || gameState.revealed[row][col]) return;

  gameState.flagged[row][col] = !gameState.flagged[row][col];
  
  const cell = document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
  if (!cell) return;

  if (gameState.flagged[row][col]) {
    cell.classList.add('flagged');
    cell.textContent = '🚩';
  } else {
    cell.classList.remove('flagged');
    cell.textContent = '';
  }

  // 更新剩余雷数
  const flagCount = getFlagCount();
  document.getElementById('mines-count').textContent = gameState.mines - flagCount;
}

// 获取标记数量
function getFlagCount() {
  let count = 0;
  for (let i = 0; i < gameState.rows; i++) {
    for (let j = 0; j < gameState.cols; j++) {
      if (gameState.flagged[i][j]) count++;
    }
  }
  return count;
}

// 检查胜利
function checkWin() {
  let revealedCount = 0;
  for (let i = 0; i < gameState.rows; i++) {
    for (let j = 0; j < gameState.cols; j++) {
      if (gameState.revealed[i][j]) revealedCount++;
    }
  }
  return revealedCount === (gameState.rows * gameState.cols - gameState.mines);
}

// 揭开所有地雷
function revealAllMines() {
  for (let i = 0; i < gameState.rows; i++) {
    for (let j = 0; j < gameState.cols; j++) {
      if (gameState.board[i][j] === -1 && !gameState.flagged[i][j]) {
        const cell = document.querySelector(`.cell[data-row="${i}"][data-col="${j}"]`);
        if (cell && !cell.classList.contains('revealed')) {
          cell.classList.add('revealed');
          cell.textContent = '💣';
        }
      }
    }
  }
}

// 保存游戏结果
async function saveGameResult(timeSeconds, won) {
  try {
    await fetch('/api/game/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: currentUserId,
        mode: 'single',
        difficulty: currentDifficulty,
        rows: gameState.rows,
        cols: gameState.cols,
        mines: gameState.mines,
        time_seconds: timeSeconds,
        won: won
      })
    });
    
    // 更新排行榜
    if (won) {
      loadLeaderboard();
    }
  } catch (error) {
    console.error('保存游戏结果失败:', error);
  }
}

// 显示游戏结果
function showGameResult(won, timeSeconds) {
  const resultEl = document.getElementById('game-result');
  resultEl.classList.remove('hidden', 'win', 'lose');
  
  if (won) {
    resultEl.classList.add('win');
    resultEl.textContent = `🎉 恭喜获胜！用时 ${timeSeconds} 秒`;
  } else {
    resultEl.classList.add('lose');
    resultEl.textContent = '💥 游戏结束';
  }
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
    ready: true
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
