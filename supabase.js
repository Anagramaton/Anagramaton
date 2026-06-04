// supabase.js — frontend Supabase client for anonymous auth & player profile management

import { createClient } from '@supabase/supabase-js';

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let _supabase = null;

function getSupabase() {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  if (!_supabase) {
    _supabase = createClient(supabaseUrl, supabaseAnonKey);
  }
  return _supabase;
}

/* \u2500\u2500 Session management \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

export async function ensureAuthSession() {
  const sb = getSupabase();
  if (!sb) return null;

  const { data: { session } } = await sb.auth.getSession();
  if (session) return session;

  // No existing session — create a new anonymous user
  const { data, error } = await sb.auth.signInAnonymously();
  if (error) {
    console.warn('[supabase] signInAnonymously failed:', error.message);
    return null;
  }
  return data.session;
}

export async function signOut() {
  const sb = getSupabase();
  if (!sb) return;
  await sb.auth.signOut();
  _profileCache = null;
}

/* \u2500\u2500 Player profile \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

let _profileCache = null; // in-memory cache: { screen_name: string } | null

export async function getPlayerProfile() {
  const sb = getSupabase();
  if (!sb) return null;

  if (_profileCache !== null) return _profileCache.screen_name;

  const session = await ensureAuthSession();
  if (!session) return null;

  const { data, error } = await sb
    .from('players')
    .select('screen_name')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (error || !data) {
    _profileCache = { screen_name: null };
    return null;
  }

  _profileCache = { screen_name: data.screen_name };
  return data.screen_name;
}

export async function setPlayerScreenName(screenName) {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase not configured');

  const session = await ensureAuthSession();
  if (!session) throw new Error('No auth session');

  const { data, error } = await sb
    .from('players')
    .upsert(
      { user_id: session.user.id, screen_name: screenName },
      { onConflict: 'user_id' }
    )
    .select('screen_name')
    .single();

  if (error) throw error;

  _profileCache = { screen_name: data.screen_name };
  return data.screen_name;
}

export function clearProfileCache() {
  _profileCache = null;
}

/* \u2500\u2500 Score submission (calls backend API with auth token) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

export async function submitScore(dailyId, score, words, hintsUsed, mode = 'daily', metadata = null) {
  const session = await ensureAuthSession();
  if (!session) return null;

  const payload = { dailyId, score, words, hintsUsed, mode };
  if (metadata && typeof metadata === 'object') {
    if (Number.isFinite(metadata.tilesUsed)) payload.tilesUsed = Math.round(metadata.tilesUsed);
    if (Number.isFinite(metadata.penalty)) payload.penalty = Math.round(metadata.penalty);
    if (Number.isFinite(metadata.solveTimeSeconds)) payload.solveTimeSeconds = Math.round(metadata.solveTimeSeconds);
  }

  try {
    const res = await fetch('/api/scores', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('[supabase] submitScore failed:', err);
    return null;
  }
}

/* \u2500\u2500 Leaderboard fetch \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

export async function fetchLeaderboard(dailyId, mode = 'daily') {
  try {
    const url = dailyId
      ? '/api/leaderboard?dailyId=' + encodeURIComponent(dailyId) + '&mode=' + encodeURIComponent(mode)
      : '/api/leaderboard?mode=' + encodeURIComponent(mode);
    const res = await fetch(url);
    if (!res.ok) return { configured: true, entries: [] };
    const data = await res.json();
    return {
      configured: data.configured !== false,
      entries: Array.isArray(data.leaderboard) ? data.leaderboard : [],
    };
  } catch (err) {
    console.warn('[supabase] fetchLeaderboard failed:', err);
    return { configured: true, entries: [] };
  }
}
