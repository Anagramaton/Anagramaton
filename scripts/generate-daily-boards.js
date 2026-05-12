import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { generateDailyHexacoreBoard, validateDailyBoard } from '../hexacoreDailyGenerator.js';

function parseArgs(argv) {
  const out = { startDate: null, days: 30, force: false, summaryFile: null };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--start-date=')) out.startDate = arg.split('=')[1];
    if (arg.startsWith('--days=')) out.days = Number(arg.split('=')[1]);
    if (arg === '--force' || arg === '--force=true') out.force = true;
    if (arg.startsWith('--force=')) out.force = arg.split('=')[1] === 'true';
    if (arg.startsWith('--summary-file=')) out.summaryFile = arg.split('=')[1];
  }
  return out;
}

function toIsoDateUTC(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isIsoDate(str) {
  return /^\d{4}-\d{2}-\d{2}$/.test(str || '');
}

function addDaysIso(startDate, addDays) {
  const d = new Date(`${startDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + addDays);
  return toIsoDateUTC(d);
}

const args = parseArgs(process.argv);
const startDate = args.startDate || toIsoDateUTC();
const days = Number.isFinite(args.days) ? Math.max(1, Math.floor(args.days)) : 30;

if (!isIsoDate(startDate)) {
  console.error(`Invalid --start-date value: ${startDate}`);
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const boardsDir = join(root, 'boards', 'daily');
mkdirSync(boardsDir, { recursive: true });

const summary = {
  startDate,
  days,
  force: !!args.force,
  generated: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
  failures: [],
};

console.log(`📅 Generating Hexacore daily boards from ${startDate} for ${days} day(s)${args.force ? ' (force)' : ''}`);

for (let i = 0; i < days; i++) {
  const date = addDaysIso(startDate, i);
  const filename = `${date}.json`;
  const outPath = join(boardsDir, filename);
  const existed = existsSync(outPath);

  if (existed && !args.force) {
    summary.skipped += 1;
    console.log(`[${i + 1}/${days}] ⏭ ${date} (exists)`);
    continue;
  }

  let wrote = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const generated = generateDailyHexacoreBoard({
        date,
        maxAttempts: 10,
        attemptSeedOffset: (attempt - 1) * 100,
        includePlacements: true,
      });
      const { placements = [], ...board } = generated;
      const validation = validateDailyBoard({
        grid: board.grid,
        placements,
        specialTiles: board.specialTiles,
      });
      if (!validation.valid) throw new Error(validation.reason || 'validateDailyBoard() failed');

      board.metadata.maxPossibleScore = validation.maxScore;
      board.metadata.minAchievableScore = validation.minScore;
      board.metadata.strategicPathCount = validation.strategicPaths;
      board.metadata.optimalSolutions = validation.strategies;

      writeFileSync(outPath, `${JSON.stringify(board, null, 2)}\n`, 'utf8');
      wrote = true;
      if (existed) summary.updated += 1;
      else summary.generated += 1;
      console.log(`[${i + 1}/${days}] ✓ ${date} (${board.metadata.maxPossibleScore} max est)`);
      break;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[${i + 1}/${days}] attempt ${attempt}/3 failed for ${date}: ${message}`);
      if (attempt === 3) {
        summary.failed += 1;
        summary.failures.push({ date, error: message });
      }
    }
  }

  if (!wrote) continue;
}

const boardFiles = readdirSync(boardsDir)
  .filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
  .sort();

const boards = boardFiles.map((filename) => {
  const date = filename.replace('.json', '');
  const data = JSON.parse(readFileSync(join(boardsDir, filename), 'utf8'));
  return {
    date,
    filename,
    maxScore: Number(data?.metadata?.maxPossibleScore) || 0,
    generatedAt: data?.metadata?.generatedAt || null,
  };
});

const manifest = {
  generatedAt: new Date().toISOString(),
  boards,
};

writeFileSync(join(boardsDir, 'index.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

if (args.summaryFile) {
  writeFileSync(args.summaryFile, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
}

console.log('✅ Daily board generation complete');
console.log(
  `   generated=${summary.generated} updated=${summary.updated} skipped=${summary.skipped} failed=${summary.failed} totalIndexed=${boards.length}`,
);
if (summary.failures.length) {
  console.log(`   failures=${summary.failures.map(f => f.date).join(',')}`);
}
