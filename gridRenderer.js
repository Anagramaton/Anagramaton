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

const TILE_SPACING = 1.25; 

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

  
svg.innerHTML = '';
tileElements.length = 0;


  
  const { updateViewForBoard } = initSvg(svg, {
    preserveAspectRatio: 'xMidYMid meet',
    defaultViewBox,
    mobileBreakpoint: 768,
    pad: 12,
  });

  
  const ids = buildDefs(svg, { idPrefix });

  
  const layout = new Layout(
    OrientationPointy,
    new Point(HEX_RADIUS * TILE_SPACING, HEX_RADIUS * TILE_SPACING),
    new Point(500, 500) // origin center-ish in the default viewBox
  );

  
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
    }
  }

  fragment.appendChild(board);
  svg.appendChild(fragment);

  
  requestAnimationFrame(() => {
  updateViewForBoard(board);
});
}
