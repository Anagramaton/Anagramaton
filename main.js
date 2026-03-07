import { initializeGrid } from './initGrid.js';
import { submitCurrentWord, resetSelectionState, recomputeAllWordScores } from './scoreLogic.js';
import { updateScoreDisplay, addWordToList } from './uiRenderer.js';
import { gameState } from './gameState.js';
import { placedWords } from './gridLogic.js';
import { initPhrasePanelEvents, revealPhrase, getHintMultiplier } from './phrasePanel.js';
import { initMergedListPanel } from './mergedListPanel.js';
import { reuseMultipliers, letterPoints, lengthMultipliers, anagramMultiplier } from './constants.js';
import { buildBoardEntries, buildPool, solveExactNonBlocking } from './scoringAndSolver.js';
import { isValidWord } from './gameLogic.js';
import { submitScore, getPlayerName, promptPlayerName } from './leaderboard.js';
import { unlockAndPreload, playSound } from './audioEngine.js'; // ← ADD THIS

// ============================================================
// AUDIO — simple <audio> tag system (no Web Audio API needed)
// ============================================================
let audioUnlocked = false;
window.addEventListener('pointerdown', async () => {
  if (audioUnlocked) return;
  audioUnlocked = true;
  await unlockAndPreload();
}, { once: true });

// ============================================================

function applySavedTheme() {
  const theme = localStorage.getItem('theme') || 'light';
  const access = localStorage.getItem('accessibility') || 'normal';
  const contrast = localStorage.getItem('contrast') || 'normal';

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

}

function setupThemeControls() {
  const themeBtn    = document.getElementById('toggle-theme');
  const accessBtn   = document.getElementById('toggle-access');
  const contrastBtn = document.getElementById('toggle-contrast');
  const modeBtn     = document.getElementById('toggle-mode');

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

  if (modeBtn) {
    modeBtn.textContent = gameState.mode === 'daily' ? '♾️ UNLIMITED' : '📅 DAILY';
    modeBtn.addEventListener('click', () => {
      const next = gameState.mode === 'daily' ? 'unlimited' : 'daily';
      window.location.href = `?mode=${next}`;
    });
  }

  if (gameState.mode === 'daily') {
    const resetDailyBtn = document.getElementById('reset-daily-btn');
    if (resetDailyBtn) {
      resetDailyBtn.hidden = false;
      resetDailyBtn.addEventListener('click', () => {
        if (gameState.dailyId) {
          localStorage.removeItem(`anagramaton_daily_${gameState.dailyId}`);
          window.location.href = '?mode=daily';
        }
      });
    }
  }
}

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

export function playAlert(msg) {
  const modal  = document.getElementById('alert-modal');
  const text   = document.getElementById('alert-text');
  const okBtn  = document.getElementById('alert-ok');

  text.textContent = msg;
  modal.classList.remove('hidden');

  playSound('sfxAlert');

  return new Promise(resolve => {
    okBtn.onclick = () => {
      modal.classList.add('hidden');
      resolve();
    };
  });
}

// ------------------------------------------------------------
let baseTotal  = 0;
let bonusTotal = 0;
let totalScore = 0;

const submittedWords = new Set();
gameState.words = gameState.words || [];

// ── Phrase pair helpers ────────────────────────────────────

/** Returns 'phrase1' | 'phrase2' | null if tiles spell out a full phrase. */
function checkPhraseMatch(tiles) {
  if (!tiles || tiles.length < 4) return null;
  if (gameState.mode !== 'daily' || !gameState.seedPhrase) return null;
  const letters = tiles.map(t => String(t.letter || '').toUpperCase()).join('');
  const { phrase1, phrase2 } = gameState.phraseCleanLetters || {};
  if (phrase1 && !gameState.phrasesFound.phrase1 && letters === phrase1) return 'phrase1';
  if (phrase2 && !gameState.phrasesFound.phrase2 && letters === phrase2) return 'phrase2';
  return null;
}

/** Returns true when both daily phrases have been found. */
function areBothPhrasesFound() {
  return !!(gameState.phrasesFound?.phrase1 && gameState.phrasesFound?.phrase2);
}

/** Returns the raw (spaced) phrase text for display. */
function getPhraseRawText(phraseKey) {
  const idx = phraseKey === 'phrase1' ? 0 : 1;
  const parts = (gameState.seedPhrase || '').split('/');
  return (parts[idx] || '').trim();
}

/** Applies the persistent border colour + one-shot celebration animation to found phrase tiles. */
function applyPhraseTileStyle(phraseKey, tiles) {
  const classNum = phraseKey === 'phrase1' ? '1' : '2';
  tiles.forEach((tile, idx) => {
    const poly = tile.element?.querySelector('polygon');
    if (poly) poly.classList.add(`phrase-tile-${classNum}`);
    if (tile.element) {
      tile.element.style.setProperty('--celebrate-delay', `${idx * 0.06}s`);
      tile.element.classList.add('phrase-celebrate');
      tile.element.addEventListener('animationend', () => {
        tile.element.classList.remove('phrase-celebrate');
        tile.element.style.removeProperty('--celebrate-delay');
      }, { once: true });
    }
  });
}

/** Called when a phrase is successfully found. */
async function handlePhraseFound(phraseKey, tiles) {
  gameState.phrasesFound[phraseKey] = true;

  applyPhraseTileStyle(phraseKey, tiles);
  playSound('sfxMagic');
  revealPhrase(phraseKey);

  const phraseNum = phraseKey === 'phrase1' ? 1 : 2;
  const rawPhrase = getPhraseRawText(phraseKey);

  if (areBothPhrasesFound()) {
    const otherKey = phraseKey === 'phrase1' ? 'phrase2' : 'phrase1';
    const otherPhrase = getPhraseRawText(otherKey);
    await playAlert(`🎉 You found BOTH phrases!\n"${rawPhrase}" & "${otherPhrase}"\n\nPhrase bonus unlocked — submit your list to collect it!`);
  } else {
    await playAlert(`🎉 Phrase ${phraseNum} found!\n"${rawPhrase}"\n\nFind phrase ${phraseNum === 1 ? 2 : 1} to unlock the phrase bonus!`);
  }
}

function syncSubmitListButton() {
  const btn = document.getElementById('submit-list');
  if (!btn) return;
  const count = (gameState.words || []).length;
  const locked = !!gameState.listLocked;
  const shouldEnable = !locked && count === 10;
  btn.toggleAttribute('disabled', !shouldEnable);
  btn.textContent = shouldEnable ? 'Submit List' : `Submit List (${count}/10)`;
}

function recomputeAll() {
  const entries = (gameState.words || []).map(w => ({ word: w.word, tiles: w.tiles }));
  const scores  = recomputeAllWordScores(entries);

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

window.addEventListener('score:delta', (e) => {
  const pts = e?.detail?.delta || 0;
  bonusTotal += pts;
  updateScoreDisplay(baseTotal + bonusTotal);
});

function updateCurrentWordDisplay() {
  const el = document.getElementById('current-word');
  if (!el) return;
  const letters = (gameState.selectedTiles || [])
    .map(t => String(t.letter || ''))
    .join('')
    .toUpperCase();
  el.textContent = letters;
}

async function handleSubmitWordClick() {
  const selectedTiles = gameState.selectedTiles || [];
  const word = selectedTiles.map(t => t.letter).join('').toUpperCase();

  // ── Phrase match check (before word validation) ──────────
  const phraseMatch = checkPhraseMatch(selectedTiles);
  if (phraseMatch) {
    await handlePhraseFound(phraseMatch, [...selectedTiles]);
    resetSelectionState();
    return;
  }

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

  const result = addWordToList(word, wordScore);
  if (!result) {
    console.error('❌ Could not add word to list; missing #word-list in DOM');
    resetSelectionState();
    return;
  }

  const { li, removeBtn } = result;

  gameState.words.push({ word, tiles: [...selectedTiles], li, removeBtn, score: wordScore });
  submittedWords.add(word);

  removeBtn.addEventListener('click', () => {
    li.remove();
    submittedWords.delete(word);
    const idx = gameState.words.findIndex(w => w.li === li);
    if (idx !== -1) gameState.words.splice(idx, 1);
    recomputeAll();
    syncSubmitListButton();
  });

  recomputeAll();
  syncSubmitListButton();

  playSound('sfxSuccess');

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

async function handleSubmitList() {
  if (gameState.listLocked) return;
  const count = (gameState.words || []).length;
  if (count !== 10) return;

  playSound('sfxMagic');

  const words = (gameState.words || []).map(w => String(w.word || '').toUpperCase());
  gameState.listLocked = true;

  document.getElementById('submit-list')?.setAttribute('disabled', 'disabled');
  document.getElementById('submit-word')?.setAttribute('disabled', 'disabled');
  (gameState.words || []).forEach(w => w?.removeBtn?.setAttribute?.('disabled', 'disabled'));
  syncSubmitListButton();

  recomputeAll();

  const bothPhrasesFound = areBothPhrasesFound();
  if (gameState.mode === 'daily' && bothPhrasesFound) {
    const hintMult = getHintMultiplier();
    bonusTotal += baseTotal * hintMult;
    totalScore  = baseTotal + bonusTotal;
    updateScoreDisplay(totalScore);
  }

  const scoreEl        = document.getElementById('score-display');
  const finalScoreText = scoreEl ? (scoreEl.textContent || 'SCORE: 0') : 'SCORE: 0';
  const finalScore     = (typeof totalScore === 'number') ? totalScore : 0;

  resetSelectionState();
  const cw = document.getElementById('current-word');
  if (cw) cw.textContent = '';

  const placedWordList = Array.isArray(placedWords)
    ? placedWords
        .filter(Boolean)
        .map(p => (
          typeof p === 'string'
            ? { word: String(p).toUpperCase(), path: [] }
            : { word: String(p.word || '').toUpperCase(), path: p.path || [] }
        ))
    : [];
  const placedWordStrings = placedWordList.map(p => p.word);

  const wordsWithScores = (gameState.words || []).map(w => ({
    word:  String(w.word || '').toUpperCase(),
    score: Number(w.score) || 0
  }));

  // Wait for the board solver to finish, but cap at 4s so mobile never hangs forever
  const solverTimeout = new Promise(resolve => setTimeout(resolve, 4000));
  await Promise.race([
    gameState.boardSolverReady ?? Promise.resolve(),
    solverTimeout
  ]);

  const phraseBonus = bothPhrasesFound ? (baseTotal * getHintMultiplier()) : 0;

  requestAnimationFrame(() => {
    const boardTop10      = Array.isArray(gameState.boardTop10) ? gameState.boardTop10 : [];
    const boardTop10Total = Number(gameState.boardTop10Total) || 0;

    window.dispatchEvent(new CustomEvent('round:over', {
      detail: {
        words,
        wordsWithScores,
        placedWords:           placedWordStrings,
        placedWordsWithPaths:  placedWordList,
        baseTotal,
        bonusTotal,
        totalScore:     finalScore,
        finalScoreText,
        boardTop10,
        boardTop10Total,
        dailyId:        gameState.mode === 'daily' ? (gameState.dailyId || null) : null,
        phrasesFound:   { ...gameState.phrasesFound },
        bothPhrasesFound,
        phraseBonus,
      }
    }));
  });

  if (gameState.mode === 'daily' && gameState.dailyId) {
    const dailyResult = {
      dailyId:    gameState.dailyId,
      score:      finalScore,
      words:      words,
      hintsUsed:  gameState.hintsUsed,
    };
    localStorage.setItem(`anagramaton_daily_${gameState.dailyId}`, JSON.stringify(dailyResult));

    // Submit score to leaderboard (fire-and-forget)
    (async () => {
      let playerName = getPlayerName();
      if (!playerName) {
        await promptPlayerName();
        playerName = getPlayerName();
        // Update set-name-btn text after name is set
        const nameBtn = document.getElementById('set-name-btn');
        if (nameBtn) {
          nameBtn.textContent = playerName ? `👤 ${playerName.toUpperCase()}` : '👤 SET NAME';
        }
      }
      if (playerName) {
        await submitScore(gameState.dailyId, finalScore, words, gameState.hintsUsed || 0);
      }
    })();
  }
}

// =============================
// DOMContentLoaded Bootstrap
// =============================
document.addEventListener('DOMContentLoaded', () => {

    // ============================
  // ★ SPLASH SCREEN
  // ============================
  const splashScreen   = document.getElementById('splash-screen');
  const splashPlayBtn  = document.getElementById('splash-play-btn');
  const splashHowtoBtn = document.getElementById('splash-howto-btn');

  const VISITED_KEY = 'anagramaton_visited';
  const isFirstVisit = !localStorage.getItem(VISITED_KEY);

  function openHowtoIfFirstVisit(delay = 300) {
    if (!isFirstVisit) return;
    localStorage.setItem(VISITED_KEY, '1');
    setTimeout(() => window.howto?.open(), delay);
  }

  if (splashPlayBtn && splashScreen) {
    let playerClickedPlay = false;

    if (!gameState.gridReady) {
      splashPlayBtn.textContent = 'LOADING...';
      splashPlayBtn.setAttribute('disabled', 'disabled');
    }

    window.addEventListener('grid:ready', () => {
      splashPlayBtn.textContent = 'PLAY';
      splashPlayBtn.removeAttribute('disabled');
      if (playerClickedPlay) {
        (async () => {
          if (!audioUnlocked) {
            audioUnlocked = true;
            await unlockAndPreload();
          }
          playSound('sfxUnlock');
          splashScreen.classList.add('hidden');
          openHowtoIfFirstVisit(300);
        })();
      }
    }, { once: true });

    splashPlayBtn.addEventListener('click', async () => {
      playerClickedPlay = true;
      if (!gameState.gridReady) return;
      if (!audioUnlocked) {
        audioUnlocked = true;
        await unlockAndPreload();
      }
      playSound('sfxUnlock');
      splashScreen.classList.add('hidden');
      openHowtoIfFirstVisit(300);
    }, { once: true });
  }

  // HOW TO PLAY button on splash screen
  splashHowtoBtn?.addEventListener('click', async () => {
    splashScreen?.classList.add('hidden');
    if (!audioUnlocked) {
      audioUnlocked = true;
      await unlockAndPreload();
    }
    playSound('sfxUnlock');
    openHowtoIfFirstVisit(100);
    if (!isFirstVisit) setTimeout(() => window.howto?.open(), 100);
  });
  // ============================

  applySavedTheme();
  setupThemeControls();
  preferOsDarkOnFirstVisit();

  // ============================
  // SETTINGS DROPDOWN (⚙️)
  // ============================
  const settingsWrap = document.getElementById('settings-wrap');
  const settingsBtn  = document.getElementById('settings-btn');
  const settingsMenu = document.getElementById('settings-menu');

  settingsBtn.addEventListener('click', () => {
    settingsMenu.hidden = !settingsMenu.hidden;
    settingsWrap.classList.toggle('menu-open', !settingsMenu.hidden);
  });

  document.addEventListener('click', (e) => {
    if (!settingsWrap.contains(e.target)) {
      settingsMenu.hidden = true;
      settingsWrap.classList.remove('menu-open');
    }
  });

  // ============================
  // SET NAME BUTTON
  // ============================
  const setNameBtn = document.getElementById('set-name-btn');
  if (setNameBtn) {
    const existingName = getPlayerName();
    if (existingName) setNameBtn.textContent = `👤 ${existingName.toUpperCase()}`;

    setNameBtn.addEventListener('click', async () => {
      await promptPlayerName();
      const saved = getPlayerName();
      setNameBtn.textContent = saved ? `👤 ${saved.toUpperCase()}` : '👤 SET NAME';
    });
  }

  // --- Reset initial state ---
  baseTotal  = 0;
  bonusTotal = 0;
  totalScore = 0;
  submittedWords.clear();
  gameState.words      = [];
  gameState.listLocked = false;
  updateScoreDisplay(0);

  initializeGrid();

  // --- Right panel visibility based on mode ---
  if (gameState.mode === 'daily') {
    initPhrasePanelEvents();
  } else {
    const rightPanel  = document.getElementById('right-panel');
    if (rightPanel)  rightPanel.style.display  = 'none';
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

    document.getElementById('submit-list')
      ?.addEventListener('click', handleSubmitList);
    syncSubmitListButton();

document.getElementById('new-game')?.addEventListener('click', () => {
  baseTotal  = 0;
  bonusTotal = 0;
  totalScore = 0;
  submittedWords.clear();
  gameState.words           = [];
  gameState.listLocked      = false;
  gameState.phrasesFound    = { phrase1: false, phrase2: false };
  gameState.boardTop10      = [];    
  gameState.boardTop10Total = 0;     
  gameState.boardTop10Paths = [];    
  gameState.playerTop10      = [];   
  gameState.playerTop10Total = 0; 
      updateScoreDisplay(0);

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

      const leftPanelInner = document.getElementById('left-panel');
      leftPanelInner?.classList.remove('is-merged');
      const h2 = document.querySelector('#left-panel .panel-content h2');
      if (h2) h2.textContent = 'YOUR WORDS';

      document.getElementById('submit-list')?.removeAttribute('disabled');
      document.getElementById('submit-word')?.removeAttribute('disabled');
      document
        .querySelectorAll('#word-list button, #word-list [data-role="remove"]')
        .forEach(btn => btn.removeAttribute('disabled'));

      const wordList = document.getElementById('word-list');
      if (wordList) {
        wordList.classList.remove('is-hidden');
        wordList.innerHTML = '';
      }
      syncSubmitListButton();

      initializeGrid();

      window.dispatchEvent(new Event('game:new'));
    });
  }

  // Check if player already completed today's daily
  if (gameState.mode === 'daily' && gameState.dailyId) {
    const savedResult = localStorage.getItem(`anagramaton_daily_${gameState.dailyId}`);
    if (savedResult) {
      const result = JSON.parse(savedResult);
      playAlert(
        `✅ You already completed today's daily!\n\nScore: ${result.score}\nWords: ${result.words.join(', ')}\nHints used: ${result.hintsUsed}`
      );
    }
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

  window.addEventListener('selection:changed', updateCurrentWordDisplay);

  // ====================================================
  // PANEL + BACKDROP HANDLING
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

  syncOpenState();

  // ====================================================
  // OTHER INITIAL MODULES
  // ====================================================
  initMergedListPanel();

  window.addEventListener('round:merged:show', () => {
    document.getElementById('left-panel')?.classList.add('is-merged');
  });
});