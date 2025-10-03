function countOverlap(grid, path, word) {
  let hits = 0;
  for (let i = 0; i < path.length; i++) {
    const { key } = path[i];
    if (grid[key] && grid[key] === word[i]) hits++;
  }
  return hits;
}

function indexByKey(path) {
  const m = new Map();
  path.forEach((p, i) => m.set(p.key, i));
  return m;
}

// no imports
export { countOverlap, indexByKey };
