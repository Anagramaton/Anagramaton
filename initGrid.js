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

function updateWordPreview() {
  const selectedTiles = gameState.selectedTiles || [];
  const selectedWord = selectedTiles.map(t => t.letter).join('');
  const wordPreviewElement = document.getElementById('current-word');
  if (wordPreviewElement) {
    
    wordPreviewElement.textContent = selectedWord.toUpperCase();
  }
}

export function handleTileClick(tile) {
  

  const isPanelOpen =
    document.getElementById('left-panel').classList.contains('open') ||
    document.getElementById('right-panel').classList.contains('open');
  if (isPanelOpen) {
    
    return;
  }

  if (!Array.isArray(gameState.selectedTiles)) {
    
    gameState.selectedTiles = [];
  }

  const selectedTiles = gameState.selectedTiles;

  if (selectedTiles.includes(tile)) {
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

  if (selectedTiles.length === 0) {
    console.log("Selecting first tile");
    tile.element.classList.add('selected');
    selectedTiles.push(tile);
    updateWordPreview();
    return;
  }

  const lastTile = selectedTiles[selectedTiles.length - 1];
  if (areAxialNeighbors(lastTile, tile)) {
    
    tile.element.classList.add('selected');
    selectedTiles.push(tile);
    updateWordPreview();
  } else {
    
  }
}

export function clearCurrentSelection() {
  
  const selectedTiles = gameState.selectedTiles || [];
  
  selectedTiles.forEach(tile => tile.element.classList.remove('selected'));
  gameState.selectedTiles = [];
  updateWordPreview();
}

export function initializeGrid() {
  gameState.totalScore = 0;
  tileElements.length = 0;

  grid = generateSeededBoard(GRID_RADIUS, gameState);
  gameState.grid = grid;

  renderGrid(grid, DOM.svg, tileElements, handleTileClick, GRID_RADIUS);

  const clearButton = document.getElementById('clear-word');
  if (clearButton && !clearButton.dataset.listener) {
   
    clearButton.addEventListener('click', clearCurrentSelection);
    clearButton.dataset.listener = 'true';
  } else {
    
  }
}
