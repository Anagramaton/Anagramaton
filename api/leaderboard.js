import { createClient } from '@supabase/supabase-js';

function getTodayId() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return y + '_' + m + '_' + day;
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

  const validModes = ['daily', 'unlimited', 'hexacore', 'hexacore_daily'];
  const mode = validModes.includes(req.query?.mode) ? req.query.mode : 'daily';
  const requestedDailyId = req.query?.dailyId || getTodayId();

  const dailyId =
    mode === 'unlimited'
      ? 'unlimited'
      : mode === 'hexacore'
        ? 'hexacore'
        : mode === 'hexacore_daily'
          ? 'hexacore_daily:' + requestedDailyId
          : requestedDailyId;

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return res.status(200).json({ configured: false, mode, dailyId, leaderboard: [] });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  const limit = mode === 'hexacore_daily' ? 50 : 20;

  let data, error;

  if (mode === 'hexacore' || mode === 'hexacore_daily') {
    // Query hexacore_scores joined with players
    const partitionId = mode === 'hexacore' ? 'hexacore' : 'hexacore_daily:' + requestedDailyId;
    const modeValue   = mode === 'hexacore' ? 'endless' : 'hexacore_daily';

    ({ data, error } = await supabase
      .from('hexacore_scores')
      .select('score, words, tiles_used, level, xp_earned, players!inner(screen_name)')
      .eq('partition_id', partitionId)
      .order('score', { ascending: false })
      .limit(limit));

    if (!error && data) {
      data = data.map(row => ({
        player_name: row.players?.screen_name || 'Anonymous',
        score:       row.score,
        words:       row.words || [],
        tiles_used:  row.tiles_used,
        level:       row.level,
        xp_earned:   row.xp_earned,
      }));
    }
  } else {
    // Query anagramaton_scores joined with players
    ({ data, error } = await supabase
      .from('anagramaton_scores')
      .select('score, words, hints_used, tiles_used, penalty, solve_time_seconds, players!inner(screen_name)')
      .eq('daily_id', dailyId)
      .order('score', { ascending: false })
      .limit(limit));

    if (!error && data) {
      data = data.map(row => ({
        player_name:         row.players?.screen_name || 'Anonymous',
        score:               row.score,
        words:               row.words || [],
        hints_used:          row.hints_used,
        tiles_used:          row.tiles_used,
        penalty:             row.penalty,
        solve_time_seconds:  row.solve_time_seconds,
      }));
    }
  }

  if (error) {
    console.error('[leaderboard] query error:', error);
    return res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }

  return res.status(200).json({ configured: true, mode, dailyId, leaderboard: data || [] });
}
