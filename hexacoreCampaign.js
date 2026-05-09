// hexacoreCampaign.js — Campaign mode level definitions and progress tracking for Hexacore

const HX_CAMPAIGN_KEY = 'hexacore_campaign';

/* ── Campaign level definitions ─────────────────────────────────── */

export const CAMPAIGN_LEVELS = [
  { id:  1, title: 'First Words',      objectives: [{ type: 'formWords',  target:  5, desc: 'Form 5 valid words' }],                                  stars: [1, 3, 5] },
  { id:  2, title: 'Fire Starter',     objectives: [{ type: 'useEmber',   target:  1, desc: 'Use an Ember tile in a word' }],                          stars: [1, 2, 3] },
  { id:  3, title: 'Wordsmith',        objectives: [{ type: 'formWords',  target: 10, desc: 'Form 10 valid words' }],                                  stars: [5, 8, 10] },
  { id:  4, title: 'Gem Hunter',       objectives: [{ type: 'useGem',     target:  3, desc: 'Use 3 gem tiles' }],                                      stars: [1, 2, 3] },
  { id:  5, title: 'Long Shot',        objectives: [{ type: 'wordLength', target:  6, desc: 'Form a 6-letter word' }],                                 stars: [1, 2, 3] },
  { id:  6, title: 'Prism Break',      objectives: [{ type: 'usePrism',   target:  2, desc: 'Use 2 Prism tiles' }],                                    stars: [1, 2, 3] },
  { id:  7, title: 'Score Rush',       objectives: [{ type: 'score',      target: 2000, desc: 'Score 2,000 points' }],                                 stars: [2000, 4000, 6000] },
  { id:  8, title: 'Wildcard',         objectives: [{ type: 'useRune',    target:  1, desc: 'Use a Rune wildcard tile' }],                             stars: [1, 2, 3] },
  { id:  9, title: 'Digraph Master',   objectives: [{ type: 'useDigraph', target:  3, desc: 'Use 3 Digraph tiles' }],                                  stars: [1, 2, 3] },
  { id: 10, title: 'Survivor',         objectives: [{ type: 'formWords',  target: 15, desc: 'Form 15 words before game over' }],                       stars: [10, 15, 20] },

  { id: 11, title: 'Ember Dance',      objectives: [{ type: 'useEmber',   target:  3, desc: 'Use 3 Ember tiles' }],                                    stars: [1, 2, 3] },
  { id: 12, title: 'Lucky Seven',      objectives: [{ type: 'wordLength', target:  7, desc: 'Form a 7-letter word' }],                                 stars: [1, 2, 3] },
  { id: 13, title: 'Gem Collector',    objectives: [{ type: 'useGem',     target:  6, desc: 'Use 6 gem tiles' }],                                      stars: [3, 6, 9] },
  { id: 14, title: 'Big Score',        objectives: [{ type: 'score',      target: 5000, desc: 'Score 5,000 points' }],                                 stars: [5000, 8000, 12000] },
  { id: 15, title: 'Combo King',       objectives: [{ type: 'wordScore',  target: 1000, desc: 'Score 1,000+ on a single word' }],                      stars: [500, 1000, 2000] },
  { id: 16, title: 'Prism Master',     objectives: [{ type: 'usePrism',   target:  4, desc: 'Use 4 Prism tiles' }],                                    stars: [2, 3, 4] },
  { id: 17, title: 'Double Digraph',   objectives: [{ type: 'useDigraph', target:  5, desc: 'Use 5 Digraph tiles' }],                                  stars: [2, 4, 5] },
  { id: 18, title: 'Word Veteran',     objectives: [{ type: 'formWords',  target: 20, desc: 'Form 20 valid words' }],                                  stars: [15, 20, 25] },
  { id: 19, title: 'Gem Stack',        objectives: [{ type: 'gemInWord',  target:  2, desc: 'Use 2 gems in a single word' }],                          stars: [1, 2, 3] },
  { id: 20, title: 'Fire & Ice',       objectives: [{ type: 'useEmber',   target:  5, desc: 'Use 5 Ember tiles' }],                                    stars: [3, 5, 7] },

  { id: 21, title: 'Octagon',          objectives: [{ type: 'wordLength', target:  8, desc: 'Form an 8-letter word' }],                                stars: [1, 2, 3] },
  { id: 22, title: 'Score Blitz',      objectives: [{ type: 'score',      target: 10000, desc: 'Score 10,000 points' }],                               stars: [10000, 15000, 20000] },
  { id: 23, title: 'Rune Runner',      objectives: [{ type: 'useRune',    target:  3, desc: 'Use 3 Rune wildcards' }],                                 stars: [1, 2, 3] },
  { id: 24, title: 'Gem Diversity',    objectives: [{ type: 'uniqueGems', target:  3, desc: 'Use 3 different gem types' }],                            stars: [2, 3, 4] },
  { id: 25, title: 'Halfway There',    objectives: [{ type: 'formWords',  target: 25, desc: 'Form 25 valid words' }],                                  stars: [20, 25, 30] },
  { id: 26, title: 'Prism Storm',      objectives: [{ type: 'usePrism',   target:  6, desc: 'Use 6 Prism tiles' }],                                    stars: [3, 5, 6] },
  { id: 27, title: 'Word Power',       objectives: [{ type: 'wordScore',  target: 5000, desc: 'Score 5,000+ on a single word' }],                      stars: [2000, 5000, 10000] },
  { id: 28, title: 'Long Game',        objectives: [{ type: 'wordLength', target:  9, desc: 'Form a 9-letter word' }],                                 stars: [1, 2, 3] },
  { id: 29, title: 'Fire Gem',         objectives: [{ type: 'emberGem',   target:  2, desc: 'Use both Ember and a Gem in a word, twice' }],            stars: [1, 2, 3] },
  { id: 30, title: 'Mega Score',       objectives: [{ type: 'score',      target: 25000, desc: 'Score 25,000 points' }],                               stars: [25000, 40000, 60000] },

  { id: 31, title: 'Gem Kingdom',      objectives: [{ type: 'useGem',     target: 10, desc: 'Use 10 gem tiles' }],                                     stars: [6, 10, 15] },
  { id: 32, title: 'Wildfire',         objectives: [{ type: 'useEmber',   target:  8, desc: 'Use 8 Ember tiles' }],                                    stars: [4, 6, 8] },
  { id: 33, title: 'Rune Army',        objectives: [{ type: 'useRune',    target:  5, desc: 'Use 5 Rune wildcards' }],                                 stars: [2, 4, 5] },
  { id: 34, title: 'Digraph Blitz',    objectives: [{ type: 'useDigraph', target:  8, desc: 'Use 8 Digraph tiles' }],                                  stars: [4, 6, 8] },
  { id: 35, title: 'Marathon',         objectives: [{ type: 'formWords',  target: 30, desc: 'Form 30 valid words' }],                                  stars: [25, 30, 35] },
  { id: 36, title: 'Grand Combo',      objectives: [{ type: 'wordScore',  target: 10000, desc: 'Score 10,000+ on a single word' }],                    stars: [5000, 10000, 20000] },
  { id: 37, title: 'Gem Grandeur',     objectives: [{ type: 'uniqueGems', target:  5, desc: 'Use 5 different gem types' }],                            stars: [3, 5, 7] },
  { id: 38, title: 'Decade',           objectives: [{ type: 'wordLength', target: 10, desc: 'Form a 10-letter word' }],                                stars: [1, 2, 3] },
  { id: 39, title: 'Dual Power',       objectives: [{ type: 'gemInWord',  target:  3, desc: 'Use 3 gems in a single word' }],                          stars: [1, 2, 3] },
  { id: 40, title: 'Score Legend',     objectives: [{ type: 'score',      target: 50000, desc: 'Score 50,000 points' }],                               stars: [50000, 75000, 100000] },

  { id: 41, title: 'Blaze of Glory',   objectives: [{ type: 'useEmber',   target: 10, desc: 'Use 10 Ember tiles' }],                                   stars: [5, 8, 10] },
  { id: 42, title: 'Prism Legend',     objectives: [{ type: 'usePrism',   target:  8, desc: 'Use 8 Prism tiles' }],                                    stars: [4, 6, 8] },
  { id: 43, title: 'Ultra Combo',      objectives: [{ type: 'wordScore',  target: 25000, desc: 'Score 25,000+ on a single word' }],                    stars: [10000, 25000, 50000] },
  { id: 44, title: 'Gem Galaxy',       objectives: [{ type: 'uniqueGems', target:  8, desc: 'Use 8 different gem types in one game' }],                stars: [4, 6, 8] },
  { id: 45, title: 'Word God',         objectives: [{ type: 'formWords',  target: 40, desc: 'Form 40 valid words' }],                                  stars: [30, 40, 50] },
  { id: 46, title: 'Rune God',         objectives: [{ type: 'useRune',    target:  8, desc: 'Use 8 Rune wildcards' }],                                 stars: [4, 6, 8] },
  { id: 47, title: 'Score Titan',      objectives: [{ type: 'score',      target: 100000, desc: 'Score 100,000 points' }],                             stars: [100000, 150000, 200000] },
  { id: 48, title: 'Full Spectrum',    objectives: [{ type: 'uniqueGems', target: 10, desc: 'Use 10 different gem types' }],                           stars: [6, 8, 10] },
  { id: 49, title: 'Hexacore Elite',   objectives: [{ type: 'wordScore',  target: 50000, desc: 'Score 50,000+ on a single word' }],                    stars: [25000, 50000, 100000] },
  { id: 50, title: 'Hexacore Master',  objectives: [{ type: 'score',      target: 250000, desc: 'Score 250,000 points — the ultimate challenge!' }],   stars: [250000, 375000, 500000] },
  { id: 51, title: 'Speed Demon',      objectives: [{ type: 'formWords',  target: 10, desc: 'Form 10 valid words' }, { type: 'timeLimit', target: 90, desc: 'Complete in under 90 seconds' }], stars: [10, 15, 20] },
  { id: 52, title: 'Quality Over Quantity', objectives: [{ type: 'avgWordLength', target: 6, desc: 'Average word length ≥ 6 letters' }],                stars: [6, 7, 8] },
  { id: 53, title: 'Ember Aversion',   objectives: [{ type: 'noEmberUse', target: 15, desc: 'Form 15 words without Ember tiles' }],                    stars: [10, 15, 20] },
  { id: 54, title: 'Hot Streak',       objectives: [{ type: 'wordStreak', target: 5, desc: 'Submit 5 words in a row (each 6+ letters)' }],             stars: [3, 5, 7] },
  { id: 55, title: 'Portal Master',    objectives: [{ type: 'portalChain', target: 4, desc: 'Use portal tiles in 4 consecutive words' }],               stars: [2, 4, 5] },
];

/* ── Persistence ─────────────────────────────────────────────────── */

export function getCampaignProgress() {
  try {
    const json = localStorage.getItem(HX_CAMPAIGN_KEY);
    if (!json) return { levels: {} };
    return JSON.parse(json);
  } catch (_) {
    return { levels: {} };
  }
}

function saveCampaignProgress(data) {
  try { localStorage.setItem(HX_CAMPAIGN_KEY, JSON.stringify(data)); } catch (_) {}
}

/** Record stars earned for a level (1–3). */
export function recordLevelStars(levelId, stars) {
  const data  = getCampaignProgress();
  const prev  = data.levels[levelId]?.stars ?? 0;
  data.levels[levelId] = { stars: Math.max(prev, stars), completed: true };
  saveCampaignProgress(data);
}

/* ── Level select modal helpers ─────────────────────────────────── */

/** Return a human-readable label for a star threshold value. */
function formatStarValue(value, objType) {
  if (objType === 'score' || objType === 'wordScore')                      return value.toLocaleString() + ' pts';
  if (objType === 'timeLimit')                                             return '≤ ' + value + 's';
  if (objType === 'avgWordLength')                                         return 'avg ≥ ' + value + ' letters';
  if (objType === 'wordStreak' || objType === 'consecutiveScore')          return value + ' in a row';
  if (objType === 'portalChain')                                           return value + ' portal words';
  if (objType === 'noEmberUse' || objType === 'noWildcards')               return value + ' clean words';
  if (objType === 'multiGemWord' || objType === 'allSpecialWord')          return value + (value === 1 ? ' word' : ' words');
  if (objType === 'emberGem' || objType === 'gemInWord')                   return value + (value === 1 ? ' word' : ' words');
  if (objType === 'formWords' || objType === 'wordLength')                 return value + (value === 1 ? ' word' : ' words');
  if (objType === 'useEmber' || objType === 'usePrism' || objType === 'useRune' ||
      objType === 'useDigraph' || objType === 'useGem')                    return value + (value === 1 ? ' tile' : ' tiles');
  if (objType === 'uniqueGems')                                            return value + ' gem types';
  return String(value);
}

/**
 * Slide the grid out of view and show a detail panel for one level.
 * The player can BACK to the grid or START the level.
 * @param {boolean} unlocked - Whether this level is available to play.
 */
function showLevelPreview(box, gridEl, level, info, onLevelStart, modal, unlocked) {
  gridEl.style.display = 'none';

  const stars = info?.stars ?? 0;

  const mainObj = level.objectives[0];

  function buildObjectivesHtml() {
    const liveProgress = _activeLevelId === level.id ? _levelProgress : null;
    return level.objectives.map(obj => {
      if (liveProgress !== null) {
        const current = liveProgress[obj.type] ?? 0;
        const pct     = Math.min(100, Math.round((current / obj.target) * 100));
        const done    = obj.type === 'timeLimit' ? current <= obj.target : current >= obj.target;
        const label   = `${obj.desc} (${formatStarValue(current, obj.type)} / ${formatStarValue(obj.target, obj.type)})`;
        return `<li class="hx-preview-obj${done ? ' hx-preview-obj-done' : ''}">
          ${label}
          <div class="hx-preview-obj-bar"><div class="hx-preview-obj-fill" style="width:${pct}%"></div></div>
        </li>`;
      }
      return `<li class="hx-preview-obj">${obj.desc}</li>`;
    }).join('');
  }

  function buildStarRows() {
    const liveProgress = _activeLevelId === level.id ? _levelProgress : null;
    return level.stars.map((t, i) => {
      const icons = [1, 2, 3].map(s =>
        `<span class="hx-star${s <= i + 1 ? ' hx-star-filled' : ''}">★</span>`
      ).join('');
      let progressLabel = '';
      if (liveProgress !== null) {
        const current = liveProgress[mainObj.type] ?? 0;
        const done    = mainObj.type === 'timeLimit' ? current <= t : current >= t;
        progressLabel = done ? ' ✓' : '';
      }
      return `<div class="hx-preview-star-row">${icons}<span class="hx-preview-star-label">${formatStarValue(t, mainObj.type)}${progressLabel}</span></div>`;
    }).join('');
  }

  const bestHtml = info?.completed
    ? `<div class="hx-preview-best">
         <span class="hx-preview-best-label">BEST</span>
         <span class="hx-preview-best-stars">
           ${[1, 2, 3].map(s => `<span class="hx-star${s <= stars ? ' hx-star-filled' : ''}">★</span>`).join('')}
         </span>
       </div>`
    : '';

  const startDisabled = !unlocked ? 'disabled' : '';
  const startClass    = !unlocked ? 'hx-preview-start-disabled' : '';
  const startLabel    = unlocked  ? '▶ START LEVEL' : '🔒 LOCKED';

  const preview = document.createElement('div');
  preview.id = 'hx-campaign-preview';
  preview.innerHTML = `
    <div id="hx-preview-nav">
      <button id="hx-preview-back" type="button" aria-label="Back to level list">← BACK</button>
      <span id="hx-preview-levelnum">LEVEL ${level.id}</span>
    </div>
    <div id="hx-preview-title">${level.title}</div>
    <div class="hx-preview-section-label">OBJECTIVES</div>
    <ul id="hx-preview-objectives">${buildObjectivesHtml()}</ul>
    <div class="hx-preview-section-label">STAR THRESHOLDS</div>
    <div id="hx-preview-stars">${buildStarRows()}</div>
    ${bestHtml}
    <button id="hx-preview-start" type="button" ${startDisabled} class="${startClass}">${startLabel}</button>
  `;

  box.appendChild(preview);

  // Live progress refresh while an active session is running for this level.
  // A MutationObserver ensures the interval is cleared whenever the preview
  // is removed from the DOM (back button, start button, modal close, etc.).
  let liveInterval = null;
  if (_activeLevelId === level.id) {
    liveInterval = setInterval(() => {
      const objEl   = preview.querySelector('#hx-preview-objectives');
      const starsEl = preview.querySelector('#hx-preview-stars');
      if (objEl)   objEl.innerHTML   = buildObjectivesHtml();
      if (starsEl) starsEl.innerHTML = buildStarRows();
    }, 1000);

    const previewObserver = new MutationObserver(() => {
      if (!document.contains(preview)) {
        clearInterval(liveInterval);
        previewObserver.disconnect();
      }
    });
    previewObserver.observe(document.body, { childList: true, subtree: true });
  }

  preview.querySelector('#hx-preview-back').addEventListener('click', () => {
    preview.remove();
    gridEl.style.display = '';
  });

  if (unlocked) {
    preview.querySelector('#hx-preview-start').addEventListener('click', () => {
      modal.remove();
      if (typeof onLevelStart === 'function') onLevelStart(level.id);
    });
  }
}

/* ── Level select modal ──────────────────────────────────────────── */

export function openCampaignModal(onLevelStart) {
  document.getElementById('hx-campaign-modal')?.remove();

  const progress = getCampaignProgress();

  const modal = document.createElement('div');
  modal.id = 'hx-campaign-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'hx-campaign-title');

  const box = document.createElement('div');
  box.id = 'hx-campaign-box';

  const header = document.createElement('div');
  header.id = 'hx-campaign-header';
  const completedCount = Object.keys(progress.levels).length;
  header.innerHTML = `
    <span id="hx-campaign-title">⚔️ CAMPAIGN</span>
    <span id="hx-campaign-progress">${completedCount} / ${CAMPAIGN_LEVELS.length}</span>
    <button id="hx-campaign-close" aria-label="Close campaign">✕</button>
  `;

  const grid = document.createElement('div');
  grid.id = 'hx-campaign-grid';

  // First pass: determine maxUnlocked
  let maxUnlocked = 1;
  CAMPAIGN_LEVELS.forEach(level => {
    const info = progress.levels[level.id];
    if (info?.completed && level.id >= maxUnlocked) maxUnlocked = level.id + 1;
  });

  // Second pass: build cards grouped into chunks of 5
  const CHUNK_SIZE = 5;
  for (let i = 0; i < CAMPAIGN_LEVELS.length; i += CHUNK_SIZE) {
    const chunk = CAMPAIGN_LEVELS.slice(i, i + CHUNK_SIZE);

    const groupEl = document.createElement('div');
    groupEl.className = 'hx-campaign-group';

    const firstId = chunk[0].id;
    const lastId  = chunk[chunk.length - 1].id;
    const labelEl = document.createElement('div');
    labelEl.className = 'hx-campaign-group-label';
    labelEl.textContent = `${firstId} – ${lastId}`;
    groupEl.appendChild(labelEl);

    const cardsEl = document.createElement('div');
    cardsEl.className = 'hx-campaign-group-cards';

    chunk.forEach(level => {
      const info    = progress.levels[level.id];
      const stars   = info?.stars ?? 0;

      const unlocked = level.id <= maxUnlocked;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'hx-campaign-level-card' +
        (info?.completed ? ' hx-campaign-complete' : '') +
        (!unlocked ? ' hx-campaign-locked' : '');
      const starsHtml = [1, 2, 3].map(s =>
        `<span class="hx-star${s <= stars ? ' hx-star-filled' : ''}">★</span>`
      ).join('');

      const checkBadge   = info?.completed ? `<span class="hx-card-check" aria-hidden="true">✓</span>` : '';
      const levelNumHtml = `<div class="hx-campaign-level-num">${level.id}</div>`;
      const ariaLabel = !unlocked
        ? `Level ${level.id} – Locked`
        : info?.completed
          ? `Level ${level.id}: ${level.title} – Completed, ${stars} of 3 stars`
          : `Level ${level.id}: ${level.title}`;
      card.setAttribute('aria-label', ariaLabel);
      const progressBar  = info?.completed
        ? `<div class="hx-card-progress-bar" aria-label="${stars} of 3 stars">
             <div class="hx-card-progress-fill" style="width:${Math.round((stars / 3) * 100)}%"></div>
           </div>`
        : '';

      card.innerHTML = `
        ${checkBadge}
        ${levelNumHtml}
        <div class="hx-campaign-level-title">${level.title}</div>
        <div class="hx-campaign-stars">${starsHtml}</div>
        ${progressBar}
      `;

      card.addEventListener('click', () => {
        showLevelPreview(box, grid, level, info, onLevelStart, modal, unlocked);
      });

      cardsEl.appendChild(card);
    });

    groupEl.appendChild(cardsEl);
    grid.appendChild(groupEl);
  }

  box.appendChild(header);
  box.appendChild(grid);
  modal.appendChild(box);
  document.body.appendChild(modal);

  document.getElementById('hx-campaign-close')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

/* ── Active campaign session tracker ────────────────────────────── */

let _activeLevelId     = null;
let _levelProgress     = {};
let _onCompleteCallback = null;
// Session-only trackers for objectives that need timers, averages, or streak state.
let _levelSession      = {};

const HX_WORD_STREAK_MIN_LENGTH       = 6;
const HX_CONSECUTIVE_SCORE_MIN_POINTS = 500;
const HX_MULTI_GEM_WORD_MIN_GEMS      = 4;

function isGemTile(tile) {
  return !!(tile?.tileType && tile.tileType.startsWith('gem'));
}

function isSpecialTile(tile) {
  return !!tile?.tileType && tile.tileType !== 'normal';
}

function didUsePortalTile(tiles, state) {
  if (!state?.portalOpen || !state.portalEntry || !state.portalExit) return false;

  const entry = `${state.portalEntry.q},${state.portalEntry.r}`;
  const exit  = `${state.portalExit.q},${state.portalExit.r}`;
  return tiles.some(tile => {
    const key = `${tile.q},${tile.r}`;
    return key === entry || key === exit;
  });
}

function isObjectiveMet(obj) {
  if (obj.type === 'timeLimit') {
    return (_levelProgress[obj.type] ?? 0) <= obj.target;
  }

  return (_levelProgress[obj.type] ?? 0) >= obj.target;
}

/** Return the current live progress object for the active campaign level. */
export function getCampaignLevelProgress() {
  return { levelId: _activeLevelId, progress: { ..._levelProgress } };
}

export function startCampaignLevel(levelId, onComplete) {
  const level = CAMPAIGN_LEVELS.find(l => l.id === levelId);
  if (!level) return;

  _activeLevelId      = levelId;
  _onCompleteCallback = onComplete;

  // Reset all objective trackers
  _levelProgress = {};
  _levelSession = {
    startedAt: Date.now(),
    totalWordLength: 0,
    wordsTracked: 0,
    gemTypes: new Set(),
    currentStreaks: {},
  };
  level.objectives.forEach(obj => { _levelProgress[obj.type] = 0; });
}

/**
 * Called after each word submission while a campaign level is active.
 * @param {string} word
 * @param {Array}  tiles
 * @param {number} wordScore
 * @param {Object} state - hxState snapshot
 */
export function updateCampaignProgress(word, tiles, wordScore, state) {
  if (_activeLevelId === null) return;

  const level = CAMPAIGN_LEVELS.find(l => l.id === _activeLevelId);
  if (!level) return;

  const startedAt      = _levelSession.startedAt;
  const elapsedSeconds = Number.isFinite(startedAt)
    ? ((Date.now() - startedAt) / 1000)
    : Number.POSITIVE_INFINITY;
  const emberCount     = tiles.filter(t => t.tileType === 'ember').length;
  const prismCount     = tiles.filter(t => t.tileType === 'prism').length;
  const runeCount      = tiles.filter(t => t.tileType === 'rune').length;
  const digraphCount   = tiles.filter(t => t.tileType === 'digraph').length;
  const gemTiles       = tiles.filter(isGemTile);
  const gemCount       = gemTiles.length;
  const hasEmber       = emberCount > 0;
  const hasRune        = runeCount > 0;
  const portalUsed     = didUsePortalTile(tiles, state);
  const allSpecialWord = tiles.length > 0 && tiles.every(isSpecialTile);

  _levelSession.totalWordLength += word.length;
  _levelSession.wordsTracked++;
  gemTiles.forEach(tile => _levelSession.gemTypes.add(tile.tileType));

  level.objectives.forEach(obj => {
    switch (obj.type) {
      case 'formWords':  _levelProgress[obj.type] = (_levelProgress[obj.type] ?? 0) + 1; break;
      case 'score':      _levelProgress[obj.type] = Math.max(_levelProgress[obj.type] ?? 0, state.score); break;
      case 'wordScore':  _levelProgress[obj.type] = Math.max(_levelProgress[obj.type] ?? 0, wordScore); break;
      case 'wordLength': if (word.length >= obj.target) _levelProgress[obj.type] = obj.target; break;
      case 'timeLimit':
        _levelProgress[obj.type] = elapsedSeconds;
        break;
      case 'avgWordLength':
        _levelProgress[obj.type] = _levelSession.wordsTracked > 0
          ? (_levelSession.totalWordLength / _levelSession.wordsTracked)
          : 0;
        break;
      case 'useEmber':   _levelProgress[obj.type] = (_levelProgress[obj.type] ?? 0) + emberCount; break;
      case 'usePrism':   _levelProgress[obj.type] = (_levelProgress[obj.type] ?? 0) + prismCount; break;
      case 'useRune':    _levelProgress[obj.type] = (_levelProgress[obj.type] ?? 0) + runeCount; break;
      case 'useDigraph': _levelProgress[obj.type] = (_levelProgress[obj.type] ?? 0) + digraphCount; break;
      case 'useGem': {
        _levelProgress[obj.type] = (_levelProgress[obj.type] ?? 0) + gemCount;
        break;
      }
      case 'gemInWord': {
        if (gemCount >= obj.target) _levelProgress[obj.type] = (_levelProgress[obj.type] ?? 0) + 1;
        break;
      }
      case 'uniqueGems': {
        _levelProgress[obj.type] = _levelSession.gemTypes.size;
        break;
      }
      case 'emberGem': {
        if (hasEmber && gemCount > 0) _levelProgress[obj.type] = (_levelProgress[obj.type] ?? 0) + 1;
        break;
      }
      case 'noEmberUse':
        if (!hasEmber) _levelProgress[obj.type] = (_levelProgress[obj.type] ?? 0) + 1;
        break;
      case 'wordStreak': {
        const streak = word.length >= HX_WORD_STREAK_MIN_LENGTH
          ? ((_levelSession.currentStreaks[obj.type] ?? 0) + 1)
          : 0;
        _levelSession.currentStreaks[obj.type] = streak;
        _levelProgress[obj.type] = Math.max(_levelProgress[obj.type] ?? 0, streak);
        break;
      }
      case 'consecutiveScore': {
        const streak = wordScore >= HX_CONSECUTIVE_SCORE_MIN_POINTS
          ? ((_levelSession.currentStreaks[obj.type] ?? 0) + 1)
          : 0;
        _levelSession.currentStreaks[obj.type] = streak;
        _levelProgress[obj.type] = Math.max(_levelProgress[obj.type] ?? 0, streak);
        break;
      }
      case 'portalChain': {
        const streak = portalUsed
          ? ((_levelSession.currentStreaks[obj.type] ?? 0) + 1)
          : 0;
        _levelSession.currentStreaks[obj.type] = streak;
        _levelProgress[obj.type] = Math.max(_levelProgress[obj.type] ?? 0, streak);
        break;
      }
      case 'noWildcards':
        if (!hasRune) _levelProgress[obj.type] = (_levelProgress[obj.type] ?? 0) + 1;
        break;
      case 'multiGemWord':
        if (gemCount >= HX_MULTI_GEM_WORD_MIN_GEMS) _levelProgress[obj.type] = (_levelProgress[obj.type] ?? 0) + 1;
        break;
      case 'allSpecialWord':
        if (allSpecialWord) _levelProgress[obj.type] = (_levelProgress[obj.type] ?? 0) + 1;
        break;
    }
  });

  // Check if all objectives are met
  const allMet = level.objectives.every(isObjectiveMet);
  if (allMet) {
    completeCampaignLevel(level, state);
  }
}

function completeCampaignLevel(level, state) {
  // Calculate stars based on the first (primary) objective's final value.
  // For multi-objective levels, star thresholds are always keyed to the primary
  // objective since they use the same metric (e.g. total score, word count).
  const mainObj = level.objectives[0];
  const val     = _levelProgress[mainObj.type] ?? 0;
  const thresholds = mainObj.type === 'timeLimit'
    ? [...level.stars].sort((a, b) => b - a)
    : level.stars;
  let starsEarned = 0;
  thresholds.forEach(t => {
    if (mainObj.type === 'timeLimit') {
      if (val <= t) starsEarned++;
    } else if (val >= t) {
      starsEarned++;
    }
  });
  starsEarned = Math.max(1, starsEarned);

  recordLevelStars(level.id, starsEarned);

  // Show overlay
  showLevelCompleteOverlay(level, starsEarned);

  const cb = _onCompleteCallback;
  _activeLevelId      = null;
  _onCompleteCallback = null;
  _levelSession       = {};

  if (typeof cb === 'function') cb({ levelId: level.id, stars: starsEarned });
}

function showLevelCompleteOverlay(level, stars) {
  document.getElementById('hx-campaign-complete-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'hx-campaign-complete-overlay';

  const starsHtml = [1, 2, 3].map(s =>
    `<span class="hx-levelcomplete-star${s <= stars ? ' filled' : ''}">★</span>`
  ).join('');

  overlay.innerHTML = `
    <div id="hx-levelcomplete-box">
      <div class="hx-levelcomplete-title">⚔️ LEVEL COMPLETE!</div>
      <div class="hx-levelcomplete-name">${level.title}</div>
      <div class="hx-levelcomplete-stars">${starsHtml}</div>
      <div class="hx-levelcomplete-stars-label">${stars} / 3 STARS</div>
      <button id="hx-levelcomplete-next" type="button">NEXT LEVEL</button>
      <button id="hx-levelcomplete-menu" type="button">CAMPAIGN MAP</button>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('hx-levelcomplete-next')?.addEventListener('click', () => {
    overlay.remove();
    // startHexacore will handle what comes next via window hooks
    const nextId = level.id + 1;
    if (nextId <= CAMPAIGN_LEVELS.length) {
      if (typeof window._hxStartCampaignLevel === 'function') {
        window._hxStartCampaignLevel(nextId);
      }
    }
  });

  document.getElementById('hx-levelcomplete-menu')?.addEventListener('click', () => {
    overlay.remove();
    if (typeof window._hxOpenCampaignModal === 'function') window._hxOpenCampaignModal();
  });
}
