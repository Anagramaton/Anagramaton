// — Layout —
export const GRID_RADIUS   = 4;           
export const HEX_RADIUS    = 35;          
export const SVG_NS        = 'http://www.w3.org/2000/svg';

// — Colours —
export const DEFAULT_TILE_COLOR = '#e0e0e0';
export const STROKE_COLOR       = '#555';
export const FONT_COLOR         = '#1a1a1a';

// — Typography —
export const FONT_FAMILY = 'Segoe UI, sans-serif';

// — Scoring —
export const letterPoints = {
  A: 1, B: 3, C: 3, D: 2, E: 1,
  F: 4, G: 2, H: 4, I: 1, J: 8,
  K: 5, L: 1, M: 3, N: 1, O: 1,
  P: 3, Q: 10, R: 1, S: 1, T: 1,
  U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
};

export const letterFrequencies = [
  'U','U','U','U',
  'D','D','D','D',
  'G','G','G','G','B','B','B','B','C','C','C','C','M','M','M','M',
  'P','P','P','P','H','H','H','H','V','V','V','V',
  'W','W','W','W','Y','Y','Y','Y','K','K','K','K',
  'X','X','X','J','J','J','Z','Z','Z','F','F','F',
  'Q','Q'
];

// — Scoring Multipliers —
export const reuseMultipliers = { 2: 2, 3: 4 }; // 2nd use = x2, 3rd+ = x4
export const anagramMultiplier = 5;
export const lengthMultipliers = {
  5: 3, 6: 4, 7: 5, 8: 6, 9: 7, 10: 10
};
