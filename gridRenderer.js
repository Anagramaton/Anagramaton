// gridRenderer.js
import {
  letterPoints,
  HEX_RADIUS,
  SVG_NS,
} from './constants.js';

import { Point, Hex, Layout }        from './gridLayout.js';
import { OrientationPointy, hexKey } from './gridOrientation.js';

import { createTile }           from './tileFactory.js';
import { buildDefs, initSvg }   from './svgKit.js';

const TILE_SPACING = 1.25; // tweak 1.1–1.3 for gap size

/**
 * Render the hex grid into an SVG.
 * @param {Object}   grid            - map of axial key -> { letter } or 'A'
 * @param {SVGSVGElement} svg        - target <svg>
 * @param {Array}    tileElements    - output array of tile objects (mutated)
 * @param {number}   gridRadius      - axial radius (q+r+s==0 constraint)
 * @param {Object}   options
 * @param {string}   [options.idPrefix=''] - prefix to avoid defs id collisions if multiple boards mount
 * @param {string}   [options.defaultViewBox='0 0 1000 1000']
 */
export function renderGrid(
  grid,
  svg,
  tileElements,
  gridRadius,
  {
    idPrefix = '',
    defaultViewBox = '0 0 1000 1000',
  } = {}
) {

  // 1) Clear target and output array
svg.innerHTML = '';
tileElements.length = 0;
console.log('Cleared existing SVG tiles and reset tileElements array.'); // DEBUG

  // 2) Initialize base SVG behavior (aspect ratio + responsive viewBox helper)
  const { updateViewForBoard } = initSvg(svg, {
    preserveAspectRatio: 'xMidYMid meet',
    defaultViewBox,
    mobileBreakpoint: 768,
    pad: 12,
  });

  // 3) Inject / refresh gradients & filters in <defs>
  const ids = buildDefs(svg, { idPrefix });

  // 4) Set up layout (pointy orientation, scaled by TILE_SPACING)
  const layout = new Layout(
    OrientationPointy,
    new Point(HEX_RADIUS * TILE_SPACING, HEX_RADIUS * TILE_SPACING),
    new Point(500, 500) // origin center-ish in the default viewBox
  );

  // 5) Build one <g id="board"> and append tiles into it
  const fragment = document.createDocumentFragment();
  const board = document.createElementNS(SVG_NS, 'g');
  board.setAttribute('id', 'board');

  for (let q = -gridRadius; q <= gridRadius; q++) {
    for (let r = -gridRadius; r <= gridRadius; r++) {
      const s = -q - r;
      if (Math.abs(s) > gridRadius) continue;

      const key = hexKey(q, r);
      const data = grid[key];
      if (!data) continue;

      const L = (typeof data === 'object' ? data.letter : data).toUpperCase();
      const pointValue = letterPoints[L] || 1;

      const hex = new Hex(q, r);

      // Create one interactive tile group via the factory
      const tile = createTile({
        hex,
        layout,
        key,
        letter: L,
        pointValue,
      });


      const poly = tile.element.querySelector('polygon');
      const spark = tile.element.querySelector('.spark');

      tileElements.push(tile);
 board.appendChild(tile.element);
console.log(`Tile Added:`, {
  letter: tile.letter,
  key: tile.q + ',' + tile.r, // Axial coordinates of the tile
  element: tile.element,
}); // DEBUG
    }
  }

  fragment.appendChild(board);
  svg.appendChild(fragment);

  // 6) Fit the SVG viewBox around the board on small screens
  requestAnimationFrame(() => {
  updateViewForBoard(board);
  console.log('Updated ViewBox:', svg.getAttribute('viewBox')); // DEBUG
});
}
