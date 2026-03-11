import { createClient } from '@supabase/supabase-js';

// Scoring constants — must match constants.js in the frontend
const LETTER_POINTS = {
  A: 1, B: 3, C: 3, D: 2, E: 1,
  F: 4, G: 2, H: 4, I: 1, J: 8,
  K: 5, L: 1, M: 3, N: 1, O: 1,
  P: 3, Q: 10, R: 1, S: 1, T: 1,
  U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
};
const LENGTH_MULTIPLIERS = { 5: 3, 6: 4, 7: 5, 8: 6, 9: 7, 10: 10 };
const ANAGRAM_MULTIPLIER = 5;

function scoreWord(word) {
  const upper = String(word).toUpperCase();
  let base = 0;
  for (const c of upper) {
    base += LETTER_POINTS[c] || 1;
  }
  let mult = 1;
  if (upper.length >= 5) {
    mult *= LENGTH_MULTIPLIERS[Math.min(upper.length, 10)] || 1;
  }
  if (upper.length > 1 && upper === upper.split('').reverse().join('')) {
    mult *= ANAGRAM_MULTIPLIER;
  }
  return base * mult;
}

function rowToGameRef(row) {
  if (!row) return null;
  const words = Array.isArray(row.words) ? row.words : [];
  const wordsWithScores = words
    .filter(w => w && typeof w === 'string')
    .map(w => ({ word: w.toUpperCase(), score: scoreWord(w) }))
    .sort((a, b) => b.score - a.score);
  const calculatedScore = wordsWithScores.reduce((sum, ws) => sum + ws.score, 0);
  return {
    dailyId: row.daily_id,
    score: calculatedScore,
    wordsWithScores,
    hintsUsed: Number(row.hints_used) || 0,
    mode: row.mode || (row.daily_id === 'unlimited' ? 'unlimited' : 'daily'),
    date: row.created_at || null,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return res.status(503).json({ configured: false });
  }

  const rawName = (req.query?.name || '').trim();
  if (!rawName) {
    return res.status(404).json({ error: 'not found' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  // Fetch all rows for this player using pagination (handles >1000 rows)
  let allRows = [];
  const PAGE_SIZE = 1000;
  let from = 0;
  let keepFetching = true;

  while (keepFetching) {
    const { data, error } = await supabase
      .from('scores')
      .select('id, daily_id, player_name, score, words, hints_used, mode, created_at')
      .ilike('player_name', rawName)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error('[player] query error:', error);
      return res.status(500).json({ error: 'Failed to fetch player data' });
    }

    if (!data || data.length === 0) {
      keepFetching = false;
    } else {
      allRows = allRows.concat(data);
      if (data.length < PAGE_SIZE) {
        keepFetching = false;
      } else {
        from += PAGE_SIZE;
      }
    }
  }

  if (allRows.length === 0) {
    return res.status(404).json({ error: 'not found' });
  }

  // Use the actual player name as stored (first row's player_name)
  const playerName = allRows[0].player_name;

  // Separate into daily and unlimited rows
  // Older rows without mode: treat daily_id !== 'unlimited' as daily
  const dailyRows = allRows.filter(r => {
    if (r.mode === 'daily') return true;
    if (r.mode === 'unlimited') return false;
    return r.daily_id !== 'unlimited';
  });
  const unlimitedRows = allRows.filter(r => {
    if (r.mode === 'unlimited') return true;
    if (r.mode === 'daily') return false;
    return r.daily_id === 'unlimited';
  });

  return res.status(200).json({
    playerName,
    daily: computeStats(dailyRows),
    unlimited: computeStats(unlimitedRows),
  });
}

function computeStats(rows) {
  if (rows.length === 0) {
    return {
      gamesPlayed: 0,
      highestScore: 0,
      averageScore: 0,
      longestWord: null,
      topWord: null,
      totalHintsUsed: 0,
      recentGames: [],
      highestScoreGame: null,
      longestWordGame: null,
      topWordGame: null,
    };
  }

  const gamesPlayed = rows.length;

  // Compute word-list-based score for each row
  const rowScores = rows.map(r =>
    (Array.isArray(r.words) ? r.words : [])
      .reduce((sum, w) => sum + (w && typeof w === 'string' ? scoreWord(w) : 0), 0)
  );

  const highestScore = Math.max(...rowScores);
  const averageScore = Math.round(rowScores.reduce((s, v) => s + v, 0) / gamesPlayed);
  const totalHintsUsed = rows.reduce((sum, r) => sum + (Number(r.hints_used) || 0), 0);

  // Collect all words across all rows
  let longestWord = null;
  let longestWordRow = null;
  let topWordEntry = null;
  let topWordScore = -1;
  let topWordRow = null;

  for (const row of rows) {
    const words = Array.isArray(row.words) ? row.words : [];
    for (const w of words) {
      if (!w || typeof w !== 'string') continue;
      const upper = w.toUpperCase();

      // Track longest word (tie-break: alphabetically last)
      if (
        longestWord === null ||
        upper.length > longestWord.length ||
        (upper.length === longestWord.length && upper > longestWord)
      ) {
        longestWord = upper;
        longestWordRow = row;
      }

      // Track top word (highest individual score)
      const ws = scoreWord(upper);
      if (
        ws > topWordScore ||
        (ws === topWordScore && topWordEntry !== null && upper > topWordEntry.word)
      ) {
        topWordScore = ws;
        topWordEntry = { word: upper, score: ws };
        topWordRow = row;
      }
    }
  }

  // highestScoreGame: row with the highest calculated score (rows already sorted desc by created_at)
  const highestScoreIdx = rowScores.indexOf(highestScore);
  const highestScoreRow = highestScoreIdx >= 0 ? rows[highestScoreIdx] : null;

  // recentGames: last 20 rows (already sorted by created_at desc)
  // Use rowToGameRef so each entry has calculated scores and wordsWithScores
  const recentGames = rows.slice(0, 20).map(rowToGameRef);

  return {
    gamesPlayed,
    highestScore,
    averageScore,
    longestWord,
    topWord: topWordEntry,
    totalHintsUsed,
    recentGames,
    highestScoreGame: rowToGameRef(highestScoreRow),
    longestWordGame: rowToGameRef(longestWordRow),
    topWordGame: rowToGameRef(topWordRow),
  };
}
