'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#7986cb', // J - indigo
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

function readStoredSkin() {
  try {
    return localStorage.getItem('tetris.skin');
  } catch (e) {
    return null;
  }
}

function writeStoredSkin(skin) {
  try {
    localStorage.setItem('tetris.skin', skin);
  } catch (e) {
    // almacenamiento no disponible (modo privado, política del navegador, iframe aislado); se ignora
  }
}

const pixelPatternCache = {};

function getPixelPattern(context, color, size) {
  const key = color + '|' + size;
  if (pixelPatternCache[key]) return pixelPatternCache[key];
  const dot = Math.max(2, Math.floor(size / 10));
  const tile = dot * 2;
  const off = document.createElement('canvas');
  off.width = tile;
  off.height = tile;
  const octx = off.getContext('2d');
  octx.fillStyle = color;
  octx.fillRect(0, 0, tile, tile);
  octx.fillStyle = 'rgba(0,0,0,0.28)';
  octx.fillRect(0, 0, dot, dot);
  const pattern = context.createPattern(off, 'repeat');
  pixelPatternCache[key] = pattern;
  return pattern;
}

function drawCellRounded(context, x, y, color, size, alpha, radius) {
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  const px = x * size + 2;
  const py = y * size + 2;
  const s = size - 4;
  const r = Math.min(radius, s / 2);
  if (typeof context.roundRect === 'function') {
    context.beginPath();
    context.roundRect(px, py, s, s, r);
    context.fill();
  } else {
    context.beginPath();
    context.moveTo(px + r, py);
    context.lineTo(px + s - r, py);
    context.quadraticCurveTo(px + s, py, px + s, py + r);
    context.lineTo(px + s, py + s - r);
    context.quadraticCurveTo(px + s, py + s, px + s - r, py + s);
    context.lineTo(px + r, py + s);
    context.quadraticCurveTo(px, py + s, px, py + s - r);
    context.lineTo(px, py + r);
    context.quadraticCurveTo(px, py, px + r, py);
    context.closePath();
    context.fill();
  }
  context.globalAlpha = 1;
}

const THEMES = {
  retro: {
    label: 'Retro',
    colors: COLORS,
    gridColor: '#22222e',
    drawCell(context, x, y, colorIndex, size, alpha) {
      context.globalAlpha = alpha ?? 1;
      context.fillStyle = this.colors[colorIndex];
      context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
      context.globalAlpha = 1;
    },
  },
  neon: {
    label: 'Neon',
    colors: [null, '#00e5ff', '#ffee00', '#e040fb', '#00e676', '#ff1744', '#536dfe', '#ff9100'],
    gridColor: '#0d0d1a',
    drawCell(context, x, y, colorIndex, size, alpha) {
      const color = this.colors[colorIndex];
      context.globalAlpha = alpha ?? 1;
      context.shadowBlur = 14;
      context.shadowColor = color;
      context.fillStyle = color;
      context.fillRect(x * size + 3, y * size + 3, size - 6, size - 6);
      context.shadowBlur = 0;
      context.globalAlpha = 1;
    },
  },
  pastel: {
    label: 'Pastel',
    colors: [null, '#a8e6f0', '#fff3b0', '#d9b3e6', '#b8e6c1', '#f4b8b8', '#b8c2f0', '#f5cba7'],
    gridColor: '#2f2f42',
    drawCell(context, x, y, colorIndex, size, alpha) {
      drawCellRounded(context, x, y, this.colors[colorIndex], size, alpha, 6);
    },
  },
  pixel: {
    label: 'Pixel art',
    colors: COLORS,
    gridColor: '#22222e',
    drawCell(context, x, y, colorIndex, size, alpha) {
      const color = this.colors[colorIndex];
      context.globalAlpha = alpha ?? 1;
      const px = x * size + 1;
      const py = y * size + 1;
      const s = size - 2;
      context.fillStyle = getPixelPattern(context, color, size);
      context.fillRect(px, py, s, s);
      context.fillStyle = 'rgba(255,255,255,0.18)';
      context.fillRect(px, py, s, 2);
      context.globalAlpha = 1;
    },
  },
};

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const skinSelect = document.getElementById('skin-select');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

let currentSkin = readStoredSkin() || 'retro';
if (!THEMES[currentSkin]) currentSkin = 'retro';

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  THEMES[currentSkin].drawCell(context, x, y, colorIndex, size, alpha);
}

function setSkin(skin) {
  if (!THEMES[skin]) skin = 'retro';
  currentSkin = skin;
  writeStoredSkin(skin);
  document.body.dataset.skin = skin;
  if (skinSelect) skinSelect.value = skin;
  if (current) draw();
  if (next) drawNext();
}

function drawGrid() {
  ctx.strokeStyle = THEMES[currentSkin].gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

if (skinSelect) {
  skinSelect.addEventListener('change', e => setSkin(e.target.value));
}

setSkin(currentSkin);
init();
