/*
  pacman.js, a simplified grid-locked Pacman.

  Movement is tick based: every TICK_MS milliseconds each entity attempts to
  move exactly one cell. The player buffers a desired direction and turns
  onto it as soon as the path is open. Ghosts only make a new AI decision at
  "intersections" (a cell with more than two open neighbours, or a cell where
  the ghost's current direction is now blocked); otherwise they keep going
  straight. This keeps the AI cheap and readable instead of chasing authentic
  Pacman ghost-house / targeting behaviour (explicitly out of scope).

  Colors are hardcoded to match (or deliberately extend) the shared
  shared/arcade.css tokens, since canvas cannot read CSS variables directly:
    wall            #2121de  classic Pacman wall blue (not a token, intentional)
    pacman          #ffd400  classic Pacman yellow (not a token, intentional)
    pellet          #22d3ee  == --arcade-accent
    power pellet    #39ff14  == --arcade-ok
    ghost "chase"   #ff3b3b  == --arcade-danger
    ghost "random"  #ff2fb0  == --arcade-accent-2
    ghost "scatter A" #ff6b3b  danger-family shade (custom)
    ghost "scatter B" #ff7fd0  accent-2-family shade (custom)
    frightened      #22d3ee  == --arcade-accent (cyan, per spec)
*/
(() => {
  'use strict';

  // ---------------------------------------------------------------------
  // Maze data. Legend: # wall, . pellet, o power pellet, space empty floor,
  // P player start, 1..4 ghost starts (1 chase, 2 random, 3/4 scatter).
  // 19 wide x 21 tall, border fully closed.
  // ---------------------------------------------------------------------
  const MAZE = [
    '###################',
    '#o...............o#',
    '#.##.###...###.##.#',
    '#.##.###...###.##.#',
    '#.................#',
    '#.##.##..#..##.##.#',
    '#.##.##..#..##.##.#',
    '#.................#',
    '#.##...........##.#',
    '#.##...........##.#',
    '#......31.24......#',
    '#.##...........##.#',
    '#.##...........##.#',
    '#.................#',
    '#.##.###...###.##.#',
    '#.##.###...###.##.#',
    '#.................#',
    '#.##.##.....##.##.#',
    '#.##.##.....##.##.#',
    '#o.......P.......o#',
    '###################',
  ];

  const COLS = MAZE[0].length;
  const ROWS = MAZE.length;
  const CELL = 20;

  const DIR = {
    UP: { dx: 0, dy: -1 },
    DOWN: { dx: 0, dy: 1 },
    LEFT: { dx: -1, dy: 0 },
    RIGHT: { dx: 1, dy: 0 },
  };
  const ALL_DIRS = [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT];

  const INITIAL_TICK_MS = 170;
  const MIN_TICK_MS = 110;
  const FRIGHTENED_MS = 7000;
  const FRIGHTENED_BLINK_MS = 1500;
  const PELLET_SCORE = 10;
  const POWER_SCORE = 50;
  const GHOST_SCORE = 200;
  const START_LIVES = 3;

  const COLORS = {
    wall: '#2121de',
    pacman: '#ffd400',
    pellet: '#22d3ee',
    power: '#39ff14',
    frightened: '#22d3ee',
    frightenedBlink: '#eafcff',
    ghost: {
      chase: '#ff3b3b',
      random: '#ff2fb0',
      scatterA: '#ff6b3b',
      scatterB: '#ff7fd0',
    },
  };

  // ---------------------------------------------------------------------
  // Parse the maze into wall / pellet grids and find the start positions.
  // ---------------------------------------------------------------------
  const wallGrid = [];
  const initialPellets = [];
  const initialPower = [];
  let playerStart = null;
  const ghostStarts = [];

  for (let y = 0; y < ROWS; y++) {
    const wallRow = [];
    const pelletRow = [];
    const powerRow = [];
    for (let x = 0; x < COLS; x++) {
      const c = MAZE[y][x];
      wallRow.push(c === '#');
      pelletRow.push(c === '.');
      powerRow.push(c === 'o');
      if (c === 'P') playerStart = { x, y };
      if (c === '1') ghostStarts.push({ x, y, aiType: 'chase' });
      if (c === '2') ghostStarts.push({ x, y, aiType: 'random' });
      if (c === '3') ghostStarts.push({ x, y, aiType: 'scatter', target: { x: 1, y: 1 } });
      if (c === '4') ghostStarts.push({ x, y, aiType: 'scatter', target: { x: COLS - 2, y: ROWS - 2 } });
    }
    wallGrid.push(wallRow);
    initialPellets.push(pelletRow);
    initialPower.push(powerRow);
  }

  const GHOST_COLORS = [COLORS.ghost.chase, COLORS.ghost.random, COLORS.ghost.scatterA, COLORS.ghost.scatterB];

  function isWall(x, y) {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return true;
    return wallGrid[y][x];
  }
  function canMove(x, y, dir) {
    return !isWall(x + dir.dx, y + dir.dy);
  }
  function openNeighborCount(x, y) {
    let n = 0;
    for (const d of ALL_DIRS) if (canMove(x, y, d)) n++;
    return n;
  }
  function isReverse(a, b) {
    return a.dx === -b.dx && a.dy === -b.dy;
  }
  function pickMinDistance(dirs, fromX, fromY, target) {
    let best = dirs[0];
    let bestDist = Infinity;
    for (const d of dirs) {
      const nx = fromX + d.dx;
      const ny = fromY + d.dy;
      const dist = Math.abs(nx - target.x) + Math.abs(ny - target.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = d;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------------
  // DOM references.
  // ---------------------------------------------------------------------
  const canvas = document.getElementById('pacman-canvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score-value');
  const livesEl = document.getElementById('lives-value');
  const levelEl = document.getElementById('level-value');
  const startOverlay = document.getElementById('start-overlay');
  const levelOverlay = document.getElementById('level-overlay');
  const gameoverOverlay = document.getElementById('gameover-overlay');
  const levelClearText = document.getElementById('level-clear-text');
  const finalScoreText = document.getElementById('final-score-text');
  const startBtn = document.getElementById('start-btn');
  const continueBtn = document.getElementById('continue-btn');
  const restartBtn = document.getElementById('restart-btn');

  // ---------------------------------------------------------------------
  // Mutable game state.
  // ---------------------------------------------------------------------
  let pelletGrid, powerGrid, pelletsRemaining;
  let player, ghosts;
  let score, lives, level, tickMs;
  let frightenedUntil = 0;
  let state = 'start'; // 'start' | 'playing' | 'levelclear' | 'gameover'
  let chompFrame = 0;
  let chompCounter = 0;

  function clonePlayer() {
    return { x: playerStart.x, y: playerStart.y, dir: null, nextDir: null, facing: DIR.RIGHT };
  }
  function cloneGhosts() {
    return ghostStarts.map((g, i) => ({
      x: g.x,
      y: g.y,
      startX: g.x,
      startY: g.y,
      dir: null,
      aiType: g.aiType,
      target: g.target || null,
      color: GHOST_COLORS[i % GHOST_COLORS.length],
      frightened: false,
      eatenImmune: false,
      forceReconsider: false,
    }));
  }

  function resetPellets() {
    pelletGrid = initialPellets.map((row) => row.slice());
    powerGrid = initialPower.map((row) => row.slice());
    pelletsRemaining = 0;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (pelletGrid[y][x] || powerGrid[y][x]) pelletsRemaining++;
      }
    }
  }

  function resetPositions() {
    player = clonePlayer();
    ghosts = cloneGhosts();
    frightenedUntil = 0;
  }

  function newGame() {
    score = 0;
    lives = START_LIVES;
    level = 1;
    tickMs = INITIAL_TICK_MS;
    resetPellets();
    resetPositions();
    updateHud();
  }

  function updateHud() {
    scoreEl.textContent = String(score);
    livesEl.textContent = String(lives);
    levelEl.textContent = String(level);
  }

  // ---------------------------------------------------------------------
  // Input handling: keyboard (arrows + wasd) and touch swipe.
  // ---------------------------------------------------------------------
  const KEY_DIRS = {
    ArrowUp: DIR.UP, ArrowDown: DIR.DOWN, ArrowLeft: DIR.LEFT, ArrowRight: DIR.RIGHT,
    w: DIR.UP, s: DIR.DOWN, a: DIR.LEFT, d: DIR.RIGHT,
    W: DIR.UP, S: DIR.DOWN, A: DIR.LEFT, D: DIR.RIGHT,
  };

  function beginIfNeeded() {
    if (state === 'start') {
      state = 'playing';
      startOverlay.classList.remove('is-open');
    }
  }

  document.addEventListener('keydown', (e) => {
    const dir = KEY_DIRS[e.key];
    if (dir) {
      e.preventDefault();
      beginIfNeeded();
      if (state === 'playing') player.nextDir = dir;
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      beginIfNeeded();
    }
  }, { passive: false });

  let touchStartX = 0;
  let touchStartY = 0;
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    beginIfNeeded();
    const t = e.changedTouches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return; // tap, not swipe
    if (state !== 'playing') return;
    if (Math.abs(dx) > Math.abs(dy)) {
      player.nextDir = dx > 0 ? DIR.RIGHT : DIR.LEFT;
    } else {
      player.nextDir = dy > 0 ? DIR.DOWN : DIR.UP;
    }
  }, { passive: false });

  startBtn.addEventListener('click', beginIfNeeded);

  continueBtn.addEventListener('click', () => {
    levelOverlay.classList.remove('is-open');
    resetPellets();
    resetPositions();
    state = 'playing';
  });

  restartBtn.addEventListener('click', () => {
    gameoverOverlay.classList.remove('is-open');
    newGame();
    state = 'playing';
  });

  // ---------------------------------------------------------------------
  // Ghost AI decision making.
  // ---------------------------------------------------------------------
  function isDecisionPoint(ghost) {
    if (!ghost.dir) return true;
    if (!canMove(ghost.x, ghost.y, ghost.dir)) return true;
    return openNeighborCount(ghost.x, ghost.y) > 2;
  }

  function decideGhostDirection(ghost) {
    const open = ALL_DIRS.filter((d) => canMove(ghost.x, ghost.y, d));
    if (open.length === 0) return ghost.dir;
    let candidates = open;
    if (ghost.dir && !ghost.forceReconsider) {
      const noReverse = open.filter((d) => !isReverse(d, ghost.dir));
      if (noReverse.length > 0) candidates = noReverse;
    }
    ghost.forceReconsider = false;

    if (ghost.frightened) {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
    if (ghost.aiType === 'random') {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
    if (ghost.aiType === 'chase') {
      return pickMinDistance(candidates, ghost.x, ghost.y, { x: player.x, y: player.y });
    }
    // scatter
    return pickMinDistance(candidates, ghost.x, ghost.y, ghost.target);
  }

  function updateGhost(ghost) {
    if (isDecisionPoint(ghost)) {
      ghost.dir = decideGhostDirection(ghost);
    }
    if (ghost.dir && canMove(ghost.x, ghost.y, ghost.dir)) {
      ghost.x += ghost.dir.dx;
      ghost.y += ghost.dir.dy;
    }
  }

  function updateFrightenedStates(now) {
    const active = now < frightenedUntil;
    for (const g of ghosts) {
      if (active) {
        if (!g.eatenImmune) g.frightened = true;
      } else {
        if (g.frightened) g.forceReconsider = true;
        g.frightened = false;
        g.eatenImmune = false;
      }
    }
  }

  // ---------------------------------------------------------------------
  // Main tick: everything that happens once per fixed game step.
  // ---------------------------------------------------------------------
  function tick() {
    const now = performance.now();
    updateFrightenedStates(now);

    // Player: turn onto the buffered direction if possible, then move.
    if (player.nextDir && canMove(player.x, player.y, player.nextDir)) {
      player.dir = player.nextDir;
      player.facing = player.dir;
    }
    if (player.dir && canMove(player.x, player.y, player.dir)) {
      player.x += player.dir.dx;
      player.y += player.dir.dy;
      player.facing = player.dir;
    }

    // Eat pellet / power pellet under the player.
    if (pelletGrid[player.y][player.x]) {
      pelletGrid[player.y][player.x] = false;
      pelletsRemaining--;
      score += PELLET_SCORE;
    } else if (powerGrid[player.y][player.x]) {
      powerGrid[player.y][player.x] = false;
      pelletsRemaining--;
      score += POWER_SCORE;
      frightenedUntil = now + FRIGHTENED_MS;
      for (const g of ghosts) g.eatenImmune = false;
    }

    for (const g of ghosts) updateGhost(g);

    // Collisions, checked after everyone has moved.
    for (const g of ghosts) {
      if (g.x === player.x && g.y === player.y) {
        if (g.frightened) {
          score += GHOST_SCORE;
          g.frightened = false;
          g.eatenImmune = true;
          g.x = g.startX;
          g.y = g.startY;
          g.dir = null;
        } else {
          loseLife();
          return;
        }
      }
    }

    if (pelletsRemaining <= 0) {
      levelClear();
      return;
    }

    chompCounter++;
    if (chompCounter >= 2) {
      chompCounter = 0;
      chompFrame = chompFrame === 0 ? 1 : 0;
    }
    updateHud();
  }

  function loseLife() {
    lives--;
    updateHud();
    if (lives <= 0) {
      state = 'gameover';
      finalScoreText.textContent = 'Score ' + score;
      gameoverOverlay.classList.add('is-open');
      return;
    }
    resetPositions();
  }

  function levelClear() {
    level++;
    tickMs = Math.max(MIN_TICK_MS, Math.round(tickMs * 0.94));
    state = 'levelclear';
    updateHud();
    levelClearText.textContent = 'Level ' + level + ', Score ' + score;
    levelOverlay.classList.add('is-open');
  }

  // ---------------------------------------------------------------------
  // Rendering.
  // ---------------------------------------------------------------------
  function cellCenter(x, y) {
    return { cx: x * CELL + CELL / 2, cy: y * CELL + CELL / 2 };
  }

  function drawMaze() {
    ctx.fillStyle = '#05060c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = COLORS.wall;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (wallGrid[y][x]) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }

    ctx.fillStyle = COLORS.pellet;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (pelletGrid[y][x]) {
          const { cx, cy } = cellCenter(x, y);
          ctx.beginPath();
          ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.fillStyle = COLORS.power;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (powerGrid[y][x]) {
          const { cx, cy } = cellCenter(x, y);
          ctx.beginPath();
          ctx.arc(cx, cy, 5.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  function facingAngle(dir) {
    if (dir === DIR.UP) return -Math.PI / 2;
    if (dir === DIR.DOWN) return Math.PI / 2;
    if (dir === DIR.LEFT) return Math.PI;
    return 0; // RIGHT / default
  }

  function drawPlayer() {
    const { cx, cy } = cellCenter(player.x, player.y);
    const radius = CELL / 2 - 1.5;
    const angle = facingAngle(player.facing);
    const mouth = chompFrame === 0 ? 0.06 : 0.24; // closed vs open, in units of PI

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = COLORS.pacman;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, mouth * Math.PI, (2 - mouth) * Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawGhost(ghost) {
    const { cx, cy } = cellCenter(ghost.x, ghost.y);
    const r = CELL / 2 - 1.5;
    let color = ghost.color;
    if (ghost.frightened) {
      const now = performance.now();
      const timeLeft = frightenedUntil - now;
      const blinking = timeLeft < FRIGHTENED_BLINK_MS;
      color = (blinking && Math.floor(now / 150) % 2 === 0) ? COLORS.frightenedBlink : COLORS.frightened;
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.1, r, Math.PI, 0);
    const bottom = cy + r * 0.9;
    ctx.lineTo(cx + r, bottom);
    const bumps = 3;
    for (let i = 0; i < bumps; i++) {
      const step = (2 * r) / bumps;
      const bx = cx + r - step * (i + 0.5);
      ctx.lineTo(bx, i % 2 === 0 ? bottom - 4 : bottom);
    }
    ctx.lineTo(cx - r, bottom);
    ctx.closePath();
    ctx.fill();

    // eyes
    const eyeDx = ghost.dir ? ghost.dir.dx : 1;
    const eyeDy = ghost.dir ? ghost.dir.dy : 0;
    ctx.fillStyle = '#eafcff';
    ctx.beginPath();
    ctx.arc(cx - 3.2, cy - 2, 2.4, 0, Math.PI * 2);
    ctx.arc(cx + 3.2, cy - 2, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0b0f1a';
    ctx.beginPath();
    ctx.arc(cx - 3.2 + eyeDx * 1.1, cy - 2 + eyeDy * 1.1, 1.1, 0, Math.PI * 2);
    ctx.arc(cx + 3.2 + eyeDx * 1.1, cy - 2 + eyeDy * 1.1, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw() {
    drawMaze();
    drawPlayer();
    for (const g of ghosts) drawGhost(g);
  }

  // ---------------------------------------------------------------------
  // Fixed-tick game loop, decoupled from render framerate.
  // ---------------------------------------------------------------------
  let lastTime = 0;
  let accumulator = 0;

  function loop(timestamp) {
    requestAnimationFrame(loop);
    if (!lastTime) lastTime = timestamp;
    const dt = timestamp - lastTime;
    lastTime = timestamp;

    if (state === 'playing') {
      accumulator += dt;
      while (accumulator >= tickMs && state === 'playing') {
        tick();
        accumulator -= tickMs;
      }
    } else {
      accumulator = 0;
    }
    draw();
  }

  newGame();
  requestAnimationFrame(loop);
})();
