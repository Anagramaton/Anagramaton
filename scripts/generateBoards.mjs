// scripts/generateBoards.mjs
// Run with: npm run generate
// Outputs:  prebuiltBoards.json  (a single daily board entry in the main project folder)

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Stub browser globals that some imported modules reference
globalThis.performance ??= { now: () => Date.now() };
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);

import { generateBoardPure } from '../gridLogicPure.js';
import { GRID_RADIUS as DEFAULT_RADIUS } from '../constants.js';
import phraseHints from '../phraseHints.js';

// ── Eastern Standard Time date (UTC-5) ──────────────────────────────────────
const EST_OFFSET_MS = -5 * 60 * 60 * 1000;
const nowEst = new Date(Date.now() + EST_OFFSET_MS);
const year  = nowEst.getUTCFullYear();
const month = String(nowEst.getUTCMonth() + 1).padStart(2, '0');
const day   = String(nowEst.getUTCDate()).padStart(2, '0');
const dateStr = `${year}-${month}-${day}`;

// ── Deterministic, no-repeat phrase index ───────────────────────────────────
// Cycles through all phraseHints entries sequentially, starting from 2025-01-01
const EPOCH = new Date('2025-01-01T00:00:00Z');
const daysSinceEpoch = Math.floor((Date.now() + EST_OFFSET_MS - EPOCH.getTime()) / (24 * 60 * 60 * 1000));
const phraseIndex = ((daysSinceEpoch % phraseHints.length) + phraseHints.length) % phraseHints.length;

console.log(`\n📅 Generating daily board for ${dateStr}`);
console.log(`   phraseIndex: ${phraseIndex} / ${phraseHints.length - 1}`);
console.log(`   phrase: "${phraseHints[phraseIndex].phrases[0]}" / "${phraseHints[phraseIndex].phrases[1]}"\n`);

process.stdout.write('  Generating board... ');
const startMs = Date.now();

const result = generateBoardPure(DEFAULT_RADIUS, 'daily', phraseIndex);

const ms = Date.now() - startMs;
process.stdout.write(`✓ (${result.placedWords.length} words, ${ms}ms)\n`);

const board = {
  date:        dateStr,
  phraseIndex,
  grid:        result.grid,
  placedWords: result.placedWords.map(p => ({ word: p.word, path: p.path })),
  anagramList: result.anagramList,
  seedPhrase:  result.seedPhrase,
  seedPaths:   result.seedPaths,
  seedHints:   result.seedHints,
  generatedAt: new Date().toISOString(),
};

const outPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'prebuiltBoards.json');
writeFileSync(outPath, JSON.stringify(board, null, 2), 'utf8');

const fileSizeKB = Math.round(JSON.stringify(board).length / 1024);
console.log(`\n✅ Done! Written to prebuiltBoards.json`);
console.log(`   Date: ${dateStr}`);
console.log(`   File size: ~${fileSizeKB}KB`);