import { gameState } from './gameState.js';

const MAX_HINTS = 3;

// ── Hint weight config ─────────────────────────────────────
const PHRASE_BONUS_BASE = 2000;

const HINT_COSTS = {
  phrase1:   500,
  phrase2:   500,
  wordCount: 800,
};

const ORDER_AMPLIFIERS = [1.5, 1.2, 1.0]; // index = 0-based position in hintOrder

export function computePhraseBonus() {
  const order = gameState.hintUsage.hintOrder || [];
  let totalDeduction = 0;
  order.forEach((hintKey, i) => {
    const baseCost = HINT_COSTS[hintKey] ?? 500;
    const amp = ORDER_AMPLIFIERS[i] ?? 1.0;
    totalDeduction += Math.round(baseCost * amp);
  });
  return Math.max(0, PHRASE_BONUS_BASE - totalDeduction);
}


// ==============================
//  UI HELPERS
// ==============================
function disableButtonById(id) {
  const btn = document.getElementById(id);
  if (!btn) return null;

  btn.disabled = true;
  btn.setAttribute('aria-disabled', 'true');
  btn.style.pointerEvents = 'none';
  btn.classList.add('btn--disabled');

  // No text change — CSS opacity handles the "used" state visually
  return btn;
}


// ==============================
//  HANDLE HINT BUTTON CLICK
// ==============================
export function useHint(phraseKey, hintType = null) {
  
  if (phraseKey === 'wordCount') {
    if (gameState.hintUsage.wordCount) return; 
    gameState.hintUsage.wordCount = true;
    gameState.hintsUsed++;
    gameState.hintUsage.hintOrder.push('wordCount');
    updateHintAndMultiPanel();

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

    disableButtonById('wordcount-hint', 'Word Count ✓');
  } else {
 
    if (!gameState.hintUsage[phraseKey]) {
      
      gameState.hintUsage[phraseKey] = true;
      gameState.hintsUsed++;
      gameState.hintUsage.hintOrder.push(phraseKey);
      updateHintAndMultiPanel();

     
      const hintIndex = 0;
      const hintText = (gameState.seedHints?.[phraseKey]?.[hintIndex]) ?? '';

      
      const hintRow = document.getElementById(`${phraseKey}-hint1`);
      if (hintRow) hintRow.textContent = hintText;

     
      disableButtonById(`${phraseKey}-hint1-btn`, 'Hint used');
    } else {

      return;
    }
  }

  
  updateHintAndMultiPanel();
}

function updateHintAndMultiPanel() {
  const used = (gameState.hintUsage.hintOrder || []).length;
  const remaining = MAX_HINTS - used;

  const headerHints = document.getElementById('hints-used');
  if (headerHints) headerHints.textContent = `HINTS: ${remaining}/${MAX_HINTS}`;

  const projectedBonus = computePhraseBonus();
  const multiEl = document.getElementById('bonus-multi');
  if (multiEl) multiEl.textContent = `PHRASE BONUS: ${projectedBonus} PTS`;
}


// ==============================
//  GENERATE WORD COUNT LAYOUT
// ==============================
function generateWordCountLayout(path, phraseText) {
  const PLACEHOLDER = '-'; 
  const clean = String(phraseText)
    .toUpperCase()
    .replace(/[^A-Z ]/g, '')       
    .trim()
    .split(/\s+/)                   
    .filter(Boolean);               

  if (!clean.length) return '';
  return clean.map(word => PLACEHOLDER.repeat(word.length)).join(' ');
}

// ==============================
//  REVEAL PHRASE WHEN FOUND
// ==============================
export function revealPhrase(phraseKey) {
  if (!phraseKey) return;
  if (gameState.mode !== 'daily' || !gameState.seedPhrase) return;

  gameState.hintUsage.phraseRevealed[phraseKey] = true;

  const phraseEl = document.getElementById(`${phraseKey}-text`);
  if (phraseEl) {
    const phraseIndex = phraseKey === 'phrase1' ? 0 : 1;
    const raw = (gameState.seedPhrase || '').split('/')[phraseIndex] || '';
    phraseEl.textContent = raw.trim();
  }

  // Disable the hint button — phrase is now revealed, hint no longer needed
  disableButtonById(`${phraseKey}-hint1-btn`);
}

export function initPhrasePanelEvents() {
  // Hide / disable in Unlimited (or if daily failed to place a phrase)
  if (gameState.mode !== 'daily' || !gameState.seedPhrase) {
    const rightPanel = document.getElementById('right-panel');
    if (rightPanel) rightPanel.style.display = 'none';

    const toggleRight = document.getElementById('toggle-right');
    if (toggleRight) {
      toggleRight.disabled = true;
      toggleRight.setAttribute('aria-disabled', 'true');
    }

    // defensively disable the hint buttons if they exist
    ['phrase1-hint1-btn', 'phrase2-hint1-btn', 'wordcount-hint'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.disabled = true;
        el.setAttribute('aria-disabled', 'true');
      }
    });

    return; // stop wiring events in Unlimited
  }

  // DAILY mode: wire up events normally
  document.getElementById('phrase1-hint1-btn')
    ?.addEventListener('click', () => useHint('phrase1', 'hint1'));
  document.getElementById('phrase2-hint1-btn')
    ?.addEventListener('click', () => useHint('phrase2', 'hint1'));
  document.getElementById('wordcount-hint')
    ?.addEventListener('click', () => useHint('wordCount'));

  updateHintAndMultiPanel();
}
