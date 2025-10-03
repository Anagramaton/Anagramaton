import { shuffledArray } from './utils.js';


const ADJ_DIRS = [
  [1, 0], [0, 1], [-1, 1],
  [-1, 0], [0, -1], [1, -1]
];

const MAX_ATTEMPTS = 150;

const hexKey = (q, r) => `${q},${r}`;

function randomFrom(arr) {
  const index = Math.floor(Math.random() * arr.length);
  return arr[index];
}


function getAllCoords(radius) {
  const coords = [];
  for (let q = -radius; q <= radius; q++) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min(radius, -q + radius);
    for (let r = rMin; r <= rMax; r++) {
      coords.push({ q, r });
    }
  }
  return coords;
}

function isValidCoord(q, r, radius) {
  return (
    Math.abs(q) <= radius &&
    Math.abs(r) <= radius &&
    Math.abs(q + r) <= radius
  );
}


export { ADJ_DIRS, hexKey, getAllCoords, isValidCoord };
