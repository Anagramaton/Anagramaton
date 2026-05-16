import { ADJ_DIRS, getAllCoords, hexKey, isValidCoord } from './gridCoords.js';
import { chooseClearanceRankedWords, pickDeterministicLengthWord } from './hexacore-wordpool.js';
import { fillEmptyTiles, placeWords } from './hexacore-placement.js';
import { simulateMaxScoreWithLookahead } from './hexacore-simulation.js';

const RARE = new Set(['Q', 'Z', 'X', 'J']);

export function fnv1a32(input) {
  let h = 2166136261;
  const text = String(input ?? '');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mkSeededRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 0x100000000;
}

function getQuadrant(q, r) {
  if (q >= 2 && r <= -2) return 'upper-right';
  if (q >= 2 && r >= 2) return 'lower-right';
  if (q <= -2 && r <= -2) return 'upper-left';
  if (q <= -2 && r >= 2) return 'lower-left';
  if (r <= -2) return 'top';
  if (r >= 2) return 'bottom';
  return 'center';
}

function applyGravity(simGrid, radius) {
  for (let q = -radius; q <= radius; q++) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min(radius, -q + radius);
    const positions = [];
    for (let r = rMin; r <= rMax; r++) positions.push({ r, key: hexKey(q, r) });

    const tiles = positions.filter(p => simGrid[p.key]).map(p => simGrid[p.key]);
    if (tiles.length === positions.length) continue;

    positions.forEach(p => delete simGrid[p.key]);
    const offset = positions.length - tiles.length;
    tiles.forEach((tile, idx) => {
      simGrid[positions[offset + idx].key] = tile;
    });
  }
}

export function findIsolatedClusters(tiles, radius) {
  const tileMap = new Map(tiles.map(t => [t.key, t]));
  const visited = new Set();
  const clusters = [];

  for (const tile of tiles) {
    if (visited.has(tile.key)) continue;

    const queue = [tile];
    const cluster = [];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || visited.has(current.key)) continue;

      visited.add(current.key);
      cluster.push(current);

      for (const [dq, dr] of ADJ_DIRS) {
        const nq = current.q + dq;
        const nr = current.r + dr;
        if (!isValidCoord(nq, nr, radius)) continue;
        const nkey = hexKey(nq, nr);
        if (visited.has(nkey)) continue;
        const neighbor = tileMap.get(nkey);
        if (neighbor) queue.push(neighbor);
      }
    }

    if (cluster.length > 0) clusters.push(cluster);
  }

  return clusters;
}

export function analyzeUnreachableTiles(grid, simData, specialTiles, radius) {
  const remainingTiles = Array.isArray(simData?.remainingTiles)
    ? simData.remainingTiles
    : [];

  const byQuadrant = {};
  const byLetterFrequency = {};
  const commonPatterns = [];

  for (const tile of remainingTiles) {
    const quadrant = getQuadrant(tile.q, tile.r);
    if (!byQuadrant[quadrant]) byQuadrant[quadrant] = [];
    byQuadrant[quadrant].push(tile);

    byLetterFrequency[tile.letter] = (byLetterFrequency[tile.letter] || 0) + 1;
    if (RARE.has(tile.letter)) {
      commonPatterns.push(`Rare letter ${tile.letter} at (${tile.q}, ${tile.r})`);
    }
  }

  const isolatedClusters = findIsolatedClusters(remainingTiles, radius)
    .filter(cluster => cluster.length > 0);

  return {
    totalUnreachable: remainingTiles.length,
    byQuadrant,
    byLetterFrequency,
    isolatedClusters,
    commonPatterns,
  };
}

export function generateBoardAttempt(rng, radius, constraints = {}) {
  const words = chooseClearanceRankedWords(rng, constraints, 8);
  const { grid, placements } = placeWords(words, rng, radius, constraints);
  const fillStats = fillEmptyTiles(grid, rng, radius, constraints);
  return { grid, placements, fillStats };
}

function snapshotConstraints(constraints) {
  return {
    minVerticalWords: constraints.minVerticalWords,
    avoidRareLetterClusters: constraints.avoidRareLetterClusters,
    requireBigramDensity: constraints.requireBigramDensity,
    maxRareLetters: constraints.maxRareLetters,
    avoidQuadrants: [...constraints.avoidQuadrants],
  };
}

function buildColumnFallbackBoard(seed, radius, constraints, buildSpecialTiles, attemptsUsed = 0) {
  const rng = mkSeededRng((seed + 0x9e3779b9) >>> 0);
  const grid = {};
  const placements = [];

  for (let q = -radius; q <= radius; q++) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min(radius, -q + radius);
    const len = (rMax - rMin + 1);

    const word = pickDeterministicLengthWord(len, rng, constraints)
      || 'E'.repeat(len);

    const path = [];
    for (let r = rMin; r <= rMax; r++) {
      const idx = r - rMin;
      const key = hexKey(q, r);
      grid[key] = word[idx] || 'E';
      path.push({ q, r, key });
    }

    placements.push({ word, path, orientation: 'vertical' });
  }

  const specialsRng = mkSeededRng((seed + 0x85ebca6b) >>> 0);
  const specialTiles = typeof buildSpecialTiles === 'function'
    ? (buildSpecialTiles({ grid, placements, rng: specialsRng }) || [])
    : [];

  // Explicit proof-path: clear each vertical column from edge to center.
  const orderedPlacements = placements
    .slice()
    .sort((a, b) => Math.abs(b.path[0].q) - Math.abs(a.path[0].q));

  const simGrid = {};
  for (const [key, letter] of Object.entries(grid)) {
    simGrid[key] = { letter, special: null };
  }

  for (const s of specialTiles) {
    const key = hexKey(s.q, s.r);
    if (simGrid[key]) simGrid[key].special = s.type;
  }

  const solutionPath = [];
  for (const p of orderedPlacements) {
    if (!p.path.every(cell => simGrid[cell.key])) continue;
    solutionPath.push(p.word);
    p.path.forEach(cell => delete simGrid[cell.key]);
    applyGravity(simGrid, radius);
  }

  const totalTiles = getAllCoords(radius).length;
  const tilesRemaining = Object.keys(simGrid).length;

  return {
    grid,
    placements,
    specialTiles,
    metadata: {
      attempts: attemptsUsed,
      fallbackUsed: true,
      fullyCleared: tilesRemaining === 0,
      tilesRemaining,
      tilesCleared: totalTiles - tilesRemaining,
      clearancePercent: totalTiles > 0 ? Math.round(((totalTiles - tilesRemaining) / totalTiles) * 1000) / 10 : 0,
      solutionPath,
      optimalMoves: solutionPath.length,
      constraints: snapshotConstraints(constraints),
    },
  };
}

export function generateGuaranteedFullClearanceBoard({
  date,
  maxAttempts = 100,
  radius,
  buildSpecialTiles,
} = {}) {
  const seed = fnv1a32(String(date));
  const constraints = {
    minVerticalWords: 3,
    avoidRareLetterClusters: true,
    requireBigramDensity: 0.4,
    maxRareLetters: 4,
    avoidQuadrants: new Set(),
  };

  let bestAttempt = null;
  let bestClearance = 0;
  const constraintTimeline = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const rng = mkSeededRng((seed + attempt * 9973) >>> 0);
    const board = generateBoardAttempt(rng, radius, constraints);

    const specialTiles = typeof buildSpecialTiles === 'function'
      ? (buildSpecialTiles({ grid: board.grid, placements: board.placements, rng, attempt }) || [])
      : [];

    const simData = simulateMaxScoreWithLookahead(board.grid, specialTiles, radius);

    if (simData.fullyCleared && simData.tilesRemaining === 0) {
      return {
        grid: board.grid,
        placements: board.placements,
        specialTiles,
        metadata: {
          ...simData,
          attempts: attempt,
          constraints: snapshotConstraints(constraints),
          constraintTimeline,
        },
      };
    }

    if (simData.clearancePercent > bestClearance) {
      bestClearance = simData.clearancePercent;
      bestAttempt = { board, specialTiles, simData, attempt };
    }

    const analysis = analyzeUnreachableTiles(board.grid, simData, specialTiles, radius);

    for (const [quadrant, tiles] of Object.entries(analysis.byQuadrant)) {
      if (tiles.length >= 3) constraints.avoidQuadrants.add(quadrant);
    }

    if (analysis.isolatedClusters.length > 1) {
      constraints.minVerticalWords = Math.min(6, constraints.minVerticalWords + 1);
    }

    if (analysis.commonPatterns.some(p => p.includes('Rare letter'))) {
      constraints.maxRareLetters = Math.max(2, constraints.maxRareLetters - 1);
    }

    if (attempt % 10 === 0) {
      constraints.avoidQuadrants.clear();
      constraints.minVerticalWords = Math.min(6, 3 + Math.floor(attempt / 10));
      constraints.requireBigramDensity = Math.min(0.7, constraints.requireBigramDensity + 0.05);
    }

    constraintTimeline.push({
      attempt,
      clearancePercent: simData.clearancePercent,
      unreachable: analysis.totalUnreachable,
      constraints: snapshotConstraints(constraints),
    });
  }

  if (bestAttempt?.simData?.fullyCleared && bestAttempt.simData.tilesRemaining === 0) {
    return {
      grid: bestAttempt.board.grid,
      placements: bestAttempt.board.placements,
      specialTiles: bestAttempt.specialTiles,
      metadata: {
        ...bestAttempt.simData,
        attempts: bestAttempt.attempt,
        constraints: snapshotConstraints(constraints),
        constraintTimeline,
      },
    };
  }

  const fallback = buildColumnFallbackBoard(seed, radius, constraints, buildSpecialTiles, maxAttempts);
  return {
    ...fallback,
    metadata: {
      ...(bestAttempt?.simData || {}),
      ...(fallback.metadata || {}),
      warning: 'Constraint search exhausted; deterministic fallback used',
      constraintTimeline,
    },
  };
}
