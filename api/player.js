import { createClient } from '@supabase/supabase-js';

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
    };
  }

  const gamesPlayed = rows.length;
  const highestScore = Math.max(...rows.map(r => Number(r.score) || 0));
  const averageScore = Math.round(
    rows.reduce((sum, r) => sum + (Number(r.score) || 0), 0) / gamesPlayed
  );
  const totalHintsUsed = rows.reduce((sum, r) => sum + (Number(r.hints_used) || 0), 0);

  // Collect all words across all rows
  let longestWord = null;
  const wordFreq = {};

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
      }

      // Track word frequency
      wordFreq[upper] = (wordFreq[upper] || 0) + 1;
    }
  }

  // topWord: most frequently appearing word across all games
  let topWord = null;
  let topCount = 0;
  for (const [word, count] of Object.entries(wordFreq)) {
    if (count > topCount || (count === topCount && topWord !== null && word > topWord)) {
      topWord = word;
      topCount = count;
    }
  }

  // Helper: convert a DB row to a game object
  const toGameObj = r => ({
    dailyId: r.daily_id,
    score: Number(r.score) || 0,
    words: Array.isArray(r.words) ? r.words : [],
    hintsUsed: Number(r.hints_used) || 0,
    mode: r.mode || (r.daily_id === 'unlimited' ? 'unlimited' : 'daily'),
    date: r.created_at || null,
  });

  // Find source game for key stats (rows already sorted by created_at desc → most recent first)
  const highestScoreRow = rows.find(r => (Number(r.score) || 0) === highestScore);
  const highestScoreGame = highestScoreRow ? toGameObj(highestScoreRow) : null;

  const longestWordRow = longestWord
    ? rows.find(r => (Array.isArray(r.words) ? r.words : []).some(w => typeof w === 'string' && w.toUpperCase() === longestWord))
    : null;
  const longestWordGame = longestWordRow ? toGameObj(longestWordRow) : null;

  const topWordRaw = topWord;
  const topWordRow = topWordRaw
    ? rows.find(r => (Array.isArray(r.words) ? r.words : []).some(w => typeof w === 'string' && w.toUpperCase() === topWordRaw))
    : null;
  const topWordGame = topWordRow ? toGameObj(topWordRow) : null;

  // Format topWord to include play count
  const topWordDisplay = topWord ? `${topWord} ×${topCount}` : null;

  // recentGames: last 20 rows (already sorted by created_at desc)
  const recentGames = rows.slice(0, 20).map(toGameObj);

  return {
    gamesPlayed,
    highestScore,
    averageScore,
    longestWord,
    topWord: topWordDisplay,
    totalHintsUsed,
    recentGames,
    highestScoreGame,
    longestWordGame,
    topWordGame,
  };
}
