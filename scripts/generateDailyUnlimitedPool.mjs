// scripts/generateDailyUnlimitedPool.mjs
//
// Generates a fixed pool of 100 pre-built Hexacore daily boards for use in
// "daily-unlimited" mode.  Each board uses a stable synthetic seed so the pool
// is identical every time the script is run.
//
// Usage:
//   node scripts/generateDailyUnlimitedPool.mjs
//   node scripts/generateDailyUnlimitedPool.mjs --count=50   # partial re-run
//   node scripts/generateDailyUnlimitedPool.mjs --force       # overwrite existing files
//
// Outputs:
//   boards/daily-unlimited/001.json … 100.json
//   boards/daily-unlimited/index.json

import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { generateDailyHexacoreBoard } from '../hexacoreDailyGenerator.js';

// ── CLI args ─────────────────────────────────────────────────────────────────
const argMap = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const eq = a.indexOf('=');
      return eq === -1 ? [a.slice(2), 'true'] : [a.slice(2, eq), a.slice(eq + 1)];
    }),
);

const POOL_SIZE = 100;
const COUNT     = Math.min(POOL_SIZE, Math.max(1, parseInt(argMap['count'] ?? String(POOL_SIZE), 10)));
const FORCE     = argMap['force'] === 'true';

// ── Paths ─────────────────────────────────────────────────────────────────────
const ROOT    = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'boards', 'daily-unlimited');
mkdirSync(OUT_DIR, { recursive: true });

// ── Helpers ───────────────────────────────────────────────────────────────────
function boardNum(n) {
  return String(n).padStart(3, '0');
}

// Each board uses a synthetic seed string that is stable across runs.
// Passing this string as the `date` parameter causes generateDailyHexacoreBoard
// to derive a deterministic RNG seed via fnv1a32(seed).
function boardSeed(n) {
  return `unlimited-${boardNum(n)}`;
}

function summarise(board, n) {
  const specials = Array.isArray(board?.specialTiles) ? board.specialTiles : [];
  const byType = new Map();
  specials.forEach(s => byType.set(s.type, (byType.get(s.type) || 0) + 1));
  const portals = specials.filter(s => s.type === 'portal');
  const digraphs = specials.filter(s => s.type === 'digraph').map(s => String(s.digraph || '').toUpperCase());
  console.log(
    `  [${boardNum(n)}] max=${board.metadata.maxPossibleScore.toLocaleString().padStart(9)}`
    + `  diff=${board.metadata.difficulty}`
    + `  prism=${byType.get('prism') || 0}`
    + `  portals=${portals.length}`
    + (digraphs.length ? `  digraphs=[${digraphs.join(',')}]` : ''),
  );
}

// ── Generate ──────────────────────────────────────────────────────────────────
console.log(`\n🎲 Generating daily-unlimited board pool (${COUNT} of ${POOL_SIZE} boards)\n`);

const indexEntries = [];
let skipped = 0;
let generated = 0;

for (let n = 1; n <= COUNT; n++) {
  const filename = `${boardNum(n)}.json`;
  const filepath = join(OUT_DIR, filename);

  if (!FORCE && existsSync(filepath)) {
    // Board already exists — add it to the index without regenerating.
    try {
      const existing = JSON.parse((await import('fs')).default.readFileSync(filepath, 'utf8'));
      indexEntries.push({
        boardNum:    n,
        filename,
        maxScore:    existing.metadata?.maxPossibleScore ?? 0,
        difficulty:  existing.metadata?.difficulty ?? 'unknown',
        generatedAt: existing.metadata?.generatedAt ?? null,
      });
    } catch {
      // Corrupt file — regenerate it below
      indexEntries.push(null);
    }
    if (indexEntries[indexEntries.length - 1] !== null) {
      skipped++;
      continue;
    }
  }

  // Generate
  process.stdout.write(`  [${boardNum(n)}/${boardNum(COUNT)}] Generating… `);
  const start = Date.now();
  const board = generateDailyHexacoreBoard({ date: boardSeed(n) });
  const ms    = Date.now() - start;
  process.stdout.write(`✓ (${ms}ms)\n`);

  // Override the 'date' field with the stable seed id so consumers can use it
  // as a human-readable identifier without confusing it with a calendar date.
  board.date = boardSeed(n);

  writeFileSync(filepath, JSON.stringify(board, null, 2), 'utf8');
  generated++;

  indexEntries.push({
    boardNum:    n,
    filename,
    maxScore:    board.metadata?.maxPossibleScore ?? 0,
    difficulty:  board.metadata?.difficulty ?? 'unknown',
    generatedAt: board.metadata?.generatedAt ?? null,
  });

  summarise(board, n);
}

// ── Write index ───────────────────────────────────────────────────────────────
const index = {
  poolSize:    POOL_SIZE,
  generatedAt: new Date().toISOString(),
  boards:      indexEntries.filter(Boolean),
};
writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2), 'utf8');

console.log(`\n✅ Done.`);
console.log(`   Generated : ${generated}`);
console.log(`   Skipped   : ${skipped}`);
console.log(`   Pool size : ${index.boards.length} boards`);
console.log(`   Output    : boards/daily-unlimited/\n`);
