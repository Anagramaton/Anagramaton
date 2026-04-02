// gridLogicPure.js
// Pure Node.js + browser compatible board generator — NO DOM, no gameState mutations.
// Used by scripts/generateBoards.mjs to pre-generate boards offline.

import { GRID_RADIUS as DEFAULT_RADIUS, letterFrequencies, letterPoints, lengthMultipliers, anagramMultiplier, reuseMultipliers } from './constants.js';
import wordList from './wordList.js';
import suffixList from './suffixList.js';
import phraseHints from './phraseHints.js';
import { ADJ_DIRS, hexKey, getAllCoords, isValidCoord } from './gridCoords.js';
import { findPath } from './pathfinding.js';
import { findPhrasePath, placePhrase } from './seedPhrases.js';
import { placeOverlappingSuffixes } from './suffixSeeder.js';
import { computeAnagrams } from './anagrams.js';
import { shuffledArray } from './utils.js';

// ─────────────────────────────────────────────────────────────────────────────
// Seeded RNG
// ─────────────────────────────────────────────────────────────────────────────
function mkSeededRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000;
}

function getDailyId() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${y}_${String(m).padStart(2, '0')}_${String(day).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily phrase placement
// ─────────��───────────────────────────────────────────────────────────────────
function placeDailyPhrasePair(grid, gridRadius, rng, state, maxTries = 100) {
  const coords = getAllCoords(gridRadius);
  const maxTiles = coords.length;
  const pick = (n) => Math.floor(rng() * n);

  for (let i = 0; i < maxTries; i++) {
    const selected = phraseHints[pick(phraseHints.length)];
    const [rawA, rawB] = selected.phrases;
    const { hints } = selected;

    const A = rawA.toUpperCase().replace(/[^A-Z]/g, '');
    const B = rawB.toUpperCase().replace(/[^A-Z]/g, '');

    if (A.length === 0 || B.length === 0) continue;
    if (A.length !== B.length) continue;
    if (A.length > maxTiles) continue;

    const pathA = findPhrasePath(grid, A, gridRadius);
    if (!pathA) continue;
    placePhrase(grid, pathA, A);

    const pathB = findPhrasePath(grid, B, gridRadius);
    if (!pathB) {
      for (let k = 0; k < pathA.length; k++) {
        const key = pathA[k].key;
        if (grid[key] === A[k]) delete grid[key];
      }
      continue;
    }
    placePhrase(grid, pathB, B);

    state.seedPhrase = `${rawA} / ${rawB}`;
    state.seedPaths  = { phraseA: pathA, phraseB: pathB };
    state.seedHints  = hints;

    return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seeded shuffle (uses state.dailyRng when in daily mode)
// ─────────────────────────────────────────────────────────────────────────────
function seededShuffle(arr, state) {
  if (state.mode !== 'daily' || !state.dailyRng) {
    return shuffledArray(arr);
  }
  const copy = Array.isArray(arr) ? arr.slice() : Array.from(arr);
  const r = state.dailyRng;
  for (let i = copy.length - 1; i > 0; i--) {
    const j = (r() * (i + 1)) | 0;
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ─────────────────────────────────────────────────────────────────────────���───
// PUBLIC ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────
export function generateBoardPure(gridRadius = DEFAULT_RADIUS, mode = 'unlimited') {
  const state = {
    mode,
    seedPhrase: null,
    seedPaths:  null,
    seedHints:  null,
    dailyId:    null,
    dailyRng:   null,
  };

  if (mode === 'daily') {
    const dailyId = getDailyId();
    state.dailyId = dailyId;

    const seedNum = Array.from(dailyId)
      .reduce((h, c) => ((h * 131) ^ c.charCodeAt(0)) >>> 0, 2166136261);

    const rng = mkSeededRng(seedNum);
    state.dailyRng = rng;

    const originalRandom = Math.random;
    Math.random = rng;
    try {
      return _generateBoard(gridRadius, state);
    } finally {
      Math.random = originalRandom;
    }
  }

  // Unlimited
  return _generateBoard(gridRadius, state);
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL: pure board generation — no DOM, no gameState, no requestAnimationFrame
// ─────────────────────────────────────────────────────────────────────────────
function _generateBoard(gridRadius = DEFAULT_RADIUS, state) {
  const isDaily     = state.mode === 'daily';
  const placedWords = [];
  let   placedSuffixes = [];

  const grid   = {};
  const coords = getAllCoords(gridRadius);
  const maxTiles = coords.length;

  const MIN_WORD_OVERLAP = 2;
  const MAX_ATTEMPTS     = 150;
  const PATH_TRIES       = Math.max(200, MAX_ATTEMPTS || 300);

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 1 — Seed phrase pair (daily only)
  // ─────────────────────────────────────────────────────────────────────────
  if (isDaily) {
    const placed = placeDailyPhrasePair(grid, gridRadius, state.dailyRng, state, 100);
    if (!placed) {
      state.seedPhrase = null;
      state.seedPaths  = null;
      state.seedHints  = null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Candidate prep
  // ─────────────────────────────────────────────────────────────────────────
  const MAX_FRIENDLY_LEN = Math.min(14, Math.floor(3.5 * gridRadius + 1));
  const MIN_FRIENDLY_LEN = 4;
  const TECHY_RE = new RegExp(
    '(ENCEPHAL|NEURO|EAE|DAE|SULF|PHEN|CHEM|BLASTU|PHYL|CYTE|PHAGE|INASE|AMIDE|IMIDE|' +
    // Biology / medicine
    'ADENYL|ADREN|AMIN(?:O|E)|ANGIO|ANTIB|BACILL|BACTER|BENZEN|BENZ(?:OA|OY)|BIOPS|' +
    'CARBOX|CARCI|CATALY|CELLUL|CHOLIN|CHROM(?:AT|OS)|COENZ|CORTIS|CYTOS|DEOXYRIB|' +
    'DIPLOC|DIPHTHERI|DISACCH|DIURET|EMBRYO|ENDOCR|ENZYM|EPIGLOTT|EPITHE|ERYTHR|' +
    'ESTROG|FERMENT|FIBRIN|FILAMENT|FLAGELL|GAMET|GASTRO|GLOBIN|GLUCOS|GLYCO|' +
    'GONAD|HAEMAT|HAEMO|HEMAT|HEMO|HEPAT|HISTOL|HORMON|HYDR(?:OX|OG)|HYPOTH|' +
    'IMMUN|INSULIN|INTESTI|ISOMER|KERAT|KINASE|LACTOS|LEUKOCYT|LIGAMENT|LIPASE|' +
    'LYMPHOC|LYSOSOM|MACROPHAG|MALIGN|MEMBRAN|METABOL|METASTA|MICROB|MITOCH|MOLEC|' +
    'MONOCYT|MUCOS|MYELIN|MYOSIN|NEPHRO|NUCLE(?:IC|OT|US)|ONCOL|ORGANELL|OSMOS|' +
    'OSTEOB|PANCREA|PARAMET|PATHOG|PEPTID|PERITON|PHAGOC|PHOSPH|PHOTOSYN|PITUITAR|' +
    'PLASM(?:ID|A)|PLATELET|POLYMER|POLYPEPT|PROKAR|PROTE(?:IN|AS)|PROT(?:OZ|ON)|' +
    'PULMON|RECEPTOR|RIBOSOM|SEROTON|SERUM|SIGNALING|STEROID|SYMBIOSI|SYNAPS|' +
    'TELOMER|THROMBOC|THYROID|TOXICOL|TRANSCRI|TRANSLAT|TRYPSIN|TUBULIN|VACUOL|' +
    'VALENC|VASODIL|VASOCONSTRI|VENTRICL|VESICL|VIRAL|VIROL|ZYMO|' +
    // Chemistry / physics
    'ACETYL|ALDEHYD|ALKALOID|ALKYLT|ALLOTROP|ANION|ANTIMAT|AROMAT|ATOM(?:IC)|' +
    'BIOLUM|CALORI|CARBIN|CARBONATE|CATALYS|CATHOD|CATION|CHROMAT|COAGUL|COHES|' +
    'COLLOID|COMBUS|COMPOUND|CONDENS|COVALENT|CRYSTAL|DECOMPOS|DIFFRACT|DILUT|' +
    'DISTILL|ELECTRO|EMULSIF|ENDOTHERM|EQUIMOL|EXOTHERM|FLOCCUL|FLUORESC|FRACT|' +
    'FULVAT|GALVAN|HALOGEN|HYDROLYSI|HYGROSCOP|INORGANIC|ION(?:IC)|ISOBAR|ISOTOP|' +
    'KINETIC|LATENT|LITMUS|MAGNETI|MOLAL|MOLAR|MOLECULE|NEUTRON|NITRAT|NITRIF|' +
    'NUCLEOPHIL|ORBITAL|OXIDAT|OXIDIZ|OZONOL|PEPTIDYL|PERIODI|PHOSPHOR|PHOTOLYS|' +
    'PHOTON|PRECIPIT|PROTON|QUANT(?:UM|IZ)|RADIOACT|REACT(?:ANT|ION)|REDOX|' +
    'REFRACT|RENORMALI|RESONANC|SALINITY|SATURATE|SOLUBIL|SOLVENT|SPECTRO|STOICHI|' +
    'SUBLIM|SUPERCOND|SURFACT|THERMO|TITRAT|VALENCE|VISCOSIT|VOLATIL|WAVEFORM)',
    'i'
  );

  function isFriendlyWord(w) {
    if (w.length < MIN_FRIENDLY_LEN || w.length > MAX_FRIENDLY_LEN) return false;
    if (!/^[A-Za-z]+$/.test(w)) return false;
    if (TECHY_RE.test(w)) return false;
    return true;
  }

  const candidates = seededShuffle(
    wordList.map((w) => w.toUpperCase()).filter(isFriendlyWord),
    state
  ).sort((a, b) => b.length - a.length);

  const LONG_MIN = 9;
  const LONG_MAX = 14;
  const isLong   = (w) => w.length >= LONG_MIN && w.length <= LONG_MAX;
  const longCandidates = candidates.filter(isLong);
  const usedWords = new Set();

  const countLongPlaced = () =>
    placedWords.reduce((n, p) => n + (p.word && isLong(p.word) ? 1 : 0), 0);

  const hasConflict = (path, word) => {
    for (let i = 0; i < path.length; i++) {
      const { key } = path[i];
      const existing = grid[key];
      if (existing && existing !== word[i]) return true;
    }
    return false;
  };

  const countOverlapLocal = (path, word) => {
    let overlaps = 0;
    for (let i = 0; i < path.length; i++) {
      if (grid[path[i].key] === word[i]) overlaps++;
    }
    return overlaps;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Scoring helpers
  // ─────────────────────────────────────────────────────────────────────────
  function isAnagramLocal(word) {
    return word.length > 1 && word === word.split('').reverse().join('');
  }

  function soloWordMultiplier(word) {
    let mult = 1;
    if (word.length >= 5) {
      mult *= lengthMultipliers[Math.min(word.length, 10)] || 1;
    }
    if (isAnagramLocal(word)) mult *= anagramMultiplier;
    return mult;
  }

  function estimatePlacementScore(word, path) {
    let baseFaceSum  = 0;
    let overlapBoost = 0;

    for (let i = 0; i < path.length; i++) {
      const { key }  = path[i];
      const letter   = word[i];
      const face     = letterPoints[letter] || 1;
      const existing = grid[key];

      if (existing === letter) {
        let uses = 0;
        for (const pw of placedWords) {
          if (!pw.path) continue;
          for (const step of pw.path) {
            if (step.key === key) { uses++; break; }
          }
        }
        const nextUses  = uses + 1;
        const nextMult  = nextUses >= 3 ? reuseMultipliers[3] : (reuseMultipliers[nextUses]  || 1);
        const priorMult = uses     >= 3 ? reuseMultipliers[3] : (reuseMultipliers[uses]      || 1);
        overlapBoost += face * (nextMult - priorMult);
      } else {
        baseFaceSum += face;
      }
    }

    return (baseFaceSum + overlapBoost) * soloWordMultiplier(word);
  }

  const placementScore = (word, overlaps, pathLen, path) => {
    const estimated  = estimatePlacementScore(word, path);
    const newLetters = pathLen - overlaps;
    return estimated + 2.0 * overlaps - 0.4 * newLetters;
  };

  const placementScore2 = (word, overlaps, anchorTouches, pathLen, path) => {
    const estimated  = estimatePlacementScore(word, path);
    const newLetters = pathLen - overlaps;
    return estimated + 30 * anchorTouches + 3 * overlaps - 1.4 * newLetters;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 2 — Overlapping suffix seeds (daily only)
  // ─────────────────────────────────────────────────────────────────────────
  if (isDaily) {
    placedSuffixes = placeOverlappingSuffixes(grid, suffixList, gridRadius);
  }

  const postLetters = Object.keys(grid).length;

  function coordKey(q, r) { return `${q},${r}`; }
  function hexDistance(q, r) { return (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2; }

  function makeRng(seed = Date.now()) {
    let s = (seed >>> 0) || 1;
    return () => (s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000;
  }

  function pickWeighted(list, rng = Math.random) {
    const sum = list.reduce((s, x) => s + x.w, 0);
    if (sum <= 0) return list[0];
    let t = rng() * sum;
    for (const item of list) {
      t -= item.w;
      if (t <= 0) return item;
    }
    return list[list.length - 1];
  }

  function getRandomCenterishStart(coords, rng, k = 5) {
    const sorted = [...coords].sort(
      (a, b) => hexDistance(a.q, a.r) - hexDistance(b.q, b.r)
    );
    const top = sorted.slice(0, Math.min(k, sorted.length));
    return top[Math.floor(rng() * top.length)];
  }

  function buildVariedAnchorPath(coords, gridRadius, targetLen, avoidKeys = new Set(), rng = Math.random) {
    const coordMap = new Map(coords.map(c => [coordKey(c.q, c.r), c]));
    const visited  = new Set([...avoidKeys]);
    const path     = [];

    let cur = getRandomCenterishStart(coords, rng);
    if (!cur) return null;

    const DIRS = [
      { dq: +1, dr:  0 }, { dq: +1, dr: -1 }, { dq:  0, dr: -1 },
      { dq: -1, dr:  0 }, { dq: -1, dr: +1 }, { dq:  0, dr: +1 },
    ];
    let prevDir = null;

    for (let i = 0; i < targetLen; i++) {
      const key = coordKey(cur.q, cur.r);
      if (visited.has(key)) return null;
      visited.add(key);
      path.push({ q: cur.q, r: cur.r, key });
      if (path.length === targetLen) break;

      for (let j = DIRS.length - 1; j > 0; j--) {
        const k = Math.floor(rng() * (j + 1));
        [DIRS[j], DIRS[k]] = [DIRS[k], DIRS[j]];
      }

      const hereCenter = hexDistance(cur.q, cur.r);
      const candidateNeighbors = [];

      for (const d of DIRS) {
        const nq   = cur.q + d.dq;
        const nr   = cur.r + d.dr;
        const nKey = coordKey(nq, nr);
        if (!coordMap.has(nKey)) continue;
        if (visited.has(nKey)) continue;

        const centerDist      = hexDistance(nq, nr);
        const outward         = centerDist > hereCenter;
        const centerBias      = gridRadius - centerDist;
        const sameDir         = prevDir && prevDir.dq === d.dq && prevDir.dr === d.dr;
        const straightPenalty = sameDir  ? -0.5 : 0.35;
        const outwardPenalty  = outward  ? -0.7 : 0;
        const jitter          = (rng() - 0.5) * 0.8;
        const score           = 1.2 * centerBias + straightPenalty + outwardPenalty + jitter;

        candidateNeighbors.push({ nq, nr, key: nKey, dir: d, score });
      }

      if (!candidateNeighbors.length) return null;

      const minScore = candidateNeighbors.reduce((m, c) => Math.min(m, c.score), Infinity);
      const shift    = minScore < 0 ? -minScore + 0.0001 : 0.0001;
      for (const c of candidateNeighbors) c.w = c.score + shift;

      const chosen = pickWeighted(candidateNeighbors, rng);
      cur     = { q: chosen.nq, r: chosen.nr };
      prevDir = chosen.dir;
    }

    return path.length === targetLen ? path : null;
  }

  function placeWordOnPath(grid, word, path) {
    for (let i = 0; i < path.length; i++) grid[path[i].key] = word[i];
  }

  function tryStandardPlacementOrTemplate(word, coords, gridRadius, occupiedKeys = new Set(), rng = Math.random) {
    const starts = seededShuffle(coords, state).slice(0, Math.min(coords.length, 40));
    for (const { q, r } of starts) {
      const path = findPath(grid, word, q, r, 0, new Set(), gridRadius, {
        allowZigZag:   true,
        preferOverlap: false,
        wallBuffer:    0,
        maxEdgeRun:    999,
        maxStraight:   5,
      });
      if (path) return { path, viaTemplate: false };
    }

    const template =
      buildVariedAnchorPath(coords, gridRadius, word.length, occupiedKeys, rng) ||
      buildVariedAnchorPath(coords, gridRadius, word.length, occupiedKeys, rng);

    if (template) return { path: template, viaTemplate: true };
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2b — Bootstrap anchor (unlimited only, when grid is empty)
  // ─────────────────────────────────────────────────────────────────────────
  if (postLetters === 0 && !isDaily) {
    const rng      = makeRng(Date.now());
    const occupied = new Set();
    const chosen   = [];

    for (const w of longCandidates) {
      if (usedWords.has(w)) continue;
      chosen.push(w);
      if (chosen.length >= 400) break;
    }

    for (const word of chosen) {
      const result = tryStandardPlacementOrTemplate(word, coords, gridRadius, occupied, rng);
      if (!result) continue;

      const { path, viaTemplate } = result;
      placeWordOnPath(grid, word, path);
      if (viaTemplate) for (const step of path) occupied.add(step.key);

      placedWords.push({ word, path, bootstrapAnchor: true, viaTemplate, mandatoryLong: true });
      usedWords.add(word);
      break; // only 1 anchor
    }

  // ── Bootstrap log — unlimited only ──
    const bootstrapWords = placedWords
      .filter(p => p.bootstrapAnchor)
      .map(p => p.word);
    console.log('📌 BOOTSTRAP words:', bootstrapWords.length ? bootstrapWords : '(none)');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 3 — Long words via suffix anchors
  // ─────────────────────────────────────────────────────────────────────────
  const step3StartCount = placedWords.length;
  let neededLong = Math.max(0, 2 - countLongPlaced());

  if (neededLong > 0 && placedSuffixes.length > 0) {
    for (const anchor of placedSuffixes) {
      if (neededLong <= 0) break;
      const keySet = new Set(anchor.path.map((p) => p.key));
      const pool   = longCandidates.filter((w) => !usedWords.has(w) && w.endsWith(anchor.chunk));

      for (const word of seededShuffle(pool, state)) {
        for (const { q, r } of seededShuffle(coords, state).slice(0, PATH_TRIES)) {
          const path = findPath(grid, word, q, r, 0, new Set(), gridRadius);
          if (!path) continue;

          let anchorHits = 0;
          for (let i = 0; i < path.length; i++) {
            const key = path[i].key;
            if (keySet.has(key) && grid[key] === word[i]) anchorHits++;
          }
          if (anchorHits < 1) continue;
          if (hasConflict(path, word)) continue;

          path.forEach(({ key }, i) => (grid[key] = word[i]));
          placedWords.push({ word, path, viaSuffix: anchor.chunk, branched: true, mandatoryLong: true });
          usedWords.add(word);
          neededLong--;
          break;
        }
        if (neededLong <= 0) break;
      }
    }
  }

      if (!isDaily) {
    const step3Words = placedWords
      .slice(step3StartCount)
      .map(p => p.word);
    console.log('🔗 STEP 3 — long words via suffix anchors:', step3Words);
  }
  // ─────────────────────────────────────────────────────────────────────────
  // STEP 4 — Long word pass (anchor-biased)
  // ─────────────────────────────────────────────────────────────────────────
  if (neededLong > 0) {
    const anchorKeySets = placedSuffixes.map((s) => new Set(s.path.map((p) => p.key)));

    const touchesAnyAnchor = (path, word) => {
      if (!anchorKeySets.length) return 0;
      let touchCount = 0;
      for (let i = 0; i < path.length; i++) {
        const k  = path[i].key;
        const ch = word[i];
        for (const ks of anchorKeySets) {
          if (ks.has(k) && grid[k] === ch) { touchCount++; break; }
        }
      }
      return touchCount;
    };

    for (const word of longCandidates) {
      if (neededLong <= 0) break;
      if (usedWords.has(word)) continue;

      let best = null;
      for (const { q, r } of seededShuffle(coords, state).slice(0, PATH_TRIES)) {
        const path = findPath(grid, word, q, r, 0, new Set(), gridRadius);
        if (!path) continue;
        const overlaps      = countOverlapLocal(path, word);
        const anchorTouches = touchesAnyAnchor(path, word);
        if (overlaps < 1 && anchorTouches === 0) continue;
        if (hasConflict(path, word)) continue;
        const score = placementScore(word, overlaps, path.length, path) + 40 * anchorTouches;
        if (!best || score > best.score) best = { score, path };
      }

      if (best) {
        best.path.forEach(({ key }, i) => (grid[key] = word[i]));
        placedWords.push({ word, path: best.path, mandatoryLong: true });
        usedWords.add(word);
        neededLong--;
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 5 — Regular suffix-centered branching + suffix stacking
  // ─────────────────────────────────────────────────────────────────────────
  const BRANCHES_PER_SUFFIX     = 2;
  const STACK_PER_SUFFIX        = 2;
  const MIN_OVERLAP_WITH_ANCHOR = 1;

  const step5StartCount = placedWords.length;

  for (const anchor of placedSuffixes) {
    let placedCount = 0;
    let stackCount  = 0;
    const keySet    = new Set(anchor.path.map((p) => p.key));

    // ── Suffix branch words (end with anchor.chunk) ──
    const pool = candidates
      .filter((w) => !usedWords.has(w) && w.endsWith(anchor.chunk))
      .slice(0, 120);

    for (const word of pool.sort((a, b) => b.length - a.length)) {
      if (placedCount >= BRANCHES_PER_SUFFIX) break;

      for (const { q, r } of seededShuffle(
        coords.filter(({ q, r }) => {
          const key = hexKey(q, r);
          return !grid[key] || grid[key] === word[0];
        }),
        state
      )) {
        const path = findPath(grid, word, q, r, 0, new Set(), gridRadius);
        if (!path) continue;

        let anchorHits = 0;
        for (let i = 0; i < path.length; i++) {
          const key = path[i].key;
          if (keySet.has(key) && grid[key] === word[i]) anchorHits++;
        }
        if (anchorHits < MIN_OVERLAP_WITH_ANCHOR) continue;

        let totalHits = 0;
        for (let i = 0; i < path.length; i++) {
          if (grid[path[i].key] === word[i]) totalHits++;
        }
        if (totalHits < 2) continue;
        if (hasConflict(path, word)) continue;

        for (let i = 0; i < path.length; i++) grid[path[i].key] = word[i];

        const overlaps       = countOverlapLocal(path, word);
        const heuristicScore = placementScore(word, overlaps, path.length, path);

        placedWords.push({ word, path, viaSuffix: anchor.chunk, branched: true, heuristicScore });
        usedWords.add(word);
        placedCount++;
        break;
      }
    }

    // ── Suffix stack words ──
    const stackZoneKeys = new Set([...keySet]);
    for (const pw of placedWords) {
      if (pw.viaSuffix === anchor.chunk) {
        for (const step of pw.path) stackZoneKeys.add(step.key);
      }
    }

    const stackPool = candidates
      .filter((w) => !usedWords.has(w) && !w.endsWith(anchor.chunk))
      .slice(0, 120);

    for (const word of stackPool.sort((a, b) => b.length - a.length)) {
      if (stackCount >= STACK_PER_SUFFIX) break;

      for (const { q, r } of seededShuffle(
        coords.filter(({ q, r }) => {
          const key = hexKey(q, r);
          return !grid[key] || grid[key] === word[0];
        }),
        state
      )) {
        const path = findPath(grid, word, q, r, 0, new Set(), gridRadius);
        if (!path) continue;

        let stackHits = 0;
        for (let i = 0; i < path.length; i++) {
          const key = path[i].key;
          if (stackZoneKeys.has(key) && grid[key] === word[i]) stackHits++;
        }
        if (stackHits < 1) continue;

        let totalHits = 0;
        for (let i = 0; i < path.length; i++) {
          if (grid[path[i].key] === word[i]) totalHits++;
        }
        if (totalHits < 2) continue;
        if (hasConflict(path, word)) continue;

        for (let i = 0; i < path.length; i++) grid[path[i].key] = word[i];

        const overlaps       = countOverlapLocal(path, word);
        const heuristicScore = placementScore(word, overlaps, path.length, path);

        placedWords.push({ word, path, viaStack: anchor.chunk, stacked: true, heuristicScore });
        usedWords.add(word);
        stackCount++;

        for (const step of path) stackZoneKeys.add(step.key);
        break;
      }
    }
  }

    // ── Step 5 log — unlimited only ──
  if (!isDaily) {
    const step5Placed      = placedWords.slice(step5StartCount);
    const step5BranchWords = step5Placed.filter(p => p.branched).map(p => p.word);
    const step5StackWords  = step5Placed.filter(p => p.stacked).map(p => p.word);
    console.log('🌿 STEP 5 — suffix branch words:', step5BranchWords.length ? step5BranchWords : '(none)');
    console.log('🪵 STEP 5 — suffix stack words: ', step5StackWords.length  ? step5StackWords  : '(none)');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 6 — General fill + leftover tiles
  // ─────────────────────────────────────────────────────────────────────────
  const step6StartCount = placedWords.length;

  {
    const anchorKeySets = placedSuffixes.map((s) => new Set(s.path.map((p) => p.key)));

    const touchesAnyAnchor = (path, word) => {
      if (!anchorKeySets.length) return 0;
      let touchCount = 0;
      for (let i = 0; i < path.length; i++) {
        const k = path[i].key;
        if (grid[k] === word[i]) {
          for (const ks of anchorKeySets) {
            if (ks.has(k)) { touchCount++; break; }
          }
        }
      }
      return touchCount;
    };

    for (const word of candidates) {
      if (usedWords.has(word)) continue;

      const attempts = seededShuffle(
        coords.filter(({ q, r }) => {
          const key = hexKey(q, r);
          return !grid[key] || grid[key] === word[0];
        }),
        state
      );
      let best = null;

      for (const { q, r } of attempts) {
        const path = findPath(grid, word, q, r, 0, new Set(), gridRadius);
        if (!path) continue;

        const overlaps = countOverlapLocal(path, word);
        if (overlaps < MIN_WORD_OVERLAP) continue;
        if (hasConflict(path, word)) continue;

        const anchorTouches = touchesAnyAnchor(path, word);
        if (anchorTouches === 0 && overlaps < (word.length >= 12 ? 1 : MIN_WORD_OVERLAP + 1)) continue;

        const score = placementScore2(word, overlaps, anchorTouches, path.length, path);
        if (!best || score > best.score) best = { score, path };
      }

      if (best) {
        best.path.forEach(({ key }, i) => { grid[key] = word[i]; });
        placedWords.push({ word, path: best.path });
        usedWords.add(word);
      }
    }

    // Fill empty tiles with random letters
    for (const { q, r } of coords) {
      const key = hexKey(q, r);
      if (!grid[key]) {
        grid[key] = letterFrequencies[Math.floor(Math.random() * letterFrequencies.length)];
      }
    }
  }

    // ── Step 6 log — unlimited only ──
  if (!isDaily) {
    const step6Words = placedWords
      .slice(step6StartCount)
      .map(p => p.word);
    console.log('🔵 STEP 6 — general fill words:', step6Words.length ? step6Words : '(none)');
  }
  // ─────────────────────────────────────────────────────────────────────────
  // Board scan — find any additional valid words already on the grid
  // ─────────────────────────────────────────────────────────────────────────
  {
    const existing = new Set(placedWords.map(p => p.word));
    for (const word of candidates) {
      if (existing.has(word)) continue;
      if (word.length < 4) continue;

      for (const { q, r } of coords) {
        const startKey = hexKey(q, r);
        if (grid[startKey] !== word[0]) continue;

        const path = findPath(grid, word, q, r, 0, new Set(), gridRadius, {
          allowZigZag:   true,
          preferOverlap: true,
          maxStraight:   5,
          wallBuffer:    0,
          maxEdgeRun:    999,
        });

        if (path) {
          placedWords.push({ word, path, autoFound: true });
          existing.add(word);
          break;
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Anagrams
  // ─────────────────────────────────────────────────────────────────────────
  const anagramList = computeAnagrams(placedWords);

  // ─────────────────────────────────────────────────────────────────────────
  // Return everything
  // ─────────────────────────────────────────────────────────────────────────
  return {
    grid,
    placedWords,
    anagramList,
    seedPhrase: state.seedPhrase,
    seedPaths:  state.seedPaths,
    seedHints:  state.seedHints,
    dailyId:    state.dailyId,
  };
}