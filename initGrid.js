import { generateSeededBoard } from './gridLogic.js';
import { playSound } from './audioEngine.js';
import { renderGrid } from './gridRenderer.js';
import { gameState } from './gameState.js';
import { GRID_RADIUS } from './constants.js';
import { areAxialNeighbors } from './utils.js';
import { isValidWord } from './gameLogic.js';
import { recomputeAllWordScores } from './scoreLogic.js';


export const DOM = {
  svg: document.getElementById('hex-grid'),
  wordList: document.getElementById('word-list'),
};
export let tileElements = [];
export let grid;

// ON-SCREEN DEBUG PANEL — shows logs directly on iPhone screen
const _debugEl = document.createElement('div');
_debugEl.style.cssText = `
  position:fixed; bottom:0; left:0; right:0;
  max-height:200px; overflow-y:auto;
  background:rgba(0,0,0,0.85); color:#0ff;
  font-size:10px; font-family:monospace;
  z-index:999999; padding:4px;
  pointer-events:none;
`;
document.body.appendChild(_debugEl);

const _origLog = console.log.bind(console);
const _origWarn = console.warn.bind(console);
console.log = (...args) => {
  _origLog(...args);
  const line = document.createElement('div');
  line.textContent = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
  _debugEl.appendChild(line);
  _debugEl.scrollTop = _debugEl.scrollHeight;
};
console.warn = (...args) => {
  _origWarn(...args);
  const line = document.createElement('div');
  line.style.color = '#ff0';
  line.textContent = '⚠️ ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
  _debugEl.appendChild(line);
  _debugEl.scrollTop = _debugEl.scrollHeight;
};

// O(1) tile lookup map — rebuilt each time initializeGrid runs
let tileElementMap = new Map();

// swipe / drag state
let isDragging = false;
let lastHoverTile = null;

// Throttle pointermove hit-testing — only re-check when finger moves 6px+
let _lastMoveX = 0;
let _lastMoveY = 0;
const MOVE_THRESHOLD = 6;

// ============================================================================
// SWIPE + AUDIO DEBUG — remove before production
// ============================================================================

let _swipeDebugLog = [];
let _swipeStartTime = 0;

function debugSwipeStart() {
  _swipeDebugLog = [];
  _swipeStartTime = performance.now();
  console.log('🟢 SWIPE START');
}

function debugSwipeStep(label, extra = {}) {
  const now = performance.now();
  const entry = {
    t: Math.round(now - _swipeStartTime),
    label,
    ...extra
  };
  _swipeDebugLog.push(entry);
  console.log(`⬡ [${entry.t}ms] ${label}`, extra);
}

function debugSwipeEnd() {
  const total = Math.round(performance.now() - _swipeStartTime);
  console.log(`🔴 SWIPE END — ${total}ms total, ${_swipeDebugLog.length} steps`);
  console.table(_swipeDebugLog);

  const ctx = window._debugAudioCtx;
  if (ctx) {
    console.log(`🔊 AudioContext state at swipe end: ${ctx.state}`);
  } else {
    console.log('🔊 AudioContext: not found on window');
  }
}

// ============================================================================
// O(1) lookup instead of O(n) find
// ============================================================================

function getTileFromEventTarget(target) {
  if (!target) return null;
  const g = target.closest?.('.tile');
  if (!g) return null;
  return tileElementMap.get(g) || null;
}

function getTileAtPoint(x, y) {
  const el = document.elementFromPoint(x, y);
  return getTileFromEventTarget(el);
}

// ============================================================================
// UI Helpers
// ============================================================================

function updateWordPreview() {
  const selectedTiles = gameState.selectedTiles || [];
  const word = selectedTiles.map(t => t.letter).join('');
  const upper = word.toUpperCase();
  const wordPreviewElement = document.getElementById('current-word');

  if (wordPreviewElement) wordPreviewElement.textContent = upper;

  if (!word) {
    if (wordPreviewElement) wordPreviewElement.classList.remove('valid-word');
    return;
  }

  const isValid = upper.length >= 4 && isValidWord(upper);
  if (wordPreviewElement) wordPreviewElement.classList.toggle('valid-word', isValid);
}

// Clear word builder state
export function clearCurrentSelection() {
  const selectedTiles = gameState.selectedTiles || [];
  selectedTiles.forEach(tile => {
    if (tile?.element) tile.setSelected(false);
  });

  gameState.selectedTiles = [];
  updateWordPreview();
}

// ============================================================================
// Event Handlers
// ============================================================================

function handleSwipeTileStep(tile) {
  if (!isDragging) return;
  if (!tile || !tile.element) return;

  const selectedTiles = gameState.selectedTiles || [];
  const idx = selectedTiles.indexOf(tile);
  const isAlreadySelected = idx !== -1;

  if (isAlreadySelected) {
    for (let i = selectedTiles.length - 1; i > idx; i--) {
      const t = selectedTiles[i];
      t.setSelected(false);
      selectedTiles.pop();
    }

    updateWordPreview();

    const index = Math.min(selectedTiles.length, 25);
    if (index > 0) {
      debugSwipeStep('playSound — backtrack', { sound: `sfxSwipe${index}` });
      playSound(`sfxSwipe${index}`);
    }
    return;
  }

  if (selectedTiles.length === 0 || areAxialNeighbors(selectedTiles[selectedTiles.length - 1], tile)) {
    tile.setSelected(true);
    selectedTiles.push(tile);
    updateWordPreview();

    const index = Math.min(selectedTiles.length, 25);
    if (index > 0) {
      debugSwipeStep('playSound — new tile', { sound: `sfxSwipe${index}`, letter: tile.letter, key: tile.key });
      playSound(`sfxSwipe${index}`);
    }
  }
}

function handlePointerDown(e) {
  e.preventDefault();
  debugSwipeStart();

  const tile = getTileAtPoint(e.clientX, e.clientY);
  if (!tile) {
    debugSwipeStep('pointerdown — no tile found', { x: e.clientX, y: e.clientY });
    return;
  }
  debugSwipeStep('pointerdown — tile found', { key: tile.key, letter: tile.letter });

  isDragging = true;
  lastHoverTile = tile;
  _lastMoveX = e.clientX;
  _lastMoveY = e.clientY;

  clearCurrentSelection();
  handleSwipeTileStep(tile);
}

function handlePointerMove(e) {
  if (!isDragging) return;
  e.preventDefault();

  const dx = e.clientX - _lastMoveX;
  const dy = e.clientY - _lastMoveY;
  if (dx * dx + dy * dy < MOVE_THRESHOLD * MOVE_THRESHOLD) return;

  _lastMoveX = e.clientX;
  _lastMoveY = e.clientY;

  const t0 = performance.now();
  const tile = getTileAtPoint(e.clientX, e.clientY);
  const hitMs = Math.round(performance.now() - t0);

  if (!tile) {
    debugSwipeStep('pointermove — no tile at point', { x: e.clientX, y: e.clientY, hitTestMs: hitMs });
    return;
  }

  if (tile === lastHoverTile) return;

  debugSwipeStep('pointermove — new tile', { key: tile.key, letter: tile.letter, hitTestMs: hitMs });

  handleSwipeTileStep(tile);
  lastHoverTile = tile;
}

function handlePointerUp(e) {
  isDragging = false;
  lastHoverTile = null;
  debugSwipeEnd();
  updateWordPreview();
}

// ============================================================================
// Initialization
// ============================================================================

export function initializeGrid() {
  gameState.totalScore = 0;
  gameState.gridReady = false;

  gameState.boardSolverReady = new Promise((resolve) => {
    gameState._resolveBoardSolver = resolve;
  });

  tileElements.length = 0;

  grid = generateSeededBoard(GRID_RADIUS, gameState);
  gameState.grid = grid;

  renderGrid(grid, DOM.svg, tileElements, GRID_RADIUS);

  gameState.allTiles = tileElements;

  tileElementMap.clear();
  for (const tile of tileElements) {
    if (tile?.element) tileElementMap.set(tile.element, tile);
  }

  recomputeAllWordScores([]);

  if (!DOM.svg.dataset.swipeListeners) {
    DOM.svg.addEventListener('pointerdown', handlePointerDown, { passive: false });
    DOM.svg.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUp);
    DOM.svg.dataset.swipeListeners = 'true';
  }

  const clearButton = document.getElementById('clear-word');
  if (clearButton && !clearButton.dataset.listener) {
    clearButton.addEventListener('click', clearCurrentSelection);
    clearButton.dataset.listener = 'true';
  }

  console.log(`🎮 [initGrid] grid initialized — ${tileElements.length} tiles, tileElementMap size: ${tileElementMap.size}`);

  requestAnimationFrame(() => {
    gameState.gridReady = true;
    window.dispatchEvent(new Event('grid:ready'));
  });
}