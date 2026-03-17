// 扫雷核心算法

class Game {
  constructor(rows = 9, cols = 9, mines = 10) {
    this.rows = rows;
    this.cols = cols;
    this.mines = mines;
    this.board = [];
    this.revealed = [];
    this.flagged = [];
    this.gameOver = false;
    this.won = false;
    this.startTime = null;
    this.endTime = null;
    
    this.initBoard();
  }

  initBoard() {
    // 初始化空棋盘
    for (let i = 0; i < this.rows; i++) {
      this.board[i] = [];
      this.revealed[i] = [];
      this.flagged[i] = [];
      for (let j = 0; j < this.cols; j++) {
        this.board[i][j] = 0;
        this.revealed[i][j] = false;
        this.flagged[i][j] = false;
      }
    }
  }

  placeMines(excludeRow, excludeCol) {
    let minesPlaced = 0;
    while (minesPlaced < this.mines) {
      const row = Math.floor(Math.random() * this.rows);
      const col = Math.floor(Math.random() * this.cols);
      
      // 排除第一点击中的位置及其周围
      const isExcluded = Math.abs(row - excludeRow) <= 1 && Math.abs(col - excludeCol) <= 1;
      
      if (this.board[row][col] !== -1 && !isExcluded) {
        this.board[row][col] = -1;
        minesPlaced++;
      }
    }

    // 计算每个格子周围的雷数
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        if (this.board[i][j] !== -1) {
          this.board[i][j] = this.countMines(i, j);
        }
      }
    }
  }

  countMines(row, col) {
    let count = 0;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        if (i === 0 && j === 0) continue;
        const newRow = row + i;
        const newCol = col + j;
        if (this.isValidCell(newRow, newCol) && this.board[newRow][newCol] === -1) {
          count++;
        }
      }
    }
    return count;
  }

  isValidCell(row, col) {
    return row >= 0 && row < this.rows && col >= 0 && col < this.cols;
  }

  reveal(row, col) {
    if (!this.isValidCell(row, col) || this.flagged[row][col] || this.revealed[row][col]) {
      return { success: false, gameOver: this.gameOver, won: this.won };
    }

    if (!this.startTime) {
      this.startTime = Date.now();
      this.placeMines(row, col);
    }

    this.revealed[row][col] = true;

    // 踩雷
    if (this.board[row][col] === -1) {
      this.gameOver = true;
      this.won = false;
      this.endTime = Date.now();
      return { success: false, gameOver: true, won: false, row, col };
    }

    // 空白格自动展开
    if (this.board[row][col] === 0) {
      this.expandEmpty(row, col);
    }

    // 检查胜利
    if (this.checkWin()) {
      this.gameOver = true;
      this.won = true;
      this.endTime = Date.now();
    }

    return { 
      success: true, 
      gameOver: this.gameOver, 
      won: this.won,
      timeSeconds: this.getElapsedTime()
    };
  }

  expandEmpty(row, col) {
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        if (i === 0 && j === 0) continue;
        const newRow = row + i;
        const newCol = col + j;
        if (this.isValidCell(newRow, newCol) && !this.revealed[newRow][newCol] && !this.flagged[newRow][newCol]) {
          this.revealed[newRow][newCol] = true;
          if (this.board[newRow][newCol] === 0) {
            this.expandEmpty(newRow, newCol);
          }
        }
      }
    }
  }

  flag(row, col) {
    if (!this.isValidCell(row, col) || this.revealed[row][col]) {
      return { success: false };
    }
    
    this.flagged[row][col] = !this.flagged[row][col];
    return { 
      success: true, 
      flagged: this.flagged[row][col],
      flagCount: this.getFlagCount()
    };
  }

  getFlagCount() {
    let count = 0;
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        if (this.flagged[i][j]) count++;
      }
    }
    return count;
  }

  checkWin() {
    let revealedCount = 0;
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        if (this.revealed[i][j]) revealedCount++;
      }
    }
    return revealedCount === (this.rows * this.cols - this.mines);
  }

  getElapsedTime() {
    if (!this.startTime) return 0;
    const end = this.endTime || Date.now();
    return Math.floor((end - this.startTime) / 1000);
  }

  getBoard() {
    const displayBoard = [];
    for (let i = 0; i < this.rows; i++) {
      displayBoard[i] = [];
      for (let j = 0; j < this.cols; j++) {
        if (this.revealed[i][j]) {
          displayBoard[i][j] = this.board[i][j];
        } else if (this.flagged[i][j]) {
          displayBoard[i][j] = 'F';
        } else {
          displayBoard[i][j] = null;
        }
      }
    }
    return displayBoard;
  }
}

module.exports = Game;
