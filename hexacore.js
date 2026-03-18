// hexacore.js — Hexacore endless word game mode for Anagramaton

import {
  GRID_RADIUS,
  HEX_RADIUS,
  letterPoints,
  lengthMultipliers,
  letterFrequencies,
  SVG_NS,
} from './constants.js';
import { isValidWord } from './gameLogic.js';
import { createTile }  from './tileFactory.js';
import {
  submitScore,
  fetchLeaderboard,
  getPlayerName,
  promptPlayerName,
} from './leaderboard.js';
import { Hex, Layout, Point } from './gridLayout.js';
import { OrientationPointy }  from './gridOrientation.js';

/* ── Layout constants ──────────────────────────────────────────── */
const TILE_SPACING = 1.25;
const ROW_HEIGHT   = 1.5 * HEX_RADIUS * TILE_SPACING; // pixel delta per r step

/* ── Letter pool (vowels + common consonants + rare via letterFrequencies) */
const HX_LETTER_POOL = [
  ...Array(9).fill('A'),
  ...Array(12).fill('E'),
  ...Array(9).fill('I'),
  ...Array(8).fill('O'),
  ...Array(4).fill('U'),
  ...Array(6).fill('N'),
  ...Array(4).fill('S'),
  ...Array(6).fill('T'),
  ...Array(6).fill('R'),
  ...Array(4).fill('L'),
  ...Array(4).fill('D'),
  ...Array(2).fill('C'),
  ...Array(2).fill('M'),
  ...Array(2).fill('P'),
  ...letterFrequencies,
];

/* ── Module-level state ────────────────────────────────────────── */
const hxState = {
  score:      0,
  words:      [],
  tiles:      [],
  emberTiles: [],
  prismTiles: [],
  runeTiles:  [],
  gameOver:   false,
  active:     false,
};

let hxSelected       = [];   // tiles in current selection chain
let hxPointerDown    = false;
let hxLayout         = null;
let hxSvg            = null;
let hxWordCount      = 0;
let hxTileMap        = new Map(); // `q,r` → tile object
let hxPointerCleanup = null;
let hxButtonCleanup  = null;

/* ── Pure helpers ──────────────────────────────────────────────── */
function hxKey(q, r) { return `${q},${r}`; }

function makeLayout() {
  return new Layout(
    OrientationPointy,
    new Point(HEX_RADIUS * TILE_SPACING, HEX_RADIUS * TILE_SPACING),
    new Point(500, 500),
  );
}

function getColumnRange(q) {
  return {
    r_min: Math.max(-GRID_RADIUS, -GRID_RADIUS - q),
    r_max: Math.min(GRID_RADIUS,   GRID_RADIUS - q),
  };
}

function randomLetter() {
  return HX_LETTER_POOL[Math.floor(Math.random() * HX_LETTER_POOL.length)];
}

function areNeighbors(a, b) {
  return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.s - b.s)) === 2;
}

function removeFrom(arr, item) {
  const i = arr.indexOf(item);
  if (i !== -1) arr.splice(i, 1);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── Tile type styling ─────────────────────────────────────────── */
function addTypeIcon(tile, glyph, fontSize, fill) {
  const cx = parseFloat(tile.textLetter.getAttribute('x'));
  const cy = parseFloat(tile.textLetter.getAttribute('y'));
  const icon = document.createElementNS(SVG_NS, 'text');
  icon.setAttribute('x', cx - HEX_RADIUS * 0.5);
  icon.setAttribute('y', cy - HEX_RADIUS * 0.45);
  icon.setAttribute('font-size', String(fontSize));
  icon.setAttribute('pointer-events', 'none');
  icon.setAttribute('class', 'hx-type-icon');
  if (fill) icon.setAttribute('fill', fill);
  icon.textContent = glyph;
  tile.element.appendChild(icon);
}

function applyTileType(tile) {
  const poly = tile.element.querySelector('polygon');
  poly.classList.remove('hx-ember', 'hx-prism', 'hx-rune');
  tile.element.querySelector('.hx-type-icon')?.remove();

  if (tile.tileType === 'ember') {
    poly.classList.add('hx-ember');
    addTypeIcon(tile, '🔥', 14, null);
  } else if (tile.tileType === 'prism') {
    poly.classList.add('hx-prism');
    addTypeIcon(tile, '✦', 12, '#ffd700');
  } else if (tile.tileType === 'rune') {
    poly.classList.add('hx-rune');
    tile.textLetter.textContent = '?';
    tile.textPoint.textContent  = '?';
    addTypeIcon(tile, '✦', 12, '#ffffff');
  }
}

/* ── SVG gradient defs ─────────────────────────────────────────── */
function injectSvgDefs(svg) {
  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(SVG_NS, 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }

  function ensureFilter(id) {
    if (defs.querySelector(`#${id}`)) return;
    const filter = document.createElementNS(SVG_NS, 'filter');
    filter.setAttribute('id', id);
    filter.setAttribute('filterUnits', 'objectBoundingBox');
    filter.setAttribute('x', '-30%'); filter.setAttribute('y', '-30%');
    filter.setAttribute('width', '160%'); filter.setAttribute('height', '160%');
    const blur = document.createElementNS(SVG_NS, 'feGaussianBlur');
    blur.setAttribute('in', 'SourceGraphic');
    blur.setAttribute('stdDeviation', '3');
    blur.setAttribute('result', 'blur');
    const merge = document.createElementNS(SVG_NS, 'feMerge');
    const m1 = document.createElementNS(SVG_NS, 'feMergeNode'); m1.setAttribute('in', 'blur');
    const m2 = document.createElementNS(SVG_NS, 'feMergeNode'); m2.setAttribute('in', 'SourceGraphic');
    merge.append(m1, m2);
    filter.append(blur, merge);
    defs.appendChild(filter);
  }

  function ensureLinearGradient(id, c1, c2) {
    if (document.getElementById(id)) return;
    const grad = document.createElementNS(SVG_NS, 'linearGradient');
    grad.setAttribute('id', id);
    grad.setAttribute('x1', '0%'); grad.setAttribute('y1', '0%');
    grad.setAttribute('x2', '100%'); grad.setAttribute('y2', '100%');
    const s1 = document.createElementNS(SVG_NS, 'stop');
    s1.setAttribute('offset', '0%'); s1.setAttribute('stop-color', c1);
    const s2 = document.createElementNS(SVG_NS, 'stop');
    s2.setAttribute('offset', '100%'); s2.setAttribute('stop-color', c2);
    grad.append(s1, s2);
    defs.appendChild(grad);
  }

  ensureFilter('hoverGlow');
  ensureLinearGradient('hx-ember-gradient', '#ff6b00', '#ff2d00');
  ensureLinearGradient('hx-prism-gradient', '#a855f7', '#06b6d4');
}

/* ── Grid construction ─────────────────────────────────────────── */
function buildGrid() {
  const board = document.createElementNS(SVG_NS, 'g');
  board.setAttribute('id', 'board');

  hxSvg.setAttribute('viewBox', '0 0 1000 1000');
  hxSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  for (let q = -GRID_RADIUS; q <= GRID_RADIUS; q++) {
    for (let r = -GRID_RADIUS; r <= GRID_RADIUS; r++) {
      const s = -q - r;
      if (Math.abs(s) > GRID_RADIUS) continue;

      const letter = randomLetter();
      const tile   = createTile({
        hex:        new Hex(q, r),
        layout:     hxLayout,
        key:        hxKey(q, r),
        letter,
        pointValue: letterPoints[letter] || 1,
      });

      tile.tileType   = 'normal';
      tile.s          = s;
      tile._transformY = 0;

      hxState.tiles.push(tile);
      hxTileMap.set(hxKey(q, r), tile);
      board.appendChild(tile.element);
    }
  }
  hxSvg.appendChild(board);
}

function spawnInitialEmbers() {
  const topPool = hxState.tiles.filter(
    t => t.r === -GRID_RADIUS || t.r === -GRID_RADIUS + 1,
  );
  const shuffled = [...topPool].sort(() => Math.random() - 0.5);
  shuffled.slice(0, 2).forEach(tile => {
    tile.tileType = 'ember';
    hxState.emberTiles.push(tile);
    applyTileType(tile);
  });
}

/* ── Score / HUD ───────────────────────────────────────────────── */
function updateScoreDisplay() {
  const el = document.getElementById('score-display');
  if (el) el.textContent = String(hxState.score);
}

function updateHud() {
  const hud = document.getElementById('hx-score-hud');
  if (hud) hud.textContent = `HEXACORE · ${hxState.score} PTS`;
}

function ensureHud() {
  if (document.getElementById('hx-score-hud')) return;
  const hud = document.createElement('div');
  hud.id = 'hx-score-hud';
  hud.textContent = 'HEXACORE · 0 PTS';
  document.body.appendChild(hud);
}

function removeHud() {
  document.getElementById('hx-score-hud')?.remove();
}

/* ── Word display / selection ──────────────────────────────────── */
function updateWordDisplay() {
  const el = document.getElementById('current-word');
  if (!el) return;
  el.textContent = hxSelected
    .map(t => t.tileType === 'rune' ? '?' : t.letter)
    .join('');
}

function clearSelection() {
  hxSelected.forEach(t => t.setSelected(false));
  hxSelected = [];
  updateWordDisplay();
}

/* ── Tile lookup from DOM element ──────────────────────────────── */
function tileFromElement(el) {
  let node = el;
  while (node && node !== hxSvg) {
    if (node.classList?.contains('tile')) {
      return hxState.tiles.find(t => t.element === node) || null;
    }
    node = node.parentElement;
  }
  return null;
}

/* ── Pointer events ────────────────────────────────────────────── */
function setupPointerEvents() {
  const svg = hxSvg;

  function onPointerDown(e) {
    if (!hxState.active || hxState.gameOver) return;
    e.preventDefault();
    const tile = tileFromElement(document.elementFromPoint(e.clientX, e.clientY));
    if (!tile) return;
    hxPointerDown = true;
    svg.setPointerCapture(e.pointerId);
    clearSelection();
    hxSelected = [tile];
    tile.setSelected(true);
    updateWordDisplay();
  }

  function onPointerMove(e) {
    if (!hxState.active || hxState.gameOver || !hxPointerDown) return;
    e.preventDefault();
    const tile = tileFromElement(document.elementFromPoint(e.clientX, e.clientY));
    if (!tile) return;

    // Allow backtracking to the previous tile
    if (hxSelected.length >= 2 && tile === hxSelected[hxSelected.length - 2]) {
      const removed = hxSelected.pop();
      removed.setSelected(false);
      updateWordDisplay();
      return;
    }

    // Don't re-add already selected tile
    if (hxSelected.includes(tile)) return;

    // Must be adjacent to the last tile
    const last = hxSelected[hxSelected.length - 1];
    if (!last || !areNeighbors(last, tile)) return;

    hxSelected.push(tile);
    tile.setSelected(true);
    updateWordDisplay();
  }

  function onPointerUp(e) {
    if (!hxPointerDown) return;
    hxPointerDown = false;
  }

  function onPointerCancel() {
    hxPointerDown = false;
  }

  svg.addEventListener('pointerdown',   onPointerDown);
  svg.addEventListener('pointermove',   onPointerMove);
  svg.addEventListener('pointerup',     onPointerUp);
  svg.addEventListener('pointercancel', onPointerCancel);

  hxPointerCleanup = () => {
    svg.removeEventListener('pointerdown',   onPointerDown);
    svg.removeEventListener('pointermove',   onPointerMove);
    svg.removeEventListener('pointerup',     onPointerUp);
    svg.removeEventListener('pointercancel', onPointerCancel);
  };
}

function setupButtons() {
  const submitBtn = document.getElementById('submit-word');
  const clearBtn  = document.getElementById('clear-word');
  if (!submitBtn || !clearBtn) return;

  function onSubmit() { if (hxState.active && !hxState.gameOver) submitHexacoreWord(); }
  function onClear()  { if (hxState.active && !hxState.gameOver) clearSelection(); }

  submitBtn.addEventListener('click', onSubmit);
  clearBtn.addEventListener('click',  onClear);
  hxButtonCleanup = () => {
    submitBtn.removeEventListener('click', onSubmit);
    clearBtn.removeEventListener('click',  onClear);
  };
}

/* ── Rune wildcard resolution ──────────────────────────────────── */
function resolveLetters(selectedTiles) {
  const letters = selectedTiles.map(t => (t.tileType === 'rune' ? null : t.letter));
  const runeIdxs = letters.map((l, i) => l === null ? i : -1).filter(i => i !== -1);
  if (runeIdxs.length === 0) return letters;

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  if (runeIdxs.length === 1) {
    for (const ch of alphabet) {
      letters[runeIdxs[0]] = ch;
      if (isValidWord(letters.join(''))) return letters;
    }
    return null;
  }

  if (runeIdxs.length === 2) {
    const [i1, i2] = runeIdxs;
    for (const c1 of alphabet) {
      for (const c2 of alphabet) {
        letters[i1] = c1; letters[i2] = c2;
        if (isValidWord(letters.join(''))) return letters;
      }
    }
    return null;
  }

  // More than 2 runes: brute-force is too slow; fall back to null
  return null;
}

/* ── Word submission ───────────────────────────────────────────── */
async function submitHexacoreWord() {
  if (hxSelected.length < 4) {
    showAlert('Select at least 4 tiles!');
    return;
  }

  const resolved = resolveLetters(hxSelected);
  if (!resolved) {
    showAlert('Invalid word!');
    clearSelection();
    return;
  }

  const word = resolved.join('');
  if (!isValidWord(word)) {
    showAlert('Not a valid word!');
    clearSelection();
    return;
  }

  // Score
  const hasPrism = hxSelected.some(t => t.tileType === 'prism');
  let base = 0;
  resolved.forEach(l => { base += letterPoints[l] || 1; });
  const lenMult   = lengthMultipliers[word.length] || 1;
  const wordScore = base * lenMult * (hasPrism ? 2 : 1);

  hxWordCount++;
  hxState.score += wordScore;
  hxState.words.push({ word, score: wordScore });

  updateScoreDisplay();
  updateHud();

  const consumed = [...hxSelected];
  clearSelection();

  // Consume tiles → gravity → ember advance → refill → special spawns
  await consumeAndRefill(consumed);

  if (!hxState.gameOver) {
    spawnSpecialTiles();
  }
}

/* ── Consume tiles → gravity → ember → refill ─────────────────── */
async function consumeAndRefill(tilesToRemove) {
  // 1. Remove consumed tiles
  tilesToRemove.forEach(tile => {
    tile.element.remove();
    removeFrom(hxState.tiles,      tile);
    removeFrom(hxState.emberTiles, tile);
    removeFrom(hxState.prismTiles, tile);
    removeFrom(hxState.runeTiles,  tile);
    hxTileMap.delete(hxKey(tile.q, tile.r));
  });

  // 2. Gravity
  applyGravity();
  await delay(420);
  if (hxState.gameOver) return;

  // 3. Advance ember tiles
  advanceEmberTiles();
  if (hxState.gameOver) return;

  // 4. Refill empty columns
  await refillGrid();
}

/* ── Gravity: pack each column to the bottom ───────────────────── */
function applyGravity() {
  const columns = [...new Set(hxState.tiles.map(t => t.q))];
  columns.forEach(q => {
    const { r_max } = getColumnRange(q);
    // Sort descending by r (process from bottom tile upward)
    const colTiles = hxState.tiles
      .filter(t => t.q === q)
      .sort((a, b) => b.r - a.r);

    let fill = r_max;
    colTiles.forEach(tile => {
      if (tile.r !== fill) {
        const deltaR = fill - tile.r;  // positive → moving down
        hxTileMap.delete(hxKey(tile.q, tile.r));
        tile.r = fill;
        tile.s = -tile.q - tile.r;
        hxTileMap.set(hxKey(tile.q, tile.r), tile);

        tile._transformY += deltaR * ROW_HEIGHT;
        tile.element.classList.add('hx-tile-falling');
        tile.element.style.transform = `translateY(${tile._transformY}px)`;
      }
      fill--;
    });
  });
}

/* ── Ember advancement: each ember tile moves one row down ─────── */
function advanceEmberTiles() {
  const embers = [...hxState.emberTiles]; // copy — may modify during iteration
  embers.forEach(tile => {
    if (hxState.gameOver) return;

    const { r_max } = getColumnRange(tile.q);
    const newR = tile.r + 1;

    if (newR > r_max) {
      triggerGameOver();
      return;
    }

    // Remove from old map position
    hxTileMap.delete(hxKey(tile.q, tile.r));

    // Displace any tile already at newR
    const displaced = hxTileMap.get(hxKey(tile.q, newR));
    if (displaced && displaced !== tile) {
      displaced.element.remove();
      removeFrom(hxState.tiles,      displaced);
      removeFrom(hxState.emberTiles, displaced);
      removeFrom(hxState.prismTiles, displaced);
      removeFrom(hxState.runeTiles,  displaced);
      hxTileMap.delete(hxKey(tile.q, newR));
    }

    // Animate ember sliding down one row
    tile._transformY += ROW_HEIGHT;
    tile.element.classList.add('hx-tile-falling');
    tile.element.style.transform = `translateY(${tile._transformY}px)`;

    tile.r = newR;
    tile.s = -tile.q - tile.r;
    hxTileMap.set(hxKey(tile.q, tile.r), tile);
  });
}

/* ── Refill: spawn new tiles at top of each column with gaps ────── */
async function refillGrid() {
  const board = hxSvg.querySelector('#board');
  if (!board) return;

  const spawnPromises = [];

  for (let q = -GRID_RADIUS; q <= GRID_RADIUS; q++) {
    const { r_min, r_max } = getColumnRange(q);
    const colIdx = q + GRID_RADIUS;

    for (let r = r_min; r <= r_max; r++) {
      if (hxTileMap.has(hxKey(q, r))) continue;  // already occupied

      const letter = randomLetter();
      const tile   = createTile({
        hex:        new Hex(q, r),
        layout:     hxLayout,
        key:        hxKey(q, r),
        letter,
        pointValue: letterPoints[letter] || 1,
      });
      tile.tileType    = 'normal';
      tile.s           = -q - r;
      tile._transformY = 0;

      hxState.tiles.push(tile);
      hxTileMap.set(hxKey(q, r), tile);
      board.appendChild(tile.element);

      // Start the tile above the visible area then drop it in
      const spawnOffset = (r - r_min + 1) * ROW_HEIGHT + ROW_HEIGHT;
      tile.element.style.transform = `translateY(-${spawnOffset}px)`;
      tile.element.style.opacity   = '0';

      spawnPromises.push(new Promise(resolve => {
        setTimeout(() => {
          tile.element.classList.add('hx-tile-falling');
          tile.element.style.opacity   = '1';
          tile.element.style.transform = 'translateY(0)';
          setTimeout(resolve, 380);
        }, 50 * colIdx);
      }));
    }
  }

  if (spawnPromises.length > 0) await Promise.all(spawnPromises);
}

/* ── Special tile spawning ─────────────────────────────────────── */
function spawnSpecialTiles() {
  // Every 3 words → 1 new ember in top row
  if (hxWordCount % 3 === 0) {
    spawnSpecialInRows('ember', [-GRID_RADIUS]);
  }
  // Every 5 words → 1 new prism in top 3 rows
  if (hxWordCount % 5 === 0) {
    spawnSpecialInRows('prism', [-GRID_RADIUS, -GRID_RADIUS + 1, -GRID_RADIUS + 2]);
  }
  // Every 7 words → 1 new rune in top 3 rows
  if (hxWordCount % 7 === 0) {
    spawnSpecialInRows('rune', [-GRID_RADIUS, -GRID_RADIUS + 1, -GRID_RADIUS + 2]);
  }
}

function spawnSpecialInRows(type, rows) {
  const eligible = hxState.tiles.filter(
    t => t.tileType === 'normal' && rows.includes(t.r),
  );
  if (eligible.length === 0) return;
  const target = eligible[Math.floor(Math.random() * eligible.length)];
  target.tileType = type;
  if (type === 'ember') hxState.emberTiles.push(target);
  else if (type === 'prism') hxState.prismTiles.push(target);
  else if (type === 'rune')  hxState.runeTiles.push(target);
  applyTileType(target);
}

/* ── Game over ─────────────────────────────────────────────────── */
function triggerGameOver() {
  if (hxState.gameOver) return;
  hxState.gameOver = true;
  hxState.active   = false;

  if (hxPointerCleanup) { hxPointerCleanup(); hxPointerCleanup = null; }
  if (hxButtonCleanup)  { hxButtonCleanup();  hxButtonCleanup  = null; }
  clearSelection();
  document.body.classList.remove('hx-active');
  removeHud();
  showGameOver();
}

async function showGameOver() {
  document.getElementById('hx-gameover-overlay')?.remove();

  const best = hxState.words.length > 0
    ? hxState.words.reduce((b, w) => w.score > b.score ? w : b)
    : null;

  const overlay = document.createElement('div');
  overlay.id = 'hx-gameover-overlay';
  overlay.innerHTML = `
    <div id="hx-gameover-box">
      <h2>HEXACORE OVER</h2>
      <div class="hx-final-score">${hxState.score}</div>
      <div class="hx-stats">
        ${hxState.words.length} WORD${hxState.words.length !== 1 ? 'S' : ''} FOUND
        ${best ? `&nbsp;&middot;&nbsp; BEST: ${escapeHtml(best.word)} (${best.score} pts)` : ''}
      </div>
      <div id="hx-lb-area" style="margin-bottom:1rem;font-size:0.8rem;min-height:2rem;color:#94a3b8;">
        Loading leaderboard&hellip;
      </div>
      <button id="hx-btn-submit" class="hx-btn-primary" type="button">
        🏆 SUBMIT SCORE &amp; VIEW LEADERBOARD
      </button>
      <button id="hx-btn-again" type="button">🔄 PLAY AGAIN</button>
      <button id="hx-btn-menu"  type="button">🏠 MAIN MENU</button>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('hx-btn-submit')?.addEventListener('click', handleSubmitScore);
  document.getElementById('hx-btn-again')?.addEventListener('click', () => {
    overlay.remove();
    startHexacore();
  });
  document.getElementById('hx-btn-menu')?.addEventListener('click', () => {
    window.location.reload();
  });

  // Load leaderboard in background
  loadLeaderboard();
}

async function handleSubmitScore() {
  const btn = document.getElementById('hx-btn-submit');
  if (!btn || btn.disabled) return;
  btn.disabled    = true;
  btn.textContent = '⏳ Submitting…';

  let name = getPlayerName();
  if (!name) name = await promptPlayerName();
  if (!name) {
    btn.disabled    = false;
    btn.textContent = '🏆 SUBMIT SCORE & VIEW LEADERBOARD';
    return;
  }

  // dailyId = 'hexacore' is how the API key-partitions the hexacore leaderboard
  await submitScore('hexacore', hxState.score, hxState.words.map(w => w.word), 0, 'hexacore');
  btn.textContent = '✓ SUBMITTED';
  await loadLeaderboard();
}

async function loadLeaderboard() {
  const area = document.getElementById('hx-lb-area');
  if (!area) return;
  area.textContent = 'Loading…';

  // dailyId = 'hexacore' partitions this leaderboard from daily/unlimited
  const result = await fetchLeaderboard('hexacore', 'hexacore');

  if (!result.configured || result.entries.length === 0) {
    area.textContent = 'No leaderboard entries yet.';
    return;
  }

  const rows = result.entries.slice(0, 10).map((e, i) => `
    <tr>
      <td style="padding:0.15rem 0.5rem;opacity:0.5">${i + 1}</td>
      <td style="padding:0.15rem 0.5rem">${escapeHtml(e.player_name || 'Anonymous')}</td>
      <td style="padding:0.15rem 0.5rem;color:#4cc9f0;font-weight:700">${e.score}</td>
    </tr>`).join('');

  area.innerHTML = `
    <table style="width:100%;border-collapse:collapse;margin-top:0.4rem">
      <thead>
        <tr style="font-size:0.72rem;opacity:0.5;text-transform:uppercase">
          <th style="padding:0.15rem 0.5rem">#</th>
          <th style="padding:0.15rem 0.5rem">Player</th>
          <th style="padding:0.15rem 0.5rem">Score</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/* ── Alert helper (reuse existing modal) ───────────────────────── */
function showAlert(msg) {
  const modal = document.getElementById('alert-modal');
  const text  = document.getElementById('alert-text');
  const ok    = document.getElementById('alert-ok');
  if (!modal || !text || !ok) return;
  text.textContent = msg;
  modal.classList.remove('hidden');
  const close = () => { modal.classList.add('hidden'); ok.removeEventListener('click', close); };
  ok.addEventListener('click', close);
}

/* ── Misc ──────────────────────────────────────────────────────── */
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ── Public entry point ────────────────────────────────────────── */
export function startHexacore() {
  // Reset state
  Object.assign(hxState, {
    score:      0,
    words:      [],
    tiles:      [],
    emberTiles: [],
    prismTiles: [],
    runeTiles:  [],
    gameOver:   false,
    active:     true,
  });
  hxSelected    = [];
  hxPointerDown = false;
  hxWordCount   = 0;
  hxTileMap     = new Map();

  // Clean up previous listeners
  if (hxPointerCleanup) { hxPointerCleanup(); hxPointerCleanup = null; }
  if (hxButtonCleanup)  { hxButtonCleanup();  hxButtonCleanup  = null; }

  // Remove any leftover overlay
  document.getElementById('hx-gameover-overlay')?.remove();

  hxSvg = document.getElementById('hex-grid');
  if (!hxSvg) return;

  // Wipe the SVG
  hxSvg.innerHTML = '';
  hxLayout = makeLayout();

  injectSvgDefs(hxSvg);
  buildGrid();
  spawnInitialEmbers();

  document.body.classList.add('hx-active');
  ensureHud();
  updateHud();
  updateScoreDisplay();

  setupPointerEvents();
  setupButtons();
}

/* ── Splash screen wiring (on module load) ─────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('splash-hexacore-btn')?.addEventListener('click', () => {
    document.getElementById('splash-screen')?.classList.add('hidden');
    startHexacore();
  });
});
