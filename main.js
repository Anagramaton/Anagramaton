console.log = () => {};
// main.js
import { initializeGrid } from './initGrid.js';
import { submitCurrentWord, resetSelectionState, recomputeAllWordScores } from './scoreLogic.js';
import { updateScoreDisplay, addWordToList } from './uiRenderer.js';
import { gameState } from './gameState.js';
import { initPhrasePanelEvents, revealPhrase } from './phrasePanel.js';
import { placedWords } from './gridLogic.js';
import { initMergedListPanel } from './mergedListPanel.js';
import { reuseMultipliers } from './constants.js';



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
    alert('❌ You can only keep 10 words in your list at a time.');
    resetSelectionState();
    return;
  }
  if (submittedWords.has(word)) {
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
function handleSubmitList() {
  if (gameState.listLocked) return;

  const count = (gameState.words || []).length;
  if (count !== 10) return;

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

  // board words (from gridLogic.js)
  const placedWordList = (placedWords || [])
    .map(p => (typeof p === 'string' ? p : p?.word))
    .filter(Boolean)
    .map(w => String(w).toUpperCase());

  const wordsWithScores = (gameState.words || []).map(w => ({
    word: String(w.word || '').toUpperCase(),
    score: Number(w.score) || 0
  }));

  // defer so merged panel computes Top 10 first
  requestAnimationFrame(() => {
    const boardTop10      = Array.isArray(gameState.boardTop10) ? gameState.boardTop10 : [];
    const boardTop10Total = Number(gameState.boardTop10Total) || 0;

    window.dispatchEvent(new CustomEvent('round:over', {
      detail: {
        words,
        wordsWithScores,
        placedWords: placedWordList,
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

// ----------------------------------------------
// DOMContentLoaded bootstrap
// ----------------------------------------------


document.addEventListener('DOMContentLoaded', () => {
  // reset state
  baseTotal = 0;
  bonusTotal = 0;
  totalScore = 0;
  submittedWords.clear();
  gameState.words = [];
  gameState.listLocked = false;
  updateScoreDisplay(0);

  // grid + phrase panel
  initializeGrid();
  initPhrasePanelEvents();

const leftPanel = document.querySelector('#left-panel .panel-content');
if (leftPanel) {
  leftPanel.innerHTML = `
    <h2>YOUR WORDS</h2>
    <ul id="word-list"></ul>
    <button id="submit-list">Submit List</button>
    <button id="new-game">New Game</button>
  `;

  // re-attach event listeners
  document.getElementById('submit-list')
    ?.addEventListener('click', handleSubmitList);
  syncSubmitListButton();

  document.getElementById('new-game')
    ?.addEventListener('click', () => {
      window.dispatchEvent(new Event('game:new'));
    });
}
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

  // preview + panel toggles
  window.addEventListener('selection:changed', updateCurrentWordDisplay);

  document.getElementById('toggle-left')
    ?.addEventListener('click', () =>
      document.getElementById('left-panel')?.classList.toggle('open')
    );

  document.getElementById('toggle-right')
    ?.addEventListener('click', () =>
      document.getElementById('right-panel')?.classList.toggle('open')
    );

  // merged list panel last
  initMergedListPanel();

  // When merged list is shown, mark left panel as merged
  window.addEventListener('round:merged:show', () => {
    document.getElementById('left-panel')?.classList.add('is-merged');
  });

// NEW GAME wiring
document.getElementById('new-game')
  ?.addEventListener('click', () => {
    // --- Reset game state ---
    baseTotal = 0;
    bonusTotal = 0;
    totalScore = 0;
    submittedWords.clear();
    gameState.words = [];
    gameState.listLocked = false;
    updateScoreDisplay(0);

    // --- Restore left panel header + classes ---
    const leftPanel = document.getElementById('left-panel');
    leftPanel?.classList.remove('is-merged');
    const h2 = document.querySelector('#left-panel .panel-content h2');
    if (h2) h2.textContent = 'YOUR WORDS';

        // ✅ Re-enable top-level buttons
    document.getElementById('submit-list')?.removeAttribute('disabled');
    document.getElementById('submit-word')?.removeAttribute('disabled');
        document.querySelectorAll('#word-list button, #word-list [data-role="remove"]')
      .forEach(btn => btn.removeAttribute('disabled'));

    // --- Clear out word list UI completely ---
    const wordList = document.getElementById('word-list');
    if (wordList) {
      wordList.classList.remove('is-hidden');
      wordList.innerHTML = ''; // remove any old words
    }
    syncSubmitListButton();

    // --- Generate a new grid ---
    initializeGrid();

    // --- Tell other modules (like mergedlistpanel.js) to clean up ---
    window.dispatchEvent(new Event('game:new'));
  });


});





