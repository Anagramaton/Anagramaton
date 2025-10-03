// ▸ Create a hexagon's corner points as a polygon string for SVG
export function createHexPoints(cx, cy, r) {
  if (typeof cx !== 'number' || typeof cy !== 'number' || typeof r !== 'number') {
    throw new Error('Invalid arguments passed to createHexPoints');
  }

  const points = [];
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI / 3 * i;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return points.join(' ');
}

// ▸ Check if two hex tiles are neighbors using axial coordinates
export function areAxialNeighbors(a, b) {
  const deltaQ = Math.abs(a.q - b.q);
  const deltaR = Math.abs(a.r - b.r);
  const deltaS = Math.abs(a.s - b.s);
  return deltaQ + deltaR + deltaS === 2;
}

// ▸ Shuffle array (Fisher–Yates, non-mutating)
export function shuffledArray(arr = []) {
  const copy = Array.isArray(arr) ? arr.slice() : Array.from(arr);
  for (let i = copy.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
