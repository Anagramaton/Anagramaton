
// main.js
import { initializeGrid, handleTileClick, clearCurrentSelection } from './initGrid.js';
import { submitCurrentWord, resetSelectionState, recomputeAllWordScores } from './scoreLogic.js';
import { updateScoreDisplay, addWordToList } from './uiRenderer.js';
import { gameState } from './gameState.js';
import { initPhrasePanelEvents, revealPhrase } from './phrasePanel.js';
import { placedWords } from './gridLogic.js';
import { initMergedListPanel } from './mergedListPanel.js';
import { reuseMultipliers, letterPoints, lengthMultipliers, anagramMultiplier } from './constants.js';
import { buildBoardEntries, buildPool, solveExactNonBlocking } from './scoringAndSolver.js';
import { isValidWord } from './gameLogic.js';


// ===== GAME MODE (daily | unlimited) via URL param =====
const _params = new URLSearchParams(typeof location !== 'undefined' ? location.search : "");
gameState.mode = _params.get('mode') === 'daily' ? 'daily' : 'unlimited';
// (no new imports needed; you already import gameState above)

// --- ALERT SOUND ---
const alertSound = new Audio('sounds/alert.mp3');

function playAlertSound() {
  alertSound.currentTime = 0;
  alertSound.play();
}

// make it callable from other modules (scoreLogic, initGrid, etc.)
window.playAlertSound = playAlertSound;

// --- SUBMIT-LIST CELEBRATION SOUND ---
const submitListSound = new Audio('sounds/zapsplat_magic_wand_ascend_spell_beeps_12528 (2).mp3');


function playSubmitListSound() {
  try {
    submitListSound.currentTime = 0;
  } catch (_) {}
  submitListSound.play().catch(() => {});
}

// cache tile sounds that initGrid.js attached to window
const allNoteSounds = Array.isArray(window.tileSounds) ? window.tileSounds : [];


// --- UNLOCK ALERT + TILE + SUBMIT SOUNDS ON FIRST TOUCH/CLICK ---
window.addEventListener('pointerdown', function unlockAudio() {
  const prime = (audio) => {
    if (!audio) return;

    const prevMuted  = audio.muted;
    const prevVolume = audio.volume;

    audio.muted  = true;
    audio.volume = 0;

    const restore = () => {
      audio.pause();
      audio.currentTime = 0;
      audio.muted  = prevMuted;
      audio.volume = prevVolume;
    };

    const p = audio.play();
    if (p && typeof p.then === 'function') {
      p.then(restore).catch(() => {
        // even if play fails, restore original settings
        audio.muted  = prevMuted;
        audio.volume = prevVolume;
      });
    } else {
      restore();
    }
  };

  // prime alert sound
  prime(alertSound);

  // prime submit-list celebration sound
  prime(submitListSound);

  // prime each tile note (the originals we now reuse)
  allNoteSounds.forEach(prime);

  window.removeEventListener('pointerdown', unlockAudio);
}, { once: true });









// ------------------------------------------------------------
// Score state
// ------------------------------------------------------------
let baseTotal = 0;     // Sum of all word scores from recomputeAll()
let bonusTotal = 0;    // Sum of bonuses coming from score:delta events
let totalScore = 0;    // Rendered total = baseTotal + bonusTotal

const submittedWords = new Set(); // Prevent duplicate word strings
gameState.words = gameState.words || []; // [{ word, tiles, li, removeBtn, score }]




// ----------------------------------------------
// Submit List button enablement
// ----------------------------------------------
function syncSubmitListButton() {
  const btn = document.getElementById('submit-list');
  if (!btn) return;

  const count = (gameState.words || []).length;
  const locked = !!gameState.listLocked;
  const shouldEnable = !locked && count === 10;

  btn.toggleAttribute('disabled', !shouldEnable);
  btn.textContent = shouldEnable ? 'Submit List' : `Submit List (${count}/10)`;
}

// ----------------------------------------------
// Recompute scores for the current list
// ----------------------------------------------
function recomputeAll() {
  const entries = (gameState.words || []).map(w => ({ word: w.word, tiles: w.tiles }));
  const scores = recomputeAllWordScores(entries);

  baseTotal = 0;
  (gameState.words || []).forEach((w, i) => {
    const s = scores[i] || 0;
    w.score = s;
    baseTotal += s;

    const btn = w.removeBtn;
    w.li.textContent = `${w.word.toUpperCase()} (+${s})`;
    w.li.appendChild(btn);
  });

  totalScore = baseTotal + bonusTotal;
  updateScoreDisplay(totalScore);
}



// ----------------------------------------------
// Global bonus deltas
// ----------------------------------------------
window.addEventListener('score:delta', (e) => {
  const pts = e?.detail?.delta || 0;
  bonusTotal += pts;
  updateScoreDisplay(baseTotal + bonusTotal);
});

// ----------------------------------------------
// CURRENT WORD preview
// ----------------------------------------------
function updateCurrentWordDisplay() {
  const el = document.getElementById('current-word');
  if (!el) return;
  const letters = (gameState.selectedTiles || [])
    .map(t => String(t.letter || ''))
    .join('')
    .toUpperCase();
  el.textContent = letters;
}





// ----------------------------------------------
// Submit current selection as a word
// ----------------------------------------------
function handleSubmitWordClick() {
  const selectedTiles = gameState.selectedTiles || [];
  const word = selectedTiles.map(t => t.letter).join('').toUpperCase();


  // Capacity + duplicate guards
  if (submittedWords.size >= 10) {
    playAlertSound();
    alert('❌ You can only keep 10 words in your list at a time.');
    resetSelectionState();
    return;
  }
  if (submittedWords.has(word)) {
    playAlertSound();
    alert(`❌ You've already submitted "${word}".`);
    resetSelectionState();
    return;
  }

  // Validate & score once
  const wordScore = submitCurrentWord(selectedTiles);
  if (wordScore === null) {
    resetSelectionState();
    return;
  }

  // Add to UI list
  const result = addWordToList(word, wordScore);
  if (!result) {
    console.error('❌ Could not add word to list; missing #word-list in DOM');
    resetSelectionState();
    return;
  }
  const { li, removeBtn } = result;

  // Track with same tile objects
  gameState.words.push({ word, tiles: [...selectedTiles], li, removeBtn, score: wordScore });
  submittedWords.add(word);



// removal
removeBtn.addEventListener('click', () => {
  li.remove();                          // remove the word's list item from the page
  submittedWords.delete(word);          // delete it from the submitted set
  const idx = gameState.words.findIndex(w => w.li === li);
  if (idx !== -1) {
    gameState.words.splice(idx, 1);     // remove it from the game state list
  }
  recomputeAll();                       // update score and totals
  syncSubmitListButton();                // refresh submit button state 
});

recomputeAll();
syncSubmitListButton();
resetSelectionState();

}

// ----------------------------------------------
// Submit the entire list (exactly 10 words)
// ----------------------------------------------
async function handleSubmitList() {
  if (gameState.listLocked) return;

  const count = (gameState.words || []).length;
  if (count !== 10) return;

  // play celebration sound when the list is successfully submitted
  playSubmitListSound();

  const words = (gameState.words || []).map(w => String(w.word || '').toUpperCase());
  gameState.listLocked = true;


  document.getElementById('submit-list')?.setAttribute('disabled', 'disabled');
  document.getElementById('submit-word')?.setAttribute('disabled', 'disabled');
  (gameState.words || []).forEach(w => w?.removeBtn?.setAttribute?.('disabled', 'disabled'));
  syncSubmitListButton();

  // fresh recompute
  recomputeAll();

  const scoreEl = document.getElementById('score-display');
  const finalScoreText = scoreEl ? (scoreEl.textContent || 'SCORE: 0') : 'SCORE: 0';
  const finalScore = (typeof totalScore === 'number') ? totalScore : 0;

  // clear selection + current word
  resetSelectionState();
  const cw = document.getElementById('current-word');
  if (cw) cw.textContent = '';

// board words (from gridLogic.js) — keep PATHS intact
const placedWordList = Array.isArray(placedWords)
  ? placedWords
      .filter(Boolean)
      .map(p => (
        typeof p === 'string'
          ? { word: String(p).toUpperCase(), path: [] }         // strings get empty path
          : { word: String(p.word || '').toUpperCase(), path: p.path || [] } // preserve path
      ))
  : [];
const placedWordStrings = placedWordList.map(p => p.word);

  const wordsWithScores = (gameState.words || []).map(w => ({
    word: String(w.word || '').toUpperCase(),
    score: Number(w.score) || 0
  }));

const boardEntries = buildBoardEntries(placedWordList);
const { POOL } = buildPool(boardEntries, 250);

const { best10, finalTotal } = await solveExactNonBlocking({
  POOL,
  boardEntries,
  TARGET: 10,
  timeBudgetMs: 800,
});

gameState.boardTop10 = best10;
gameState.boardTop10Total = finalTotal;

  // defer so merged panel computes Top 10 first
  requestAnimationFrame(() => {
    const boardTop10      = Array.isArray(gameState.boardTop10) ? gameState.boardTop10 : [];
    const boardTop10Total = Number(gameState.boardTop10Total) || 0;

    window.dispatchEvent(new CustomEvent('round:over', {
      detail: {
        words,
        wordsWithScores,
        placedWords: placedWordStrings, // ✅ sends plain text to panel
        placedWordsWithPaths: placedWordList, // ✅ keep full data for replay/solver
        baseTotal,
        bonusTotal,
        totalScore: finalScore,
        finalScoreText,
        boardTop10,
        boardTop10Total
      }
    }));
  });
}

// =============================
// DOMContentLoaded Bootstrap
// =============================
document.addEventListener('DOMContentLoaded', () => {
  // --- Reset initial state ---
  baseTotal = 0;
  bonusTotal = 0;
  totalScore = 0;
  submittedWords.clear();
  gameState.words = [];
  gameState.listLocked = false;
  updateScoreDisplay(0);

  
  initializeGrid();
  

  // --- Right panel visibility based on mode ---
  if (gameState.mode === 'daily') {
    initPhrasePanelEvents();
  } else {
    const rightPanel = document.getElementById('right-panel');
    if (rightPanel) rightPanel.style.display = 'none';
    const toggleRight = document.getElementById('toggle-right');
    if (toggleRight) toggleRight.style.display = 'none';
  }

  // --- Build Left Panel Content ---
  const leftPanel = document.querySelector('#left-panel .panel-content');
  if (leftPanel) {
    leftPanel.innerHTML = `
      <h2>YOUR WORDS</h2>
      <button id="submit-list">Submit List</button>
      <ul id="word-list"></ul>
      <button id="new-game">New Game</button>
    `;

    // reattach event listeners
    document.getElementById('submit-list')
      ?.addEventListener('click', handleSubmitList);
    syncSubmitListButton();

document.getElementById('new-game')?.addEventListener('click', () => {
  // reset numbers
  baseTotal = 0;
  bonusTotal = 0;
  totalScore = 0;
  submittedWords.clear();
  gameState.words = [];
  gameState.listLocked = false;
  updateScoreDisplay(0);

  // close panels
  const leftPanelEl  = document.getElementById('left-panel');
  const rightPanelEl = document.getElementById('right-panel');
  const syncOpenState = () => {
    const leftOpen  = leftPanelEl?.classList.contains('open');
    const rightOpen = rightPanelEl?.classList.contains('open');
    document.body.classList.toggle('left-open',  !!leftOpen);
    document.body.classList.toggle('right-open', !!rightOpen);
    document.body.classList.toggle('panel-open', !!(leftOpen || rightOpen));
  };
  leftPanelEl?.classList.remove('open');
  rightPanelEl?.classList.remove('open');
  syncOpenState();

  // un-merge the left panel title
  const leftPanel = document.getElementById('left-panel');
  leftPanel?.classList.remove('is-merged');
  const h2 = document.querySelector('#left-panel .panel-content h2');
  if (h2) h2.textContent = 'YOUR WORDS';

  // re-enable buttons
  document.getElementById('submit-list')?.removeAttribute('disabled');
  document.getElementById('submit-word')?.removeAttribute('disabled');
  document
    .querySelectorAll('#word-list button, #word-list [data-role="remove"]')
    .forEach(btn => btn.removeAttribute('disabled'));

  // clear word list
  const wordList = document.getElementById('word-list');
  if (wordList) {
    wordList.classList.remove('is-hidden');
    wordList.innerHTML = '';
  }
  syncSubmitListButton();

  // make a fresh grid
  initializeGrid();

  // tell mergedListPanel to clear itself
  window.dispatchEvent(new Event('game:new'));
});

  }

  // --- General button + word actions ---
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('#submit-word');
    if (btn) handleSubmitWordClick(e);
  });

  document.getElementById('clear-word')
    ?.addEventListener('click', () => {
      resetSelectionState();
      const cw = document.getElementById('current-word');
      if (cw) cw.textContent = '';
    });

  // --- Selection preview updates ---
  window.addEventListener('selection:changed', updateCurrentWordDisplay);

  // ====================================================
  // PANEL + BACKDROP HANDLING (runs once at startup)
  // ====================================================
  const leftPanelEl  = document.getElementById('left-panel');
  const rightPanelEl = document.getElementById('right-panel');
  const backdrop     = document.getElementById('backdrop');

  const syncOpenState = () => {
    const leftOpen  = leftPanelEl?.classList.contains('open');
    const rightOpen = rightPanelEl?.classList.contains('open');
    document.body.classList.toggle('left-open',  !!leftOpen);
    document.body.classList.toggle('right-open', !!rightOpen);
    document.body.classList.toggle('panel-open', !!(leftOpen || rightOpen));
  };

  document.getElementById('toggle-left')?.addEventListener('click', () => {
    leftPanelEl?.classList.toggle('open');
    rightPanelEl?.classList.remove('open');
    syncOpenState();
  });

  document.getElementById('toggle-right')?.addEventListener('click', () => {
    rightPanelEl?.classList.toggle('open');
    leftPanelEl?.classList.remove('open');
    syncOpenState();
  });

  backdrop?.addEventListener('click', () => {
    leftPanelEl?.classList.remove('open');
    rightPanelEl?.classList.remove('open');
    syncOpenState();
  });

  // Initialize body classes for fallback if :has() unsupported
  syncOpenState();

  // ====================================================
  // OTHER INITIAL MODULES
  // ====================================================
  initMergedListPanel();

  // When merged list is shown, mark left panel as merged
  window.addEventListener('round:merged:show', () => {
    document.getElementById('left-panel')?.classList.add('is-merged');
  });
});



if (window.matchMedia('(max-width: 768px)').matches) {
  let dragging = false;
  let lastTile = null;
  let visitedTiles = new Set();

  const hex = document.getElementById('hex-grid');
  if (hex) {
    const startDrag = (e) => {
      const el = e.target.closest('.tile');
      if (!el) return;

      // Clear any previous selection (DOM + state + sounds)
      clearCurrentSelection();

      dragging = true;
      lastTile = null;
      visitedTiles = new Set();

      // Start a new selection for this swipe
      gameState.selectedTiles = [];

      hex.setPointerCapture(e.pointerId);

      // Use the normal click handler so swipe behaves like tapping
      const tileKey = el.getAttribute('data-key') || el.id;
      const tileObj = el.tileObject;
      if (!tileObj) return;

      visitedTiles.add(tileKey);
      handleTileClick(tileObj);
      console.log("Added tile object (startDrag):", tileObj); // <--- LOG HERE

      // Keep UI in sync (word preview + 'selection:changed' listeners)
      window.dispatchEvent(new Event('selection:changed'));
    };

    


    const moveDrag = (e) => {
      if (!dragging) return;
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const tile = hit && hit.closest('.tile');
      if (!tile) return;

      const tileKey = tile.getAttribute('data-key') || tile.id;
      if (visitedTiles.has(tileKey)) return;

      const tileObj = tile.tileObject;
      if (!tileObj) return;

      visitedTiles.add(tileKey);
      lastTile = tile;

      // Reuse the normal click handler for adjacency + sounds + preview
      handleTileClick(tileObj);
      console.log("Added tile object (moveDrag):", tileObj); // <--- LOG HERE

      window.dispatchEvent(new Event('selection:changed'));
    };

    

    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      lastTile = null;
      visitedTiles = new Set();
      try { hex.releasePointerCapture(e.pointerId); } catch (_) {}
    };

    hex.addEventListener('pointerdown', startDrag);
    hex.addEventListener('pointermove', moveDrag);
    hex.addEventListener('pointerup', endDrag);
    hex.addEventListener('pointercancel', endDrag);

    hex.style.touchAction = 'none';
  }
}




