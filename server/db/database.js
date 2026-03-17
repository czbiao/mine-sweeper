const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'mine-sweeper.db');
let db = null;

// 初始化数据库
async function initDatabase() {
  const SQL = await initSqlJs();
  
  // 尝试加载已有数据库
  let data = null;
  if (fs.existsSync(dbPath)) {
    data = fs.readFileSync(dbPath);
  }
  
  db = new SQL.Database(data);
  
  // 创建表
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT UNIQUE NOT NULL,
      nickname TEXT DEFAULT '匿名玩家',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS game_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      mode TEXT NOT NULL,
      difficulty TEXT,
      rows INTEGER,
      cols INTEGER,
      mines INTEGER,
      time_seconds INTEGER,
      won INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS leaderboard (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      mode TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      best_time INTEGER NOT NULL,
      achieved_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_code TEXT UNIQUE NOT NULL,
      host_user_id INTEGER NOT NULL,
      status TEXT DEFAULT 'waiting',
      difficulty TEXT,
      rows INTEGER DEFAULT 9,
      cols INTEGER DEFAULT 9,
      mines INTEGER DEFAULT 10,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS room_players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      position INTEGER,
      ready INTEGER DEFAULT 0,
      score INTEGER DEFAULT 0,
      finished INTEGER DEFAULT 0,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  saveDatabase();
  console.log('数据库初始化完成');
}

// 保存数据库到文件
function saveDatabase() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

// 用户操作
function createUser(deviceId, nickname = '匿名玩家') {
  try {
    db.run('INSERT OR IGNORE INTO users (device_id, nickname) VALUES (?, ?)', [deviceId, nickname]);
    saveDatabase();
  } catch (e) {}
  return getUserByDeviceId(deviceId);
}

function getUserByDeviceId(deviceId) {
  const stmt = db.prepare('SELECT * FROM users WHERE device_id = ?');
  stmt.bind([deviceId]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function getUserById(id) {
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
  stmt.bind([id]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

// 游戏记录
function saveGameRecord(userId, mode, difficulty, rows, cols, mines, timeSeconds, won) {
  db.run(`
    INSERT INTO game_records (user_id, mode, difficulty, rows, cols, mines, time_seconds, won)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [userId, mode, difficulty, rows, cols, mines, timeSeconds, won ? 1 : 0]);
  
  const result = db.exec('SELECT last_insert_rowid() as id');
  saveDatabase();
  return { lastInsertRowid: result[0].values[0][0] };
}

// 排行榜
function updateLeaderboard(userId, mode, difficulty, bestTime) {
  const existing = db.exec(`
    SELECT * FROM leaderboard WHERE user_id = ${userId} AND mode = '${mode}' AND difficulty = '${difficulty}'
  `);
  
  if (existing.length > 0 && existing[0].values.length > 0) {
    const currentBest = existing[0].values[0][3];
    if (bestTime < currentBest) {
      db.run(`UPDATE leaderboard SET best_time = ?, achieved_at = CURRENT_TIMESTAMP WHERE id = ?`, 
        [bestTime, existing[0].values[0][0]]);
    }
  } else {
    db.run(`INSERT INTO leaderboard (user_id, mode, difficulty, best_time) VALUES (?, ?, ?, ?)`,
      [userId, mode, difficulty, bestTime]);
  }
  saveDatabase();
}

function getLeaderboard(mode, difficulty, limit = 10) {
  const result = db.exec(`
    SELECT l.*, u.nickname FROM leaderboard l
    JOIN users u ON l.user_id = u.id
    WHERE l.mode = '${mode}' AND l.difficulty = '${difficulty}'
    ORDER BY l.best_time ASC
    LIMIT ${limit}
  `);
  
  if (result.length === 0) return [];
  
  const columns = result[0].columns;
  return result[0].values.map(row => {
    const obj = {};
    columns.forEach((col, i) => obj[col] = row[i]);
    return obj;
  });
}

// 房间操作
function createRoom(hostUserId, difficulty = 'beginner', rows = 9, cols = 9, mines = 10) {
  const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  
  db.run(`
    INSERT INTO rooms (room_code, host_user_id, difficulty, rows, cols, mines)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [roomCode, hostUserId, difficulty, rows, cols, mines]);
  
  const result = db.exec('SELECT last_insert_rowid() as id');
  const roomId = result[0].values[0][0];
  
  // 房主自动加入
  db.run(`INSERT INTO room_players (room_id, user_id, position) VALUES (?, ?, ?)`,
    [roomId, hostUserId, 1]);
  
  saveDatabase();
  return getRoomById(roomId);
}

function getRoomById(id) {
  const result = db.exec(`SELECT * FROM rooms WHERE id = ${id}`);
  if (result.length === 0 || result[0].values.length === 0) return null;
  
  const columns = result[0].columns;
  const row = result[0].values[0];
  const obj = {};
  columns.forEach((col, i) => obj[col] = row[i]);
  return obj;
}

function getRoomByCode(roomCode) {
  const result = db.exec(`SELECT * FROM rooms WHERE room_code = '${roomCode}'`);
  if (result.length === 0 || result[0].values.length === 0) return null;
  
  const columns = result[0].columns;
  const row = result[0].values[0];
  const obj = {};
  columns.forEach((col, i) => obj[col] = row[i]);
  return obj;
}

function addPlayerToRoom(roomId, userId, position) {
  db.run(`INSERT INTO room_players (room_id, user_id, position) VALUES (?, ?, ?)`,
    [roomId, userId, position]);
  saveDatabase();
}

function getRoomPlayers(roomId) {
  const result = db.exec(`
    SELECT rp.*, u.nickname FROM room_players rp
    JOIN users u ON rp.user_id = u.id
    WHERE rp.room_id = ${roomId}
    ORDER BY rp.position
  `);
  
  if (result.length === 0) return [];
  
  const columns = result[0].columns;
  return result[0].values.map(row => {
    const obj = {};
    columns.forEach((col, i) => obj[col] = row[i]);
    return obj;
  });
}

function updatePlayerReady(roomId, userId, ready) {
  db.run(`UPDATE room_players SET ready = ? WHERE room_id = ? AND user_id = ?`,
    [ready ? 1 : 0, roomId, userId]);
  saveDatabase();
}

function updatePlayerScore(roomId, userId, score) {
  db.run(`UPDATE room_players SET score = ? WHERE room_id = ? AND user_id = ?`,
    [score, roomId, userId]);
  saveDatabase();
}

function updatePlayerFinished(roomId, userId, finished) {
  db.run(`UPDATE room_players SET finished = ? WHERE room_id = ? AND user_id = ?`,
    [finished ? 1 : 0, roomId, userId]);
  saveDatabase();
}

function removePlayerFromRoom(roomId, userId) {
  db.run('DELETE FROM room_players WHERE room_id = ? AND user_id = ?', [roomId, userId]);
  saveDatabase();
}

function updateRoomStatus(roomId, status) {
  db.run('UPDATE rooms SET status = ? WHERE id = ?', [status, roomId]);
  saveDatabase();
}

function deleteRoom(roomId) {
  db.run('DELETE FROM room_players WHERE room_id = ?', [roomId]);
  db.run('DELETE FROM rooms WHERE id = ?', [roomId]);
  saveDatabase();
}

module.exports = {
  initDatabase,
  createUser,
  getUserByDeviceId,
  getUserById,
  saveGameRecord,
  updateLeaderboard,
  getLeaderboard,
  createRoom,
  getRoomById,
  getRoomByCode,
  addPlayerToRoom,
  getRoomPlayers,
  updatePlayerReady,
  updatePlayerScore,
  updatePlayerFinished,
  removePlayerFromRoom,
  updateRoomStatus,
  deleteRoom
};
