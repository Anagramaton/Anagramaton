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
  { id: 'q_10words',   desc: 'SUBMIT 10 WORDS IN ONE SESSION',        reward: 150, target: 10,    trackKey: 'totalWords' },
  { id: 'q_9letter',   desc: 'FORM A WORD OF 9 OR MORE LETTERS',      reward: 300, target: 1,     trackKey: 'ninePlusWords' },
  { id: 'q_8letter',   desc: 'FORM AN 8+ LETTER WORD',                reward: 200, target: 1,     trackKey: 'eightPlusWords' },
  { id: 'q_6letter3',  desc: 'FORM 3 WORDS OF 6 OR MORE LETTERS',     reward: 150, target: 3,     trackKey: 'sixPlusWords' },
  { id: 'q_prism3',    desc: 'USE 3 PRISM TILES IN WORDS',            reward: 200, target: 3,     trackKey: 'prismUsed' },
  { id: 'q_5gems',     desc: 'COLLECT 5 GEMS IN ONE SESSION',         reward: 150, target: 5,     trackKey: 'gemsCollected' },
  { id: 'q_portal3',   desc: 'USE THE PORTAL IN 3 WORDS',             reward: 150, target: 3,     trackKey: 'portalUses' },
  { id: 'q_score10k',  desc: 'SCORE 10,000+ POINTS IN ONE SESSION',   reward: 200, target: 10000, trackKey: 'sessionScore' },
  { id: 'q_ember3',    desc: 'USE 3 EMBER TILES IN WORDS',            reward: 200, target: 3,     trackKey: 'emberUsed' },
  { id: 'q_rune2',     desc: 'USE 2 RUNE WILDCARD TILES IN WORDS',    reward: 250, target: 2,     trackKey: 'runeUsed' },
  { id: 'q_digraph5',  desc: 'USE 5 DIGRAPH TILES IN WORDS',          reward: 150, target: 5,     trackKey: 'digraphUsed' },
  { id: 'q_3gems1word',desc: 'USE 3 GEMS IN A SINGLE WORD',           reward: 300, target: 1,     trackKey: 'tripleGemWord' },
  { id: 'q_levelup',   desc: 'REACH LEVEL 3 IN ONE SESSION',          reward: 200, target: 3,     trackKey: 'maxLevel' },
  { id: 'q_wordcombo', desc: 'SCORE 1,000+ POINTS ON A SINGLE WORD',  reward: 200, target: 1000,  trackKey: 'bestWordScore' },
  { id: 'q_selenite1', desc: 'COLLECT A SELENITE POWER-UP',           reward: 150, target: 1,     trackKey: 'seleniteCollected' },
  { id: 'q_claim5ach', desc: 'CLAIM 5 ACHIEVEMENTS',                  reward: 350, target: 5,     trackKey: 'achievementsClaimed' },
];

/* ── Fixed weekly quest — login streak ──────────────────────────── */

const WEEKLY_LOGIN_QUEST = {
  id:       'wq_login7',
  desc:     'LOG IN EACH DAY FOR 7 DAYS THIS WEEK',
  reward:   1000,
  target:   7,
  trackKey: 'weeklyLoginDays',
};

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

const HX_WEEKLY_LOGIN_KEY = 'hexacore_weekly_login';

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

function loadWeeklyLoginState() {
  try {
    const json = localStorage.getItem(HX_WEEKLY_LOGIN_KEY);
    return json ? JSON.parse(json) : null;
  } catch (_) { return null; }
}

function saveWeeklyLoginState(state) {
  try { localStorage.setItem(HX_WEEKLY_LOGIN_KEY, JSON.stringify(state)); } catch (_) {}
}

/**
 * Record today's login for the weekly login-streak quest.
 * Keeps a set of unique dates the player opened the game this week.
 */
function recordLoginDay() {
  const week  = getWeekString();
  const today = getTodayString();
  let state   = loadWeeklyLoginState();

  if (!state || state.week !== week) {
    state = { week, days: [] };
  }
  if (!state.days.includes(today)) {
    state.days.push(today);
    saveWeeklyLoginState(state);
  }
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
  const week  = getWeekString();
  let state   = loadWeeklyState();

  if (!state || state.week !== week) {
    state = {
      week,
      quest: { ...WEEKLY_LOGIN_QUEST, progress: 0, completed: false, claimed: false },
    };
    saveWeeklyState(state);
  } else if (state.quest.id !== WEEKLY_LOGIN_QUEST.id) {
    // Migrate from an old non-login quest — preserve any login-day progress
    // already recorded this week rather than wiping it.
    const loginState = loadWeeklyLoginState();
    const existingDays = (loginState && loginState.week === week) ? loginState.days.length : 0;
    state.quest = {
      ...WEEKLY_LOGIN_QUEST,
      progress:  Math.min(existingDays, WEEKLY_LOGIN_QUEST.target),
      completed: existingDays >= WEEKLY_LOGIN_QUEST.target,
      claimed:   false,
    };
    saveWeeklyState(state);
  }

  // Sync live login-day count into quest progress
  const loginState = loadWeeklyLoginState();
  if (loginState && loginState.week === week) {
    const days = loginState.days.length;
    if (!state.quest.completed) {
      state.quest.progress = days;
      if (days >= state.quest.target) {
        state.quest.completed = true;
        state.quest.progress  = state.quest.target;
      }
      saveWeeklyState(state);
    }
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
  if (eventType !== 'wordSubmitted' && eventType !== 'achievementClaimed') return;

  const { word, tiles, score, gemsUsed, portalUsed, gameLevel, amethystCollected, seleniteCollected } = data;
  const wordStr = typeof word === 'string' ? word : '';

  const updater = (quests) => {
    let anyCompleted = false;
    quests.forEach(q => {
      if (q.completed) return;

      const prev = q.progress;
      switch (q.trackKey) {
        case 'totalWords':        q.progress += 1; break;
        case 'sixPlusWords':      if (wordStr.length >= 6) q.progress += 1; break;
        case 'sevenPlusWords':    if (wordStr.length >= 7) q.progress += 1; break;
        case 'eightPlusWords':    if (wordStr.length >= 8) q.progress += 1; break;
        case 'ninePlusWords':     if (wordStr.length >= 9) q.progress += 1; break;
        case 'tenPlusWords':      if (wordStr.length >= 10) q.progress += 1; break;
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
        case 'achievementsClaimed':
          if (eventType === 'achievementClaimed') q.progress = Math.max(q.progress, data?.count || 0);
          break;
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
  // Weekly quest is login-based — updated only via recordLoginDay(), not word submission.
}

export function updateAchievementQuestProgress(count) {
  updateQuestProgress('achievementClaimed', { count });
}

export function claimQuestReward(questId) {
  const today      = getTodayString();
  const dailyState = loadDailyState();

  if (dailyState && dailyState.date === today) {
    const q = dailyState.quests.find(q => q.id === questId);
    if (q && q.completed && !q.claimed) {
      q.claimed = true;
      saveDailyState(dailyState);
      if (q.reward > 0 && typeof window._hxAddXP === 'function') window._hxAddXP(q.reward);
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
      if (q.reward > 0 && typeof window._hxAddXP === 'function') window._hxAddXP(q.reward);
      return q.reward;
    }
  }

  return 0;
}

/** Called when game starts — initialises quests and records today's login. */
export function initQuests() {
  getDailyQuests();
  recordLoginDay();
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

  const weekly = getWeeklyQuest();

  body.innerHTML = '';

  // Weekly section
  const weeklySection = document.createElement('div');
  weeklySection.className = 'hx-quest-section';
  weeklySection.innerHTML = '<div class="hx-quest-section-title">🗓 WEEKLY QUEST</div>';
  weeklySection.appendChild(buildQuestItem(weekly, true));
  body.appendChild(weeklySection);

  // Challenges section (rendered via hexacore.js callback to avoid circular imports)
  if (typeof window._hxRenderChallengesInto === 'function') {
    const challengesHeader = document.createElement('div');
    challengesHeader.className = 'hx-quest-section-title hx-quest-challenges-header';
    challengesHeader.innerHTML = '📋 CHALLENGES';
    body.appendChild(challengesHeader);

    const challengesBody = document.createElement('div');
    challengesBody.id = 'hx-quests-challenges-body';
    body.appendChild(challengesBody);

    window._hxRenderChallengesInto(challengesBody);
  }
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
      claimQuestReward(q.id);
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
