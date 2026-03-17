const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'mine-sweeper.db');
const db = new Database(dbPath);

// 初始化数据库表
function initDatabase() {
  db.exec(`
    -- 用户表（匿名用户，设备指纹）
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT UNIQUE NOT NULL,
      nickname TEXT DEFAULT '匿名玩家',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 游戏记录表
    CREATE TABLE IF NOT EXISTS game_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      mode TEXT NOT NULL,
      difficulty TEXT,
      rows INTEGER,
      cols INTEGER,
      mines INTEGER,
      time_seconds INTEGER,
      won BOOLEAN,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- 排行榜表（每日/每周/总榜）
    CREATE TABLE IF NOT EXISTS leaderboard (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      mode TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      best_time INTEGER NOT NULL,
      achieved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- 房间表
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
    );

    -- 房间玩家表
    CREATE TABLE IF NOT EXISTS room_players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      position INTEGER,
      ready BOOLEAN DEFAULT FALSE,
      score INTEGER DEFAULT 0,
      finished BOOLEAN DEFAULT FALSE,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (room_id) REFERENCES rooms(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
  console.log('数据库初始化完成');
}

// 用户操作
function createUser(deviceId, nickname = '匿名玩家') {
  const stmt = db.prepare('INSERT OR IGNORE INTO users (device_id, nickname) VALUES (?, ?)');
  const result = stmt.run(deviceId, nickname);
  return getUserByDeviceId(deviceId);
}

function getUserByDeviceId(deviceId) {
  const stmt = db.prepare('SELECT * FROM users WHERE device_id = ?');
  return stmt.get(deviceId);
}

function getUserById(id) {
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
  return stmt.get(id);
}

// 游戏记录操作
function saveGameRecord(userId, mode, difficulty, rows, cols, mines, timeSeconds, won) {
  const stmt = db.prepare(`
    INSERT INTO game_records (user_id, mode, difficulty, rows, cols, mines, time_seconds, won)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(userId, mode, difficulty, rows, cols, mines, timeSeconds, won);
}

// 排行榜操作
function updateLeaderboard(userId, mode, difficulty, bestTime) {
  // 检查是否已有记录
  const existing = db.prepare(`
    SELECT * FROM leaderboard WHERE user_id = ? AND mode = ? AND difficulty = ?
  `).get(userId, mode, difficulty);

  if (existing) {
    if (bestTime < existing.best_time) {
      db.prepare(`
        UPDATE leaderboard SET best_time = ?, achieved_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(bestTime, existing.id);
    }
  } else {
    db.prepare(`
      INSERT INTO leaderboard (user_id, mode, difficulty, best_time)
      VALUES (?, ?, ?, ?)
    `).run(userId, mode, difficulty, bestTime);
  }
}

function getLeaderboard(mode, difficulty, limit = 10) {
  return db.prepare(`
    SELECT l.*, u.nickname FROM leaderboard l
    JOIN users u ON l.user_id = u.id
    WHERE l.mode = ? AND l.difficulty = ?
    ORDER BY l.best_time ASC
    LIMIT ?
  `).all(mode, difficulty, limit);
}

// 房间操作
function createRoom(hostUserId, difficulty = 'beginner', rows = 9, cols = 9, mines = 10) {
  const roomCode = generateRoomCode();
  const stmt = db.prepare(`
    INSERT INTO rooms (room_code, host_user_id, difficulty, rows, cols, mines)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(roomCode, hostUserId, difficulty, rows, cols, mines);
  
  // 房主自动加入房间
  addPlayerToRoom(result.lastInsertRowid, hostUserId, 1);
  
  return getRoomById(result.lastInsertRowid);
}

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getRoomById(id) {
  return db.prepare('SELECT * FROM rooms WHERE id = ?').get(id);
}

function getRoomByCode(roomCode) {
  return db.prepare('SELECT * FROM rooms WHERE room_code = ?').get(roomCode);
}

function addPlayerToRoom(roomId, userId, position) {
  const stmt = db.prepare(`
    INSERT INTO room_players (room_id, user_id, position)
    VALUES (?, ?, ?)
  `);
  return stmt.run(roomId, userId, position);
}

function getRoomPlayers(roomId) {
  return db.prepare(`
    SELECT rp.*, u.nickname FROM room_players rp
    JOIN users u ON rp.user_id = u.id
    WHERE rp.room_id = ?
    ORDER BY rp.position
  `).all(roomId);
}

function updatePlayerReady(roomId, userId, ready) {
  db.prepare(`
    UPDATE room_players SET ready = ? WHERE room_id = ? AND user_id = ?
  `).run(ready, roomId, userId);
}

function updatePlayerScore(roomId, userId, score) {
  db.prepare(`
    UPDATE room_players SET score = ? WHERE room_id = ? AND user_id = ?
  `).run(score, roomId, userId);
}

function updatePlayerFinished(roomId, userId, finished) {
  db.prepare(`
    UPDATE room_players SET finished = ? WHERE room_id = ? AND user_id = ?
  `).run(finished, roomId, userId);
}

function removePlayerFromRoom(roomId, userId) {
  db.prepare('DELETE FROM room_players WHERE room_id = ? AND user_id = ?').run(roomId, userId);
}

function updateRoomStatus(roomId, status) {
  db.prepare('UPDATE rooms SET status = ? WHERE id = ?').run(status, roomId);
}

function deleteRoom(roomId) {
  db.prepare('DELETE FROM room_players WHERE room_id = ?').run(roomId);
  db.prepare('DELETE FROM rooms WHERE id = ?').run(roomId);
}

module.exports = {
  db,
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
