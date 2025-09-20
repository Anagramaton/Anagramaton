// howToModal.js
(function () {
  const $ = (id) => document.getElementById(id);
  const modal   = $('howto-modal');
  const openBtn = $('howto-open');
  const closeBtn = $('howto-close');
  const prevBtn  = $('howto-prev');
  const nextBtn  = $('howto-next');
  const dotsWrap = $('howto-dots');
  const pages = Array.from(modal.querySelectorAll('.howto-page'));
  let page = 0, lastFocused = null;

  function setDotStyles() {
    const dots = dotsWrap.querySelectorAll('.howto-dot');
    dots.forEach((d, i) => {
      d.style.width = '10px';
      d.style.height = '10px';
      d.style.borderRadius = '50%';
      d.style.border = '1px solid rgba(255,255,255,.6)';
      d.style.background = i === page ? '#fff' : 'transparent';
      d.style.opacity = i === page ? '1' : '.6';
      d.style.cursor = 'pointer';
    });
  }
  function render() {
    pages.forEach((sec, i) => sec.hidden = (i !== page));
    prevBtn.disabled = page === 0;
    nextBtn.disabled = page === pages.length - 1;
    setDotStyles();
  }
  function open() {
    lastFocused = document.activeElement;
    modal.classList.remove('rom--hidden');
    document.body.classList.add('rom-open');
    page = 0; render();
    (nextBtn || closeBtn).focus();
    trapFocus(true);
  }
  function close() {
    modal.classList.add('rom--hidden');
    document.body.classList.remove('rom-open');
    trapFocus(false);
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }
  function go(n) { page = Math.max(0, Math.min(pages.length - 1, n)); render(); }

  // Focus trap
  let focusHandler = null;
  function trapFocus(enable) {
    if (enable && !focusHandler) {
      focusHandler = () => {
        const dialog = modal.querySelector('.rom__dialog');
        if (!dialog.contains(document.activeElement)) (nextBtn || closeBtn).focus();
      };
      document.addEventListener('focusin', focusHandler);
    } else if (!enable && focusHandler) {
      document.removeEventListener('focusin', focusHandler);
      focusHandler = null;
    }
  }

  // Events
  openBtn?.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  modal.querySelector('.rom__backdrop')?.addEventListener('click', close);
  prevBtn?.addEventListener('click', () => go(page - 1));
  nextBtn?.addEventListener('click', () => go(page + 1));
  dotsWrap.addEventListener('click', (e) => {
    const dot = e.target.closest('.howto-dot'); if (!dot) return;
    go(Number(dot.dataset.dot || 0));
  });
  document.addEventListener('keydown', (e) => {
    if (modal.classList.contains('rom--hidden')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') go(page + 1);
    if (e.key === 'ArrowLeft') go(page - 1);
  });
})();
