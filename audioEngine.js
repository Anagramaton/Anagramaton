// audioEngine.js — Web Audio API pre-decoded buffer playback

let _muted = false;
try { _muted = localStorage.getItem('anagramaton_muted') === '1'; } catch(_) {}

export function isMuted() { return _muted; }

export function setMuted(val) {
  _muted = val;
  try { localStorage.setItem('anagramaton_muted', val ? '1' : '0'); } catch(_) {}
}

export function toggleMute() {
  setMuted(!_muted);
  return _muted;
}

let _ctx = null;
const _buffers = new Map();
const _activeSources = new Map();
const _audioFiles = {};

// Register all your swipe sounds + other SFX here
for (let i = 1; i <= 25; i++) {
  _audioFiles[`sfxSwipe${i}`] = `./audio/ascend1${String.fromCharCode(64 + i)}.mp3`;
}
_audioFiles['sfxAlert']   = './audio/alert.mp3';
_audioFiles['sfxSuccess'] = './audio/ohyeahh.mp3';
_audioFiles['sfxUnlock']  = './audio/zapsplat_musical_piano_insides_strings_strum_002_101394.mp3';
_audioFiles['sfxFunk'] = './audio/prettyjohn1-funk-funky-music_32sec-483398.mp3';
_audioFiles['sfxGemCollect'] = './audio/zapsplat_multimedia_game_sound_collect_twinkle_sparkle_glissando_gem_stone_award_109027.mp3';

function getCtx() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
  return _ctx;
}

/**
 * STEP 1 — Call synchronously (no await before it) inside the tap handler.
 * Creates the AudioContext and calls resume() while still inside the gesture
 * trust window that mobile Safari requires.
 */
export function unlockAudioContext() {
  const ctx = getCtx();
  if (ctx.state === 'suspended') {
    return ctx.resume();
  }
  return Promise.resolve();
}

/**
 * STEP 2 — Call after unlockAudioContext(). Safe to await.
 * Fetches and decodes all audio files into memory buffers.
 */
export async function preloadBuffers() {
  const ctx = getCtx();

  const loads = Object.entries(_audioFiles).map(async ([id, url]) => {
    try {
      const res = await fetch(url);
      const arrayBuf = await res.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(arrayBuf);
      _buffers.set(id, audioBuf);
    } catch (e) {
      // silently ignore — playSound will fall back to <audio> tag
    }
  });

  await Promise.all(loads);
}

/** Play a pre-decoded buffer — near-zero latency */
export function playSound(id) {
  if (_muted) return;
  const ctx = getCtx();

  const buf = _buffers.get(id);
  if (!buf) {
    const el = document.getElementById(id);
    if (el) {
      try { el.currentTime = 0; el.play().catch(() => {}); }
      catch(e) {}
    }
    return;
  }

  try {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
    _activeSources.set(id, src);
    src.onended = () => { if (_activeSources.get(id) === src) _activeSources.delete(id); };
  } catch (e) {}
}

/** Stop a currently-playing source by id */
export function stopSound(id) {
  const src = _activeSources.get(id);
  if (src) {
    src.onended = null;
    try { src.stop(); } catch (e) {}
    _activeSources.delete(id);
    return;
  }
  // Fallback: stop <audio> tag if Web Audio buffer wasn't used
  const el = document.getElementById(id);
  if (el) {
    try { el.pause(); el.currentTime = 0; } catch (e) {}
  }
}