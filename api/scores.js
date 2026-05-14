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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    dailyId,
    playerName,
    score,
    words,
    hintsUsed,
    mode = 'daily',
    tilesUsed,
    penalty,
    solveTimeSeconds,
  } = req.body || {};

  const requestContext = {
    dailyId: dailyId || null,
    mode: mode || 'daily',
    playerName: typeof playerName === 'string' ? playerName.trim() : null,
    score: typeof score === 'number' ? score : null,
    wordsCount: Array.isArray(words) ? words.length : null,
    hintsUsed: Number.isFinite(Number(hintsUsed)) ? Number(hintsUsed) : null,
    tilesUsed: Number.isFinite(tilesUsed) ? Math.round(tilesUsed) : null,
    penalty: Number.isFinite(penalty) ? Math.round(penalty) : null,
    solveTimeSeconds: Number.isFinite(solveTimeSeconds) ? Math.round(solveTimeSeconds) : null,
  };

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('[scores] missing Supabase configuration', {
      hasUrl: Boolean(process.env.SUPABASE_URL),
      hasServiceKey: Boolean(process.env.SUPABASE_SERVICE_KEY),
      context: requestContext,
    });
    return res.status(503).json({ configured: false, error: 'Leaderboard not configured' });
  }

  if (mode === 'unlimited' || mode === 'hexacore') {
    // No date validation for unlimited/hexacore modes; use fixed partition key
  } else {
    // Validate dailyId matches today
    const todayId = getTodayId();
    if (!dailyId || (mode !== 'hexacore_daily' && dailyId !== todayId)) {
      console.warn('[scores] rejected invalid dailyId', { todayId, context: requestContext });
      return res.status(400).json({ error: 'Invalid or expired dailyId' });
    }
    if (mode === 'hexacore_daily') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dailyId))) {
        console.warn('[scores] rejected invalid hexacore_daily date format', { context: requestContext });
        return res.status(400).json({ error: 'Invalid hexacore_daily date format' });
      }
      const submittedDay = new Date(`${dailyId}T00:00:00Z`);
      const todayDay = new Date();
      todayDay.setUTCHours(0, 0, 0, 0);
      if (!Number.isFinite(submittedDay.getTime()) || submittedDay.getTime() > todayDay.getTime()) {
        console.warn('[scores] rejected future/invalid hexacore_daily date', { context: requestContext });
        return res.status(400).json({ error: 'hexacore_daily date cannot be in the future' });
      }
    }
  }

  // Validate playerName
  if (!playerName || typeof playerName !== 'string' || playerName.trim().length === 0) {
    console.warn('[scores] rejected empty playerName', { context: requestContext });
    return res.status(400).json({ error: 'playerName must be a non-empty string' });
  }
  if (playerName.trim().length > 30) {
    console.warn('[scores] rejected long playerName', { context: requestContext });
    return res.status(400).json({ error: 'playerName must be 30 characters or fewer' });
  }

  // Validate score
  if (typeof score !== 'number' || !isFinite(score) || score < 0) {
    console.warn('[scores] rejected invalid score', { context: requestContext });
    return res.status(400).json({ error: 'score must be a non-negative number' });
  }

  // Validate words — hexacore is endless so allow up to 500 words
  const maxWords = mode === 'hexacore' ? 500 : mode === 'hexacore_daily' ? 200 : 10;
  if (!Array.isArray(words) || words.length > maxWords) {
    console.warn('[scores] rejected invalid words payload', { maxWords, context: requestContext });
    return res.status(400).json({ error: `words must be an array of up to ${maxWords} strings` });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  const normalizedDailyId = dailyId || getTodayId();
  const partitionId =
    mode === 'unlimited'
      ? 'unlimited'
      : mode === 'hexacore'
        ? 'hexacore'
        : mode === 'hexacore_daily'
          ? `hexacore_daily:${normalizedDailyId}`
          : normalizedDailyId;
  const modeValue =
    mode === 'unlimited'
      ? 'unlimited'
      : mode === 'hexacore'
        ? 'hexacore'
        : mode === 'hexacore_daily'
          ? 'hexacore_daily'
          : 'daily';

  if (mode === 'hexacore' || mode === 'hexacore_daily') {
    // Only update if new score beats the existing personal best
    const { data: existing, error: existingError } = await supabase
      .from('scores')
      .select('score')
      .eq('daily_id', partitionId)
      .eq('mode', modeValue)
      .eq('player_name', playerName.trim())
      .maybeSingle();

    if (existingError) {
      console.error('[scores] existing score lookup failed:', {
        error: existingError,
        partitionId,
        modeValue,
        context: requestContext,
      });
      return res.status(500).json({ error: 'Failed to check existing score', details: existingError.message || null });
    }

    if (existing && existing.score >= Math.round(score)) {
      return res.status(200).json({ ok: true, newBest: false });
    }
  }

  const { error } = await supabase
    .from('scores')
    .upsert(
      {
        daily_id:    partitionId,
        player_name: playerName.trim(),
        score:       Math.round(score),
        words:       words.map(String),
        hints_used:  Number(hintsUsed) || 0,
        mode:        modeValue,
        tiles_used:  Number.isFinite(tilesUsed) ? Math.max(0, Math.round(tilesUsed)) : null,
        penalty:     Number.isFinite(penalty) ? Math.max(0, Math.round(penalty)) : null,
        solve_time_seconds: Number.isFinite(solveTimeSeconds) ? Math.max(0, Math.round(solveTimeSeconds)) : null,
      },
      // Unique index is (daily_id, player_name, mode) so each mode stores independent personal bests.
      { onConflict: 'daily_id,player_name,mode', ignoreDuplicates: false }
    );

  if (error) {
    console.error('[scores] upsert error:', {
      error,
      partitionId,
      modeValue,
      context: requestContext,
    });
    return res.status(500).json({ error: 'Failed to save score', details: error.message || null, code: error.code || null });
  }

  return res.status(200).json({ ok: true, newBest: true });
}
