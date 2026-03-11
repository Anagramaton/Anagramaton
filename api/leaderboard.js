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
  for (const c of upper) base += LETTER_POINTS[c] || 1;
  let mult = 1;
  if (upper.length >= 5) mult *= LENGTH_MULTIPLIERS[Math.min(upper.length, 10)] || 1;
  if (upper.length > 1 && upper === upper.split('').reverse().join('')) mult *= ANAGRAM_MULTIPLIER;
  return base * mult;
}

function calcWordListScore(words) {
  if (!Array.isArray(words)) return 0;
  return words.reduce((sum, w) => sum + (w && typeof w === 'string' ? scoreWord(w) : 0), 0);
}

function getTodayId() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}_${m}_${day}`;
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

  const mode = req.query?.mode === 'unlimited' ? 'unlimited' : 'daily';
  const dailyId = mode === 'unlimited' ? 'unlimited' : (req.query?.dailyId || getTodayId());

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return res.status(200).json({ configured: false, mode, dailyId, leaderboard: [] });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  const { data, error } = await supabase
    .from('scores')
    .select('player_name, score, words')
    .eq('daily_id', dailyId)
    .order('score', { ascending: false })
    .limit(100);

  if (error) {
    console.error('[leaderboard] query error:', error);
    return res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }

  // Recalculate each entry's score from its submitted word list (no tile-reuse inflation)
  // Then re-sort by the recalculated score and take the top 20
  const recalculated = (data || [])
    .map(entry => ({
      player_name: entry.player_name,
      score: calcWordListScore(entry.words),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  return res.status(200).json({ mode, dailyId, leaderboard: recalculated });
}
