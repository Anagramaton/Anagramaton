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

  const { dailyId, playerName, score, words, hintsUsed, mode = 'daily' } = req.body || {};

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return res.status(503).json({ configured: false, error: 'Leaderboard not configured' });
  }

  if (mode === 'unlimited' || mode === 'hexacore') {
    // No date validation for unlimited/hexacore modes; use fixed partition key
  } else {
    // Validate dailyId matches today
    const todayId = getTodayId();
    if (!dailyId || dailyId !== todayId) {
      return res.status(400).json({ error: 'Invalid or expired dailyId' });
    }
  }

  // Validate playerName
  if (!playerName || typeof playerName !== 'string' || playerName.trim().length === 0) {
    return res.status(400).json({ error: 'playerName must be a non-empty string' });
  }
  if (playerName.trim().length > 30) {
    return res.status(400).json({ error: 'playerName must be 30 characters or fewer' });
  }

  // Validate score
  if (typeof score !== 'number' || !isFinite(score) || score <= 0) {
    return res.status(400).json({ error: 'score must be a positive number' });
  }

  // Validate words — hexacore is endless so allow up to 500 words
  const maxWords = mode === 'hexacore' ? 500 : 10;
  if (!Array.isArray(words) || words.length > maxWords) {
    return res.status(400).json({ error: `words must be an array of up to ${maxWords} strings` });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  if (mode === 'hexacore') {
    // Only update if new score beats the existing personal best
    const { data: existing } = await supabase
      .from('scores')
      .select('score')
      .eq('daily_id', 'hexacore')
      .eq('player_name', playerName.trim())
      .maybeSingle();

    if (existing && existing.score >= Math.round(score)) {
      return res.status(200).json({ ok: true, newBest: false });
    }
  }

  const partitionId = (mode === 'unlimited' || mode === 'hexacore') ? mode : dailyId;
  const modeValue   = mode === 'unlimited' ? 'unlimited' : mode === 'hexacore' ? 'hexacore' : 'daily';

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
      },
      { onConflict: 'daily_id,player_name', ignoreDuplicates: false }
    );

  if (error) {
    console.error('[scores] upsert error:', error);
    return res.status(500).json({ error: 'Failed to save score' });
  }

  return res.status(200).json({ ok: true, newBest: true });
}
