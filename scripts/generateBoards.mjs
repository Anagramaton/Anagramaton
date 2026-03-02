// scripts/generateBoards.mjs
// Run with: npm run generate
// Outputs:  prebuiltBoards.json  (in the main project folder)

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Stub browser globals that some imported modules reference
globalThis.performance ??= { now: () => Date.now() };
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);

import { generateBoardPure } from '../gridLogicPure.js';

const NUM_BOARDS = 1; // how many unlimited boards to pre-generate

const boards = [];

console.log(`\n🎲 Generating ${NUM_BOARDS} boards...\n`);

for (let i = 0; i < NUM_BOARDS; i++) {
  process.stdout.write(`  Board ${i + 1}/${NUM_BOARDS}... `);
  const startMs = Date.now();

  const { grid, placedWords, anagramList } = generateBoardPure();

  const ms = Date.now() - startMs;
  process.stdout.write(`✓ (${placedWords.length} words, ${ms}ms)\n`);

  boards.push({
    id: i,
    grid,
    placedWords: placedWords.map(p => ({
      word: p.word,
      path: p.path,
    })),
    anagramList,
    generatedAt: new Date().toISOString(),
  });
}

const outPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'prebuiltBoards.json');
writeFileSync(outPath, JSON.stringify(boards), 'utf8');

const fileSizeKB = Math.round(JSON.stringify(boards).length / 1024);
console.log(`\n✅ Done! Written to prebuiltBoards.json`);
console.log(`   Boards generated: ${NUM_BOARDS}`);
console.log(`   File size: ~${fileSizeKB}KB`);