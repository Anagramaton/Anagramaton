// svgKit.js
import { SVG_NS } from './constants.js';

/**
 * Build (or refresh) gradients/filters in <defs>.
 * Returns the ids it used, so other modules can reference them safely.
 *
 * Options:
 *  - idPrefix: string to avoid id collisions if multiple boards exist
 *  - palette: { tileTop, tileBottom } HSL/hex strings for the tile fill gradient
 */
export function buildDefs(svg, {
  idPrefix = '',
} = {}) {

  ensureSVG(svg);

  const defs = getOrCreateDefs(svg);

  const ids = {
    hoverGlow: `${idPrefix}hoverGlow`,
  };


  

  // ---- Hover glow filter ----
  upsert(defs, 'filter', ids.hoverGlow, (filter) => {
    filter.setAttribute('filterUnits', 'objectBoundingBox');
    filter.setAttribute('x', '-30%');
    filter.setAttribute('y', '-30%');
    filter.setAttribute('width',  '160%');
    filter.setAttribute('height', '160%');

    clearChildren(filter);

    const blur = document.createElementNS(SVG_NS, 'feGaussianBlur');
    blur.setAttribute('in', 'SourceGraphic');
    blur.setAttribute('stdDeviation', '3');
    blur.setAttribute('result', 'blur');

    const merge = document.createElementNS(SVG_NS, 'feMerge');
    const m1 = document.createElementNS(SVG_NS, 'feMergeNode'); m1.setAttribute('in', 'blur');
    const m2 = document.createElementNS(SVG_NS, 'feMergeNode'); m2.setAttribute('in', 'SourceGraphic');
    merge.append(m1, m2);

    filter.append(blur, merge);
  });

  return ids;
}

/**
 * Set base SVG attributes and provide a helper to fit the viewBox around a <g> board on small screens.
 * Usage:
 *   const { updateViewForBoard } = initSvg(svg);
 *   updateViewForBoard(boardG); // call once after you append the board
 */
export function initSvg(
  svg,
  {
    preserveAspectRatio = 'xMidYMid meet',
    defaultViewBox      = '0 0 1000 1000',
    mobileBreakpoint    = 768,
    pad                 = 12,
  } = {}
) {
  ensureSVG(svg);

  svg.setAttribute('preserveAspectRatio', preserveAspectRatio);
  svg.setAttribute('viewBox', defaultViewBox);

  const updateViewForBoard = (boardG) => {
    if (!(boardG instanceof SVGGElement)) return;

    const isMobile = (window.innerWidth || 0) <= mobileBreakpoint;
    if (isMobile) {
      const b = boardG.getBBox();
      const x = b.x - pad;
      const y = b.y - pad;
      const w = b.width  + pad * 2;
      const h = b.height + pad * 2;
      svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
console.log('Updated SVG ViewBox:', svg.getAttribute('viewBox')); // DEBUG
    } else {
      svg.setAttribute('viewBox', defaultViewBox);
    }
  };

  // add listeners once per svg
  if (!svg.__svgKitResizeBound) {
    const onResize = () => {
      // Try to find a child <g id="board"> by convention; if not found, skip.
      const boardG = svg.querySelector('g#board');
      if (boardG) updateViewForBoard(boardG);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    svg.__svgKitResizeBound = true;
  }

  return { updateViewForBoard };
}

/* ----------------- helpers ----------------- */

function ensureSVG(svg) {
  if (!svg || svg.namespaceURI !== SVG_NS) {
    throw new Error('svgKit: provided element is not an SVG element with the correct namespace.');
  }
}

function getOrCreateDefs(svg) {
  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(SVG_NS, 'defs');
    // Insert at top so ids are available to following nodes.
    svg.insertBefore(defs, svg.firstChild);
  }
  return defs;
}

function upsert(parent, tag, id, configurator) {
  let el = parent.querySelector(`${tag}#${cssEscape(id)}`);
  if (!el) {
    el = document.createElementNS(SVG_NS, tag);
    el.setAttribute('id', id);
    parent.appendChild(el);
  }
  configurator(el);
  return el;
}

function makeStop(offset, color) {
  const stop = document.createElementNS(SVG_NS, 'stop');
  stop.setAttribute('offset', offset);
  stop.setAttribute('stop-color', color);
  return stop;
}

function clearChildren(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

// Minimal CSS escape for ids inside a querySelector.
// For broad compatibility you can use a more complete polyfill later.
function cssEscape(id) {
  return id.replace(/([ #.;?+*~':"!^$[\]()=>|/@])/g, '\\$1');
}
