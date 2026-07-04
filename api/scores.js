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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return res.status(503).json({ configured: false, error: 'Leaderboard not configured' });
  }

  // ── Auth token validation ──────────────────────────────────────

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing auth token' });
  }

  // Use service key client to verify the user's JWT
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid or expired auth token' });
  }

  // Look up player profile by user_id
  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('id, screen_name')
    .eq('user_id', user.id)
    .maybeSingle();

  if (playerError || !player) {
    return res.status(401).json({ error: 'Player profile not found — set a gamer tag first' });
  }

  const playerId = player.id;

  // ── Parse request body ─────────────────────────────────────────

  const {
    dailyId,
    score,
    words,
    hintsUsed,
    mode = 'daily',
    tilesUsed,
    penalty,
    solveTimeSeconds,
  } = req.body || {};

  // ── Validate mode & dailyId ────────────────────────────────────

  if (mode === 'unlimited' || mode === 'hexacore') {
    // No date validation for unlimited/hexacore modes
  } else if (mode === 'hexacore_daily' || mode === 'hexacore_daily_unlimited') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dailyId || ''))) {
      return res.status(400).json({ error: `Invalid ${mode} date format` });
    }
    const submittedDay = new Date(dailyId + 'T00:00:00Z');
    const todayDay = new Date();
    todayDay.setUTCHours(0, 0, 0, 0);
    if (!Number.isFinite(submittedDay.getTime()) || submittedDay.getTime() > todayDay.getTime()) {
      return res.status(400).json({ error: `${mode} date cannot be in the future` });
    }
  } else {
    // daily mode
    const todayId = getTodayId();
    if (!dailyId || dailyId !== todayId) {
      return res.status(400).json({ error: 'Invalid or expired dailyId' });
    }
  }

  // ── Validate score ─────────────────────────────────────────────

  if (typeof score !== 'number' || !isFinite(score) || score < 0) {
    return res.status(400).json({ error: 'score must be a non-negative number' });
  }

  // ── Validate words ─────────────────────────────────────────────

  const maxWords = mode === 'hexacore' ? 500 : (mode === 'hexacore_daily' || mode === 'hexacore_daily_unlimited') ? 200 : 10;
  if (!Array.isArray(words) || words.length > maxWords) {
    return res.status(400).json({ error: 'words must be an array of up to ' + maxWords + ' strings' });
  }

  // ── Write to appropriate table ─────────────────────────────────

  if (mode === 'hexacore' || mode === 'hexacore_daily' || mode === 'hexacore_daily_unlimited') {
    const partitionId = mode === 'hexacore'
      ? 'hexacore'
      : mode === 'hexacore_daily_unlimited'
        ? 'hexacore_daily_unlimited:' + dailyId
        : 'hexacore_daily:' + dailyId;
    const modeValue = mode === 'hexacore' ? 'endless' : mode;

    // Only update if new score beats the existing personal best
    const { data: existing } = await supabase
      .from('hexacore_scores')
      .select('score')
      .eq('player_id', playerId)
      .eq('partition_id', partitionId)
      .eq('mode', modeValue)
      .maybeSingle();

    if (existing && existing.score >= Math.round(score)) {
      return res.status(200).json({ ok: true, newBest: false });
    }

    const { error: upsertError } = await supabase
      .from('hexacore_scores')
      .upsert(
        {
          player_id:    playerId,
          mode:         modeValue,
          partition_id: partitionId,
          score:        Math.round(score),
          words:        words.map(String),
          tiles_used:   Number.isFinite(tilesUsed) ? Math.max(0, Math.round(tilesUsed)) : null,
        },
        { onConflict: 'player_id,partition_id,mode', ignoreDuplicates: false }
      );

    if (upsertError) {
      console.error('[scores] hexacore upsert error:', upsertError);
      return res.status(500).json({ error: 'Failed to save score' });
    }

    return res.status(200).json({ ok: true, newBest: true });
  }

  // Anagramaton (daily / unlimited)
  const normalizedDailyId = dailyId || getTodayId();
  const partitionId = mode === 'unlimited' ? 'unlimited' : normalizedDailyId;

  const { error: upsertError } = await supabase
    .from('anagramaton_scores')
    .upsert(
      {
        player_id:           playerId,
        daily_id:            partitionId,
        score:               Math.round(score),
        words:               words.map(String),
        hints_used:          Number(hintsUsed) || 0,
        tiles_used:          Number.isFinite(tilesUsed) ? Math.max(0, Math.round(tilesUsed)) : null,
        penalty:             Number.isFinite(penalty) ? Math.max(0, Math.round(penalty)) : null,
        solve_time_seconds:  Number.isFinite(solveTimeSeconds) ? Math.max(0, Math.round(solveTimeSeconds)) : null,
      },
      { onConflict: 'player_id,daily_id', ignoreDuplicates: false }
    );

  if (upsertError) {
    console.error('[scores] anagramaton upsert error:', upsertError);
    return res.status(500).json({ error: 'Failed to save score' });
  }

  return res.status(200).json({ ok: true, newBest: true });
}
