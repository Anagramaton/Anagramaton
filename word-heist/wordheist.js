// wordheist.js — Word Heist Game Controller
// ES Module; imports wordPool from ./heistWords.js

import { wordPool } from './heistWords.js';

/* ════════════════════════════════════════════
   CONSTANTS
   ════════════════════════════════════════════ */

const THEMES = ['noir', 'neon', 'gold', 'chalk', 'blueprint', 'sunrise'];

const THEME_LABELS = {
  noir:      '🌑 Noir',
  neon:      '⚡ Neon',
  gold:      '✨ Gold',
  chalk:     '🍀 Chalk',
  blueprint: '📐 Blueprint',
  sunrise:   '🌅 Sunrise',
};

/* ════════════════════════════════════════════
   GAME STATE
   ════════════════════════════════════════════ */

const state = {
  mode: null,           // 'classic' | 'blitz'
  theme: null,

  // Classic mode
  wordsPerRound: 10,
  totalRounds: 3,
  currentRound: 1,
  wordsInRound: 0,      // words completed in current round

  // Blitz mode
  timeLimit: 120,       // seconds
  timeRemaining: 0,
  timerInterval: null,

  // Per-word state
  currentWord: null,    // { word: string, hint: string[] }
  scrambledWord: '',
  enteredLetters: [],
  wordStartTime: 0,
  hintShown: false,

  // Session tracking
  sessionWords: [],     // words used this session (avoid repeats)
  solvedWords: [],      // { word, time, hintUsed }
  skippedWords: 0,
  hintsUsed: 0,
  totalTime: 0,

  // Word pool working copy (so we can reshuffle without mutating import)
  pool: [],
  poolIndex: 0,
};

/* ════════════════════════════════════════════
   DOM REFERENCES (cached after DOMContentLoaded)
   ════════════════════════════════════════════ */

let dom = {};

function cacheDom() {
  dom = {
    // Screens
    startScreen:   document.getElementById('wh-start-screen'),
    gameScreen:    document.getElementById('wh-game-screen'),
    statsScreen:   document.getElementById('wh-stats-screen'),

    // Start screen
    classicCard:   document.getElementById('wh-classic-card'),
    blitzCard:     document.getElementById('wh-blitz-card'),
    classicPanel:  document.getElementById('wh-classic-panel'),
    blitzPanel:    document.getElementById('wh-blitz-panel'),
    startBtn:      document.getElementById('wh-start-btn'),

    // Theme pickers (there may be several theme buttons, one per screen)
    themePicker:   document.getElementById('wh-theme-picker'),
    themeButtons:  document.querySelectorAll('.wh-theme-btn'),

    // Game screen elements
    scrambleEl:    document.getElementById('wh-scramble'),
    dashesEl:      document.getElementById('wh-dashes'),
    hintBtn:       document.getElementById('wh-hint-btn'),
    hintText:      document.getElementById('wh-hint-text'),
    keyboard:      document.getElementById('wh-keyboard'),

    // Status
    wordNumEl:     document.getElementById('wh-word-num'),
    wordTotalEl:   document.getElementById('wh-word-total'),
    roundNumEl:    document.getElementById('wh-round-num'),
    roundTotalEl:  document.getElementById('wh-round-total'),
    timerEl:       document.getElementById('wh-timer'),
    progressFill:  document.getElementById('wh-progress-fill'),
    skipBtn:       document.getElementById('wh-skip-btn'),
    classicStatus: document.getElementById('wh-classic-status'),
    blitzStatus:   document.getElementById('wh-blitz-status'),

    // Stats screen
    statsTitle:    document.getElementById('wh-stats-title'),
    statsSolved:   document.getElementById('wh-stats-solved'),
    statsHints:    document.getElementById('wh-stats-hints'),
    statsAvgTime:  document.getElementById('wh-stats-avg-time'),
    statsSkipped:  document.getElementById('wh-stats-skipped'),
    statsFastest:  document.getElementById('wh-stats-fastest'),
    statsScore:    document.getElementById('wh-stats-score'),
    playAgainBtn:  document.getElementById('wh-play-again-btn'),
    menuBtn:       document.getElementById('wh-menu-btn'),
  };
}

/* ════════════════════════════════════════════
   THEME
   ════════════════════════════════════════════ */

function applyTheme(name) {
  state.theme = name;
  document.body.dataset.whTheme = name;
  // Mark active option in picker
  document.querySelectorAll('.wh-theme-option').forEach(el => {
    el.classList.toggle('active', el.dataset.theme === name);
  });
}

function cycleTheme() {
  const idx = THEMES.indexOf(state.theme);
  const next = THEMES[(idx + 1) % THEMES.length];
  applyTheme(next);
  closeThemePicker();
}

function openThemePicker() {
  dom.themePicker.classList.add('open');
}

function closeThemePicker() {
  dom.themePicker.classList.remove('open');
}

function toggleThemePicker() {
  dom.themePicker.classList.toggle('open');
}

/* ════════════════════════════════════════════
   SCREEN MANAGEMENT
   ════════════════════════════════════════════ */

function showScreen(id) {
  document.querySelectorAll('.wh-screen').forEach(el => {
    el.classList.toggle('active', el.id === id);
  });
  closeThemePicker();
}

/* ════════════════════════════════════════════
   WORD SCRAMBLING
   ════════════════════════════════════════════ */

/** Fisher-Yates shuffle on word letters. Returns scrambled string.
 *  Guarantees the result differs from original if word.length > 1. */
function scramble(word) {
  if (word.length <= 1) return word;
  const arr = word.split('');
  let result;
  let attempts = 0;
  do {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    result = arr.join('');
    attempts++;
  } while (result === word && attempts < 20);
  return result;
}

/* ════════════════════════════════════════════
   WORD POOL MANAGEMENT
   ════════════════════════════════════════════ */

/** Prepare the pool: deep copy + filter to valid lengths, then shuffle. */
function initPool() {
  state.pool = wordPool
    .filter(w => w.word.length >= 7 && w.word.length <= 15)
    .map(w => ({ ...w }));
  shufflePool();
  state.poolIndex = 0;
}

function shufflePool() {
  for (let i = state.pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [state.pool[i], state.pool[j]] = [state.pool[j], state.pool[i]];
  }
}

/** Pick the next word that hasn't been used this session. */
function pickNextWord() {
  // Try to find one not yet used this session
  const unused = state.pool.filter(w => !state.sessionWords.includes(w.word));
  if (unused.length === 0) {
    // Pool exhausted — reset session word history and reshuffle
    state.sessionWords = [];
    shufflePool();
    state.poolIndex = 0;
    return state.pool[0];
  }
  // Find next from current position in pool
  while (state.poolIndex < state.pool.length) {
    const candidate = state.pool[state.poolIndex];
    state.poolIndex++;
    if (!state.sessionWords.includes(candidate.word)) {
      return candidate;
    }
  }
  // Wrapped around — just return first unused
  return unused[0];
}

/* ════════════════════════════════════════════
   WORD LOADING & DISPLAY
   ════════════════════════════════════════════ */

function loadWord() {
  // Pick word
  const entry = pickNextWord();
  state.currentWord = entry;
  state.sessionWords.push(entry.word);
  state.scrambledWord = scramble(entry.word);
  state.enteredLetters = [];
  state.wordStartTime = Date.now();
  state.hintShown = false;

  // Update scramble display
  dom.scrambleEl.textContent = state.scrambledWord;

  // Build dashes
  renderDashes();

  // Reset hint area — hide button if this word has no hint data
  const hasHint = Array.isArray(entry.hint) && entry.hint.length > 0;
  dom.hintBtn.style.display = hasHint ? '' : 'none';
  dom.hintText.classList.remove('visible');
  dom.hintText.innerHTML = '';

  // Clear used-key styling
  dom.keyboard.querySelectorAll('.wh-key').forEach(k => k.classList.remove('used'));

  // Remove solved/shake classes
  dom.dashesEl.classList.remove('solved', 'shake');
}

function renderDashes() {
  dom.dashesEl.innerHTML = '';
  const word = state.currentWord.word;
  for (let i = 0; i < word.length; i++) {
    const slot = document.createElement('div');
    slot.className = 'wh-dash-letter';
    slot.dataset.index = i;
    if (i < state.enteredLetters.length) {
      slot.textContent = state.enteredLetters[i];
      slot.classList.add('filled');
    }
    dom.dashesEl.appendChild(slot);
  }
}

/* ════════════════════════════════════════════
   INPUT HANDLING
   ════════════════════════════════════════════ */

function handleKey(letter) {
  const word = state.currentWord.word;
  if (state.enteredLetters.length >= word.length) return;

  const pos = state.enteredLetters.length;
  state.enteredLetters.push(letter);

  // Update the specific dash slot
  const slots = dom.dashesEl.querySelectorAll('.wh-dash-letter');
  const slot = slots[pos];
  slot.textContent = letter;
  slot.classList.add('filled');

  // Check correctness of this position
  if (letter !== word[pos]) {
    slot.classList.add('wrong');
    wrongInput();
    return;
  }

  // If all letters entered and all correct
  if (state.enteredLetters.length === word.length) {
    checkWord();
  }
}

function handleBackspace() {
  if (state.enteredLetters.length === 0) return;

  const pos = state.enteredLetters.length - 1;
  state.enteredLetters.pop();

  const slots = dom.dashesEl.querySelectorAll('.wh-dash-letter');
  const slot = slots[pos];
  slot.textContent = '';
  slot.classList.remove('filled', 'wrong');

  // Remove shake class so they can type again cleanly
  dom.dashesEl.classList.remove('shake');
}

/* ════════════════════════════════════════════
   WORD CHECKING
   ════════════════════════════════════════════ */

function checkWord() {
  const entered = state.enteredLetters.join('');
  const word = state.currentWord.word;

  if (entered === word) {
    solveWord();
  } else {
    wrongInput();
  }
}

function wrongInput() {
  // Trigger shake animation on dashes
  dom.dashesEl.classList.remove('shake');
  // Force reflow so animation re-triggers if already shaking
  void dom.dashesEl.offsetWidth;
  dom.dashesEl.classList.add('shake');

  // Remove shake class after animation ends
  dom.dashesEl.addEventListener('animationend', () => {
    dom.dashesEl.classList.remove('shake');
  }, { once: true });
}

/* ════════════════════════════════════════════
   WORD SOLVED
   ════════════════════════════════════════════ */

function solveWord() {
  const elapsed = (Date.now() - state.wordStartTime) / 1000;

  // Record this solve
  state.solvedWords.push({
    word: state.currentWord.word,
    time: elapsed,
    hintUsed: state.hintShown,
  });
  state.totalTime += elapsed;

  // Animate dashes green
  dom.dashesEl.classList.add('solved');

  // Advance after animation
  setTimeout(() => {
    dom.dashesEl.classList.remove('solved');
    if (state.mode === 'classic') {
      state.wordsInRound++;
      updateClassicStatus();
      if (state.wordsInRound >= state.wordsPerRound) {
        endRound();
      } else {
        loadWord();
      }
    } else {
      // Blitz: just load next word
      loadWord();
    }
  }, 800);
}

/* ════════════════════════════════════════════
   HINT
   ════════════════════════════════════════════ */

function showHint() {
  if (state.hintShown) return;
  state.hintShown = true;
  state.hintsUsed++;

  const hints = state.currentWord.hint || [];
  if (hints.length === 0) {
    dom.hintText.innerHTML = '<em>No hint available</em>';
  } else {
    dom.hintText.innerHTML = hints
      .map(h => `<span class="wh-hint-tag">${h}</span>`)
      .join('');
  }
  dom.hintText.classList.add('visible');
  dom.hintBtn.style.display = 'none';
}

/* ════════════════════════════════════════════
   CLASSIC MODE
   ════════════════════════════════════════════ */

function startClassic(wordsPerRound, rounds) {
  state.mode = 'classic';
  state.wordsPerRound = wordsPerRound;
  state.totalRounds = rounds;
  state.currentRound = 1;
  state.wordsInRound = 0;
  state.solvedWords = [];
  state.skippedWords = 0;
  state.hintsUsed = 0;
  state.totalTime = 0;
  state.sessionWords = [];

  // Show/hide mode-specific UI
  dom.classicStatus.style.display = '';
  dom.blitzStatus.style.display = 'none';
  dom.skipBtn.style.display = 'none';

  showScreen('wh-game-screen');
  showRoundBanner(state.currentRound, state.totalRounds, () => {
    loadWord();
    updateClassicStatus();
  });
}

function updateClassicStatus() {
  dom.wordNumEl.textContent  = state.wordsInRound + 1;
  dom.wordTotalEl.textContent = state.wordsPerRound;
  dom.roundNumEl.textContent  = state.currentRound;
  dom.roundTotalEl.textContent = state.totalRounds;

  const pct = (state.wordsInRound / state.wordsPerRound) * 100;
  if (dom.progressFill) dom.progressFill.style.width = pct + '%';
}

function endRound() {
  if (state.currentRound >= state.totalRounds) {
    endGame();
  } else {
    state.currentRound++;
    state.wordsInRound = 0;
    showRoundBanner(state.currentRound, state.totalRounds, () => {
      loadWord();
      updateClassicStatus();
    });
  }
}

/** Overlay banner showing "ROUND N" then auto-dismisses after 1.5s */
function showRoundBanner(round, total, callback) {
  const banner = document.createElement('div');
  banner.className = 'wh-round-banner';
  banner.innerHTML = `
    <h2>ROUND ${round}</h2>
    <p>of ${total} &nbsp;·&nbsp; Unscramble each word</p>
  `;
  document.body.appendChild(banner);

  setTimeout(() => {
    banner.style.opacity = '0';
    banner.style.transition = 'opacity 0.4s ease';
    setTimeout(() => {
      banner.remove();
      callback();
    }, 400);
  }, 1400);
}

/* ════════════════════════════════════════════
   BLITZ MODE
   ════════════════════════════════════════════ */

function startBlitz(seconds) {
  state.mode = 'blitz';
  state.timeLimit = seconds;
  state.timeRemaining = seconds;
  state.solvedWords = [];
  state.skippedWords = 0;
  state.hintsUsed = 0;
  state.totalTime = 0;
  state.sessionWords = [];

  // Show/hide mode-specific UI
  dom.classicStatus.style.display = 'none';
  dom.blitzStatus.style.display = '';
  dom.skipBtn.style.display = '';

  showScreen('wh-game-screen');
  updateTimerDisplay();
  loadWord();
  startCountdown();
}

function startCountdown() {
  if (state.timerInterval) clearInterval(state.timerInterval);

  state.timerInterval = setInterval(() => {
    state.timeRemaining--;
    updateTimerDisplay();

    if (state.timeRemaining <= 0) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
      endGame();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const t = Math.max(0, state.timeRemaining);
  const m = Math.floor(t / 60);
  const s = t % 60;
  dom.timerEl.textContent = m + ':' + String(s).padStart(2, '0');
  dom.timerEl.classList.toggle('low', t <= 30 && t > 0);
}

function skipWord() {
  state.skippedWords++;
  loadWord();
}

/* ════════════════════════════════════════════
   END GAME & STATS
   ════════════════════════════════════════════ */

function endGame() {
  // Stop timer if running
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }

  const stats = computeStats();
  renderStats(stats);
  showScreen('wh-stats-screen');
}

function computeStats() {
  const solved = state.solvedWords.length;
  const hints  = state.hintsUsed;
  const skips  = state.skippedWords;
  const times  = state.solvedWords.map(w => w.time);

  const avgTime = solved > 0
    ? (times.reduce((a, b) => a + b, 0) / solved).toFixed(1)
    : 0;

  let fastestWord = '—';
  let fastestTime = null;
  if (solved > 0) {
    const fastest = state.solvedWords.reduce((a, b) => a.time < b.time ? a : b);
    fastestWord = fastest.word;
    fastestTime = fastest.time.toFixed(1);
  }

  // Score formula:
  //   Classic: 100 per word, -10 per hint, +5 per word under 10s
  //   Blitz: 100 per word, -10 per hint, -5 per skip
  let score = 0;
  if (state.mode === 'classic') {
    score = solved * 100
      - hints * 10
      + state.solvedWords.filter(w => w.time < 10).length * 5;
  } else {
    score = solved * 100 - hints * 10 - skips * 5;
  }
  score = Math.max(0, score);

  return { solved, hints, skips, avgTime, fastestWord, fastestTime, score };
}

function renderStats(stats) {
  // Title
  dom.statsTitle.textContent = stats.solved > 0 ? 'CASE CLOSED' : 'BUSTED';

  // Stat cards
  dom.statsSolved.textContent  = stats.solved;
  dom.statsHints.textContent   = stats.hints;
  dom.statsAvgTime.textContent = stats.avgTime + 's';
  dom.statsSkipped.textContent = stats.skips;

  // Score
  dom.statsScore.textContent = stats.score;

  // Fastest word
  if (stats.fastestWord !== '—') {
    dom.statsFastest.innerHTML =
      `Fastest crack: <strong>${stats.fastestWord}</strong> in ${stats.fastestTime}s`;
  } else {
    dom.statsFastest.textContent = 'No words cracked';
  }
}

/* ════════════════════════════════════════════
   START SCREEN UI
   ════════════════════════════════════════════ */

function setupStartScreen() {
  // Mode card selection
  dom.classicCard.addEventListener('click', () => {
    dom.classicCard.classList.add('selected');
    dom.blitzCard.classList.remove('selected');
    dom.classicPanel.classList.add('active');
    dom.blitzPanel.classList.remove('active');
    state.mode = 'classic';
  });

  dom.blitzCard.addEventListener('click', () => {
    dom.blitzCard.classList.add('selected');
    dom.classicCard.classList.remove('selected');
    dom.blitzPanel.classList.add('active');
    dom.classicPanel.classList.remove('active');
    state.mode = 'blitz';
  });

  // Option buttons (words-per-round, rounds, time)
  document.querySelectorAll('.wh-option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const group = btn.closest('.wh-option-group');
      group.querySelectorAll('.wh-option-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  // Start button
  dom.startBtn.addEventListener('click', () => {
    if (state.mode === 'classic') {
      const groups = document.querySelectorAll('#wh-classic-panel .wh-option-group');
      const wprBtn = groups[0] ? groups[0].querySelector('.wh-option-btn.selected') : null;
      const rdBtn  = groups[1] ? groups[1].querySelector('.wh-option-btn.selected') : null;
      const wpr = wprBtn ? parseInt(wprBtn.dataset.value) : 10;
      const rd  = rdBtn  ? parseInt(rdBtn.dataset.value)  : 3;
      initPool();
      startClassic(wpr, rd);
    } else if (state.mode === 'blitz') {
      const tBtn = document.querySelector('#wh-blitz-panel .wh-option-btn.selected');
      const secs = tBtn ? parseInt(tBtn.dataset.value) : 120;
      initPool();
      startBlitz(secs);
    }
  });
}

/* ════════════════════════════════════════════
   KEYBOARD SETUP
   ════════════════════════════════════════════ */

function buildKeyboard() {
  const rows = [
    ['Q','W','E','R','T','Y','U','I','O','P'],
    ['A','S','D','F','G','H','J','K','L'],
    ['Z','X','C','V','B','N','M','⌫'],
  ];

  dom.keyboard.innerHTML = '';
  rows.forEach(row => {
    const rowEl = document.createElement('div');
    rowEl.className = 'wh-key-row';
    row.forEach(letter => {
      const key = document.createElement('button');
      key.className = 'wh-key';
      key.textContent = letter;
      if (letter === '⌫') {
        key.classList.add('backspace');
        key.dataset.key = 'BACKSPACE';
        key.addEventListener('click', () => handleBackspace());
      } else {
        key.dataset.key = letter;
        key.addEventListener('click', () => handleKey(letter));
      }
      rowEl.appendChild(key);
    });
    dom.keyboard.appendChild(rowEl);
  });
}

/* ════════════════════════════════════════════
   PHYSICAL KEYBOARD LISTENER
   ════════════════════════════════════════════ */

function setupPhysicalKeyboard() {
  document.addEventListener('keydown', e => {
    // Only active on game screen
    if (!dom.gameScreen.classList.contains('active')) return;

    const key = e.key.toUpperCase();
    if (key === 'BACKSPACE') {
      e.preventDefault();
      handleBackspace();
    } else if (key.length === 1 && key >= 'A' && key <= 'Z') {
      handleKey(key);
    }
  });
}

/* ════════════════════════════════════════════
   THEME PICKER SETUP
   ════════════════════════════════════════════ */

function setupThemePicker() {
  // Build theme options
  dom.themePicker.innerHTML = '';
  THEMES.forEach(t => {
    const opt = document.createElement('button');
    opt.className = 'wh-theme-option';
    opt.dataset.theme = t;
    opt.textContent = THEME_LABELS[t];
    opt.addEventListener('click', () => {
      applyTheme(t);
      closeThemePicker();
    });
    dom.themePicker.appendChild(opt);
  });

  // All theme toggle buttons across screens
  dom.themeButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleThemePicker();
    });
  });

  // Close picker when clicking outside
  document.addEventListener('click', (e) => {
    if (!dom.themePicker.contains(e.target) && !e.target.classList.contains('wh-theme-btn')) {
      closeThemePicker();
    }
  });
}

/* ════════════════════════════════════════════
   STATS SCREEN SETUP
   ════════════════════════════════════════════ */

function setupStatsScreen() {
  dom.playAgainBtn.addEventListener('click', () => {
    // Re-run same mode with same settings
    if (state.mode === 'classic') {
      initPool();
      startClassic(state.wordsPerRound, state.totalRounds);
    } else {
      initPool();
      startBlitz(state.timeLimit);
    }
  });

  dom.menuBtn.addEventListener('click', () => {
    showScreen('wh-start-screen');
  });
}

/* ════════════════════════════════════════════
   GAME SCREEN SETUP
   ════════════════════════════════════════════ */

function setupGameScreen() {
  dom.hintBtn.addEventListener('click', () => showHint());
  dom.skipBtn.addEventListener('click', () => skipWord());
}

/* ════════════════════════════════════════════
   INIT
   ════════════════════════════════════════════ */

function init() {
  cacheDom();

  // Pick random starting theme
  const randomTheme = THEMES[Math.floor(Math.random() * THEMES.length)];
  applyTheme(randomTheme);

  // Build UI pieces
  buildKeyboard();
  setupThemePicker();
  setupStartScreen();
  setupGameScreen();
  setupStatsScreen();
  setupPhysicalKeyboard();

  // Default: classic mode selected
  dom.classicCard.classList.add('selected');
  dom.classicPanel.classList.add('active');
  state.mode = 'classic';

  // Select default option buttons
  document.querySelectorAll('.wh-option-btn[data-default="true"]').forEach(btn => {
    btn.classList.add('selected');
  });

  showScreen('wh-start-screen');
}

document.addEventListener('DOMContentLoaded', init);
