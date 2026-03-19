
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

  /* ── Open / Close ───────────────────────────────────────────── */
  function openModal({ words = [], baseTotal = 0, bonusTotal = 0, totalScore = 0 } = {}) {
    totalEl.textContent = totalScore;
    baseEl.textContent  = baseTotal;
    bonusEl.textContent = bonusTotal;

    lastFocused = document.activeElement;
    modal.classList.remove('rom--hidden');
    document.body.classList.add('rom-open');

    // Scroll dialog back to top each open
    dialog.scrollTop = 0;

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

  /* ── Focus trap ─────────────────────────────────────────────── */
  let focusHandler = null;
  function trapFocus(enable) {
    if (enable && !focusHandler) {
      focusHandler = () => {
        if (!dialog.contains(document.activeElement)) {
          (closeBtn || dialog).focus();
        }
      };
      document.addEventListener('focusin', focusHandler);
    } else if (!enable && focusHandler) {
      document.removeEventListener('focusin', focusHandler);
      focusHandler = null;
    }
  }

  /* ── Close interactions ─────────────────────────────────────── */
  closeBtn?.addEventListener('click', closeModal);

  // Backdrop click — only close when the click target IS the backdrop element
  backdrop?.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (!modal.classList.contains('rom--hidden') && e.key === 'Escape') {
      closeModal();
    }
  });

  window.addEventListener('round:over', (e) => {
    const d = e.detail || {};
    openModal(d);
  });

  /* ════════════════════════════════════════════════════════════
     DUEL BOARD — enhanced sections
     ════════════════════════════════════════════════════════════ */
  (() => {

    /* ── Section builders ─────────────────────────────────────── */
    function ensureDismissHint() {
      if (dialog.querySelector('.rom__dismiss-hint')) return;
      const hint = document.createElement('p');
      hint.className = 'rom__dismiss-hint';
      hint.textContent = 'Click outside to close';
      dialog.appendChild(hint);
    }

    function ensureVSSection() {
      let wrap = $('rom-vs-wrap');
      if (wrap) return wrap;

      wrap = document.createElement('section');
      wrap.id = 'rom-vs-wrap';

      // Section label
      const lbl = document.createElement('div');
      lbl.className = 'rom__section-label';
      lbl.textContent = 'Head-to-Head';
      wrap.appendChild(lbl);

      // Column headers: YOU · VS · BOARD
      const heads = document.createElement('div');
      heads.className = 'rom__duel-heads';
      heads.innerHTML = `
        <div class="rom__duel-head rom__duel-head--you">
          YOU <span id="rom-you-count" class="col-count"></span>
        </div>
        <div class="rom__duel-vs">VS</div>
        <div class="rom__duel-head rom__duel-head--them">
          BOARD <span id="rom-them-count" class="col-count"></span>
        </div>
      `;
      wrap.appendChild(heads);

      // Grid
      const grid = document.createElement('div');
      grid.className = 'rom__grid';

      const colYou = document.createElement('div');
      colYou.className = 'rom__col rom__col--you';
      colYou.innerHTML = `
        <h4 class="rom__col-title">YOUR WORDS</h4>
        <ol id="rom-you-ol" class="rom__ol"></ol>
      `;

      const colThem = document.createElement('div');
      colThem.className = 'rom__col rom__col--them';
      colThem.innerHTML = `
        <h4 class="rom__col-title">BOARD'S TOP 10</h4>
        <ol id="rom-them-ol" class="rom__ol"></ol>
      `;

      grid.appendChild(colYou);
      grid.appendChild(colThem);
      wrap.appendChild(grid);

      const actions = modal.querySelector('.rom__actions');
      dialog.insertBefore(wrap, actions);
      return wrap;
    }

    function ensureMeter() {
      let meter = $('rom-meter');
      if (meter) return meter;

      meter = document.createElement('section');
      meter.id = 'rom-meter';
      meter.className = 'rom__meter';

      const lbl = document.createElement('div');
      lbl.className = 'rom__section-label';
      lbl.textContent = 'Duel Bar';
      dialog.insertBefore(lbl, modal.querySelector('.rom__actions'));

      meter.innerHTML = `
        <div class="rom__meter-top">
          <span class="rom__meter-tag rom__meter-scores">
            <span class="you-score" id="rom-meter-you-score">—</span>
            <span class="sep">/</span>
            <span class="them-score" id="rom-meter-them-score">—</span>
          </span>
          <span id="rom-meter-numbers" class="rom__meter-tag"></span>
        </div>
        <div class="rom__track"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow="0"
          aria-label="Your score vs board top-10">
          <div id="rom-meter-fill" class="rom__fill"></div>
        </div>
        <div id="rom-meter-pct" class="rom__pct">
          <span class="rom__pct-label">YOUR SHARE</span>
          <span id="rom-pct-val" class="rom__pct-val">—</span>
        </div>
      `;
      const actions = modal.querySelector('.rom__actions');
      dialog.insertBefore(meter, actions);
      return meter;
    }

    function ensureSummarySection() {
      let sec = $('rom-summary');
      if (sec) return sec;
      sec = document.createElement('section');
      sec.id = 'rom-summary';
      sec.className = 'rom__block rom__block--summary';
      const actions = dialog.querySelector('.rom__actions');
      dialog.insertBefore(sec, actions);
      return sec;
    }

    function ensureBadgeStrip() {
      let sec = $('rom-badges');
      if (sec) return sec;
      sec = document.createElement('section');
      sec.id = 'rom-badges';
      sec.className = 'rom__block rom__block--badges';
      const actions = dialog.querySelector('.rom__actions');
      dialog.insertBefore(sec, actions);
      return sec;
    }

    function ensureTabbedArea() {
      let wrap = $('rom-tabs');
      if (wrap) return wrap;

      wrap = document.createElement('section');
      wrap.id = 'rom-tabs';
      wrap.className = 'rom__block rom__block--tabs';
      wrap.innerHTML = `
        <div class="rom__section-label" style="padding-left:0;">Details</div>
        <div class="rom__tablist" role="tablist" aria-label="Round details">
          <button type="button" class="rom__tab rom__tab--active" data-tab="summary"     role="tab" aria-selected="true">Summary</button>
          <button type="button" class="rom__tab"                  data-tab="yours"       role="tab" aria-selected="false">Your 10</button>
          <button type="button" class="rom__tab"                  data-tab="board"       role="tab" aria-selected="false">Board Top 10</button>
          <button type="button" class="rom__tab"                  data-tab="missed"      role="tab" aria-selected="false">Missed</button>
        </div>
        <div class="rom__panels">
          <div id="rom-panel-summary"     class="rom__panel rom__panel--active" data-tabpanel="summary"></div>
          <div id="rom-panel-yours"       class="rom__panel"                    data-tabpanel="yours"></div>
          <div id="rom-panel-board"       class="rom__panel"                    data-tabpanel="board"></div>
          <div id="rom-panel-missed"      class="rom__panel"                    data-tabpanel="missed"></div>
        </div>
      `;
      const actions = dialog.querySelector('.rom__actions');
      dialog.insertBefore(wrap, actions);

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

    /* ── Render helpers ───────────────────────────────────────── */
    function renderList(ol, items, matchSet = new Set(), highlightClass = '') {
      ol.innerHTML = '';
      items.forEach((it, idx) => {
        const li = document.createElement('li');
        li.className = 'rom__li';

        const wordUpper = String(it.word || '').toUpperCase();
        const word = document.createElement('span');
        word.className = 'rom__word';
        word.textContent = `${idx + 1}. ${wordUpper}`;

        const chip = document.createElement('span');
        chip.className = 'rom__score-chip';
        chip.textContent = `+${Number(it.score) || 0}`;

        li.appendChild(word);
        li.appendChild(chip);

        if (matchSet.has(wordUpper) && highlightClass) {
          li.classList.add(highlightClass);
        }

        ol.appendChild(li);
      });
    }

    function animateFill(el, toPct) {
      const target  = Math.max(0, Math.min(100, toPct));
      const start   = parseFloat(el.style.width || '0') || 0;
      const dur     = 900;
      const t0      = performance.now();

      function step(t) {
        const k = Math.min(1, (t - t0) / dur);
        // ease-out cubic
        const ease = 1 - Math.pow(1 - k, 3);
        el.style.width = (start + (target - start) * ease) + '%';
        if (k < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    /* ── Fill extra sections on round:over ───────────────────── */
    function fillExtraSections(d) {
      const {
        wordsWithScores  = [],
        baseTotal        = 0,
        bonusTotal       = 0,
        totalScore       = 0,
        boardTop10       = [],
        boardTop10Total  = 0,
        phrasesFound     = {},
        bothPhrasesFound = false,
        phraseBonus      = 0,
      } = d;

      /* Build sections in visual order (each insertBefore .rom__actions appends in sequence) */
      ensureMeter();
      const sumSec = ensureSummarySection();
      ensureBadgeStrip();
      ensureVSSection();
      ensureTabbedArea();
      const phrase1Found = !!phrasesFound.phrase1;
      const phrase2Found = !!phrasesFound.phrase2;
      const showPhraseRow = phrase1Found || phrase2Found || d.dailyId;
      sumSec.innerHTML = `
        <div class="rom__summary-grid">
          <div><span class="rom__label">Your Score</span>   <span class="rom__value" style="color:var(--rom-you)">${totalScore}</span></div>
          <div><span class="rom__label">Board Top 10</span> <span class="rom__value" style="color:var(--rom-them)">${boardTop10Total}</span></div>
          <div><span class="rom__label">Base</span>         <span class="rom__value">${baseTotal}</span></div>
          <div><span class="rom__label">Bonus</span>        <span class="rom__value">${bonusTotal}</span></div>
        </div>
        ${showPhraseRow ? `
        <div class="rom__phrase-status${bothPhrasesFound ? ' rom__phrase-status--found' : ''}">
          ${bothPhrasesFound
            ? `🎉 Both phrases found! Phrase bonus: <strong>+${phraseBonus}</strong>`
            : `Phrase 1: ${phrase1Found ? '✅' : '❌'} &nbsp; Phrase 2: ${phrase2Found ? '✅' : '❌'}
               <br><small>Find both phrases to earn the phrase bonus!</small>`
          }
        </div>` : ''}
      `;

      /* Badges */
      const badgeSec = $('rom-badges');
      const longest = wordsWithScores.reduce(
        (b, c) => String(c.word || '').length > b.len ? { word: c.word, len: String(c.word || '').length } : b,
        { word: null, len: 0 }
      );
      const topScoring = wordsWithScores.reduce(
        (b, c) => (c.score > b.score ? c : b),
        { word: null, score: -1 }
      );
      const beatBoard  = boardTop10Total > 0 && totalScore >= boardTop10Total;
      const efficiency = boardTop10Total > 0 ? Math.round((totalScore / boardTop10Total) * 100) : 0;

      badgeSec.innerHTML = `
        <div class="rom__badge-row">
          <span class="rom__badge">EFF: ${efficiency}%</span>
          ${longest.word   ? `<span class="rom__badge">LONGEST: ${String(longest.word).toUpperCase()}</span>` : ''}
          ${topScoring.word ? `<span class="rom__badge">TOP: ${String(topScoring.word).toUpperCase()} +${topScoring.score}</span>` : ''}
          ${beatBoard       ? `<span class="rom__badge rom__badge--win">🏆 YOU MATCHED THE BOARD</span>` : ''}
        </div>
      `;

      /* Tabs */
      const summaryPanel = $('rom-panel-summary');
      const yoursPanel   = $('rom-panel-yours');
      const boardPanel   = $('rom-panel-board');
      const missedPanel  = $('rom-panel-missed');

      if (summaryPanel) {
        summaryPanel.innerHTML = `
          <p>Your list scored <strong>${totalScore}</strong> vs the board's top-10 total of <strong>${boardTop10Total}</strong>.</p>
          <p>You submitted <strong>${wordsWithScores.length}</strong> word${wordsWithScores.length !== 1 ? 's' : ''}.</p>
        `;
      }

      const byScoreDesc = (a, b) => (Number(b.score) || 0) - (Number(a.score) || 0);

      if (yoursPanel) {
        const sorted = [...wordsWithScores].sort(byScoreDesc);
        yoursPanel.innerHTML = sorted.length
          ? sorted.map(w => `
              <div class="rom__row">
                <span class="rom__word">${String(w.word || '').toUpperCase()}</span>
                <span class="rom__score-chip">+${w.score}</span>
              </div>`).join('')
          : '<p>No words submitted.</p>';
      }

      if (boardPanel) {
        boardPanel.innerHTML = (boardTop10 || []).length
          ? [...boardTop10].sort(byScoreDesc).map(w => `
              <div class="rom__row">
                <span class="rom__word">${String(w.word || '').toUpperCase()}</span>
                <span class="rom__score-chip">+${w.score}</span>
              </div>`).join('')
          : '<p>No board data available.</p>';
      }

      if (missedPanel) {
        const yourSet = new Set(wordsWithScores.map(w => String(w.word || '').toUpperCase()));
        const missed  = (boardTop10 || []).filter(b => !yourSet.has(String(b.word || '').toUpperCase()));
        missedPanel.innerHTML = missed.length
          ? missed.map(m => `
              <div class="rom__row rom__row--missed">
                <span class="rom__word">${String(m.word || '').toUpperCase()}</span>
                <span class="rom__score-chip">+${m.score}</span>
              </div>`).join('')
          : '<p>You covered all of the board\'s top words! 🎯</p>';
      }
    }

    /* ── Main round:over handler ──────────────────────────────── */
    window.addEventListener('round:over', (e) => {
      const d = e?.detail || {};

      fillExtraSections(d);
      ensureDismissHint();

      const boardTop10     = Array.isArray(d.boardTop10) ? d.boardTop10 : [];
      const youItems       = Array.isArray(d.wordsWithScores) ? d.wordsWithScores
                           : Array.isArray(d.words)           ? d.words.map(w => ({ word: w, score: 0 }))
                           : [];

      const byScoreDesc = (a, b) => (Number(b.score) || 0) - (Number(a.score) || 0);
      const youSorted   = [...youItems].sort(byScoreDesc).slice(0, 10);
      const themSorted  = [...boardTop10].sort(byScoreDesc).slice(0, 10);

      /* Render VS lists */
      const youOl   = $('rom-you-ol');
      const themOl  = $('rom-them-ol');
      const youCnt  = $('rom-you-count');
      const themCnt = $('rom-them-count');

      const top10WordSet = new Set(themSorted.map(x => String(x.word || '').toUpperCase()));
      const yourWordSet  = new Set(youSorted.map(x => String(x.word || '').toUpperCase()));

      if (youOl)   renderList(youOl,   youSorted,  top10WordSet,  'rom__li--match');
      if (themOl)  renderList(themOl,  themSorted, yourWordSet,   'rom__li--match-them');
      if (youCnt)  youCnt.textContent  = `(${youItems.length})`;
      if (themCnt) themCnt.textContent = `(${themSorted.length})`;

      /* Meter */
      const playerTotal   = Number(d.totalScore) || 0;
      const boardTotal    = Number(d.boardTop10Total)
                          || themSorted.reduce((acc, x) => acc + (Number(x.score) || 0), 0);
      const pct           = boardTotal > 0 ? Math.round((playerTotal / boardTotal) * 100) : 0;
      const overlap       = youItems.filter(p => top10WordSet.has(String(p.word || '').toUpperCase())).length;

      const fill        = $('rom-meter-fill');
      const pctVal      = $('rom-pct-val');
      const meterNums   = $('rom-meter-numbers');
      const meterYou    = $('rom-meter-you-score');
      const meterThem   = $('rom-meter-them-score');
      const track       = dialog.querySelector('.rom__track');

      if (meterYou)  meterYou.textContent  = Math.round(playerTotal);
      if (meterThem) meterThem.textContent = Math.round(boardTotal);
      if (meterNums) meterNums.textContent = `${pct}%`;
      if (pctVal)    pctVal.textContent    = `${pct}% — ${overlap} shared word${overlap !== 1 ? 's' : ''}`;
      if (track)     track.setAttribute('aria-valuenow', String(pct));
      if (fill)      animateFill(fill, pct);
    });

  })();

})();