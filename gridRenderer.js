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
  { offset: '0%', color: 'hsl(210, 20%, 25%)' },
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
  { offset: '0%', color: 'rgba(255, 255, 255, 0.4)' },
  { offset: '60%', color: 'rgba(255, 255, 255, 0.1)' },
  { offset: '100%', color: 'rgba(255, 255, 255, 0)' }
];

for (const { offset, color } of shineStops) {
  const stop = document.createElementNS(SVG_NS, 'stop');
  stop.setAttribute('offset', offset);
  stop.setAttribute('stop-color', color);
  shineGradient.appendChild(stop);
}
defs.appendChild(shineGradient);


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

// Create SVG path string (outer hex → inner hex reversed to make a hole)
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

const poly = document.createElementNS(SVG_NS, 'polygon');
poly.setAttribute('points', corners);
poly.setAttribute('fill', 'url(#tileShine)'); // shiny transparent fill
poly.setAttribute('stroke', 'rgba(255, 255, 255, 0.4)');
poly.setAttribute('stroke-width', '2');
poly.setAttribute('class', 'hex-tile');
poly.setAttribute('data-key', key);
poly.style.cursor = 'pointer';
poly.setAttribute('id', key); // <-- add this


// Main letter (center of tile)
const tLetter = document.createElementNS(SVG_NS, 'text');
tLetter.setAttribute('x', center.x);
tLetter.setAttribute('y', center.y);
tLetter.setAttribute('text-anchor', 'middle');
tLetter.setAttribute('fill', '#ffffff');
tLetter.setAttribute('font-size', '28');
tLetter.setAttribute('font-weight', 'bold');
tLetter.setAttribute('font-family', FONT_FAMILY);
tLetter.setAttribute('pointer-events', 'none');
tLetter.textContent = L;

// Point value (beneath the letter)
const tPoint = document.createElementNS(SVG_NS, 'text');
tPoint.setAttribute('x', center.x);
tPoint.setAttribute('y', center.y + HEX_RADIUS * 0.6);
tPoint.setAttribute('text-anchor', 'middle');
tPoint.setAttribute('fill', '#ffffff');
tPoint.setAttribute('font-size', '18');
tPoint.setAttribute('font-weight', 'bold');
tPoint.setAttribute('font-family', FONT_FAMILY);
tPoint.setAttribute('pointer-events', 'none');
tPoint.textContent = pointValue;

      const tile = {
        letter: L,
        point: pointValue,
        q, r, s,
        used: false,
        element: poly,
        textLetter: tLetter,
        textPoint: tPoint
      };

      poly.addEventListener('click', () => handleTileClick(tile));

      tileElements.push(tile);
      

const g = document.createElementNS(SVG_NS, 'g');
g.append(outline, poly, tLetter, tPoint);

      fragment.appendChild(g);
    }
  }

  svg.appendChild(fragment);
}
