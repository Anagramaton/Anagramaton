// gridOrientation.js
const SQRT3 = Math.sqrt(3);

export const OrientationPointy = {
  f0: SQRT3,
  f1: SQRT3 / 2,
  f2: 0,
  f3: 1.5,
  start_angle: 0.5,
};

export const hexKey = (q, r) => `${q},${r}`;
