// hexacoreModeSelect.js — Mode selection screen for Hexacore

const MODES = [
  {
    id:    'endless',
    icon:  '🔥',
    title: 'ENDLESS',
    desc:  'Survive the ember. Score as high as you can with no limits.',
    color: '#f97316',
  },
  {
    id:    'hexacoreDaily',
    icon:  '📅',
    title: 'DAILY',
    desc:  'Fixed daily board with no refills. Submit for the best final score.',
    color: '#4cc9f0',
  },
  {
    id:    'campaign',
    icon:  '⚔️',
    title: 'CAMPAIGN',
    desc:  '50 structured levels with unique objectives and star ratings.',
    color: '#a855f7',
  },
];

/** Open the mode select modal; calls onModeSelected(modeId) when a mode is chosen,
 *  or onClose() when dismissed without selecting a mode. */
export function openModeSelectModal(onModeSelected, onClose) {
  document.getElementById('hx-mode-select-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'hx-mode-select-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'hx-mode-select-title');

  const box = document.createElement('div');
  box.id = 'hx-mode-select-box';

  box.innerHTML = `
    <div id="hx-mode-select-header">
      <span id="hx-mode-select-title">⚡ SELECT MODE</span>
      <button id="hx-mode-select-close" aria-label="Close">✕</button>
    </div>
    <div id="hx-mode-cards"></div>
  `;

  modal.appendChild(box);
  document.body.appendChild(modal);

  const cardsEl = box.querySelector('#hx-mode-cards');

  MODES.forEach(mode => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'hx-mode-card';
    card.dataset.mode = mode.id;
    card.style.setProperty('--mode-color', mode.color);
    card.innerHTML = `
      <span class="hx-mode-card-icon">${mode.icon}</span>
      <div class="hx-mode-card-info">
        <span class="hx-mode-card-title">${mode.title}</span>
        <span class="hx-mode-card-desc">${mode.desc}</span>
      </div>
      <span class="hx-mode-card-arrow">›</span>
    `;
    card.addEventListener('click', () => {
      modal.remove();
      if (typeof onModeSelected === 'function') onModeSelected(mode.id);
    });
    cardsEl.appendChild(card);
  });

  document.getElementById('hx-mode-select-close')?.addEventListener('click', () => {
    modal.remove();
    if (typeof onClose === 'function') onClose();
  });
  modal.addEventListener('click', e => {
    if (e.target === modal) {
      modal.remove();
      if (typeof onClose === 'function') onClose();
    }
  });
}
