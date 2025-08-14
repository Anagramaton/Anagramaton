import { gameState } from './gameState.js';

// ==============================
// 0. UI HELPERS
// ==============================
function disableButtonById(id, labelWhenDisabled = null) {
  const btn = document.getElementById(id);
  if (!btn) return null;

  // Make it non-interactive
  btn.disabled = true;                 // works for <button>
  btn.setAttribute('aria-disabled', 'true');
  btn.style.pointerEvents = 'none';    // belt-and-suspenders

  // Visual cue (optional: style .btn--disabled in your CSS)
  btn.classList.add('btn--disabled');

  if (labelWhenDisabled !== null) {
    btn.textContent = labelWhenDisabled;
  }

  // Helpful tooltip
  btn.title = (btn.title ? btn.title + ' — ' : '') + 'Disabled';

  return btn;
}


// ==============================
// 1. HANDLE HINT BUTTON CLICK
// ==============================
export function useHint(phraseKey, hintType = null) {
  // ✅ Word count hint (global)
  if (phraseKey === 'wordCount') {
    if (gameState.hintUsage.wordCount) return; // already revealed
    gameState.hintUsage.wordCount = true;
    gameState.hintsUsed++;
    updateMultiplier();

    // ✅ Show dash groups per word for both phrases, e.g., GOOD DAY -> "---- ----"
    const phrase1Layout = generateWordCountLayout(
      gameState.seedPaths.phraseA,
      (gameState.seedPhrase || '').split('/')[0] || ''
    );
    const phrase2Layout = generateWordCountLayout(
      gameState.seedPaths.phraseB,
      (gameState.seedPhrase || '').split('/')[1] || ''
    );

    const phrase1LayoutEl = document.getElementById('phrase1-layout');
    const phrase2LayoutEl = document.getElementById('phrase2-layout');

    if (phrase1LayoutEl) phrase1LayoutEl.textContent = phrase1Layout;
    if (phrase2LayoutEl) phrase2LayoutEl.textContent = phrase2Layout;

    // ✅ Hide the Word Count button
    disableButtonById('wordcount-hint', 'Word Count ✓');
     } else {
    // ✅ Normal hint for phrase1 or phrase2
    if (!gameState.hintUsage[phraseKey]) return; // guard
    if (gameState.hintUsage[phraseKey][hintType]) return; // already used

    gameState.hintUsage[phraseKey][hintType] = true;
    gameState.hintsUsed++;
    updateMultiplier();

    // ✅ Reveal hint text
    const hintIndex = hintType === 'hint1' ? 0 : 1;
    const hintText = (gameState.seedHints?.[phraseKey]?.[hintIndex]) ?? '';
    const hintRow = document.getElementById(`${phraseKey}-${hintType}`);
    if (hintRow) hintRow.textContent = hintText;

    // ✅ Remove button
    disableButtonById(`${phraseKey}-${hintType}-btn`, 'Hint used');
    }

  // ✅ Update “Hints: X/5” after any hint usage
  updateHintPanelHeader();
}

// ==============================
// 2. UPDATE HEADER (no chip)
// ==============================
function updateHintPanelHeader() {
  const headerHints = document.getElementById('hints-used');
  if (headerHints) headerHints.textContent = `Hints: ${gameState.hintsUsed}/5`;
}

// ==============================
// 3. GENERATE WORD COUNT LAYOUT
// ==============================
function generateWordCountLayout(path, phraseText) {
  const PLACEHOLDER = '-'; 
  const clean = String(phraseText)
    .toUpperCase()
    .replace(/[^A-Z ]/g, '')       // remove punctuation/numbers, keep letters + spaces
    .trim()
    .split(/\s+/)                   // split on 1+ spaces
    .filter(Boolean);               // drop empty

  if (!clean.length) return '';
  return clean.map(word => PLACEHOLDER.repeat(word.length)).join(' ');
}

// ==============================
// 4. UPDATE MULTIPLIER (no chip UI)
// ==============================
function updateMultiplier() {
  switch (gameState.hintsUsed) {
    case 0: gameState.multiplier = 10; break;
    case 1: gameState.multiplier = 5; break;
    case 2: gameState.multiplier = 4; break;
    case 3: gameState.multiplier = 3; break;
    case 4: gameState.multiplier = 2; break;
    case 5: gameState.multiplier = 0; break;
    default: gameState.multiplier = Math.max(0, 10 - gameState.hintsUsed);
  }
}

// ==============================
// 4a. SCORE + TOAST HELPERS
// ==============================
// phrasePanel.js
function addScore(points) {
  // keep internal tally if you want it
  gameState.score = (gameState.score || 0) + points;

  // let main.js update the UI
  window.dispatchEvent(new CustomEvent('score:delta', {
    detail: { delta: points, source: 'anagramBonus' }
  }));
}

function showToast(message, type = 'success') {
  let root = document.getElementById('toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toast-root';
    root.className = 'toast-root';
    document.body.appendChild(root);
  }

  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  root.appendChild(el);

  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
  }, 2500);
}


// ==============================
// 4b. TILE HIGHLIGHT / CELEBRATE  (Option A: mark done first, then pop)
// ==============================
function highlightPhraseTiles(phraseKey, { animate = true } = {}) {
  const pathKey = phraseKey === 'phrase1' ? 'phraseA' : 'phraseB';
  const path = gameState.seedPaths?.[pathKey] || [];
  if (!path.length) return;

  const CLASS_SOLVED = 'tile--solved-phrase';
  const CLASS_CELEB  = 'tile--celebrate';

  // 1) MARK ALL TILES SOLVED RIGHT NOW (no delays)
  path.forEach(p => {
    const tile = document.getElementById(String(p.key));
    if (tile) tile.classList.add(CLASS_SOLVED);
  });

  // 2) OPTIONAL: RUN THE STAGGERED POP JUST FOR LOOKS
  if (animate) {
    path.forEach((p, i) => {
      const tile = document.getElementById(String(p.key));
      if (!tile) return;

      setTimeout(() => {
        // restart the keyframes cleanly
        tile.classList.remove(CLASS_CELEB);
        void tile.offsetWidth; // force reflow to restart animation
        tile.classList.add(CLASS_CELEB);

        // remove the pop class after it finishes
        setTimeout(() => tile.classList.remove(CLASS_CELEB), 450);
      }, i * 120);
    });
  }
}

  function areTilesSolved(path = []) {
  if (!path.length) return false;
  return path.every(p => {
    const el = document.getElementById(String(p.key));
    return el && el.classList.contains('tile--solved-phrase');
  });
}


// ==============================
// 4c. BASE BONUS + ANAGRAM BONUS
// ==============================
function baseBonus(hintsUsed = 0) {
  const table = [500, 400, 300, 200, 100, 0];
  const idx = Math.max(0, Math.min(5, Number(hintsUsed) || 0));
  return table[idx];
}

function awardAnagramBonusIfReady() {
  const idsA = gameState.seedPaths?.phraseA || [];
  const idsB = gameState.seedPaths?.phraseB || [];

  const phrase1Built = areTilesSolved(idsA);
  const phrase2Built = areTilesSolved(idsB);

  if (!(phrase1Built && phrase2Built) || gameState.anagramBonusPaid) return;

  const base = baseBonus(gameState.hintsUsed);
  const multi = gameState.multiplier ?? 0;
  const points = base * multi;

  gameState.anagramBonusPaid = true;

  if (points > 0) {
    addScore(points);
    showToast(`Anagram Bonus +${points.toLocaleString()}! (Base ${base} × x${multi})`, 'success');
  } else {
    showToast('Better luck next time — all 5 hints used.', 'info');
  }
}

// ==============================
// 5. REVEAL PHRASE WHEN FOUND
// ==============================
export function revealPhrase(phraseKey) {
  if (!phraseKey) return;

  gameState.phraseRevealed[phraseKey] = true;

  const phraseEl = document.getElementById(`${phraseKey}-text`);
  if (phraseEl) {
    const phraseIndex = phraseKey === 'phrase1' ? 0 : 1;
    const raw = (gameState.seedPhrase || '').split('/')[phraseIndex] || '';
    phraseEl.textContent = raw.trim();
  }

disableButtonById(`${phraseKey}-hint1-btn`, 'Disabled');
disableButtonById(`${phraseKey}-hint2-btn`, 'Disabled');

  highlightPhraseTiles(phraseKey, { animate: true });
  awardAnagramBonusIfReady();
}

// ==============================
// 6. INITIALIZE EVENT BINDINGS
// ==============================
export function initPhrasePanelEvents() {
  document.getElementById('phrase1-hint1-btn')?.addEventListener('click', () => useHint('phrase1', 'hint1'));
  document.getElementById('phrase1-hint2-btn')?.addEventListener('click', () => useHint('phrase1', 'hint2'));
  document.getElementById('phrase2-hint1-btn')?.addEventListener('click', () => useHint('phrase2', 'hint1'));
  document.getElementById('phrase2-hint2-btn')?.addEventListener('click', () => useHint('phrase2', 'hint2'));
  document.getElementById('wordcount-hint')?.addEventListener('click', () => useHint('wordCount'));

  updateHintPanelHeader();
}
