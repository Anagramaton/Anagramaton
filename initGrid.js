import { generateSeededBoard, placedWords } from './gridLogic.js';
import { playSound } from './audioEngine.js';
import { renderGrid } from './gridRenderer.js';
import { gameState } from './gameState.js';
import { GRID_RADIUS } from './constants.js';
import { areAxialNeighbors } from './utils.js';
import { isValidWord } from './gameLogic.js';
import { recomputeAllWordScores } from './scoreLogic.js';
import { buildBoardEntries, buildPool, solveExactNonBlocking } from './scoringAndSolver.js';

export const DOM = {
  svg: document.getElementById('hex-grid'),
  wordList: document.getElementById('word-list'),
};
export let tileElements = [];
export let grid;

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
      playSound(`sfxSwipe${index}`);
    }
  }
}

function handlePointerDown(e) {
  e.preventDefault();

  const tile = getTileAtPoint(e.clientX, e.clientY);
  if (!tile) return;

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

  const tile = getTileAtPoint(e.clientX, e.clientY);
  if (!tile) return;
  if (tile === lastHoverTile) return;

  handleSwipeTileStep(tile);
  lastHoverTile = tile;
}

function handlePointerUp(e) {
  isDragging = false;
  lastHoverTile = null;
  updateWordPreview();
  // Auto-submit when drag ends, if any tiles are selected
  if ((gameState.selectedTiles || []).length > 0) {
    window.dispatchEvent(new Event('word:autosubmit'));
  }
}

// ============================================================================
// Prebuilt board helpers (daily mode)
// ============================================================================

/** Returns today's date string in EST (UTC-5), e.g. "2026-04-17". */
function getTodayEST() {
  const EST_OFFSET_MS = -5 * 60 * 60 * 1000;
  const nowEst = new Date(Date.now() + EST_OFFSET_MS);
  const y = nowEst.getUTCFullYear();
  const m = String(nowEst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(nowEst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Fetches /prebuiltBoards.json and returns it if the date matches today, else null. */
async function fetchTodaysPrebuiltBoard() {
  try {
    const res = await fetch('/prebuiltBoards.json');
    if (!res.ok) return null;
    const board = await res.json();
    if (board.date !== getTodayEST()) return null;
    return board;
  } catch {
    return null;
  }
}

/** Kicks off the background board solver after a prebuilt board is loaded. */
function runSolverInBackground(boardEntries, POOL) {
  requestAnimationFrame(() => {
    setTimeout(async () => {
      try {
        const { best10, finalTotal } = await solveExactNonBlocking({
          POOL,
          boardEntries,
          TARGET: 10,
          timeBudgetMs: 2500,
          sliceMs: 16,
          hardNodeCap: 600_000,
          earlyAcceptRatio: 1.01,
        });
        if (best10?.length) {
          gameState.boardTop10 = best10;
          gameState.boardTop10Total = Number(finalTotal) || 0;
          gameState.boardTop10Paths = best10.map(x => {
            const be = boardEntries.find(b => b.word === x.word);
            return be ? be.tiles.map(t => t.key) : [];
          });
        }
      } catch (e) {
        console.error('Exact solver error:', e);
      } finally {
        gameState._resolveBoardSolver?.();
      }
    }, 0);
  });
}

// ============================================================================
// Initialization
// ============================================================================

export async function initializeGrid() {
  gameState.totalScore = 0;
  gameState.gridReady = false;

  // Pre-set dailyId synchronously so code that runs immediately after the
  // (un-awaited) initializeGrid() call has a valid value, e.g. the
  // already-completed-today localStorage check in main.js.
  if (gameState.mode === 'daily') {
    gameState.dailyId = getTodayEST().replace(/-/g, '_');
  }

  gameState.boardSolverReady = new Promise((resolve) => {
    gameState._resolveBoardSolver = resolve;
  });

  tileElements.length = 0;

  let usedPrebuilt = false;

  if (gameState.mode === 'daily') {
    const board = await fetchTodaysPrebuiltBoard();
    if (board) {
      usedPrebuilt = true;
      grid = board.grid;
      gameState.dailyId            = board.date.replace(/-/g, '_');
      gameState.seedPhrase         = board.seedPhrase;
      gameState.seedPaths          = board.seedPaths;
      gameState.seedHints          = board.seedHints;
      gameState.anagramList        = board.anagramList ?? [];
      gameState.phrasesFound       = { phrase1: false, phrase2: false };
      gameState.phraseOccupiedKeys = null;
      gameState.phraseAdjacentKeys = null;

      const parts = (board.seedPhrase || '').split('/');
      gameState.phraseCleanLetters = {
        phrase1: (parts[0] || '').replace(/[^A-Za-z]/g, '').toUpperCase(),
        phrase2: (parts[1] || '').replace(/[^A-Za-z]/g, '').toUpperCase(),
      };

      // Populate the shared placedWords array used by scoring/solver
      placedWords.length = 0;
      for (const pw of board.placedWords) {
        placedWords.push({ word: pw.word, path: pw.path });
      }

      const boardEntries = buildBoardEntries(placedWords);
      const { POOL } = buildPool(boardEntries);
      runSolverInBackground(boardEntries, POOL);
    }
  }

  if (!usedPrebuilt) {
    grid = generateSeededBoard(GRID_RADIUS, gameState);
  }

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

  requestAnimationFrame(() => {
    gameState.gridReady = true;
    window.dispatchEvent(new Event('grid:ready'));
  });
}