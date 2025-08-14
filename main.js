import { initializeGrid, clearCurrentSelection } from './initGrid.js';
import { submitCurrentWord, resetSelectionState } from './scoreLogic.js';
import { updateScoreDisplay, addWordToList } from './uiRenderer.js';
import { gameState } from './gameState.js';
import { placedWords } from './gridLogic.js';
import { initPhrasePanelEvents, revealPhrase } from './phrasePanel.js';


let totalScore = 0;
const submittedWords = new Set();

document.addEventListener('DOMContentLoaded', () => {
  // Reset score and submitted words
  totalScore = 0;
  submittedWords.clear();

  // Show 0 on the scoreboard at start
  updateScoreDisplay(totalScore);

  // Catch ALL score changes (word points + anagram bonus)
  window.addEventListener('score:delta', (e) => {
    const pts = e?.detail?.delta || 0;
    totalScore += pts;
    updateScoreDisplay(totalScore);
  });







  // Initialize grid & phrase panel
  console.log("Calling initializeGrid() from main.js");
  initializeGrid();
  console.log("Calling initPhrasePanelEvents() from main.js");
  initPhrasePanelEvents();

  // --- LEFT PANEL SETUP ---
  const leftPanel = document.querySelector('#left-panel .panel-content');
  if (leftPanel) {
    console.log("Left panel found, setting innerHTML and attaching Submit List");
    leftPanel.innerHTML = `
      <h2>Your Words</h2>
      <ul id="word-list"></ul>
      <button id="submit-list">Submit List</button>
    `;
    document.getElementById('submit-list')?.addEventListener('click', handleSubmitList);
  } else {
    console.warn("⚠ Left panel not found");
  }

const submitWordBtn = document.getElementById('submit-word');
if (submitWordBtn) {
  submitWordBtn.addEventListener('click', () => {
    console.log("🖱 Submit Word button clicked");
    console.log("Selected Tiles at click:", gameState.selectedTiles);

    const selectedTiles = gameState.selectedTiles || [];
    const word = selectedTiles.map(t => t.letter).join('').toUpperCase();
    console.log("Built word:", word);

// === PHRASE DETECTION (spelled correctly in order) ===
const normalize = s => String(s).toUpperCase().replace(/[^A-Z]/g, '');
const [raw1 = '', raw2 = ''] = (gameState.seedPhrase || '').split('/');
const target1 = normalize(raw1);
const target2 = normalize(raw2);
const selectionLetters = normalize((gameState.selectedTiles || []).map(t => t.letter).join(''));

if (!gameState.phraseRevealed.phrase1 && selectionLetters === target1) {
  revealPhrase('phrase1');
  setTimeout(() => resetSelectionState(), 520); // let the 0.45s pulse finish
  return;
}
if (!gameState.phraseRevealed.phrase2 && selectionLetters === target2) {
  revealPhrase('phrase2');
  setTimeout(() => resetSelectionState(), 520);
  return;
}



    // === original submit flow continues ===
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

    const wordScore = submitCurrentWord(selectedTiles);
    if (wordScore === null) {
      alert(`❌ "${word}" is not a valid word.`);
      resetSelectionState();
      return;
    }

    totalScore += wordScore;
    updateScoreDisplay(totalScore);

    const { li, removeBtn } = addWordToList(word, wordScore);
    submittedWords.add(word);

    removeBtn.addEventListener('click', () => {
      console.log(`🗑 Removing word "${word}"`);
      li.remove();
      submittedWords.delete(word);
      totalScore -= wordScore;
      updateScoreDisplay(totalScore);
      for (const tile of selectedTiles) {
        tile.usageCount = Math.max(0, (tile.usageCount || 1) - 1);
      }
    });

    resetSelectionState();
  });
} else {
  console.error("❌ Submit Word button NOT found in DOM");
}


  // ✅ Clear Word listener is already in initGrid.js

  // --- PANEL TOGGLES ---
  document.getElementById('toggle-left')?.addEventListener('click', () => {
    
    document.getElementById('left-panel').classList.toggle('open');
  });
  document.getElementById('toggle-right')?.addEventListener('click', () => {
    
    document.getElementById('right-panel').classList.toggle('open');
  });
});

function handleSubmitList() {
  console.log("🖱 Submit List button clicked");
  const wordPreview = document.getElementById('current-word');
  if (wordPreview) {
    
    wordPreview.textContent = '';
  }

  const wordSet = new Set(
    Array.from(submittedWords).map(w => w.toUpperCase())
  );
}

