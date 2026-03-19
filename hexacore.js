// hexacore.js — Hexacore endless word game mode for Anagramaton

import {
  GRID_RADIUS,
  HEX_RADIUS,
  letterPoints,
  lengthMultipliers,
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
import { initSvg }            from './svgKit.js';
import { unlockAudioContext, preloadBuffers, playSound } from './audioEngine.js';

/* ── Audio state ───────────────────────────────────────────────── */
let _hxAudioReady = false;

/* ── Layout constants ──────────────────────────────────────────── */
const TILE_SPACING             = 1.25;
const INTRO_ARC_OFFSET         = 60;   // px: horizontal fan spread during pour-in arc
const REFILL_STAGGER_MS        = 40;   // ms between each column's spawn delay

/* ── Animation timing constants (easy to tune) ─────────────────── */
const WORD_TILE_STAGGER_MS      = 55;  // ms stagger between each consumed tile pop-out
const GRAVITY_STAGGER_MS        = 38;  // ms stagger between tiles in the gravity cascade
const REFILL_COL_TILE_STAGGER_MS = 40; // ms stagger between tiles within a refill column
const SCORE_TICK_MS             = 700; // ms duration for score count-up animation

/* ── Letter pool — mirrors Scrabble tile distribution for maximum playability ──
 * Counts sourced from: https://norvig.com/scrabble-letter-scores.html
 * High-frequency vowels + consonants ensure dense playable word coverage.      */
const HX_LETTER_POOL = [
  // Vowels
  ...Array(12).fill('E'),  // 12
  ...Array(9).fill('A'),   //  9
  ...Array(9).fill('I'),   //  9
  ...Array(8).fill('O'),   //  8
  ...Array(4).fill('U'),   //  4

  // High-frequency consonants
  ...Array(6).fill('N'),   //  6
  ...Array(6).fill('R'),   //  6
  ...Array(6).fill('T'),   //  6
  ...Array(4).fill('L'),   //  4
  ...Array(4).fill('S'),   //  4
  ...Array(4).fill('D'),   //  4

  // Mid-frequency consonants
  ...Array(3).fill('G'),   //  3
  ...Array(2).fill('B'),   //  2
  ...Array(2).fill('C'),   //  2
  ...Array(2).fill('F'),   //  2
  ...Array(2).fill('H'),   //  2
  ...Array(2).fill('M'),   //  2
  ...Array(2).fill('P'),   //  2
  ...Array(2).fill('V'),   //  2
  ...Array(2).fill('W'),   //  2
  ...Array(2).fill('Y'),   //  2

  // Rare letters — 1 each (still possible, not dominant)
  'J', 'K', 'Q', 'X', 'Z',
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

let hxSelected          = [];   // tiles in current selection chain
let hxPointerDown       = false;
let hxLayout            = null;
let hxSvg               = null;
let hxWordCount         = 0;
let hxTileMap           = new Map(); // `q,r` → tile object
let hxPointerCleanup    = null;
let hxUpdateViewForBoard = null;

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

const HX_VOWELS = new Set(['A','E','I','O','U']);
const HX_VOWEL_POOL = ['A','A','A','E','E','E','E','I','I','I','O','O','O','U','U'];

/**
 * Returns a letter from HX_LETTER_POOL, but if all hex-grid neighbours of
 * position (q, r) are already consonants, biases strongly toward a vowel
 * so that isolated consonant islands are broken up.
 */
function randomLetterForPos(q, r) {
  const neighborKeys = [
    hxKey(q + 1, r),  hxKey(q - 1, r),
    hxKey(q, r + 1),  hxKey(q, r - 1),
    hxKey(q + 1, r - 1), hxKey(q - 1, r + 1),
  ];
  const neighborLetters = neighborKeys
    .map(k => hxTileMap.get(k)?.letter)
    .filter(Boolean);

  const hasVowelNeighbor = neighborLetters.some(l => HX_VOWELS.has(l));

  // If surrounded by consonants, 75% chance to force a vowel
  if (!hasVowelNeighbor && neighborLetters.length >= 2 && Math.random() < 0.75) {
    return HX_VOWEL_POOL[Math.floor(Math.random() * HX_VOWEL_POOL.length)];
  }
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

/* ── Tile geometry repositioning ───────────────────────────────── */
function repositionTileGeometry(tile) {
  const hex    = new Hex(tile.q, tile.r);
  const center = hxLayout.hexToPixel(hex);

  const poly = tile.element.querySelector('polygon');
  if (poly) {
    const pts = hxLayout.polygonCorners(hex, HEX_RADIUS).map(p => `${p.x},${p.y}`).join(' ');
    poly.setAttribute('points', pts);
  }

  const outline = tile.element.querySelector('path');
  if (outline) {
    const outer = hxLayout.polygonCorners(hex, HEX_RADIUS + 5);
    const inner = hxLayout.polygonCorners(hex, HEX_RADIUS);
    const d = [
      'M', outer[0].x, outer[0].y,
      ...outer.slice(1).map(p => `L ${p.x} ${p.y}`),
      'Z',
      'M', inner[0].x, inner[0].y,
      ...inner.slice(1).map(p => `L ${p.x} ${p.y}`),
      'Z',
    ].join(' ');
    outline.setAttribute('d', d);
  }

  tile.textLetter.setAttribute('x', center.x);
  tile.textLetter.setAttribute('y', center.y);
  tile.textPoint.setAttribute('x', center.x);
  tile.textPoint.setAttribute('y', center.y + HEX_RADIUS * 0.6);

  const spark = tile.element.querySelector('.spark');
  if (spark) {
    spark.setAttribute('cx', center.x + HEX_RADIUS * 0.4);
    spark.setAttribute('cy', center.y - HEX_RADIUS * 0.4);
  }

  tile.element.removeAttribute('transform');
  tile.element.style.transform = '';
}

/* ── Animate a batch of tile moves simultaneously (arc paths) ───── */
async function animateTileMoves(moves) {
  const promises = moves.map(({ tile, fromQ, fromR, toQ, toR }) =>
    new Promise(resolve => {
      const start = hxLayout.hexToPixel(new Hex(fromQ, fromR));
      const end   = hxLayout.hexToPixel(new Hex(toQ,   toR));
      // Path offsets are relative to the tile's baked (drawn) polygon position.
      // For existing tiles tile.q/tile.r == fromQ/fromR (pre-move position).
      // For new refill tiles tile.q/tile.r == toQ/toR (spawned at destination).
      // In both cases tile.q/tile.r gives the correct SVG geometry reference.
      const bakedPixel = hxLayout.hexToPixel(new Hex(tile.q, tile.r));

      const sx = start.x - bakedPixel.x;
      const sy = start.y - bakedPixel.y;
      const ex = end.x   - bakedPixel.x;
      const ey = end.y   - bakedPixel.y;

      // Quadratic Bézier control point: 0.25 pulls the arc toward the start row,
      // creating the "shoulder-slide" where tiles appear to roll off each other
      const cpx = (sx + ex) / 2;
      const cpy = sy + (ey - sy) * 0.25;

      const anim = document.createElementNS(SVG_NS, 'animateMotion');
      anim.setAttribute('path', `M ${sx},${sy} Q ${cpx},${cpy} ${ex},${ey}`);
      anim.setAttribute('dur', '0.22s');
      anim.setAttribute('fill', 'freeze');

      // settled flag prevents double-resolution if both endEvent and the
      // fallback timer fire (e.g. very fast browser or already-removed element)
      let settled = false;
      let fallbackTimer;
      function finalize() {
        if (settled) return;
        settled = true;
        clearTimeout(fallbackTimer);
        hxTileMap.delete(hxKey(fromQ, fromR));
        tile.q = toQ;
        tile.r = toR;
        tile.s = -toQ - toR;
        hxTileMap.set(hxKey(toQ, toR), tile);
        anim.remove();
        repositionTileGeometry(tile);
        tile.element.classList.remove('hx-tile-landing');
        // Re-adding the same class only re-triggers the animation after a reflow
        // forces the browser to flush the style change between remove and add.
        void tile.element.getBoundingClientRect();
        tile.element.classList.add('hx-tile-landing');
        resolve();
      }

      anim.addEventListener('endEvent', finalize, { once: true });

      // Fallback: SVG endEvent is not 100% reliable across all browsers.
      // If it never fires (e.g. element removed from DOM mid-animation) the
      // promise would hang forever, stalling the gravity/refill chain.
      // 300 ms gives the 220 ms animation generous time to fire naturally.
      fallbackTimer = setTimeout(finalize, 300);

      tile.element.appendChild(anim);
      anim.beginElement();
    })
  );

  await Promise.all(promises);
}

/* ── Animate tile moves with a per-tile stagger (chain-reaction) ── */
async function animateTileMovesStaggered(moves, staggerMs) {
  if (moves.length === 0) return;
  const promises = moves.map((move, idx) =>
    new Promise(resolve => {
      setTimeout(() => {
        animateTileMoves([move]).then(resolve);
      }, idx * staggerMs);
    })
  );
  await Promise.all(promises);
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

  const { updateViewForBoard } = initSvg(hxSvg, {
    preserveAspectRatio: 'xMidYMid meet',
    defaultViewBox: '0 0 1000 1000',
    mobileBreakpoint: 768,
    pad: 12,
  });
  hxUpdateViewForBoard = updateViewForBoard;

  for (let q = -GRID_RADIUS; q <= GRID_RADIUS; q++) {
    for (let r = -GRID_RADIUS; r <= GRID_RADIUS; r++) {
      const s = -q - r;
      if (Math.abs(s) > GRID_RADIUS) continue;

      const letter = randomLetterForPos(q, r);
      const tile   = createTile({
        hex:        new Hex(q, r),
        layout:     hxLayout,
        key:        hxKey(q, r),
        letter,
        pointValue: letterPoints[letter] || 1,
      });

      tile.tileType = 'normal';
      tile.s        = s;

      hxState.tiles.push(tile);
      hxTileMap.set(hxKey(q, r), tile);
      board.appendChild(tile.element);

      // Hide until intro animation reveals the tile
      tile.element.style.opacity = '0';
    }
  }
  hxSvg.appendChild(board);

  // Tighten viewBox to board bounds on mobile FIRST,
  // then pre-position tiles and kick off the intro animation —
  // all in one rAF so the viewBox is settled before we
  // convert screen → SVG coordinates.
  requestAnimationFrame(() => {
    if (hxUpdateViewForBoard) hxUpdateViewForBoard(board);

    // Pre-position all tiles at the title element so the pour-in starts there
    const titleEl = document.getElementById('game-title');
    const ctm     = hxSvg.getScreenCTM()?.inverse();
    if (titleEl && ctm) {
      const rect  = titleEl.getBoundingClientRect();
      const svgPt = hxSvg.createSVGPoint();
      svgPt.x     = rect.left + rect.width  / 2;
      svgPt.y     = rect.top  + rect.height / 2;
      const origin = svgPt.matrixTransform(ctm);

      hxState.tiles.forEach(tile => {
        const center = hxLayout.hexToPixel(new Hex(tile.q, tile.r));
        tile.element.setAttribute(
          'transform',
          `translate(${origin.x - center.x},${origin.y - center.y})`,
        );
      });
    }

    // Start the cascade intro (sets hxState.active = true when done)
    animateGridIntro();
  });
}

/* ── Intro cascade: tiles pour from the title into their positions ─ */
async function animateGridIntro() {
  const titleEl = document.getElementById('game-title');
  const ctm     = hxSvg.getScreenCTM()?.inverse();

  if (!titleEl || !ctm) {
    // Fallback: no animation — just show everything immediately
    hxState.tiles.forEach(t => { t.element.style.opacity = '1'; t.element.removeAttribute('transform'); });
    hxState.active = true;
    return;
  }

  const rect  = titleEl.getBoundingClientRect();
  const svgPt = hxSvg.createSVGPoint();
  svgPt.x     = rect.left + rect.width  / 2;
  svgPt.y     = rect.top  + rect.height / 2;
  const origin = svgPt.matrixTransform(ctm);

  // Process rows top-to-bottom
  const rValues = [...new Set(hxState.tiles.map(t => t.r))].sort((a, b) => a - b);

  for (const r of rValues) {
    const rowTiles = hxState.tiles
      .filter(t => t.r === r)
      .sort((a, b) => a.q - b.q); // left → right

    const wavePromises = rowTiles.map((tile, idx) =>
      new Promise(resolve => {
        setTimeout(() => {
          const center = hxLayout.hexToPixel(new Hex(tile.q, tile.r));
          // SVG transform is already translate(origin-center); animateMotion
          // path M 0,0 → M -(origin-center) cancels it, landing at (0,0)
          const dx = center.x - origin.x; // = -(origin-center).x
          const dy = center.y - origin.y;

          // Arc control: left tiles fan SW (-x), right tiles fan SE (+x)
          const arcDir = tile.q < 0 ? -1 : 1;
          const cpX    = dx / 2 + arcDir * INTRO_ARC_OFFSET;
          const cpY    = dy / 2;

          tile.element.style.opacity = '1';

          const anim = document.createElementNS(SVG_NS, 'animateMotion');
          anim.setAttribute('path', `M 0,0 Q ${cpX},${cpY} ${dx},${dy}`);
          anim.setAttribute('dur', '0.5s');
          anim.setAttribute('fill', 'freeze');

          anim.addEventListener('endEvent', () => {
            anim.remove();
            tile.element.removeAttribute('transform');
            tile.element.classList.add('hx-tile-intro-landing');
            resolve();
          }, { once: true });

          tile.element.appendChild(anim);
          anim.beginElement();
        }, idx * 30);
      })
    );

    await Promise.all(wavePromises);
  }

  hxState.active = true;
}


/* ── Rune wildcard resolution ──────────────────────────────────── */
function updateScoreDisplay() {
  const el = document.getElementById('score-display');
  if (el) el.textContent = String(hxState.score);
}

function updateHud() {
  const hud = document.getElementById('hx-score-hud');
  if (hud) hud.textContent = `${hxState.score} PTS`;
}

/* ── Animate the HUD score counting up from oldScore → newScore ── */
let _scoreRafId = 0; // cancel any in-flight count-up before starting a new one
function animateScoreHud(oldScore, newScore) {
  const hud = document.getElementById('hx-score-hud');
  if (!hud) return;

  // Cancel any in-progress count-up animation
  if (_scoreRafId) { cancelAnimationFrame(_scoreRafId); _scoreRafId = 0; }

  // Restart pop animation (force reflow so the animation restarts if already running)
  hud.classList.remove('hx-score-popping');
  void hud.getBoundingClientRect();
  hud.classList.add('hx-score-popping');
  hud.addEventListener('animationend', () => {
    hud.classList.remove('hx-score-popping');
  }, { once: true });

  // Ease-out count-up via requestAnimationFrame
  const startTime = performance.now();
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function frame(now) {
    const elapsed  = now - startTime;
    const progress = Math.min(elapsed / SCORE_TICK_MS, 1);
    const current  = Math.round(oldScore + (newScore - oldScore) * easeOut(progress));
    hud.textContent = `${current} PTS`;
    if (progress < 1) { _scoreRafId = requestAnimationFrame(frame); }
    else { _scoreRafId = 0; }
  }
  _scoreRafId = requestAnimationFrame(frame);
}

function ensureHud() {
  if (document.getElementById('hx-score-hud')) return;
  const hud = document.createElement('div');
  hud.id = 'hx-score-hud';
  hud.textContent = '0 PTS';
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
    unlockAudioContext();
    if (!_hxAudioReady) {
      _hxAudioReady = true;
      preloadBuffers();
    }
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
    const swipeIndex = Math.max(1, Math.min(25, hxSelected.length));
    playSound('sfxSwipe' + swipeIndex);
    updateWordDisplay();
  }

  function onPointerUp(e) {
    if (!hxPointerDown) return;
    hxPointerDown = false;
    // Auto-submit the word when the drag ends
    if (hxState.active && !hxState.gameOver && hxSelected.length > 0) {
      submitHexacoreWord();
    }
  }

  function onPointerCancel() {
    hxPointerDown = false;
    clearSelection();
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
  // Too few tiles — silently cancel (accidental drag)
  if (hxSelected.length < 4) {
    clearSelection();
    return;
  }

  const resolved = resolveLetters(hxSelected);
  if (!resolved || !isValidWord(resolved.join(''))) {
    playSound('sfxAlert');
    showAlert('Word not found!');
    clearSelection();
    return;
  }

  // Score
  const word     = resolved.join('');
  const hasPrism = hxSelected.some(t => t.tileType === 'prism');
  let base = 0;
  resolved.forEach(l => { base += letterPoints[l] || 1; });
  const lenMult   = lengthMultipliers[word.length] || 1;
  const wordScore = base * lenMult * (hasPrism ? 2 : 1);

  hxWordCount++;
  const oldScore = hxState.score;
  hxState.score += wordScore;
  hxState.words.push({ word, score: wordScore });

  updateScoreDisplay();
  animateScoreHud(oldScore, hxState.score);

  const consumed = [...hxSelected];
  clearSelection();

  playSound('sfxSuccess');
  // Consume tiles → gravity → ember advance → refill → special spawns
  await consumeAndRefill(consumed);

  if (!hxState.gameOver) {
    spawnSpecialTiles();
  }
}

/* ── Consume tiles → gravity → ember → refill ─────────────────── */
async function consumeAndRefill(tilesToRemove) {
  // 1. Animate tiles out with a tile-by-tile stagger (first selected → last)
  tilesToRemove.forEach((tile, idx) => {
    tile.element.style.setProperty('--tile-idx', String(idx));
    const type = tile.tileType;
    if (type === 'ember' || type === 'prism' || type === 'rune') {
      // Consumed-special class replaces hx-tile-removing with combined animation
      tile.element.classList.add(`hx-consumed-${type}`);
    } else {
      tile.element.classList.add('hx-tile-removing');
    }
    tile.element.style.pointerEvents = 'none';
  });
  // Wait for all tiles to finish: pop-out duration + stagger * tile count
  await delay(270 + WORD_TILE_STAGGER_MS * tilesToRemove.length);

  tilesToRemove.forEach(tile => {
    tile.element.remove();
    removeFrom(hxState.tiles,      tile);
    removeFrom(hxState.emberTiles, tile);
    removeFrom(hxState.prismTiles, tile);
    removeFrom(hxState.runeTiles,  tile);
    hxTileMap.delete(hxKey(tile.q, tile.r));
  });

  // 2. Gravity
  await applyGravity();
  if (hxState.gameOver) return;

  // 3. Advance ember tiles
  await advanceEmberTiles();
  if (hxState.gameOver) return;

  // 4. Refill empty columns
  await refillGrid();
}

/* ── Gravity: Battle Balls-style SE/SW cascade ─────────────────── */
async function applyGravity() {
  function inBounds(pos) {
    const s = -pos.q - pos.r;
    return (
      Math.abs(pos.q) <= GRID_RADIUS &&
      Math.abs(pos.r) <= GRID_RADIUS &&
      Math.abs(s)     <= GRID_RADIUS
    );
  }

  let anyMoved = true;
  while (anyMoved) {
    anyMoved = false;
    // Process bottom rows first so lower tiles move before upper ones
    const sorted = [...hxState.tiles].sort((a, b) => b.r - a.r);
    const moves  = []; // { tile, fromQ, fromR, toQ, toR }

    for (const tile of sorted) {
      const se = { q: tile.q,     r: tile.r + 1 };
      const sw = { q: tile.q - 1, r: tile.r + 1 };

      const seOk = inBounds(se) &&
        !hxTileMap.has(hxKey(se.q, se.r)) &&
        !moves.some(m => m.toQ === se.q && m.toR === se.r);
      const swOk = inBounds(sw) &&
        !hxTileMap.has(hxKey(sw.q, sw.r)) &&
        !moves.some(m => m.toQ === sw.q && m.toR === sw.r);

      if (seOk) {
        moves.push({ tile, fromQ: tile.q, fromR: tile.r, toQ: se.q, toR: se.r });
        anyMoved = true;
      } else if (swOk) {
        moves.push({ tile, fromQ: tile.q, fromR: tile.r, toQ: sw.q, toR: sw.r });
        anyMoved = true;
      }
    }

    if (moves.length === 0) break;

    // All tiles in a gravity wave fall simultaneously (Battle Balls style).
    // Each successive pass of the while-loop is one "step" downward, giving
    // the cascade effect without per-tile stagger within a single step.
    await animateTileMoves(moves);
  }
}

/* ── Ember advancement: each ember moves to a random lower hex neighbour ── */
async function advanceEmberTiles() {
  if (hxState.gameOver) return;

  const embers     = [...hxState.emberTiles];
  const emberMoves = [];

  for (const tile of embers) {
    if (hxState.gameOver) break;

    // In a pointy-top grid the two lower neighbours of (q,r) are
    //   (q, r+1)   — lower-right (SE)
    //   (q-1, r+1) — lower-left  (SW)
    const candidates = [
      { q: tile.q,     r: tile.r + 1 },
      { q: tile.q - 1, r: tile.r + 1 },
    ].filter(pos => {
      const s = -pos.q - pos.r;
      return (
        Math.abs(pos.q) <= GRID_RADIUS &&
        Math.abs(pos.r) <= GRID_RADIUS &&
        Math.abs(s)     <= GRID_RADIUS
      );
    });

    if (candidates.length === 0) {
      triggerGameOver();
      return;
    }

    const target = candidates[Math.floor(Math.random() * candidates.length)];

    // Displace any normal tile at the target before moving
    const displaced = hxTileMap.get(hxKey(target.q, target.r));
    if (displaced && displaced !== tile) {
      displaced.element.remove();
      removeFrom(hxState.tiles,      displaced);
      removeFrom(hxState.emberTiles, displaced);
      removeFrom(hxState.prismTiles, displaced);
      removeFrom(hxState.runeTiles,  displaced);
      hxTileMap.delete(hxKey(target.q, target.r));
    }

    emberMoves.push({ tile, fromQ: tile.q, fromR: tile.r, toQ: target.q, toR: target.r });
  }

  if (emberMoves.length > 0 && !hxState.gameOver) {
    await animateTileMoves(emberMoves);
  }
}

/* ── Refill: spawn new tiles from above the column's top boundary ── */
async function refillGrid() {
  const board = hxSvg.querySelector('#board');
  if (!board) return;

  const allPromises = [];

  for (let q = -GRID_RADIUS; q <= GRID_RADIUS; q++) {
    const { r_min, r_max } = getColumnRange(q);
    const colIdx  = q + GRID_RADIUS;
    const colMoves = [];

    for (let r = r_min; r <= r_max; r++) {
      if (hxTileMap.has(hxKey(q, r))) continue;

      const letter = randomLetterForPos(q, r);
      const tile   = createTile({
        hex:        new Hex(q, r),
        layout:     hxLayout,
        key:        hxKey(q, r),
        letter,
        pointValue: letterPoints[letter] || 1,
      });
      tile.tileType = 'normal';
      tile.s        = -q - r;

      hxState.tiles.push(tile);
      hxTileMap.set(hxKey(q, r), tile);
      board.appendChild(tile.element);

      // Hide until the column's stagger delay fires
      tile.element.style.opacity = '0';

      // Spawn from one hex-step above the column's topmost slot
      colMoves.push({ tile, fromQ: q, fromR: r_min - 1, toQ: q, toR: r });
    }

    if (colMoves.length > 0) {
      allPromises.push(
        new Promise(resolve => {
          setTimeout(async () => {
            colMoves.forEach(m => { m.tile.element.style.opacity = '1'; });
            // Stagger tiles within the column top-to-bottom (colMoves is already r_min→r_max)
            await animateTileMovesStaggered(colMoves, REFILL_COL_TILE_STAGGER_MS);
            resolve();
          }, colIdx * REFILL_STAGGER_MS);
        }),
      );
    }
  }

  if (allPromises.length > 0) await Promise.all(allPromises);
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
  playSound('sfxMagic');

  // Dramatic entrance animation for the newly spawned special tile
  const spawnClass = `hx-${type}-spawn`;
  target.element.classList.add(spawnClass);
  target.element.addEventListener('animationend', () => {
    target.element.classList.remove(spawnClass);
  }, { once: true });
}

/* ── Game over ─────────────────────────────────────────────────── */
function triggerGameOver() {
  if (hxState.gameOver) return;
  hxState.gameOver = true;
  hxState.active   = false;

  if (hxPointerCleanup) { hxPointerCleanup(); hxPointerCleanup = null; }
  clearSelection();
  document.body.classList.remove('hx-active');

  // Restore game title
  const titleEl = document.getElementById('game-title');
  if (titleEl) titleEl.textContent = 'ANAGRAMATON';

  // Restore SUBMIT/CLEAR buttons for when the player returns to main mode
  const submitBtn = document.getElementById('submit-word');
  const clearBtn  = document.getElementById('clear-word');
  if (submitBtn) submitBtn.style.display = '';
  if (clearBtn)  clearBtn.style.display  = '';

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
    active:     false, // set to true after intro animation completes
  });
  hxSelected           = [];
  hxPointerDown        = false;
  hxWordCount          = 0;
  hxTileMap            = new Map();
  hxUpdateViewForBoard = null;

  // Clean up previous pointer listeners
  if (hxPointerCleanup) { hxPointerCleanup(); hxPointerCleanup = null; }

  // Remove any leftover overlay
  document.getElementById('hx-gameover-overlay')?.remove();

  hxSvg = document.getElementById('hex-grid');
  if (!hxSvg) return;

  // Wipe the SVG
  hxSvg.innerHTML = '';
  hxLayout = makeLayout();

  injectSvgDefs(hxSvg);
  buildGrid();
  // Ember tiles do NOT spawn at game start — only after milestone words

  document.body.classList.add('hx-active');

  // Change title to reflect Hexacore mode
  const titleEl = document.getElementById('game-title');
  if (titleEl) titleEl.textContent = 'HEXACORE';

  // Hide SUBMIT/CLEAR — Hexacore auto-submits on drag release
  const submitBtn = document.getElementById('submit-word');
  const clearBtn  = document.getElementById('clear-word');
  if (submitBtn) submitBtn.style.display = 'none';
  if (clearBtn)  clearBtn.style.display  = 'none';

  ensureHud();
  updateHud();
  updateScoreDisplay();

  setupPointerEvents();
  playSound('sfxUnlock');
}

export function stopHexacore() {
  hxState.gameOver = true;
  hxState.active   = false;

  if (hxPointerCleanup) { hxPointerCleanup(); hxPointerCleanup = null; }

  document.getElementById('hx-gameover-overlay')?.remove();
  removeHud();

  document.body.classList.remove('hx-active');

  const titleEl = document.getElementById('game-title');
  if (titleEl) titleEl.textContent = 'ANAGRAMATON';

  const submitBtn = document.getElementById('submit-word');
  const clearBtn  = document.getElementById('clear-word');
  if (submitBtn) submitBtn.style.removeProperty('display');
  if (clearBtn)  clearBtn.style.removeProperty('display');
}

/* ── Splash screen wiring (on module load) ─────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('splash-hexacore-btn')?.addEventListener('click', () => {
    document.getElementById('splash-screen')?.classList.add('hidden');
    startHexacore();
  });
});

/* ── TODO: Hexacore events still missing a dedicated sound ─────────
 *
 * The following game events have no audio feedback yet. New audio
 * assets will need to be recorded or sourced and wired in.
 *
 * Event                          | Notes                                                        | Recommended length
 * -------------------------------|--------------------------------------------------------------|--------------------
 * Tile deselected / backtrack    | Player drags back to deselect last tile in chain             | ~0.05 s (very short tick/click)
 * Tile consumed / pop-out        | Each tile popping out during word consumption                | ~0.1 s per tile (light pop or burst; could stagger with --tile-idx)
 * Ember tile advancing           | Ember moves toward the bottom — danger cue                   | ~0.3 s (low rumble or crackle)
 * Ember tile spawning            | Distinct from sfxMagic; ember has its own CSS spawn animation | ~0.4 s (fire whoosh)
 * Prism tile spawning            | Currently shares sfxMagic — could be a distinct sparkle      | ~0.4 s (crystal chime)
 * Rune tile spawning             | Currently shares sfxMagic — could be a distinct mystical hum | ~0.4 s (arcane hum)
 * Gravity cascade                | Tiles falling after words are consumed                       | ~0.2 s (soft cascade whoosh)
 * Refill tiles dropping in       | New tiles appearing per-column from above                    | ~0.15 s (light tile-drop thud)
 * Game over                      | triggerGameOver() / showGameOver() called                    | ~1.5–2 s (dramatic sting or thud)
 * Score milestone / high word    | Optional feedback for scoring above a threshold             | ~0.5 s (ascending chime)
 * Leaderboard score submitted    | handleSubmitScore() success path                             | ~0.5 s (fanfare or confirmation chime)
 * Intro animation completes      | End of animateGridIntro() when hxState.active = true         | ~0.3 s (soft ready ding)
 *
 * ───────────────────────────────────────────────────────────────── */
