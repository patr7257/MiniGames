"use strict";

/*
  Snake, vanilla canvas game for the MiniGames arcade.

  Grid: 20x20 cells, 24px each, canvas is a fixed 480x480 internal
  resolution (scaled responsively by CSS in snake.css).

  Loop: fixed timestep. requestAnimationFrame drives rendering every
  frame, but the game only advances one grid step ("tick") when enough
  real time has accumulated. This keeps snake speed independent of the
  monitor refresh rate and lets us safely change the tick interval to
  speed the game up.

  Colors below are hardcoded to match the CSS tokens in ../shared/arcade.css:
  --arcade-bg #05060c, --arcade-cell #0d1524, --arcade-cell-line #173047,
  --arcade-ok #39ff14 (snake), --arcade-danger #ff3b3b (food).
*/

(function () {
  const GRID_SIZE = 20;
  const CELL_PX = 24; // 20 * 24 = 480, matches the canvas width/height attrs.

  const COLOR_BG = "#0d1524";
  const COLOR_GRID_LINE = "#173047";
  const COLOR_SNAKE_HEAD = "#39ff14";
  const COLOR_SNAKE_BODY = "#1fbf0c";
  const COLOR_FOOD = "#ff3b3b";

  const START_TICK_MS = 140; // ms per grid step at the start
  const MIN_TICK_MS = 70; // fastest the game is allowed to get
  const SPEEDUP_EVERY_N_FOODS = 5;
  const SPEEDUP_STEP_MS = 12;

  const BEST_SCORE_KEY = "minigames-snake-best-score";

  const DIRECTIONS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  function isOpposite(a, b) {
    return a.x === -b.x && a.y === -b.y;
  }

  // --- localStorage, guarded so file:// (storage disabled) never throws. ---
  function loadBestScore() {
    try {
      const raw = localStorage.getItem(BEST_SCORE_KEY);
      const parsed = raw === null ? 0 : parseInt(raw, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    } catch (err) {
      return 0;
    }
  }

  function saveBestScore(value) {
    try {
      localStorage.setItem(BEST_SCORE_KEY, String(value));
    } catch (err) {
      // Storage unavailable (file://, private mode, quota). Ignore silently.
    }
  }

  // --- DOM references ---
  const canvas = document.getElementById("snake-canvas");
  const ctx = canvas.getContext("2d");
  const scoreValueEl = document.getElementById("score-value");
  const bestValueEl = document.getElementById("best-value");
  const startOverlay = document.getElementById("start-overlay");
  const startBtn = document.getElementById("start-btn");
  const gameOverOverlay = document.getElementById("game-over-overlay");
  const finalScoreText = document.getElementById("final-score-text");
  const restartBtn = document.getElementById("restart-btn");

  // --- Game state ---
  let snake; // array of {x, y}, index 0 is the head
  let direction; // current direction of travel
  let queuedDirection; // at most one buffered turn, applied on next tick
  let food;
  let score;
  let bestScore = loadBestScore();
  let foodsEaten;
  let tickIntervalMs;
  let tickAccumulatorMs;
  let lastFrameTime;
  let state; // "start" | "playing" | "gameover"
  let rafHandle;

  bestValueEl.textContent = String(bestScore);

  function resetGame() {
    const mid = Math.floor(GRID_SIZE / 2);
    snake = [
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid },
      { x: mid - 3, y: mid },
    ];
    direction = DIRECTIONS.right;
    queuedDirection = null;
    score = 0;
    foodsEaten = 0;
    tickIntervalMs = START_TICK_MS;
    tickAccumulatorMs = 0;
    food = spawnFood();
    updateScoreHud();
  }

  function updateScoreHud() {
    scoreValueEl.textContent = String(score);
  }

  function occupiedByBody(cell) {
    return snake.some((seg) => seg.x === cell.x && seg.y === cell.y);
  }

  // Pick a random empty cell for the food. With a 20x20 grid and a short
  // snake there is always ample free space, so simple retry is fine.
  function spawnFood() {
    let cell;
    do {
      cell = {
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE),
      };
    } while (occupiedByBody(cell));
    return cell;
  }

  // Buffer at most one turn per tick, and never accept an immediate
  // reversal (that would collide with the segment right behind the head).
  function queueTurn(nextDirection) {
    if (state !== "playing") return;
    if (isOpposite(nextDirection, direction)) return;
    queuedDirection = nextDirection;
  }

  function step() {
    if (queuedDirection) {
      direction = queuedDirection;
      queuedDirection = null;
    }

    const head = snake[0];
    const newHead = { x: head.x + direction.x, y: head.y + direction.y };

    const hitWall =
      newHead.x < 0 ||
      newHead.x >= GRID_SIZE ||
      newHead.y < 0 ||
      newHead.y >= GRID_SIZE;

    // Growth only removes the tail if the snake did NOT eat this tick, so
    // check body collision against the segments that will still be there
    // (i.e. everything except the current tail, when about to grow).
    const ateFood = newHead.x === food.x && newHead.y === food.y;
    const bodyToCheck = ateFood ? snake : snake.slice(0, snake.length - 1);
    const hitSelf = bodyToCheck.some(
      (seg) => seg.x === newHead.x && seg.y === newHead.y
    );

    if (hitWall || hitSelf) {
      endGame();
      return;
    }

    snake.unshift(newHead);
    if (ateFood) {
      score += 10;
      foodsEaten += 1;
      updateScoreHud();
      food = spawnFood();
      if (foodsEaten % SPEEDUP_EVERY_N_FOODS === 0) {
        tickIntervalMs = Math.max(MIN_TICK_MS, tickIntervalMs - SPEEDUP_STEP_MS);
      }
    } else {
      snake.pop();
    }
  }

  function endGame() {
    state = "gameover";
    if (score > bestScore) {
      bestScore = score;
      saveBestScore(bestScore);
      bestValueEl.textContent = String(bestScore);
    }
    finalScoreText.textContent = "Score " + score;
    gameOverOverlay.classList.add("is-open");
  }

  function drawGrid() {
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = COLOR_GRID_LINE;
    ctx.lineWidth = 1;
    for (let i = 1; i < GRID_SIZE; i++) {
      const pos = i * CELL_PX + 0.5;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, canvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(canvas.width, pos);
      ctx.stroke();
    }
  }

  function drawCell(cell, color) {
    const pad = 2;
    ctx.fillStyle = color;
    ctx.fillRect(
      cell.x * CELL_PX + pad,
      cell.y * CELL_PX + pad,
      CELL_PX - pad * 2,
      CELL_PX - pad * 2
    );
  }

  function render() {
    drawGrid();
    drawCell(food, COLOR_FOOD);
    for (let i = snake.length - 1; i >= 0; i--) {
      drawCell(snake[i], i === 0 ? COLOR_SNAKE_HEAD : COLOR_SNAKE_BODY);
    }
  }

  // --- Fixed-timestep loop ---
  function frame(now) {
    rafHandle = requestAnimationFrame(frame);

    if (lastFrameTime === undefined) {
      lastFrameTime = now;
    }
    const elapsed = now - lastFrameTime;
    lastFrameTime = now;

    if (state === "playing") {
      tickAccumulatorMs += elapsed;
      // Step as many times as the accumulated time covers, so a slow frame
      // (tab switch, GC pause) does not permanently desync the game speed.
      while (tickAccumulatorMs >= tickIntervalMs && state === "playing") {
        tickAccumulatorMs -= tickIntervalMs;
        step();
      }
    }

    render();
  }

  function startGame() {
    resetGame();
    state = "playing";
    startOverlay.classList.remove("is-open");
    gameOverOverlay.classList.remove("is-open");
  }

  function handleActivate() {
    if (state === "start" || state === "gameover") {
      startGame();
    }
  }

  // --- Keyboard controls: arrows and WASD, space to start/restart. ---
  const KEY_TO_DIRECTION = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    w: "up",
    W: "up",
    s: "down",
    S: "down",
    a: "left",
    A: "left",
    d: "right",
    D: "right",
  };

  window.addEventListener("keydown", (event) => {
    const isArrow = event.key.startsWith("Arrow");
    if (isArrow || event.key === " ") {
      // Never let the page scroll while playing.
      event.preventDefault();
    }

    if (event.key === " ") {
      handleActivate();
      return;
    }

    const dirName = KEY_TO_DIRECTION[event.key];
    if (dirName) {
      queueTurn(DIRECTIONS[dirName]);
    }
  });

  startBtn.addEventListener("click", startGame);
  restartBtn.addEventListener("click", startGame);

  // --- Touch controls: swipe on the canvas to steer. ---
  let touchStart = null;
  const SWIPE_THRESHOLD_PX = 20;

  canvas.addEventListener(
    "touchstart",
    (event) => {
      const touch = event.changedTouches[0];
      touchStart = { x: touch.clientX, y: touch.clientY };
      // A tap (no movement) on the start/game-over screen should start play.
      handleActivate();
    },
    { passive: true }
  );

  canvas.addEventListener(
    "touchend",
    (event) => {
      if (!touchStart) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - touchStart.x;
      const dy = touch.clientY - touchStart.y;
      touchStart = null;

      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD_PX) {
        return; // too small to count as a swipe
      }

      if (Math.abs(dx) > Math.abs(dy)) {
        queueTurn(dx > 0 ? DIRECTIONS.right : DIRECTIONS.left);
      } else {
        queueTurn(dy > 0 ? DIRECTIONS.down : DIRECTIONS.up);
      }
    },
    { passive: true }
  );

  // --- Boot ---
  resetGame();
  state = "start";
  render();
  rafHandle = requestAnimationFrame(frame);
})();
