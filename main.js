import { initializeGrid } from './initGrid.js';
import { submitCurrentWord, resetSelectionState, recomputeAllWordScores } from './scoreLogic.js';
import { updateScoreDisplay, addWordToList } from './uiRenderer.js';
import { gameState } from './gameState.js';
import { initPhrasePanelEvents, revealPhrase } from './phrasePanel.js';
import { placedWords } from './gridLogic.js';
import { initMergedListPanel } from './mergedListPanel.js';
import { reuseMultipliers, letterPoints, lengthMultipliers, anagramMultiplier } from './constants.js';
import { buildBoardEntries, buildPool, solveExactNonBlocking } from './scoringAndSolver.js';
import { isValidWord } from './gameLogic.js';
import { loadSound, playSound } from './gameAudio.js';

function applySavedTheme() {
  const theme = localStorage.getItem('theme') || 'light';            // 'light' | 'dark'
  const access = localStorage.getItem('accessibility') || 'normal';  // 'normal' | 'colorblind'
  const contrast = localStorage.getItem('contrast') || 'normal';     // 'normal' | 'high'

  document.body.setAttribute('data-theme', theme);
  document.body.setAttribute('data-accessibility', access);
  document.body.setAttribute('data-contrast', contrast);

  const themeBtn = document.getElementById('toggle-theme');
  const accessBtn = document.getElementById('toggle-access');
  const contrastBtn = document.getElementById('toggle-contrast');

  if (themeBtn) {
    themeBtn.setAttribute('aria-pressed', String(theme === 'dark'));
    themeBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
    themeBtn.title = theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
  }

  if (accessBtn) {
    accessBtn.setAttribute('aria-pressed', String(access === 'colorblind'));
    accessBtn.textContent = access === 'colorblind' ? '🌓' : '🌒';
    accessBtn.title = access === 'colorblind' ? 'Disable Colorblind Mode' : 'Enable Colorblind Mode';
  }

  if (contrastBtn) {
    contrastBtn.setAttribute('aria-pressed', String(contrast === 'high'));
    contrastBtn.textContent = contrast === 'high' ? '◻️' : '◼️';
    contrastBtn.title = contrast === 'high'
      ? 'Disable High Contrast Mode'
      : 'Enable High Contrast Mode';
  }
}

function setupThemeControls() {
  const themeBtn = document.getElementById('toggle-theme');
  const accessBtn = document.getElementById('toggle-access');
  const contrastBtn = document.getElementById('toggle-contrast');

  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const current = document.body.getAttribute('data-theme') || 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      document.body.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
      themeBtn.setAttribute('aria-pressed', String(next === 'dark'));
      themeBtn.textContent = next === 'dark' ? '☀️' : '🌙';
      themeBtn.title = next === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
    });
  }

  if (accessBtn) {
    accessBtn.addEventListener('click', () => {
      const current = document.body.getAttribute('data-accessibility') || 'normal';
      const next = current === 'colorblind' ? 'normal' : 'colorblind';
      document.body.setAttribute('data-accessibility', next);
      localStorage.setItem('accessibility', next);
      accessBtn.setAttribute('aria-pressed', String(next === 'colorblind'));
      accessBtn.textContent = next === 'colorblind' ? '🌓' : '🌒';
      accessBtn.title = next === 'colorblind' ? 'Disable Colorblind Mode' : 'Enable Colorblind Mode';
    });
  }

  if (contrastBtn) {
    contrastBtn.addEventListener('click', () => {
      const current = document.body.getAttribute('data-contrast') || 'normal';
      const next = current === 'high' ? 'normal' : 'high';
      document.body.setAttribute('data-contrast', next);
      localStorage.setItem('contrast', next);

      contrastBtn.setAttribute('aria-pressed', String(next === 'high'));
      contrastBtn.textContent = next === 'high' ? '◻️' : '◼️';
      contrastBtn.title = next === 'high'
        ? 'Disable High Contrast Mode'
        : 'Enable High Contrast Mode';
    });
  }
}


// Optional: honor OS dark preference on first visit if no saved choice
function preferOsDarkOnFirstVisit() {
  const hasSaved = localStorage.getItem('theme');
  if (hasSaved) return;
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (prefersDark) {
    document.body.setAttribute('data-theme', 'dark');
    localStorage.setItem('theme', 'dark');
    const themeBtn = document.getElementById('toggle-theme');
    if (themeBtn) {
      themeBtn.setAttribute('aria-pressed', 'true');
      themeBtn.textContent = '☀️';
      themeBtn.title = 'Switch to Light Mode';
    }
  }
}

// ===== GAME MODE (daily | unlimited) via URL param =====
const _params = new URLSearchParams(typeof location !== 'undefined' ? location.search : "");
gameState.mode = _params.get('mode') === 'daily' ? 'daily' : 'unlimited';

// Load all game audio (alert, success, swipe1–14)
async function loadAllGameAudio() {
  await loadSound('alert', './audio/alert.mp3');
  await loadSound('success', './audio/ohyeahh.mp3');
  await loadSound('magic', './audio/zapsplat_magic_wand_ascend_spell_beeps_12528.mp3');

  for (let i = 1; i <= 14; i++) {
    await loadSound(`swipe${i}`, `./audio/ascend${i}.mp3`);
  }
}

export function playAlert(msg) {
  const modal = document.getElementById('alert-modal');
  const text = document.getElementById('alert-text');
  const okBtn = document.getElementById('alert-ok');

  text.textContent = msg;
  modal.classList.remove('hidden');

  // Web Audio alert sound
  playSound('alert');

  return new Promise(resolve => {
    okBtn.onclick = () => {
      modal.classList.add('hidden');
      resolve();
    };
  });
}

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
async function handleSubmitWordClick() {
  const selectedTiles = gameState.selectedTiles || [];
  const word = selectedTiles.map(t => t.letter).join('').toUpperCase();

  if (submittedWords.size >= 10) {
    await playAlert('❌ You can only keep 10 words in your list at a time.');
    resetSelectionState();
    return;
  }

  if (submittedWords.has(word)) {
    await playAlert(`❌ You've already submitted "${word}".`);
    resetSelectionState();
    return;
  }

  const wordScore = await submitCurrentWord(selectedTiles);
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

  // Setup removal
  removeBtn.addEventListener('click', () => {
    li.remove();
    submittedWords.delete(word);
    const idx = gameState.words.findIndex(w => w.li === li);
    if (idx !== -1) {
      gameState.words.splice(idx, 1);
    }
    recomputeAll();
    syncSubmitListButton();
  });

  recomputeAll();
  syncSubmitListButton();

  playSound('success');

  const currentWordEl = document.getElementById('current-word');
  if (currentWordEl) {
    currentWordEl.classList.add('puff-out-hor');
    currentWordEl.addEventListener('animationend', () => {
      currentWordEl.classList.remove('puff-out-hor');
      currentWordEl.textContent = '';
      resetSelectionState();
    }, { once: true });
  }
}

// ----------------------------------------------
// Submit the entire list (exactly 10 words)
// ----------------------------------------------
async function handleSubmitList() {
  if (gameState.listLocked) return;

  const count = (gameState.words || []).length;
  if (count !== 10) return;

  playSound('magic');

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

  requestAnimationFrame(() => {
    const boardTop10      = Array.isArray(gameState.boardTop10) ? gameState.boardTop10 : [];
    const boardTop10Total = Number(gameState.boardTop10Total) || 0;

    window.dispatchEvent(new CustomEvent('round:over', {
      detail: {
        words,
        wordsWithScores,
        placedWords: placedWordStrings,
        placedWordsWithPaths: placedWordList,
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
  // Kick off loading all audio (fire-and-forget)
  loadAllGameAudio();

  // Initialize theme + accessibility preferences
  applySavedTheme();
  setupThemeControls();
  preferOsDarkOnFirstVisit(); 
  // ============================
// SETTINGS DROPDOWN (⚙️)
// ============================

const settingsWrap = document.getElementById("settings-wrap");
const settingsBtn = document.getElementById("settings-btn");
const settingsMenu = document.getElementById("settings-menu");

settingsBtn.addEventListener("click", () => {
  settingsMenu.hidden = !settingsMenu.hidden;
  settingsWrap.classList.toggle("menu-open", !settingsMenu.hidden);
});

document.addEventListener("click", (e) => {
  if (!settingsWrap.contains(e.target)) {
    settingsMenu.hidden = true;
    settingsWrap.classList.remove("menu-open");
  }
});



  // First-tap overlay to unlock audio on mobile
  const startOverlay = document.getElementById('start-overlay');
  const startButton  = document.getElementById('start-button');
  if (startOverlay && startButton) {
    startButton.addEventListener('click', () => {
      // This user gesture will unlock Web Audio on mobile
      playSound('success'); // or 'alert' or any other loaded sound key
      startOverlay.style.display = 'none';
    });
  }

  // --- Reset initial state ---
  baseTotal = 0;
  bonusTotal = 0;
  totalScore = 0;
  submittedWords.clear();
  gameState.words = [];
  gameState.listLocked = false;
  updateScoreDisplay(0);

  initializeGrid();

  const grid = document.getElementById('hex-grid');
  ['pointerdown','pointermove','pointerup'].forEach(type => {
    grid.addEventListener(type, e => {
      console.log(type, e.pointerType);
    });
  });

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

  window.dispatchEvent(new Event('selection:changed'));

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



