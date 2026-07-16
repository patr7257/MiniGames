"use strict";

/*
  Minesweeper, vanilla JS, DOM grid (no canvas).

  Board cells are plain objects kept in a 2D array (board[row][col]). The DOM
  mirrors that array one to one, and cellEls[row][col] caches the element for
  each cell so updates do not need to query the DOM.
*/

const DIFFICULTIES = {
  easy: { rows: 9, cols: 9, mines: 10, cellSize: 32 },
  medium: { rows: 16, cols: 16, mines: 40, cellSize: 26 },
  hard: { rows: 16, cols: 30, mines: 99, cellSize: 20 },
};

const LONG_PRESS_MS = 500;

const gridEl = document.getElementById("grid");
const mineCountEl = document.getElementById("mine-count");
const timeCountEl = document.getElementById("time-count");
const restartBtn = document.getElementById("restart-btn");
const overlayEl = document.getElementById("overlay");
const overlayTitleEl = document.getElementById("overlay-title");
const overlayTextEl = document.getElementById("overlay-text");
const overlayRestartBtn = document.getElementById("overlay-restart-btn");
const flagModeBtn = document.getElementById("flag-mode-btn");
const difficultyBtns = document.querySelectorAll("[data-difficulty]");

let currentDifficulty = "easy";
let rows = 0;
let cols = 0;
let mineCount = 0;
let board = [];
let cellEls = [];
let firstClickDone = false;
let gameOver = false;
let flagsPlaced = 0;
let revealedCount = 0;
let elapsedSeconds = 0;
let timerHandle = null;
let flagModeOn = false;

let longPressTimer = null;
let longPressFired = false;

function padNumber(value, width) {
  const sign = value < 0 ? "-" : "";
  const digits = String(Math.abs(value));
  return sign + digits.padStart(width - sign.length, "0");
}

function inBounds(row, col) {
  return row >= 0 && row < rows && col >= 0 && col < cols;
}

function forEachNeighbor(row, col, callback) {
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = row + dr;
      const nc = col + dc;
      if (inBounds(nr, nc)) callback(nr, nc);
    }
  }
}

function buildEmptyBoard() {
  board = [];
  for (let r = 0; r < rows; r++) {
    const rowArr = [];
    for (let c = 0; c < cols; c++) {
      rowArr.push({ mine: false, revealed: false, flagged: false, adjacent: 0 });
    }
    board.push(rowArr);
  }
}

function buildGridDom() {
  gridEl.innerHTML = "";
  gridEl.style.setProperty("--ms-cols", cols);
  gridEl.style.setProperty("--ms-rows", rows);
  gridEl.style.setProperty("--ms-cell-size", DIFFICULTIES[currentDifficulty].cellSize + "px");

  cellEls = [];
  for (let r = 0; r < rows; r++) {
    const rowEls = [];
    for (let c = 0; c < cols; c++) {
      const cellEl = document.createElement("div");
      cellEl.className = "ms-cell";
      cellEl.dataset.row = String(r);
      cellEl.dataset.col = String(c);
      gridEl.appendChild(cellEl);
      rowEls.push(cellEl);
    }
    cellEls.push(rowEls);
  }
}

function generateMines(excludeRow, excludeCol) {
  const excluded = new Set();
  excluded.add(excludeRow + "," + excludeCol);
  forEachNeighbor(excludeRow, excludeCol, (r, c) => excluded.add(r + "," + c));

  let placed = 0;
  while (placed < mineCount) {
    const r = Math.floor(Math.random() * rows);
    const c = Math.floor(Math.random() * cols);
    const key = r + "," + c;
    if (excluded.has(key) || board[r][c].mine) continue;
    board[r][c].mine = true;
    placed++;
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board[r][c].mine) continue;
      let count = 0;
      forEachNeighbor(r, c, (nr, nc) => {
        if (board[nr][nc].mine) count++;
      });
      board[r][c].adjacent = count;
    }
  }
}

function updateCellDom(row, col) {
  const cell = board[row][col];
  const el = cellEls[row][col];
  el.className = "ms-cell";
  el.textContent = "";

  if (cell.revealed) {
    el.classList.add("is-revealed");
    if (cell.mine) {
      el.classList.add("is-mine-revealed");
    } else if (cell.adjacent > 0) {
      el.textContent = String(cell.adjacent);
      el.classList.add("n" + cell.adjacent);
    }
  } else if (cell.flagged) {
    el.classList.add("is-flagged");
  }
}

function updateMineCounter() {
  const remaining = mineCount - flagsPlaced;
  mineCountEl.textContent = padNumber(remaining, 3);
}

function updateTimeDisplay() {
  timeCountEl.textContent = padNumber(Math.min(elapsedSeconds, 999), 3);
}

function startTimer() {
  stopTimer();
  timerHandle = setInterval(() => {
    elapsedSeconds++;
    updateTimeDisplay();
  }, 1000);
}

function stopTimer() {
  if (timerHandle !== null) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
}

function revealCell(row, col) {
  if (gameOver) return;
  const cell = board[row][col];
  if (cell.revealed || cell.flagged) return;

  if (!firstClickDone) {
    generateMines(row, col);
    firstClickDone = true;
    startTimer();
  }

  if (cell.mine) {
    cell.revealed = true;
    updateCellDom(row, col);
    cellEls[row][col].classList.add("is-mine-hit");
    endGame(false);
    return;
  }

  floodReveal(row, col);
  checkWin();
}

function floodReveal(startRow, startCol) {
  const stack = [[startRow, startCol]];
  while (stack.length > 0) {
    const [r, c] = stack.pop();
    const cell = board[r][c];
    if (cell.revealed || cell.flagged || cell.mine) continue;

    cell.revealed = true;
    revealedCount++;
    updateCellDom(r, c);

    if (cell.adjacent === 0) {
      forEachNeighbor(r, c, (nr, nc) => {
        if (!board[nr][nc].revealed && !board[nr][nc].flagged) {
          stack.push([nr, nc]);
        }
      });
    }
  }
}

function toggleFlag(row, col) {
  if (gameOver) return;
  const cell = board[row][col];
  if (cell.revealed) return;

  cell.flagged = !cell.flagged;
  flagsPlaced += cell.flagged ? 1 : -1;
  updateCellDom(row, col);
  updateMineCounter();
}

function checkWin() {
  const safeCells = rows * cols - mineCount;
  if (revealedCount >= safeCells) {
    endGame(true);
  }
}

function endGame(won) {
  gameOver = true;
  stopTimer();

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = board[r][c];
      if (cell.mine && !cell.revealed) {
        cell.revealed = true;
        updateCellDom(r, c);
      }
    }
  }

  if (won) {
    overlayTitleEl.textContent = "You win";
    overlayTitleEl.classList.remove("is-danger");
    overlayTextEl.textContent = "Time " + padNumber(elapsedSeconds, 3);
  } else {
    overlayTitleEl.textContent = "You lose";
    overlayTitleEl.classList.add("is-danger");
    overlayTextEl.textContent = "Time " + padNumber(elapsedSeconds, 3);
  }
  overlayEl.classList.add("is-open");
}

function setActiveDifficultyButton() {
  difficultyBtns.forEach((btn) => {
    const isActive = btn.dataset.difficulty === currentDifficulty;
    btn.classList.toggle("is-active", isActive);
    btn.classList.toggle("is-cyan", !isActive);
  });
}

function initGame(difficultyKey) {
  currentDifficulty = difficultyKey;
  const preset = DIFFICULTIES[difficultyKey];
  rows = preset.rows;
  cols = preset.cols;
  mineCount = preset.mines;

  firstClickDone = false;
  gameOver = false;
  flagsPlaced = 0;
  revealedCount = 0;
  elapsedSeconds = 0;
  stopTimer();

  buildEmptyBoard();
  buildGridDom();
  updateMineCounter();
  updateTimeDisplay();
  overlayEl.classList.remove("is-open");
  setActiveDifficultyButton();
}

function handleGridClick(event) {
  const cellEl = event.target.closest(".ms-cell");
  if (!cellEl) return;

  if (longPressFired) {
    longPressFired = false;
    return;
  }

  const row = Number(cellEl.dataset.row);
  const col = Number(cellEl.dataset.col);
  if (flagModeOn) {
    toggleFlag(row, col);
  } else {
    revealCell(row, col);
  }
}

function handleGridContextMenu(event) {
  event.preventDefault();
  const cellEl = event.target.closest(".ms-cell");
  if (!cellEl || gameOver) return;
  const row = Number(cellEl.dataset.row);
  const col = Number(cellEl.dataset.col);
  toggleFlag(row, col);
}

function clearLongPressTimer() {
  if (longPressTimer !== null) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function handleGridPointerDown(event) {
  if (event.pointerType !== "touch") return;
  const cellEl = event.target.closest(".ms-cell");
  if (!cellEl || gameOver) return;

  longPressFired = false;
  clearLongPressTimer();
  const row = Number(cellEl.dataset.row);
  const col = Number(cellEl.dataset.col);
  longPressTimer = setTimeout(() => {
    longPressFired = true;
    toggleFlag(row, col);
  }, LONG_PRESS_MS);
}

function handleGridPointerUpOrCancel() {
  clearLongPressTimer();
}

function handleFlagModeToggle() {
  flagModeOn = !flagModeOn;
  flagModeBtn.textContent = "Flag mode: " + (flagModeOn ? "on" : "off");
  flagModeBtn.classList.toggle("is-active", flagModeOn);
}

function wireUpEvents() {
  gridEl.addEventListener("click", handleGridClick);
  gridEl.addEventListener("contextmenu", handleGridContextMenu);
  gridEl.addEventListener("pointerdown", handleGridPointerDown);
  gridEl.addEventListener("pointerup", handleGridPointerUpOrCancel);
  gridEl.addEventListener("pointercancel", handleGridPointerUpOrCancel);
  gridEl.addEventListener("pointerleave", handleGridPointerUpOrCancel);

  restartBtn.addEventListener("click", () => initGame(currentDifficulty));
  overlayRestartBtn.addEventListener("click", () => initGame(currentDifficulty));
  flagModeBtn.addEventListener("click", handleFlagModeToggle);

  difficultyBtns.forEach((btn) => {
    btn.addEventListener("click", () => initGame(btn.dataset.difficulty));
  });
}

wireUpEvents();
initGame(currentDifficulty);
