

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

  window.addEventListener('round:over', (e) => {
    const d = e.detail || {};
    openModal(d);
  });



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

        function ensureSummarySection() {
      let sec = document.getElementById('rom-summary');
      if (sec) return sec;
      sec = document.createElement('section');
      sec.id = 'rom-summary';
      sec.className = 'rom__block rom__block--summary';
      // content filled later
      const actions = dialog.querySelector('.rom__actions');
      dialog.insertBefore(sec, actions);
      return sec;
    }

    function ensureBadgeStrip() {
      let sec = document.getElementById('rom-badges');
      if (sec) return sec;
      sec = document.createElement('section');
      sec.id = 'rom-badges';
      sec.className = 'rom__block rom__block--badges';
      const actions = dialog.querySelector('.rom__actions');
      dialog.insertBefore(sec, actions);
      return sec;
    }

    function ensureTabbedArea() {
      let wrap = document.getElementById('rom-tabs');
      if (wrap) return wrap;

      wrap = document.createElement('section');
      wrap.id = 'rom-tabs';
      wrap.className = 'rom__block rom__block--tabs';
      wrap.innerHTML = `
        <div class="rom__tablist" role="tablist" aria-label="Round details">
          <button type="button" class="rom__tab rom__tab--active" data-tab="summary" role="tab" aria-selected="true">Summary</button>
          <button type="button" class="rom__tab" data-tab="yours" role="tab" aria-selected="false">Your 10</button>
          <button type="button" class="rom__tab" data-tab="board" role="tab" aria-selected="false">Board Top 10</button>
          <button type="button" class="rom__tab" data-tab="missed" role="tab" aria-selected="false">Missed</button>
        </div>
        <div class="rom__panels">
          <div id="rom-panel-summary" class="rom__panel rom__panel--active" data-tabpanel="summary"></div>
          <div id="rom-panel-yours" class="rom__panel" data-tabpanel="yours"></div>
          <div id="rom-panel-board" class="rom__panel" data-tabpanel="board"></div>
          <div id="rom-panel-missed" class="rom__panel" data-tabpanel="missed"></div>
        </div>
      `;
      const actions = dialog.querySelector('.rom__actions');
      dialog.insertBefore(wrap, actions);

      // tab wiring
      wrap.addEventListener('click', (evt) => {
        const btn = evt.target.closest('.rom__tab');
        if (!btn) return;
        const tab = btn.dataset.tab;
        wrap.querySelectorAll('.rom__tab').forEach(t => {
          t.classList.toggle('rom__tab--active', t === btn);
          t.setAttribute('aria-selected', t === btn ? 'true' : 'false');
        });
        wrap.querySelectorAll('.rom__panel').forEach(p => {
          p.classList.toggle('rom__panel--active', p.dataset.tabpanel === tab);
        });
      });

      return wrap;
    }

    function fillExtraSections(d) {
      const {
        wordsWithScores = [],
        baseTotal = 0,
        bonusTotal = 0,
        totalScore = 0,
        boardTop10 = [],
        boardTop10Total = 0,
      } = d;

      const sumSec = ensureSummarySection();
      const badgeSec = ensureBadgeStrip();
      ensureTabbedArea();

      // summary block mirrors existing numbers
      sumSec.innerHTML = `
        <div class="rom__summary-grid">
          <div>
            <span class="rom__label">Final score</span>
            <span class="rom__value">${totalScore}</span>
          </div>
          <div>
            <span class="rom__label">Base</span>
            <span class="rom__value">${baseTotal}</span>
          </div>
          <div>
            <span class="rom__label">Bonus</span>
            <span class="rom__value">${bonusTotal}</span>
          </div>
          <div>
            <span class="rom__label">Board Top 10</span>
            <span class="rom__value">${boardTop10Total}</span>
          </div>
        </div>
      `;

      // badges derived from actual payload
      const longest = wordsWithScores.reduce(
        (best, curr) => {
          const len = String(curr.word || '').length;
          return len > best.len ? { word: curr.word, len } : best;
        },
        { word: null, len: 0 }
      );
      const topScoring = wordsWithScores.reduce(
        (best, curr) => (curr.score > best.score ? curr : best),
        { word: null, score: -1 }
      );
      const beatBoard = boardTop10Total > 0 && totalScore >= boardTop10Total;
      const efficiency = boardTop10Total > 0 ? Math.round((totalScore / boardTop10Total) * 100) : 0;

      badgeSec.innerHTML = `
        <div class="rom__badge-row">
          <span class="rom__badge">Eff: ${efficiency}%</span>
          ${longest.word ? `<span class="rom__badge">Longest: ${longest.word}</span>` : ''}
          ${topScoring.word ? `<span class="rom__badge">Top: ${topScoring.word} (+${topScoring.score})</span>` : ''}
          ${beatBoard ? `<span class="rom__badge rom__badge--win">You matched the board</span>` : ''}
        </div>
      `;

      // Tab panels
      const yoursPanel = document.getElementById('rom-panel-yours');
      const boardPanel = document.getElementById('rom-panel-board');
      const missedPanel = document.getElementById('rom-panel-missed');
      const summaryPanel = document.getElementById('rom-panel-summary');

      if (summaryPanel) {
        summaryPanel.innerHTML = `
          <p>Your list scored <strong>${totalScore}</strong> vs board’s <strong>${boardTop10Total}</strong>.</p>
          <p>You submitted <strong>${wordsWithScores.length}</strong> words.</p>
        `;
      }

      if (yoursPanel) {
        yoursPanel.innerHTML = wordsWithScores
          .sort((a, b) => b.score - a.score)
          .map(w => `
            <div class="rom__row">
              <span class="rom__word">${String(w.word).toUpperCase()}</span>
              <span class="rom__score-chip">+${w.score}</span>
            </div>
          `).join('') || '<p>No words.</p>';
      }

      if (boardPanel) {
        boardPanel.innerHTML = (boardTop10 || [])
          .map(w => `
            <div class="rom__row">
              <span class="rom__word">${String(w.word).toUpperCase()}</span>
              <span class="rom__score-chip">+${w.score}</span>
            </div>
          `).join('') || '<p>No board data.</p>';
      }

      if (missedPanel) {
        const yourSet = new Set(wordsWithScores.map(w => String(w.word).toUpperCase()));
        const missed = (boardTop10 || []).filter(b => !yourSet.has(String(b.word).toUpperCase()));
        missedPanel.innerHTML = missed.length
          ? missed.map(m => `
              <div class="rom__row rom__row--missed">
                <span class="rom__word">${String(m.word).toUpperCase()}</span>
                <span class="rom__score-chip">+${m.score}</span>
              </div>
            `).join('')
          : '<p>You covered the board’s top set.</p>';
      }
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

      // Fill summary / badges / tabs
      fillExtraSections(d);

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
