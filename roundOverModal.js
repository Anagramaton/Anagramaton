// roundOverModal.js
// import { gameState } from './gameState.js';

(function () {
  const $ = (id) => document.getElementById(id);

  const modal    = $('round-over-modal');
  const backdrop = modal.querySelector('.rom__backdrop');
  const dialog   = modal.querySelector('.rom__dialog');

  const totalEl  = $('rom-total');
  const baseEl   = $('rom-base');
  const bonusEl  = $('rom-bonus');
  const closeBtn = $('rom-close-btn');

  let lastFocused = null;

  // ---------- Open/Close modal
  function openModal({ words = [], baseTotal = 0, bonusTotal = 0, totalScore = 0 } = {}) {
    // Fill fields
    totalEl.textContent = totalScore;
    baseEl.textContent  = baseTotal;
    bonusEl.textContent = bonusTotal;

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

  // ---------- Focus management
  function isInDialog(el) {
    return dialog.contains(el);
  }

  // Simple focus trap within the dialog
  let focusHandler = null;
  function trapFocus(enable) {
    if (enable && !focusHandler) {
      focusHandler = () => {
        if (!isInDialog(document.activeElement)) {
          (closeBtn || dialog).focus();
        }
      };
      document.addEventListener('focusin', focusHandler);
    } else if (!enable && focusHandler) {
      document.removeEventListener('focusin', focusHandler);
      focusHandler = null;
    }
  }

  // ---------- Wire close interactions
  closeBtn?.addEventListener('click', closeModal);
  backdrop?.addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => {
    if (!modal.classList.contains('rom--hidden') && e.key === 'Escape') {
      closeModal();
    }
  });

  // ---------- Listen for your game's event from main.js to open modal
  window.addEventListener('round:over', (e) => openModal(e.detail || {}));

  // === Add-only enhancement: Side-by-side "You vs Them" + Fancy Meter ==========
  (() => {
    const modal = document.getElementById('round-over-modal');
    if (!modal) return;

    const dialog = modal.querySelector('.rom__dialog');

    // ---------- UI builders
    function ensureVSSection() {
      let wrap = document.getElementById('rom-vs-wrap');
      if (wrap) return wrap;

      wrap = document.createElement('section');
      wrap.id = 'rom-vs-wrap';

      const h3 = document.createElement('h3');
      h3.className = 'rom__section-title';
      h3.textContent = 'Words vs Board';

      const grid = document.createElement('div');
      grid.className = 'rom__grid';

      // YOU
      const colYou = document.createElement('div');
      colYou.className = 'rom__col rom__col--you';
      colYou.innerHTML = `
        <h4 class="rom__col-title">Your Words <span id="rom-you-count"></span></h4>
        <ol id="rom-you-ol" class="rom__ol"></ol>
      `;

      // THEM
      const colThem = document.createElement('div');
      colThem.className = 'rom__col rom__col--them';
      colThem.innerHTML = `
        <h4 class="rom__col-title">Board's Top 10 <span id="rom-them-count"></span></h4>
        <ol id="rom-them-ol" class="rom__ol"></ol>
      `;

      grid.appendChild(colYou);
      grid.appendChild(colThem);

      // insert before the actions
      const actions = modal.querySelector('.rom__actions');
      wrap.appendChild(h3);
      wrap.appendChild(grid);
      dialog.insertBefore(wrap, actions);

      return wrap;
    }

    function ensureMeter() {
      let meter = document.getElementById('rom-meter');
      if (meter) return meter;

      meter = document.createElement('section');
      meter.id = 'rom-meter';
      meter.className = 'rom__meter';
      meter.innerHTML = `
        <div class="rom__meter-top">
          <span class="rom__meter-label">YOU vs THEM</span>
          <span id="rom-meter-numbers" class="rom__meter-label"></span>
        </div>
        <div class="rom__track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="Round score comparison">
          <div id="rom-meter-fill" class="rom__fill"></div>
        </div>
        <div id="rom-meter-pct" class="rom__pct"></div>
      `;
      const actions = modal.querySelector('.rom__actions');
      dialog.insertBefore(meter, actions);
      return meter;
    }

function renderList(ol, items, matchSet = new Set(), highlightThem = false) {
  ol.innerHTML = '';
  items.forEach((it, idx) => {
    const li = document.createElement('li');
    li.className = 'rom__li';

    const wordUpper = String(it.word).toUpperCase();

    const word = document.createElement('span');
    word.className = 'rom__word';
    word.textContent = `${idx + 1}. ${wordUpper}`;

    const chip = document.createElement('span');
    chip.className = 'rom__score-chip';
    chip.textContent = `+${Number(it.score) || 0}`;

    li.appendChild(word);
    li.appendChild(chip);

    // highlight if in matchSet
    if (matchSet.has(wordUpper)) {
      li.classList.add(highlightThem ? 'rom__li--match-them' : 'rom__li--match');
    }

    ol.appendChild(li);
  });
}


    function animateFill(el, toPct) {
      const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
      const target = clamp(toPct, 0, 100);
      const start = parseFloat(el.style.width || '0') || 0;
      const duration = 700; // ms
      const t0 = performance.now();

      function step(t) {
        const k = Math.min(1, (t - t0) / duration);
        const val = start + (target - start) * k;
        el.style.width = val + '%';
        if (k < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    // ---------- Fill on round end
    window.addEventListener('round:over', (e) => {
      const d = e?.detail || {};

      // Ensure sections exist
      ensureVSSection();
      ensureMeter();

      // Data prep
      const boardTop10 = Array.isArray(d.boardTop10) ? d.boardTop10 : [];
      const youItems =
        Array.isArray(d.wordsWithScores) ? d.wordsWithScores :
        Array.isArray(d.words) ? d.words.map(w => ({ word: w, score: 0 })) : [];

      // Sort both by score desc for satisfying comparison
      const byScoreDesc = (a, b) => (Number(b.score) || 0) - (Number(a.score) || 0);
      const youSorted   = [...youItems].sort(byScoreDesc).slice(0, 10);
      const themSorted  = [...boardTop10].sort(byScoreDesc).slice(0, 10);

      // Render side-by-side lists + counts
      const youOl   = document.getElementById('rom-you-ol');
      const themOl  = document.getElementById('rom-them-ol');
      const youCnt  = document.getElementById('rom-you-count');
      const themCnt = document.getElementById('rom-them-count');

      renderList(youOl, youSorted);
      renderList(themOl, themSorted);
      youCnt.textContent  = `(${youItems.length})`;
      themCnt.textContent = `(${themSorted.length})`;

      // Overlap set
      const top10WordSet = new Set(themSorted.map(x => String(x.word).toUpperCase()));
      const overlap = youItems.filter(p => top10WordSet.has(String(p.word).toUpperCase())).length;

      // Render with highlighting
      renderList(youOl, youSorted, top10WordSet, false);
      renderList(themOl, themSorted, new Set(youSorted.map(x => String(x.word).toUpperCase())), true);


      const playerTotal = Number(d.totalScore) || 0;
      const boardTop10Total =
        Number(d.boardTop10Total) ||
        themSorted.reduce((acc, x) => acc + (Number(x.score) || 0), 0);

      const pct = boardTop10Total > 0 ? Math.round((playerTotal / boardTop10Total) * 100) : 0;

      // Fill meter
      const fill    = document.getElementById('rom-meter-fill');
      const numbers = document.getElementById('rom-meter-numbers');
      const pctEl   = document.getElementById('rom-meter-pct');
      const track   = dialog.querySelector('.rom__track');

      numbers.innerHTML = `<b>${Math.round(playerTotal)}</b> / ${Math.round(boardTop10Total)}`;
      pctEl.textContent = `${pct}% of Top 10 total • Matched ${overlap} word${overlap === 1 ? '' : 's'}`;
      track.setAttribute('aria-valuenow', String(pct));
      animateFill(fill, pct);
    });
  })();

})();
