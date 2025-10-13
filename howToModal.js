// howToModal.js
(function () {
  const $ = (id) => document.getElementById(id);
  const modal    = $('howto-modal');
  const openBtn  = $('howto-open');
  const closeBtn = $('howto-close');
  const prevBtn  = $('howto-prev');
  const nextBtn  = $('howto-next');
  const dotsWrap = $('howto-dots');

  if (!modal) return; // guard if modal isn't on page

  const pages = Array.from(modal.querySelectorAll('.howto-page'));
  let page = 0, lastFocused = null;

  // --- dots ---
  function buildDots() {
    if (!dotsWrap) return;
    dotsWrap.innerHTML = '';
    pages.forEach((_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'howto-dot';
      b.dataset.dot = String(i);
      b.setAttribute('aria-label', `Go to page ${i + 1}`);
      b.setAttribute('aria-controls', 'howto-modal');
      b.style.all = 'unset'; // reset so we can style inline below
      b.style.display = 'inline-block';
      b.style.margin = '0 4px';
      b.style.verticalAlign = 'middle';
      dotsWrap.appendChild(b);
    });
  }

  function setDotStyles() {
    if (!dotsWrap) return;
    const dots = dotsWrap.querySelectorAll('.howto-dot');
    dots.forEach((d, i) => {
      d.style.width = '10px';
      d.style.height = '10px';
      d.style.borderRadius = '50%';
      d.style.border = '1px solid rgba(255,255,255,.6)';
      d.style.background = i === page ? '#fff' : 'transparent';
      d.style.opacity = i === page ? '1' : '.65';
      d.style.cursor = 'pointer';
      d.setAttribute('aria-current', i === page ? 'true' : 'false');
      d.tabIndex = 0;
    });
  }

  // --- render / nav ---
  function render() {
    pages.forEach((sec, i) => sec.hidden = (i !== page));
    if (prevBtn) prevBtn.disabled = page === 0;
    if (nextBtn) nextBtn.disabled = page === pages.length - 1;
    setDotStyles();
  }

  function go(n) {
    page = Math.max(0, Math.min(pages.length - 1, n));
    render();
  }

  // --- open / close ---
  function open() {
    lastFocused = document.activeElement;
    modal.classList.remove('rom--hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('rom-open');
    page = 0;
    render();
    (nextBtn || closeBtn || modal).focus();
    trapFocus(true);
  }

  function close() {
    modal.classList.add('rom--hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('rom-open');
    trapFocus(false);
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  // --- focus trap ---
  let focusHandler = null;
  function trapFocus(enable) {
    if (enable && !focusHandler) {
      focusHandler = () => {
        const dialog = modal.querySelector('.rom__dialog');
        if (!dialog) return;
        if (!dialog.contains(document.activeElement)) (nextBtn || closeBtn || dialog).focus();
      };
      document.addEventListener('focusin', focusHandler);
    } else if (!enable && focusHandler) {
      document.removeEventListener('focusin', focusHandler);
      focusHandler = null;
    }
  }

  // --- events ---
  openBtn?.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  modal.querySelector('.rom__backdrop')?.addEventListener('click', close);
  prevBtn?.addEventListener('click', () => go(page - 1));
  nextBtn?.addEventListener('click', () => go(page + 1));

  // dots (click + keyboard)
  dotsWrap?.addEventListener('click', (e) => {
    const dot = e.target.closest('.howto-dot'); if (!dot) return;
    go(Number(dot.dataset.dot || 0));
  });
  dotsWrap?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const dot = e.target.closest('.howto-dot'); if (!dot) return;
    e.preventDefault();
    go(Number(dot.dataset.dot || 0));
  });

  document.addEventListener('keydown', (e) => {
    if (modal.classList.contains('rom--hidden')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') go(page + 1);
    if (e.key === 'ArrowLeft') go(page - 1);
  });

  // --- init ---
  buildDots();
  render();

  // --- tiny public API (handy while you draft the Phrase Panel text) ---
  window.howto = {
    open, close,
    setPage: (n) => go(Number(n) || 0),
    setPhrasePanelHTML(html) {
      // Phrase Panel is page 5 ⇒ index 4 (data-page="4")
      const phrase = modal.querySelector('.howto-page[data-page="4"]');
      if (!phrase) return;
      // Replace the first paragraph after the h3 (keeps the heading)
      const p = phrase.querySelector('p');
      if (p) p.innerHTML = html;
      // jump there to preview if you want:
      // go(4);
    }
  };
})();
