// hexacoreCampaign.js — Campaign mode with 50 levels for Hexacore

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

  let maxUnlocked = 1;
  CAMPAIGN_LEVELS.forEach(level => {
    const info    = progress.levels[level.id];
    const stars   = info?.stars ?? 0;
    if (info?.completed && level.id >= maxUnlocked) maxUnlocked = level.id + 1;

    const unlocked = level.id <= maxUnlocked;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'hx-campaign-level-card' +
      (info?.completed ? ' hx-campaign-complete' : '') +
      (!unlocked ? ' hx-campaign-locked' : '');
    card.disabled = !unlocked;

    const starsHtml = [1, 2, 3].map(s =>
      `<span class="hx-star${s <= stars ? ' hx-star-filled' : ''}">★</span>`
    ).join('');

    card.innerHTML = `
      <div class="hx-campaign-level-num">${level.id}</div>
      <div class="hx-campaign-level-title">${level.title}</div>
      <div class="hx-campaign-stars">${starsHtml}</div>
    `;

    if (unlocked) {
      card.addEventListener('click', () => {
        modal.remove();
        if (typeof onLevelStart === 'function') onLevelStart(level.id);
      });
    }

    grid.appendChild(card);
  });

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

export function startCampaignLevel(levelId, onComplete) {
  const level = CAMPAIGN_LEVELS.find(l => l.id === levelId);
  if (!level) return;

  _activeLevelId      = levelId;
  _onCompleteCallback = onComplete;

  // Reset all objective trackers
  _levelProgress = {};
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

  level.objectives.forEach(obj => {
    switch (obj.type) {
      case 'formWords':  _levelProgress[obj.type] = (_levelProgress[obj.type] ?? 0) + 1; break;
      case 'score':      _levelProgress[obj.type] = Math.max(_levelProgress[obj.type] ?? 0, state.score); break;
      case 'wordScore':  _levelProgress[obj.type] = Math.max(_levelProgress[obj.type] ?? 0, wordScore); break;
      case 'wordLength': if (word.length >= obj.target) _levelProgress[obj.type] = obj.target; break;
      case 'useEmber':   _levelProgress[obj.type] = (_levelProgress[obj.type] ?? 0) + tiles.filter(t => t.tileType === 'ember').length; break;
      case 'usePrism':   _levelProgress[obj.type] = (_levelProgress[obj.type] ?? 0) + tiles.filter(t => t.tileType === 'prism').length; break;
      case 'useRune':    _levelProgress[obj.type] = (_levelProgress[obj.type] ?? 0) + tiles.filter(t => t.tileType === 'rune').length; break;
      case 'useDigraph': _levelProgress[obj.type] = (_levelProgress[obj.type] ?? 0) + tiles.filter(t => t.tileType === 'digraph').length; break;
      case 'useGem': {
        const gemCount = tiles.filter(t => t.tileType && t.tileType.startsWith('gem')).length;
        _levelProgress[obj.type] = (_levelProgress[obj.type] ?? 0) + gemCount;
        break;
      }
      case 'gemInWord': {
        const gemCount = tiles.filter(t => t.tileType && t.tileType.startsWith('gem')).length;
        if (gemCount >= obj.target) _levelProgress[obj.type] = (_levelProgress[obj.type] ?? 0) + 1;
        break;
      }
      case 'uniqueGems': {
        const types = new Set(tiles.filter(t => t.tileType && t.tileType.startsWith('gem')).map(t => t.tileType));
        _levelProgress[obj.type] = Math.max(_levelProgress[obj.type] ?? 0, types.size);
        break;
      }
      case 'emberGem': {
        const hasEmber = tiles.some(t => t.tileType === 'ember');
        const hasGem   = tiles.some(t => t.tileType && t.tileType.startsWith('gem'));
        if (hasEmber && hasGem) _levelProgress[obj.type] = (_levelProgress[obj.type] ?? 0) + 1;
        break;
      }
    }
  });

  // Check if all objectives are met
  const allMet = level.objectives.every(obj => (_levelProgress[obj.type] ?? 0) >= obj.target);
  if (allMet) {
    completeCampaignLevel(level, state);
  }
}

function completeCampaignLevel(level, state) {
  // Calculate stars
  const mainObj = level.objectives[0];
  const val     = _levelProgress[mainObj.type] ?? 0;
  const thresholds = level.stars;
  let starsEarned = 0;
  thresholds.forEach(t => { if (val >= t) starsEarned++; });
  starsEarned = Math.max(1, starsEarned);

  recordLevelStars(level.id, starsEarned);

  // Show overlay
  showLevelCompleteOverlay(level, starsEarned);

  const cb = _onCompleteCallback;
  _activeLevelId      = null;
  _onCompleteCallback = null;

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
