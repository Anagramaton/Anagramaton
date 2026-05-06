// hexacoreQuests.js — Daily/Weekly Quest system for Hexacore

const HX_DAILY_QUESTS_KEY = 'hexacore_daily_quests';
const HX_WEEKLY_QUEST_KEY = 'hexacore_weekly_quest';

/* ── Date helpers ───────────────────────────────────────────────── */

export function getTodayString() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

export function getWeekString() {
  const now  = new Date();
  const year = now.getUTCFullYear();
  // ISO week: Monday = day 1
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const dayOfYear = Math.floor((now - jan1) / 86400000) + 1;
  const week = Math.ceil((dayOfYear + jan1.getUTCDay()) / 7);
  return `week-${year}-${String(week).padStart(2, '0')}`;
}

/* ── Quest pool ─────────────────────────────────────────────────── */

const QUEST_POOL = [
  { id: 'q_5words',    desc: 'Submit 5 words in one session',        reward: 100, target: 5,     trackKey: 'totalWords' },
  { id: 'q_10words',   desc: 'Submit 10 words in one session',       reward: 150, target: 10,    trackKey: 'totalWords' },
  { id: 'q_15words',   desc: 'Submit 15 words in one session',       reward: 200, target: 15,    trackKey: 'totalWords' },
  { id: 'q_20words',   desc: 'Submit 20 words in one session',       reward: 250, target: 20,    trackKey: 'totalWords' },
  { id: 'q_prism3',    desc: 'Use 3 Prism tiles in words',           reward: 200, target: 3,     trackKey: 'prismUsed' },
  { id: 'q_prism5',    desc: 'Use 5 Prism tiles in words',           reward: 300, target: 5,     trackKey: 'prismUsed' },
  { id: 'q_9letter',   desc: 'Submit a 9+ letter word',              reward: 300, target: 1,     trackKey: 'ninePlusWords' },
  { id: 'q_8letter',   desc: 'Submit an 8+ letter word',             reward: 200, target: 1,     trackKey: 'eightPlusWords' },
  { id: 'q_10gems',    desc: 'Collect 10 gems in one session',       reward: 250, target: 10,    trackKey: 'gemsCollected' },
  { id: 'q_5gems',     desc: 'Collect 5 gems in one session',        reward: 150, target: 5,     trackKey: 'gemsCollected' },
  { id: 'q_portal3',   desc: 'Use the portal in 3 words',            reward: 150, target: 3,     trackKey: 'portalUses' },
  { id: 'q_portal1',   desc: 'Use the portal in a word',             reward: 100, target: 1,     trackKey: 'portalUses' },
  { id: 'q_6letter5',  desc: 'Form 5 words of 6+ letters',           reward: 200, target: 5,     trackKey: 'sixPlusWords' },
  { id: 'q_6letter3',  desc: 'Form 3 words of 6+ letters',           reward: 150, target: 3,     trackKey: 'sixPlusWords' },
  { id: 'q_score5k',   desc: 'Score 5,000+ points in one session',   reward: 150, target: 5000,  trackKey: 'sessionScore' },
  { id: 'q_score10k',  desc: 'Score 10,000+ points in one session',  reward: 200, target: 10000, trackKey: 'sessionScore' },
  { id: 'q_score25k',  desc: 'Score 25,000+ points in one session',  reward: 300, target: 25000, trackKey: 'sessionScore' },
  { id: 'q_ember3',    desc: 'Use 3 Ember tiles in words',           reward: 200, target: 3,     trackKey: 'emberUsed' },
  { id: 'q_ember5',    desc: 'Use 5 Ember tiles in words',           reward: 300, target: 5,     trackKey: 'emberUsed' },
  { id: 'q_rune2',     desc: 'Use 2 Rune wildcards in words',        reward: 250, target: 2,     trackKey: 'runeUsed' },
  { id: 'q_rune4',     desc: 'Use 4 Rune wildcards in words',        reward: 350, target: 4,     trackKey: 'runeUsed' },
  { id: 'q_digraph5',  desc: 'Use 5 Digraph tiles in words',         reward: 150, target: 5,     trackKey: 'digraphUsed' },
  { id: 'q_digraph10', desc: 'Use 10 Digraph tiles in words',        reward: 250, target: 10,    trackKey: 'digraphUsed' },
  { id: 'q_3gems1word',desc: 'Use 3 gems in a single word',          reward: 300, target: 1,     trackKey: 'tripleGemWord' },
  { id: 'q_7letter3',  desc: 'Form 3 words of 7+ letters',           reward: 250, target: 3,     trackKey: 'sevenPlusWords' },
  { id: 'q_7letter1',  desc: 'Form a word of 7+ letters',            reward: 150, target: 1,     trackKey: 'sevenPlusWords' },
  { id: 'q_emerald3',  desc: 'Use an Emerald gem 3 times',           reward: 150, target: 3,     trackKey: 'emeraldUsed' },
  { id: 'q_levelup',   desc: 'Reach Level 3 in one session',         reward: 200, target: 3,     trackKey: 'maxLevel' },
  { id: 'q_wordcombo', desc: 'Score 1,000+ on a single word',        reward: 200, target: 1000,  trackKey: 'bestWordScore' },
  { id: 'q_wordcombo2',desc: 'Score 5,000+ on a single word',        reward: 350, target: 5000,  trackKey: 'bestWordScore' },
  { id: 'q_amethyst1', desc: 'Collect an Amethyst power-up',         reward: 150, target: 1,     trackKey: 'amethystCollected' },
  { id: 'q_selenite1', desc: 'Collect a Selenite power-up',          reward: 150, target: 1,     trackKey: 'seleniteCollected' },
];

const WEEKLY_QUEST_POOL = [
  { id: 'wq_50words',  desc: 'Submit 50 words across all sessions this week',      reward: 500,  target: 50,    trackKey: 'weeklyTotalWords' },
  { id: 'wq_score50k', desc: 'Score 50,000+ points in a single session this week', reward: 600,  target: 50000, trackKey: 'weeklyBestScore' },
  { id: 'wq_9letter3', desc: 'Submit three 9+ letter words this week',             reward: 700,  target: 3,     trackKey: 'weeklyNinePlusWords' },
  { id: 'wq_gem20',    desc: 'Collect 20 gems this week',                          reward: 500,  target: 20,    trackKey: 'weeklyGemsCollected' },
  { id: 'wq_level5',   desc: 'Reach Level 5 in any session this week',             reward: 800,  target: 5,     trackKey: 'weeklyMaxLevel' },
  { id: 'wq_portal10', desc: 'Use the portal 10 times this week',                  reward: 600,  target: 10,    trackKey: 'weeklyPortalUses' },
  { id: 'wq_10letter', desc: 'Submit a 10+ letter word this week',                 reward: 1000, target: 1,     trackKey: 'weeklyTenPlusWords' },
];

/* ── Deterministic shuffle from a seed ─────────────────────────── */

function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0x100000000;
  };
}

function pickQuests(pool, count, seed) {
  const rng = seededRandom(seed);
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count).map(q => ({ ...q }));
}

function dateSeed(str) {
  let hash = 0;
  for (const char of str) { hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0; }
  return hash;
}

/* ── Persistence helpers ────────────────────────────────────────── */

function loadDailyState() {
  try {
    const json = localStorage.getItem(HX_DAILY_QUESTS_KEY);
    return json ? JSON.parse(json) : null;
  } catch (_) { return null; }
}

function saveDailyState(state) {
  try { localStorage.setItem(HX_DAILY_QUESTS_KEY, JSON.stringify(state)); } catch (_) {}
}

function loadWeeklyState() {
  try {
    const json = localStorage.getItem(HX_WEEKLY_QUEST_KEY);
    return json ? JSON.parse(json) : null;
  } catch (_) { return null; }
}

function saveWeeklyState(state) {
  try { localStorage.setItem(HX_WEEKLY_QUEST_KEY, JSON.stringify(state)); } catch (_) {}
}

/* ── Public API ─────────────────────────────────────────────────── */

export function getDailyQuests() {
  const today = getTodayString();
  let state   = loadDailyState();

  if (!state || state.date !== today) {
    const seed   = dateSeed(today);
    const quests = pickQuests(QUEST_POOL, 3, seed);
    state = {
      date:    today,
      quests:  quests.map(q => ({ ...q, progress: 0, completed: false, claimed: false })),
    };
    saveDailyState(state);
  }

  return state.quests;
}

export function getWeeklyQuest() {
  const week = getWeekString();
  let state  = loadWeeklyState();

  if (!state || state.week !== week) {
    const seed  = dateSeed(week);
    const quest = pickQuests(WEEKLY_QUEST_POOL, 1, seed)[0];
    state = {
      week,
      quest: { ...quest, progress: 0, completed: false, claimed: false },
    };
    saveWeeklyState(state);
  }

  return state.quest;
}

export function getQuestState() {
  return { daily: getDailyQuests(), weekly: getWeeklyQuest() };
}

/**
 * Update quest progress after a word submission.
 * @param {string} eventType - 'wordSubmitted'
 * @param {Object} data - { word, tiles, score, gemsUsed, portalUsed, gameLevel, amethystCollected, seleniteCollected }
 */
export function updateQuestProgress(eventType, data) {
  if (eventType !== 'wordSubmitted') return;

  const { word, tiles, score, gemsUsed, portalUsed, gameLevel, amethystCollected, seleniteCollected } = data;

  const updater = (quests) => {
    let anyCompleted = false;
    quests.forEach(q => {
      if (q.completed) return;

      const prev = q.progress;
      switch (q.trackKey) {
        case 'totalWords':        q.progress += 1; break;
        case 'sixPlusWords':      if (word.length >= 6) q.progress += 1; break;
        case 'sevenPlusWords':    if (word.length >= 7) q.progress += 1; break;
        case 'eightPlusWords':    if (word.length >= 8) q.progress += 1; break;
        case 'ninePlusWords':     if (word.length >= 9) q.progress += 1; break;
        case 'tenPlusWords':      if (word.length >= 10) q.progress += 1; break;
        case 'prismUsed':         q.progress += (tiles || []).filter(t => t.tileType === 'prism').length; break;
        case 'emberUsed':         q.progress += (tiles || []).filter(t => t.tileType === 'ember').length; break;
        case 'runeUsed':          q.progress += (tiles || []).filter(t => t.tileType === 'rune').length; break;
        case 'digraphUsed':       q.progress += (tiles || []).filter(t => t.tileType === 'digraph').length; break;
        case 'gemsCollected':     q.progress += (gemsUsed || 0); break;
        case 'portalUses':        if (portalUsed) q.progress += 1; break;
        case 'tripleGemWord':     if ((gemsUsed || 0) >= 3) q.progress += 1; break;
        case 'sessionScore':      q.progress = Math.max(q.progress, score || 0); break;
        case 'bestWordScore':     q.progress = Math.max(q.progress, score || 0); break;
        case 'maxLevel':          q.progress = Math.max(q.progress, gameLevel || 1); break;
        case 'emeraldUsed':       q.progress += (tiles || []).filter(t => t.tileType === 'gemEmerald').length; break;
        case 'amethystCollected': if (amethystCollected) q.progress += 1; break;
        case 'seleniteCollected': if (seleniteCollected) q.progress += 1; break;
      }

      if (!q.completed && q.progress >= q.target) {
        q.completed = true;
        anyCompleted = true;
        if (typeof showQuestCompleteToast === 'function') showQuestCompleteToast(q.desc);
      }
    });
    return anyCompleted;
  };

  // Update daily
  const today      = getTodayString();
  const dailyState = loadDailyState();
  if (dailyState && dailyState.date === today) {
    const completed = updater(dailyState.quests);
    saveDailyState(dailyState);
    if (completed && document.getElementById('hx-quests-modal')) renderQuestsModal();
  }

  // Update weekly (maps weekly-specific track keys to equivalent daily track keys)
  const weeklyKeyToBasicKeyMap = {
    weeklyTotalWords:    'totalWords',
    weeklyBestScore:     'sessionScore',
    weeklyNinePlusWords: 'ninePlusWords',
    weeklyGemsCollected: 'gemsCollected',
    weeklyMaxLevel:      'maxLevel',
    weeklyPortalUses:    'portalUses',
    weeklyTenPlusWords:  'tenPlusWords',
  };
  const weekState = loadWeeklyState();
  const week      = getWeekString();
  if (weekState && weekState.week === week) {
    const q = weekState.quest;
    if (!q.completed) {
      const mapped = weeklyKeyToBasicKeyMap[q.trackKey];
      // Re-use updater with a synthetic temp trackKey aligned to daily keys
      const tempQ = { ...q, trackKey: mapped || q.trackKey };
      updater([tempQ]);
      q.progress  = tempQ.progress;
      q.completed = tempQ.completed;
      saveWeeklyState(weekState);
    }
  }
}

export function claimQuestReward(questId) {
  const today      = getTodayString();
  const dailyState = loadDailyState();

  if (dailyState && dailyState.date === today) {
    const q = dailyState.quests.find(q => q.id === questId);
    if (q && q.completed && !q.claimed) {
      q.claimed = true;
      saveDailyState(dailyState);
      return q.reward;
    }
  }

  const weekState = loadWeeklyState();
  const week      = getWeekString();
  if (weekState && weekState.week === week) {
    const q = weekState.quest;
    if (q.id === questId && q.completed && !q.claimed) {
      q.claimed = true;
      saveWeeklyState(weekState);
      return q.reward;
    }
  }

  return 0;
}

/** Called when game starts — resets per-session trackers in state. */
export function initQuests() {
  getDailyQuests();
  getWeeklyQuest();
}

/* ── Quest UI ───────────────────────────────────────────────────── */

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderQuestsModal() {
  const body = document.getElementById('hx-quests-body');
  if (!body) return;

  const daily  = getDailyQuests();
  const weekly = getWeeklyQuest();

  body.innerHTML = '';

  // Daily section
  const dailySection = document.createElement('div');
  dailySection.className = 'hx-quest-section';
  dailySection.innerHTML = '<div class="hx-quest-section-title">📅 DAILY QUESTS</div>';
  daily.forEach(q => {
    dailySection.appendChild(buildQuestItem(q));
  });
  body.appendChild(dailySection);

  // Weekly section
  const weeklySection = document.createElement('div');
  weeklySection.className = 'hx-quest-section';
  weeklySection.innerHTML = '<div class="hx-quest-section-title">🗓 WEEKLY QUEST</div>';
  weeklySection.appendChild(buildQuestItem(weekly, true));
  body.appendChild(weeklySection);
}

function buildQuestItem(q, isWeekly = false) {
  const item = document.createElement('div');
  item.className = 'hx-quest-item' + (q.completed ? ' hx-quest-done' : '');

  const pct = Math.min(100, ((q.progress ?? 0) / (q.target ?? 1)) * 100);
  const statusIcon = q.claimed ? '✅' : q.completed ? '🎁' : '⬜';

  item.innerHTML = `
    <div class="hx-quest-row">
      <span class="hx-quest-icon">${statusIcon}</span>
      <span class="hx-quest-desc">${escapeHtml(q.desc)}</span>
      <span class="hx-quest-reward">+${q.reward} XP</span>
    </div>
    <div class="hx-quest-progress-bar">
      <div class="hx-quest-progress-fill" style="width:${pct}%"></div>
    </div>
    <div class="hx-quest-progress-text">${Math.min(q.progress ?? 0, q.target)} / ${q.target}</div>
  `;

  if (q.completed && !q.claimed) {
    const btn = document.createElement('button');
    btn.className = 'hx-quest-claim-btn';
    btn.textContent = 'CLAIM';
    btn.addEventListener('click', () => {
      const xp = claimQuestReward(q.id);
      if (xp > 0 && typeof window._hxAddXP === 'function') window._hxAddXP(xp);
      renderQuestsModal();
    });
    item.appendChild(btn);
  }

  return item;
}

export function openQuestsModal() {
  document.getElementById('hx-quests-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'hx-quests-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'hx-quests-title');

  const box = document.createElement('div');
  box.id = 'hx-quests-box';

  box.innerHTML = `
    <div id="hx-quests-header">
      <span id="hx-quests-title">📋 QUESTS</span>
      <button id="hx-quests-close" aria-label="Close quests">✕</button>
    </div>
    <div id="hx-quests-body"></div>
  `;

  modal.appendChild(box);
  document.body.appendChild(modal);

  renderQuestsModal();

  document.getElementById('hx-quests-close')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

export function showQuestCompleteToast(desc) {
  const toast = document.createElement('div');
  toast.className = 'hx-quest-toast';
  toast.innerHTML = `<span class="hx-quest-toast-icon">✅</span><span class="hx-quest-toast-text">QUEST DONE: ${escapeHtml(desc)}</span>`;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('hx-quest-toast-visible'));
  setTimeout(() => {
    toast.classList.remove('hx-quest-toast-visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    setTimeout(() => toast.remove(), 600);
  }, 3000);
}
