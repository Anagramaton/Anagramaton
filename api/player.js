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

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return res.status(503).json({ configured: false });
  }

  const rawName = (req.query?.name || '').trim();
  if (!rawName) {
    return res.status(404).json({ error: 'not found' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  // Look up player by screen_name
  const { data: playerRow, error: playerError } = await supabase
    .from('players')
    .select('id, screen_name')
    .ilike('screen_name', rawName)
    .maybeSingle();

  if (playerError) {
    console.error('[player] lookup error:', playerError);
    return res.status(500).json({ error: 'Failed to fetch player' });
  }

  if (!playerRow) {
    return res.status(404).json({ error: 'not found' });
  }

  const { id: playerId, screen_name: playerName } = playerRow;

  // Fetch all Anagramaton scores for this player
  let anagramatonRows = [];
  let from = 0;
  const PAGE_SIZE = 1000;
  let keepFetching = true;

  while (keepFetching) {
    const { data, error } = await supabase
      .from('anagramaton_scores')
      .select('id, daily_id, score, words, hints_used, created_at')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error('[player] anagramaton query error:', error);
      return res.status(500).json({ error: 'Failed to fetch player data' });
    }

    if (!data || data.length === 0) {
      keepFetching = false;
    } else {
      anagramatonRows = anagramatonRows.concat(data);
      keepFetching = data.length === PAGE_SIZE;
      from += PAGE_SIZE;
    }
  }

  // Fetch hexacore scores for this player (endless only for now)
  const { data: hexacoreRows, error: hexError } = await supabase
    .from('hexacore_scores')
    .select('id, partition_id, mode, score, words, created_at')
    .eq('player_id', playerId)
    .eq('mode', 'endless')
    .order('score', { ascending: false })
    .limit(1);

  if (hexError) {
    console.error('[player] hexacore query error:', hexError);
  }

  // Separate into daily and unlimited rows
  const dailyRows = anagramatonRows.filter(r => r.daily_id !== 'unlimited');
  const unlimitedRows = anagramatonRows.filter(r => r.daily_id === 'unlimited');

  // Add mode for stats helper
  dailyRows.forEach(r => { r.mode = 'daily'; });
  unlimitedRows.forEach(r => { r.mode = 'unlimited'; });

  return res.status(200).json({
    playerName,
    daily:     computeStats(dailyRows),
    unlimited: computeStats(unlimitedRows),
    hexacore: {
      highestScore: hexacoreRows && hexacoreRows.length > 0 ? hexacoreRows[0].score : 0,
    },
  });
}

function computeWordScore(word) {
  const pts = {
    A: 1, B: 3, C: 3, D: 2, E: 1,
    F: 4, G: 2, H: 4, I: 1, J: 8,
    K: 5, L: 1, M: 3, N: 1, O: 1,
    P: 3, Q: 10, R: 1, S: 1, T: 1,
    U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
  };
  const lengthMults = { 5: 3, 6: 4, 7: 5, 8: 6, 9: 7, 10: 10 };
  const upper = word.toUpperCase();
  let base = 0;
  for (const ch of upper) base += pts[ch] || 1;
  const len = upper.length;
  const lm = len >= 5 ? (lengthMults[Math.min(len, 10)] || 1) : 1;
  const isPalindrome = upper === upper.split('').reverse().join('');
  return Math.round(base * lm * (isPalindrome ? 5 : 1));
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

  let longestWord = null;
  const wordFreq = {};

  for (const row of rows) {
    const words = Array.isArray(row.words) ? row.words : [];
    for (const w of words) {
      if (!w || typeof w !== 'string') continue;
      const upper = w.toUpperCase();
      if (
        longestWord === null ||
        upper.length > longestWord.length ||
        (upper.length === longestWord.length && upper > longestWord)
      ) {
        longestWord = upper;
      }
      wordFreq[upper] = (wordFreq[upper] || 0) + 1;
    }
  }

  let topWord = null;
  let topWordScore = 0;
  for (const word of Object.keys(wordFreq)) {
    const s = computeWordScore(word);
    if (s > topWordScore || (s === topWordScore && topWord !== null && word > topWord)) {
      topWord = word;
      topWordScore = s;
    }
  }

  const toGameObj = r => ({
    dailyId:   r.daily_id,
    score:     Number(r.score) || 0,
    words:     Array.isArray(r.words) ? r.words : [],
    hintsUsed: Number(r.hints_used) || 0,
    mode:      r.mode || (r.daily_id === 'unlimited' ? 'unlimited' : 'daily'),
    date:      r.created_at || null,
  });

  const highestScoreRow = rows.find(r => (Number(r.score) || 0) === highestScore);
  const highestScoreGame = highestScoreRow ? toGameObj(highestScoreRow) : null;

  const longestWordRow = longestWord
    ? rows.find(r => (Array.isArray(r.words) ? r.words : []).some(w => typeof w === 'string' && w.toUpperCase() === longestWord))
    : null;
  const longestWordGame = longestWordRow ? toGameObj(longestWordRow) : null;

  const topWordRow = topWord
    ? rows.find(r => (Array.isArray(r.words) ? r.words : []).some(w => typeof w === 'string' && w.toUpperCase() === topWord))
    : null;
  const topWordGame = topWordRow ? toGameObj(topWordRow) : null;
  const topWordDisplay = topWord ? topWord + ' (' + topWordScore + ')' : null;

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
