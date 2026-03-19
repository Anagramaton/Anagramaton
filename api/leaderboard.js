import { createClient } from '@supabase/supabase-js';

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

  const validModes = ['daily', 'unlimited', 'hexacore'];
  const mode = validModes.includes(req.query?.mode) ? req.query.mode : 'daily';
  const dailyId = (mode === 'unlimited' || mode === 'hexacore') ? mode : (req.query?.dailyId || getTodayId());

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
    .limit(20);

  if (error) {
    console.error('[leaderboard] query error:', error);
    return res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }

  return res.status(200).json({ mode, dailyId, leaderboard: data || [] });
}
