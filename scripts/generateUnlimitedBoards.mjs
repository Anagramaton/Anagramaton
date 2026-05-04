// scripts/generateUnlimitedBoards.mjs
// Run with: npm run generate:unlimited
// Outputs:  boards/unlimited/<id>.json  (one file per board)
//           boards/unlimited/manifest.json  (rolling manifest)

import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Stub browser globals that some imported modules reference
globalThis.performance ??= { now: () => Date.now() };
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);

import { generateBoardPure } from '../gridLogicPure.js';
import { GRID_RADIUS as DEFAULT_RADIUS } from '../constants.js';
import { buildBoardEntries, buildPool, solveExactNonBlocking } from '../scoringAndSolver.js';

// ── CLI args ─────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const [k, v] = a.slice(2).split('=');
      return [k, v ?? 'true'];
    })
);

const COUNT     = Math.min(50, Math.max(1, parseInt(args['count']     ?? '10', 10)));
const KEEP_DAYS = Math.max(1,             parseInt(args['keep-days']  ?? '30', 10));
const DATE_OVERRIDE = args['date'] ?? null;

// ── Eastern Standard Time date (UTC-5) ──────────────────────────────────────
// NOTE: Uses a fixed UTC-5 offset (EST). During summer, Eastern Time is EDT
// (UTC-4), but the workflow cron is fixed at 05:10 UTC so both stay in sync.
const EST_OFFSET_MS = -5 * 60 * 60 * 1000;

function getEstDateStr() {
  if (DATE_OVERRIDE) return DATE_OVERRIDE;
  const nowEst = new Date(Date.now() + EST_OFFSET_MS);
  const y = nowEst.getUTCFullYear();
  const m = String(nowEst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(nowEst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ── Paths ────────────────────────────────────────────────────────────────────
const ROOT       = join(dirname(fileURLToPath(import.meta.url)), '..');
const BOARD_DIR  = join(ROOT, 'boards', 'unlimited');
const MANIFEST   = join(BOARD_DIR, 'manifest.json');

mkdirSync(BOARD_DIR, { recursive: true });

// ── Load / initialise manifest ───────────────────────────────────────────────
function loadManifest() {
  try {
    return JSON.parse(readFileSync(MANIFEST, 'utf8'));
  } catch {
    return { lastUpdated: null, keepDays: KEEP_DAYS, boards: [] };
  }
}

// ── Pruning ──────────────────────────────────────────────────────────────────
function pruneManifest(manifest) {
  // Compute the cutoff date as an EST date string (UTC-5)
  const cutoffMs  = Date.now() + EST_OFFSET_MS - KEEP_DAYS * 24 * 60 * 60 * 1000;
  const cutoffEst = new Date(cutoffMs);
  const cutoffStr = [
    cutoffEst.getUTCFullYear(),
    String(cutoffEst.getUTCMonth() + 1).padStart(2, '0'),
    String(cutoffEst.getUTCDate()).padStart(2, '0'),
  ].join('-');

  manifest.boards = manifest.boards.filter(b => b.date >= cutoffStr);
}

// ── Main ─────────────────────────────────────────────────────────────────────
const dateStr  = getEstDateStr();
const manifest = loadManifest();
pruneManifest(manifest);

// Find the next board index for today
const todayBoards = manifest.boards.filter(b => b.date === dateStr);
let startIdx = todayBoards.length + 1;

console.log(`\n📅 Generating ${COUNT} unlimited board(s) for ${dateStr}`);
console.log(`   Pool before run: ${manifest.boards.length} boards`);
console.log(`   Starting from index: ${String(startIdx).padStart(2, '0')}\n`);

const newEntries = [];

for (let i = 0; i < COUNT; i++) {
  const idx    = startIdx + i;
  const idxStr = String(idx).padStart(2, '0');
  const id     = `${dateStr}_${idxStr}`;
  const file   = `${id}.json`;

  process.stdout.write(`[${i + 1}/${COUNT}] Generating ${id}... `);
  const genStart = Date.now();

  const result = generateBoardPure(DEFAULT_RADIUS, 'unlimited', null);

  const genMs = Date.now() - genStart;
  process.stdout.write(`✓ (${result.placedWords.length} words, ${genMs}ms) — solving... `);

  // ── Solve ──────────────────────────────────────────────────────────────────
  const boardEntries = buildBoardEntries(result.placedWords);
  const { POOL }     = buildPool(boardEntries);

  const solveStart = Date.now();
  const { best10, finalTotal } = await solveExactNonBlocking({
    POOL,
    boardEntries,
    TARGET:          10,
    timeBudgetMs:    5000,
    sliceMs:         50,
    hardNodeCap:     1_000_000,
    earlyAcceptRatio: 1.01,
  });
  const solveMs = Date.now() - solveStart;

  const topScore = Number(finalTotal) || 0;
  process.stdout.write(`✓ (${solveMs}ms, top score: ${topScore})\n`);

  // ── Build top10 paths list ─────────────────────────────────────────────────
  const boardTop10 = best10 ?? [];
  const boardTop10Paths = boardTop10.map(x => {
    const be = boardEntries.find(b => b.word === x.word);
    return be ? be.tiles.map(t => t.key) : [];
  });

  // ── Write board file ───────────────────────────────────────────────────────
  const board = {
    id,
    date:            dateStr,
    generatedAt:     new Date().toISOString(),
    grid:            result.grid,
    placedWords:     result.placedWords.map(p => ({ word: p.word, path: p.path })),
    anagramList:     result.anagramList,
    boardTop10,
    boardTop10Total: topScore,
    boardTop10Paths,
  };

  writeFileSync(join(BOARD_DIR, file), JSON.stringify(board), 'utf8');

  newEntries.push({
    id,
    date:        dateStr,
    file,
    wordCount:   result.placedWords.length,
    topScore,
    generatedAt: board.generatedAt,
  });
}

// ── Update manifest ──────────────────────────────────────────────────────────
manifest.lastUpdated = new Date().toISOString();
manifest.keepDays    = KEEP_DAYS;
manifest.boards.push(...newEntries);

writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2), 'utf8');

console.log(`\n✅ Done!`);
console.log(`   Boards added:  ${newEntries.length}`);
console.log(`   Pool size now: ${manifest.boards.length}`);
console.log(`   Manifest:      ${MANIFEST}`);
