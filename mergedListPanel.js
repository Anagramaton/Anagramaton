import { gameState } from './gameState.js';
import { recomputeAllWordScores } from './scoreLogic.js';

// mergedListPanel.js
// Usage: import { initMergedListPanel } from './mergedListPanel.js'; then call initMergedListPanel() once.

export function initMergedListPanel() {
  // Create merged section (once) inside the left panel
  function ensureWrap() {
    const panel = document.querySelector('#left-panel .panel-content');
    if (!panel) return null;

    let wrap = document.getElementById('merged-words-wrap');
    if (wrap) return wrap;

    wrap = document.createElement('section');
    wrap.id = 'merged-words-wrap';
    wrap.style.marginTop = '12px';
wrap.innerHTML = `
  <details id="merged-words-details" open>
    <summary style="cursor:pointer; font-weight:700;">
      All Words (<span id="merged-total">0</span>) • Yours: <span id="merged-yours">0</span>
    </summary>

    <div id="merged-scroll" class="merged__scroll panel-content">
      <ul id="merged-list" class="merged__list"></ul>
    </div>

    <div style="margin-top:8px; font-size:12px; opacity:0.8;">
      <span style="display:inline-block; padding:2px 6px; border-radius:6px; background:#ffd54d; color:#222; font-weight:700; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.15);">YOURS</span>
      <span style="margin-left:8px;">= submitted words</span>
    </div>
  </details>
`;


    panel.appendChild(wrap);

    const listEl = () => wrap.querySelector('#merged-list');
    const collect = (filterFn = () => true) =>
      [...listEl().querySelectorAll('li')].filter(filterFn).map(li => li.dataset.word).join('\n');

    return wrap;
  }

// Build + render the merged list (length desc, then A→Z; highlight player's words)
function buildMergedList(playerWords = [], boardWords = [], scoreMap = {}) {

  const wrap = ensureWrap();
  if (!wrap) return;

  // 1) Normalize to uppercase strings and drop empties
  const up = arr => (arr || [])
    .map(w => String(w || '').trim().toUpperCase())
    .filter(Boolean);

  const yours = up(playerWords);
  const board = up(boardWords);

  // 2) Merge + de-dupe
  const seen = new Set();
  const merged = [];
  for (const w of [...yours, ...board]) {
    if (!w || seen.has(w)) continue;
    seen.add(w);
    merged.push(w);
  }

  // 3) Sort by length (desc), then alphabetically (A→Z)
  merged.sort((a, b) => (b.length - a.length) || a.localeCompare(b));

  // 4) Update counters
  wrap.querySelector('#merged-total').textContent = String(merged.length);
  wrap.querySelector('#merged-yours').textContent = String(yours.length);

  if (scoreMap) {
  // scoreMap is a Map of word -> score (already prepared upstream!)
  const topEntries = Array.from(scoreMap.entries())
    .map(([word, score]) => ({ word, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  gameState.boardTop10 = topEntries;
  gameState.boardTop10Total = topEntries.reduce((sum, x) => sum + x.score, 0);

  console.log("Top 10 (board):", gameState.boardTop10, "Total:", gameState.boardTop10Total);
}
  
  // 5) Render
  const ul = wrap.querySelector('#merged-list');
  ul.innerHTML = ''; // clear

  const yoursSet = new Set(yours);

  for (const w of merged) {
    const li = document.createElement('li');
    li.dataset.word = w;
    li.className = 'merged__item';             // base item style

    const isYours = yoursSet.has(w);
    if (isYours) li.classList.add('is-yours'); // highlight your words

    // Optional score badge: only for your words if scoreMap provided
    const label = (isYours && scoreMap && scoreMap.has(w))
      ? `${w} (+${scoreMap.get(w)})`
      : w;

    li.textContent = label;
    ul.appendChild(li);
  }
}


  // helper: build a score map from window.gameState.words (if present)
  function getScoreMapFromGameState() {
    const gs = window.gameState;
    if (!gs || !Array.isArray(gs.words)) return null;
    return new Map(gs.words.map(o => [String(o.word || '').toUpperCase(), Number(o.score) || 0]));
  }

  // After round ends: hide original list, retitle, and show merged list
  window.addEventListener('round:over', (e) => {
    const d = e.detail || {};

    // Hide original submitted list
    document.getElementById('word-list')?.classList.add('is-hidden');

    // Update header to show we're in review mode
    const h2 = document.querySelector('#left-panel .panel-content h2');
    if (h2) h2.textContent = 'ALL WORDS';

    // Prefer wordsWithScores in detail (if provided), else derive from gameState
    let scoreMap = null;
    if (Array.isArray(d.wordsWithScores)) {
      scoreMap = new Map(
        d.wordsWithScores.map(o => [String(o.word || '').toUpperCase(), Number(o.score) || 0])
      );
    } else {
      scoreMap = getScoreMapFromGameState();
    }

    // Render merged list (player's words highlighted)
    buildMergedList(d.words || [], d.placedWords || [], scoreMap);

    // Notify main.js (and anyone else) that the merged panel is now active
    window.dispatchEvent(new Event('round:merged:show'));
  });

  // On new game: ONLY clear merged list UI (main.js resets everything else)
  window.addEventListener('game:new', () => {
    const wrap = document.getElementById('merged-words-wrap');
    if (wrap) wrap.remove();
  });
}


