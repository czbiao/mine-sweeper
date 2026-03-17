const http = require('http');
const app = require('./http');
const setupWebSocket = require('./websocket');
const { initDatabase } = require('./db/database');

const PORT = process.env.PORT || 3000;

// 初始化数据库
initDatabase();

const server = http.createServer(app);

// 设置WebSocket
setupWebSocket(server);

server.listen(PORT, () => {
  console.log(`服务器已启动:`);
  console.log(`- HTTP: http://localhost:${PORT}`);
  console.log(`- WebSocket: ws://localhost:${PORT}/ws`);
});
