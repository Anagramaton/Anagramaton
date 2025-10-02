import { gameState } from './gameState.js';

const MAX_HINTS = 3; 


// ==============================
//  UI HELPERS
// ==============================
function disableButtonById(id, labelWhenDisabled = null) {
  const btn = document.getElementById(id);
  if (!btn) return null;

  
  btn.disabled = true;                 
  btn.setAttribute('aria-disabled', 'true');
  btn.style.pointerEvents = 'none';    

  
  btn.classList.add('btn--disabled');

  if (labelWhenDisabled !== null) {
    btn.textContent = labelWhenDisabled;
  }

 
  btn.title = (btn.title ? btn.title + ' — ' : '') + 'Disabled';

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
  const used = Math.max(0, Math.min(MAX_HINTS, Number(gameState.hintsUsed) || 0));
  const remaining = MAX_HINTS - used;

  
  const headerHints = document.getElementById('hints-used');
  if (headerHints) headerHints.textContent = `HINTS: ${remaining}/${MAX_HINTS}`;

  
  const multiMap = ['x3', 'x2', 'x1', 'X']; 
  const multiLabel = multiMap[used] ?? 'X';
  const multiEl = document.getElementById('bonus-multi');
  if (multiEl) multiEl.textContent = `BONUS MULTI: ${multiLabel}`;
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

  gameState.phraseRevealed[phraseKey] = true;

  const phraseEl = document.getElementById(`${phraseKey}-text`);
  if (phraseEl) {
    const phraseIndex = phraseKey === 'phrase1' ? 0 : 1;
    const raw = (gameState.seedPhrase || '').split('/')[phraseIndex] || '';
    phraseEl.textContent = raw.trim();
  }

disableButtonById(`${phraseKey}-hint1-btn`, 'Disabled');


}

// ==============================
//  INITIALIZE EVENT BINDINGS
// ==============================
export function initPhrasePanelEvents() {
  document.getElementById('phrase1-hint1-btn')?.addEventListener('click', () => useHint('phrase1', 'hint1'));
  document.getElementById('phrase2-hint1-btn')?.addEventListener('click', () => useHint('phrase2', 'hint1'));
  document.getElementById('wordcount-hint')?.addEventListener('click', () => useHint('wordCount'));

  updateHintAndMultiPanel();
}

