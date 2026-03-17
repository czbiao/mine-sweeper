const Game = require('./Game');

class GameManager {
  constructor() {
    this.singlePlayerGames = new Map(); // userId -> Game
    this.multiplayerGames = new Map();  // roomId -> { game: Game, players: Map }
  }

  // 单机游戏
  createSinglePlayerGame(userId, difficulty, rows, cols, mines) {
    const game = new Game(rows, cols, mines);
    this.singlePlayerGames.set(userId, game);
    return game;
  }

  getSinglePlayerGame(userId) {
    return this.singlePlayerGames.get(userId);
  }

  removeSinglePlayerGame(userId) {
    this.singlePlayerGames.delete(userId);
  }

  // 多人游戏
  createMultiplayerGame(roomId, rows, cols, mines) {
    const game = new Game(rows, cols, mines);
    this.multiplayerGames.set(roomId, {
      game,
      players: new Map(),
      currentRound: 1,
      maxRounds: 3
    });
    return game;
  }

  getMultiplayerGame(roomId) {
    return this.multiplayerGames.get(roomId);
  }

  removeMultiplayerGame(roomId) {
    this.multiplayerGames.delete(roomId);
  }

  // 获取游戏公开信息（不包含地雷位置）
  getPublicGameState(roomId) {
    const roomData = this.multiplayerGames.get(roomId);
    if (!roomData) return null;
    
    const { game, players } = roomData;
    const board = game.getBoard();
    
    // 只返回每个玩家已翻开的格子
    const playerStates = {};
    players.forEach((state, userId) => {
      playerStates[userId] = {
        revealed: state.revealed || [],
        flagged: state.flagged || [],
        finished: state.finished,
        score: state.score
      };
    });

    return {
      rows: game.rows,
      cols: game.cols,
      mines: game.mines,
      gameOver: game.gameOver,
      won: game.won,
      currentRound: roomData.currentRound,
      maxRounds: roomData.maxRounds,
      playerStates
    };
  }
}

module.exports = new GameManager();
