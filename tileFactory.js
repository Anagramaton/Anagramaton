// tileFactory.js
import { SVG_NS, HEX_RADIUS, FONT_FAMILY } from './constants.js';

export function createTile({
  hex,                 // Hex instance (q,r,s inside it)
  layout,              // Layout instance for pixel coords & corners
  key,                 // unique key (axial)
  letter,              // uppercase letter
  pointValue,          // numeric score
}) {
  const center = layout.hexToPixel(hex);

  // --- Outline ring (path with hole) ---
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
  outline.setAttribute('fill', '#888');
  outline.setAttribute('fill-rule', 'evenodd');
  outline.setAttribute('stroke', '#444');
  outline.setAttribute('stroke-width', '1');

  // --- Main hex polygon ---
  const pts = layout.polygonCorners(hex, HEX_RADIUS).map(p => `${p.x},${p.y}`).join(' ');
  const poly = document.createElementNS(SVG_NS, 'polygon');
  poly.setAttribute('points', pts);
  poly.setAttribute('class', 'hex-tile');
  poly.setAttribute('data-key', key);
  poly.setAttribute('id', key);
  

  // --- Letter ---
  const tLetter = document.createElementNS(SVG_NS, 'text');
  tLetter.setAttribute('x', center.x);
  tLetter.setAttribute('y', center.y);
  tLetter.setAttribute('text-anchor', 'middle');
  tLetter.setAttribute('font-size', '28');
  tLetter.setAttribute('font-weight', 'bold');
  tLetter.setAttribute('font-family', FONT_FAMILY);
  tLetter.setAttribute('pointer-events', 'none');
  tLetter.setAttribute('class', 'tile-letter');
  tLetter.textContent = letter;

  // --- Point value ---
  const tPoint = document.createElementNS(SVG_NS, 'text');
  tPoint.setAttribute('x', center.x);
  tPoint.setAttribute('y', center.y + HEX_RADIUS * 0.6);
  tPoint.setAttribute('text-anchor', 'middle');
  tPoint.setAttribute('font-size', '18');
  tPoint.setAttribute('font-weight', 'bold');
  tPoint.setAttribute('font-family', FONT_FAMILY);
  tPoint.setAttribute('pointer-events', 'none');
  tPoint.setAttribute('class', 'tile-point');
  tPoint.textContent = pointValue;

  // --- Optional spark only (keep hoverGlow support) ---
  const spark = document.createElementNS(SVG_NS, 'circle');
  spark.setAttribute('cx', center.x + HEX_RADIUS * 0.4);
  spark.setAttribute('cy', center.y - HEX_RADIUS * 0.4);
  spark.setAttribute('r', '2.2');
  spark.setAttribute('fill', '#fff');
  spark.setAttribute('filter', 'url(#hoverGlow)');
  spark.setAttribute('opacity', '0.9');
  spark.setAttribute('class', 'spark');

const g = document.createElementNS(SVG_NS, 'g');
g.classList.add('tile');
g.append(outline, poly, spark, tLetter, tPoint);



  // --- Public tile object & helpers ---
  const tile = {
    letter,
    point: pointValue,
    q: hex.q, r: hex.r, s: -hex.q - hex.r,
    used: false,
    element: g,
    textLetter: tLetter,
    textPoint: tPoint,

  setSelected(val) {
    const on = !!val;
    g.classList.toggle('selected', on);
    poly.classList.toggle('selected', on);
    tLetter.classList.toggle('selected', on);
    tPoint.classList.toggle('selected', on);
  },
  setUsed(val) {
    poly.used = !!val;
    g.classList.toggle('used', !!val);
  },
    setEnabled(val) {
      const on = val !== false;
      g.style.pointerEvents = on ? 'auto' : 'none';
      g.classList.toggle('disabled', !on);
    },
    updateLetter(newLetter, newPoint = null) {
      poly.letter = newLetter.toUpperCase();
      tLetter.textContent = tile.letter;
      if (newPoint != null) {
        poly.point = newPoint;
        tPoint.textContent = newPoint;
      }
    }
  };




  return tile;
}
