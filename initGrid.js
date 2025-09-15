
import { generateSeededBoard } from './gridLogic.js';
import { renderGrid } from './gridRenderer.js';
import { gameState } from './gameState.js';
import { GRID_RADIUS } from './constants.js';
import { areAxialNeighbors } from './utils.js';


export const DOM = {
  svg: document.getElementById('hex-grid'),
  wordList: document.getElementById('word-list'),
};


export let tileElements = [];
export let grid;

// ============================================================================
// UI Helpers
// ============================================================================

function updateWordPreview() {
  const selectedTiles = gameState.selectedTiles || [];
  const selectedWord = selectedTiles.map(t => t.letter).join('');
  const wordPreviewElement = document.getElementById('current-word');
  if (wordPreviewElement) {
    // Keep as-is: uppercasing output
    wordPreviewElement.textContent = selectedWord.toUpperCase();
  }
}


export function clearCurrentSelection() {
  const selectedTiles = gameState.selectedTiles || [];
  selectedTiles.forEach(tile => tile.element.classList.remove('selected'));
  gameState.selectedTiles = [];
  updateWordPreview();
}

// ============================================================================
// Event Handlers
// ============================================================================


export function handleTileClick(tile) {


 
  if (!Array.isArray(gameState.selectedTiles)) {
    gameState.selectedTiles = [];
  }
  const selectedTiles = gameState.selectedTiles;

  // --- If tile already selected...
  if (selectedTiles.includes(tile)) {
    // ...allow deselect only if it's the last selected (stack pop)
    if (tile === selectedTiles[selectedTiles.length - 1]) {
      selectedTiles.pop();
      tile.element.classList.remove('selected');
      updateWordPreview();
    } else {
      console.warn("Tried to deselect non-last tile");
      alert('❌ You can only deselect the most recently selected tile.');
    }
    return;
  }

  // --- If this is the first selection
  if (selectedTiles.length === 0) {
    console.log("Selecting first tile");
    tile.element.classList.add('selected');
    selectedTiles.push(tile);
    updateWordPreview();
    return;
  }

  // --- Otherwise enforce adjacency to the last selected tile
  const lastTile = selectedTiles[selectedTiles.length - 1];
  if (areAxialNeighbors(lastTile, tile)) {
    tile.element.classList.add('selected');
    selectedTiles.push(tile);
    updateWordPreview();
  } else {
  }
}

// ============================================================================
// Initialization
// ============================================================================


export function initializeGrid() {
  gameState.totalScore = 0;
  tileElements.length = 0;

  grid = generateSeededBoard(GRID_RADIUS, gameState);
  gameState.grid = grid;

  renderGrid(grid, DOM.svg, tileElements, handleTileClick, GRID_RADIUS);
  gameState.allTiles = tileElements;

  const clearButton = document.getElementById('clear-word');
  if (clearButton && !clearButton.dataset.listener) {
    clearButton.addEventListener('click', clearCurrentSelection);
    clearButton.dataset.listener = 'true';
  } else {

  }
}
