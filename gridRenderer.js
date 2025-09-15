import {
  letterPoints,
  HEX_RADIUS,
  FONT_COLOR,
  FONT_FAMILY,
  SVG_NS
} from './constants.js';

import { Point, Hex, Layout }        from './gridLayout.js';
import { OrientationPointy, hexKey } from './gridOrientation.js';

const TILE_SCALE = 0.92;
const TILE_SPACING = 1.25; // try 1.1 to 1.3 for subtle to wide gaps



export function renderGrid(grid, svg, tileElements, handleTileClick, gridRadius) {
  /* 1. clear */
  svg.innerHTML = '';
  tileElements.length = 0;

  /* 1a. Inject gradient definitions */
  const defs = document.createElementNS(SVG_NS, 'defs');

  // --- Tile Gradient (optional background fill) ---
  const gradient = document.createElementNS(SVG_NS, 'linearGradient');
  gradient.setAttribute('id', 'tileGradient');
  gradient.setAttribute('x1', '0%');
  gradient.setAttribute('y1', '0%');
  gradient.setAttribute('x2', '0%');
  gradient.setAttribute('y2', '100%');

  const stops = [
    { offset: '0%',   color: 'hsl(210, 20%, 25%)' },
    { offset: '100%', color: 'hsl(210, 20%, 35%)' }
  ];
  for (const { offset, color } of stops) {
    const stop = document.createElementNS(SVG_NS, 'stop');
    stop.setAttribute('offset', offset);
    stop.setAttribute('stop-color', color);
    gradient.appendChild(stop);
  }
  defs.appendChild(gradient);

  // --- Shine Gradient (soft highlight) ---
  const shineGradient = document.createElementNS(SVG_NS, 'radialGradient');
  shineGradient.setAttribute('id', 'tileShine');
  shineGradient.setAttribute('cx', '50%');
  shineGradient.setAttribute('cy', '30%');
  shineGradient.setAttribute('r', '80%');

  const shineStops = [
    { offset: '0%',   color: 'rgba(255, 255, 255, 0.4)' },
    { offset: '60%',  color: 'rgba(255, 255, 255, 0.1)' },
    { offset: '100%', color: 'rgba(255, 255, 255, 0)' }
  ];
  for (const { offset, color } of shineStops) {
    const stop = document.createElementNS(SVG_NS, 'stop');
    stop.setAttribute('offset', offset);
    stop.setAttribute('stop-color', color);
    shineGradient.appendChild(stop);
  }
  defs.appendChild(shineGradient);


// --- Hover glow filter (used on hover) ---
const glow = document.createElementNS(SVG_NS, 'filter');
glow.setAttribute('id', 'hoverGlow');
glow.setAttribute('filterUnits', 'objectBoundingBox');
glow.setAttribute('x', '-30%');
glow.setAttribute('y', '-30%');
glow.setAttribute('width', '160%');
glow.setAttribute('height', '160%');

const blur = document.createElementNS(SVG_NS, 'feGaussianBlur');
blur.setAttribute('in', 'SourceGraphic');
blur.setAttribute('stdDeviation', '3');
blur.setAttribute('result', 'blur');
glow.appendChild(blur);

const merge = document.createElementNS(SVG_NS, 'feMerge');
const m1 = document.createElementNS(SVG_NS, 'feMergeNode'); m1.setAttribute('in', 'blur');
const m2 = document.createElementNS(SVG_NS, 'feMergeNode'); m2.setAttribute('in', 'SourceGraphic');
merge.append(m1, m2);
glow.appendChild(merge);

defs.appendChild(glow);





  // Append all defs
  svg.appendChild(defs);

  const layout = new Layout(
    OrientationPointy,
    new Point(HEX_RADIUS * TILE_SPACING, HEX_RADIUS * TILE_SPACING),
    new Point(500, 500)
  );

  const fragment = document.createDocumentFragment();

  /* 3. iterate axial coords */
  for (let q = -gridRadius; q <= gridRadius; q++) {
    for (let r = -gridRadius; r <= gridRadius; r++) {
      const s = -q - r;
      if (Math.abs(s) > gridRadius) continue;

      const key        = hexKey(q, r);
      const letterData = grid[key];
      if (!letterData) continue;

      const letter     = typeof letterData === 'object' ? letterData.letter : letterData;
      const L          = letter.toUpperCase();
      const pointValue = letterPoints[L] || 1;

      const hex    = new Hex(q, r);
      const center = layout.hexToPixel(hex);

      // === Outline ring using path with hole ===
      const outerCorners = layout.polygonCorners(hex, HEX_RADIUS + 5);
      const innerCorners = layout.polygonCorners(hex, HEX_RADIUS);
      const pathData = [
        'M', outerCorners[0].x, outerCorners[0].y,
        ...outerCorners.slice(1).map(p => `L ${p.x} ${p.y}`),
        'Z',
        'M', innerCorners[0].x, innerCorners[0].y,
        ...innerCorners.slice(1).map(p => `L ${p.x} ${p.y}`),
        'Z'
      ].join(' ');
      const outline = document.createElementNS(SVG_NS, 'path');
      outline.setAttribute('d', pathData);
      outline.setAttribute('fill', '#888'); // outline color
      outline.setAttribute('fill-rule', 'evenodd');
      outline.setAttribute('stroke', '#444');
      outline.setAttribute('stroke-width', '1');

      // === Main hex tile ===
      const rScaled = HEX_RADIUS;
      const corners = layout.polygonCorners(hex, rScaled)
        .map(p => `${p.x},${p.y}`)
        .join(' ');
      // Main hex tile (polygon)
      const poly = document.createElementNS(SVG_NS, 'polygon');
      poly.setAttribute('points', corners);
      poly.setAttribute('class', 'hex-tile'); // 👈 only a class
      poly.setAttribute('data-key', key);
      poly.style.cursor = 'pointer';
      poly.setAttribute('id', key);


      // Main letter (center of tile)
      const tLetter = document.createElementNS(SVG_NS, 'text');
      tLetter.setAttribute('x', center.x);
      tLetter.setAttribute('y', center.y);
      tLetter.setAttribute('text-anchor', 'middle');
      tLetter.setAttribute('font-size', '28');
      tLetter.setAttribute('font-weight', 'bold');
      tLetter.setAttribute('font-family', FONT_FAMILY);
      tLetter.setAttribute('pointer-events', 'none');
      tLetter.setAttribute('class', 'tile-letter');   // 👈 base class
      tLetter.textContent = L;

      // Point value (beneath the letter)
      const tPoint = document.createElementNS(SVG_NS, 'text');
      tPoint.setAttribute('x', center.x);
      tPoint.setAttribute('y', center.y + HEX_RADIUS * 0.6);
      tPoint.setAttribute('text-anchor', 'middle');
      tPoint.setAttribute('font-size', '18');
      tPoint.setAttribute('font-weight', 'bold');
      tPoint.setAttribute('font-family', FONT_FAMILY);
      tPoint.setAttribute('pointer-events', 'none');
      tPoint.setAttribute('class', 'tile-point');    // 👈 base class
      tPoint.textContent = pointValue;

      // === Group wrapper (this gets .selected) ===
      const g = document.createElementNS(SVG_NS, 'g');
      g.append(outline, poly, tLetter, tPoint);



// mark the tile group so CSS can target it
g.classList.add('tile');

// --- center pulse circle (one-shot on hover) ---
const pulse = document.createElementNS(SVG_NS, 'circle');
pulse.setAttribute('class', 'pulse');
pulse.setAttribute('cx', center.x);
pulse.setAttribute('cy', center.y);
pulse.setAttribute('r', '1');
pulse.setAttribute('fill', 'white');
pulse.setAttribute('opacity', '0');

// --- orbiting spark: a group anchored at center that rotates via CSS ---
const orbit = document.createElementNS(SVG_NS, 'g');
orbit.setAttribute('class', 'orbit');
// anchor orbit group at the tile center; CSS rotates it
orbit.setAttribute('transform', `translate(${center.x} ${center.y})`);

const spark = document.createElementNS(SVG_NS, 'circle');
// offset spark slightly to the right so it traces a ring when the group rotates
spark.setAttribute('cx', String(HEX_RADIUS * 0.92));
spark.setAttribute('cy', '0');
spark.setAttribute('r', '2.2');
spark.setAttribute('fill', '#fff');
spark.setAttribute('filter', 'url(#hoverGlow)');
spark.setAttribute('opacity', '0.9');
spark.setAttribute('class', 'spark');

orbit.appendChild(spark);

// insert effects ABOVE the polygon but BELOW the text
g.insertBefore(pulse, tLetter);
g.insertBefore(orbit, tLetter);

// --- Hover listeners (toggle glow, pulse, and orbit speed ramp) ---
g.addEventListener('mouseenter', () => {
  g.classList.add('hover');

  // restart the center pulse animation on each enter
  pulse.style.animation = 'none';
  void pulse.getBBox(); // force reflow so animation restarts
  pulse.style.animation = '';

  // handle orbit acceleration
  orbit.classList.remove('spindown', 'steady'); // clean exit state if any
  orbit.classList.add('spinup');

  // once spinup finishes, hand off to steady rotation
  const onSpinupEnd = () => {
    orbit.classList.remove('spinup');
    orbit.classList.add('steady');
    orbit.removeEventListener('animationend', onSpinupEnd);
  };
  orbit.addEventListener('animationend', onSpinupEnd, { once: true });
});

g.addEventListener('mouseleave', () => {
  g.classList.remove('hover');

  // trigger orbit wind-down
  orbit.classList.remove('spinup', 'steady');
  orbit.classList.add('spindown');

  // after spin-down ends, clear back to base state
  orbit.addEventListener('animationend', () => {
    orbit.classList.remove('spindown');
  }, { once: true });
});

// --- ADD this new part (don’t replace hover code) ---
g.addEventListener('click', () => {
  g.classList.toggle('selected');
});


      // Tile object points to GROUP
      const tile = {
        letter: L,
        point: pointValue,
        q, r, s,
        used: false,
        element: g,          // group instead of polygon
        textLetter: tLetter,
        textPoint: tPoint
      };

      // Click on group (whole tile interactive)
      g.addEventListener('click', () => handleTileClick(tile));

      // Track and append
      tileElements.push(tile);
      fragment.appendChild(g);
    }
  }



  
  // ✅ Append once, after loops
  svg.appendChild(fragment);
}

