import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { generateDailyHexacoreBoard, generateDailyHexacoreBatch } from '../hexacoreDailyGenerator.js';

function parseArgs(argv) {
  const out = { count: null, date: null };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--count=')) out.count = Number(arg.split('=')[1]);
    if (arg.startsWith('--date=')) out.date = arg.split('=')[1];
  }
  return out;
}

function toIsoDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function summarizeSpecials(board) {
  const specials = Array.isArray(board?.specialTiles) ? board.specialTiles : [];
  const countByType = new Map();
  specials.forEach(s => countByType.set(s.type, (countByType.get(s.type) || 0) + 1));

  const rotatingGem = specials.find(s => s.type === 'gemEmerald' || s.type === 'gemGold')?.type ?? 'none';
  const rotatingSpecial = specials.find(s => s.type === 'rune' || s.type === 'amethyst')?.type ?? 'none';
  const digraphs = specials
    .filter(s => s.type === 'digraph')
    .map(s => String(s.digraph || '').toUpperCase())
    .filter(Boolean);
  const portals = specials.filter(s => s.type === 'portal');
  const portalSummary = portals.length >= 2
    ? `${portals[0].q},${portals[0].r} -> ${portals[1].q},${portals[1].r}`
    : 'missing';

  console.log(`   specials: prism=${countByType.get('prism') || 0}, rotateGem=${rotatingGem}, rotateSpecial=${rotatingSpecial}, portals=${portals.length} (${portalSummary}), digraphs=${digraphs.length}${digraphs.length ? ` [${digraphs.join(', ')}]` : ''}`);
}

const args = parseArgs(process.argv);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'boards', 'hexacoreDaily');
mkdirSync(outDir, { recursive: true });

if (args.count && args.count > 1) {
  const startDate = args.date || toIsoDate();
  console.log(`📅 Generating ${args.count} Hexacore Daily Challenge boards from ${startDate}`);
  const boards = generateDailyHexacoreBatch({ startDate, count: args.count, includePlacements: true });
  boards.forEach((board, i) => {
    const fp = join(outDir, `${board.date}.json`);
    writeFileSync(fp, JSON.stringify(board, null, 2), 'utf8');
    console.log(`[${i + 1}/${boards.length}] ✓ ${board.date} (${board.metadata.maxPossibleScore} max est)`);
    summarizeSpecials(board);
  });
  console.log(`✅ Wrote ${boards.length} board files to boards/hexacoreDaily`);
} else {
  const date = args.date || toIsoDate();
  console.log(`📅 Generating Hexacore Daily Challenge board for ${date}`);
  const board = generateDailyHexacoreBoard({ date, includePlacements: true });
  const fp = join(outDir, `${date}.json`);
  writeFileSync(fp, JSON.stringify(board, null, 2), 'utf8');
  console.log(`✅ Wrote ${fp}`);
  console.log(`   maxPossibleScore: ${board.metadata.maxPossibleScore}`);
  console.log(`   strategicPathCount: ${board.metadata.strategicPathCount}`);
  summarizeSpecials(board);
}
