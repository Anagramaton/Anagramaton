import { gameState } from './gameState.js';

// roundOverModal.js
(function () {
  const $ = (id) => document.getElementById(id);

  const modal    = $('round-over-modal');
  const backdrop = modal.querySelector('.rom__backdrop');
  const dialog   = modal.querySelector('.rom__dialog');

  const totalEl  = $('rom-total');
  const baseEl   = $('rom-base');
  const bonusEl  = $('rom-bonus');
  const countEl  = $('rom-count');
  const wordsEl  = $('rom-words');
  const closeBtn = $('rom-close-btn');
  

  let lastFocused = null;

  function clearWords() {
    while (wordsEl.firstChild) wordsEl.removeChild(wordsEl.firstChild);
  }

  function fillWords(words) {
    clearWords();
    for (const w of words) {
      const li = document.createElement('li');
      li.textContent = String(w).toUpperCase();
      wordsEl.appendChild(li);
    }
  }

  function openModal({ words = [], baseTotal = 0, bonusTotal = 0, totalScore = 0 } = {}) {
    // Fill fields
    totalEl.textContent = totalScore;
    baseEl.textContent  = baseTotal;
    bonusEl.textContent = bonusTotal;
    countEl.textContent = words.length;
    fillWords(words);

    // Show
    lastFocused = document.activeElement;
    modal.classList.remove('rom--hidden');
    document.body.classList.add('rom-open');

    // Focus the first interactive element for accessibility
    (closeBtn || dialog).focus();
    trapFocus(true);
  }

  function closeModal() {
    modal.classList.add('rom--hidden');
    document.body.classList.remove('rom-open');
    trapFocus(false);
    if (lastFocused && typeof lastFocused.focus === 'function') {
      lastFocused.focus();
    }
  }

  function isInDialog(el) {
    return dialog.contains(el);
  }

  // Simple focus trap within the dialog
  let focusHandler = null;
  function trapFocus(enable) {
    if (enable && !focusHandler) {
      focusHandler = (e) => {
        if (!isInDialog(document.activeElement)) {
          // move focus back into dialog
          (closeBtn || dialog).focus();
        }
      };
      document.addEventListener('focusin', focusHandler);
    } else if (!enable && focusHandler) {
      document.removeEventListener('focusin', focusHandler);
      focusHandler = null;
    }
  }

  // Wire close interactions
  closeBtn?.addEventListener('click', closeModal);
  backdrop?.addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => {
    if (!modal.classList.contains('rom--hidden') && e.key === 'Escape') {
      closeModal();
    }
  });

  // Listen for your game's event from main.js
  window.addEventListener('round:over', (e) => openModal(e.detail || {}));

// === Add-only enhancement: Board Top 10 + Comparison =========================
(() => {
  const modal = document.getElementById('round-over-modal');
  if (!modal) return;

  // tiny helpers (scoped to this IIFE to avoid collisions)
  function romEnsureSection(id, headingText) {
    let section = document.getElementById(id);
    if (section) return section;

    section = document.createElement('section');
    section.id = id;
    section.style.marginTop = '14px';

    const h3 = document.createElement('h3');
    h3.textContent = headingText;
    h3.style.margin = '10px 0 6px';

    const list = document.createElement('ol');
    list.className = 'rom__list';
    list.style.maxHeight = '200px';
    list.style.overflow = 'auto';
    list.style.paddingLeft = '20px';
    list.id = id + '-list';

    section.appendChild(h3);
    section.appendChild(list);

    const dialog = modal.querySelector('.rom__dialog');
    const actions = modal.querySelector('.rom__actions');
    dialog.insertBefore(section, actions);
    return section;
  }

  function romFillList(ol, items) {
    ol.innerHTML = '';
    items.forEach((it) => {
      const li = document.createElement('li');
      li.textContent = `${String(it.word).toUpperCase()} (+${Number(it.score) || 0})`;
      ol.appendChild(li);
    });
  }

  window.addEventListener('round:over', (e) => {
    const detail = e?.detail || {};

    // these new fields come from main.js (see note below)
    const boardTop10 = Array.isArray(detail.boardTop10) ? detail.boardTop10 : [];
    const boardTop10Total = Number(detail.boardTop10Total) || 0;

    // create & fill "Board's Top 10" section
    const top10Section = romEnsureSection('rom-top10', "Board's Top 10");
    const top10List = document.getElementById('rom-top10-list');
    romFillList(top10List, boardTop10);

    // compute overlap + optimal percentage
    const playerItems = Array.isArray(detail.wordsWithScores) ? detail.wordsWithScores : [];
    const top10WordSet = new Set(boardTop10.map(x => String(x.word).toUpperCase()));
    const overlap = playerItems.filter(p => top10WordSet.has(String(p.word).toUpperCase())).length;

    const playerTotal = Number(detail.totalScore) || 0;
    const optimalPct = boardTop10Total > 0
      ? Math.round((playerTotal / boardTop10Total) * 100)
      : 0;

    // ensure comparison block
    let cmp = document.getElementById('rom-compare');
    if (!cmp) {
      cmp = document.createElement('div');
      cmp.id = 'rom-compare';
      cmp.style.marginTop = '10px';
      cmp.style.opacity = '0.9';
      const dialog = modal.querySelector('.rom__dialog');
      const actions = modal.querySelector('.rom__actions');
      dialog.insertBefore(cmp, actions);
    }

    cmp.innerHTML = `
      <p><strong>WELL...HOW'D YOU DO?!:</strong></p>
      <ul class="rom__list" style="max-height: none;">
        <li>MATCHED ${overlap} OF THE BOARD’S TOP 10 WORDS</li>
        <li>YOU vs THEM: ${Math.round(playerTotal)} / ${Math.round(boardTop10Total)} (${optimalPct}%)</li>
      </ul>
    `;
  });
})();


})();
