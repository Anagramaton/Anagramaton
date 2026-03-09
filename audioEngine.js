// audioEngine.js — Web Audio API pre-decoded buffer playback

let _ctx = null;
const _buffers = new Map();
const _audioFiles = {};

for (let i = 1; i <= 25; i++) {
  _audioFiles[`sfxSwipe${i}`] = `./audio/ascend1${String.fromCharCode(64 + i)}.mp3`;
}
_audioFiles['sfxAlert']   = './audio/alert.mp3';
_audioFiles['sfxSuccess'] = './audio/ohyeahh.mp3';
_audioFiles['sfxMagic']   = './audio/zapsplat_magic_wand_ascend_spell_beeps_12528.mp3';
_audioFiles['sfxUnlock']  = './audio/zapsplat_musical_piano_insides_strings_strum_002_101394.mp3';

function getCtx() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
  window._debugAudioCtx = _ctx;
  return _ctx;
}

/**
 * STEP 1 — call this SYNCHRONOUSLY inside a user gesture handler.
 * Creates and resumes the AudioContext while iOS still considers
 * the gesture active. Must NOT be awaited before calling.
 */
export function unlockAudioContext() {
  const ctx = getCtx();
  if (ctx.state === 'suspended') {
    // resume() must be called synchronously inside the gesture
    ctx.resume().then(() => {
      console.log(`🔊 [audio] context resumed — state: ${ctx.state}`);
    }).catch(e => {
      console.warn(`🔊 [audio] resume failed:`, e);
    });
  } else {
    console.log(`🔊 [audio] context already active — state: ${ctx.state}`);
  }
}

/**
 * STEP 2 — call this after unlockAudioContext() to decode all buffers.
 * Safe to await since the context is already unlocked by this point.
 */
export async function preloadBuffers() {
  const ctx = getCtx();
  console.log(`🔊 [audio] preloadBuffers called — ctx.state: ${ctx.state}`);

  const loads = Object.entries(_audioFiles).map(async ([id, url]) => {
    const t0 = performance.now();
    try {
      const res = await fetch(url);
      const arrayBuf = await res.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(arrayBuf);
      _buffers.set(id, audioBuf);
      console.log(`🔊 [audio] ✅ loaded ${id} in ${Math.round(performance.now() - t0)}ms`);
    } catch (e) {
      console.warn(`🔊 [audio] ❌ failed to load ${id}:`, e);
    }
  });

  await Promise.all(loads);
  console.log(`🔊 [audio] all files loaded — ${_buffers.size} buffers ready`);
}

/** Keep this export so existing calls to unlockAndPreload() don't break */
export async function unlockAndPreload() {
  unlockAudioContext();       // sync — resumes context inside gesture
  await preloadBuffers();     // async — decodes files after context is active
}

export function playSound(id) {
  const ctx = getCtx();
  console.log(`🔊 [audio] playSound("${id}") — ctx.state: ${ctx.state} — buffer loaded: ${_buffers.has(id)}`);

  const buf = _buffers.get(id);
  if (!buf) {
    console.warn(`🔊 [audio] ⚠️ buffer not found for "${id}" — falling back to <audio> tag`);
    const el = document.getElementById(id);
    if (el) {
      try { el.currentTime = 0; el.play().catch(err => console.warn(`🔊 [audio] <audio> fallback failed:`, err)); }
      catch(e) { console.warn(`🔊 [audio] <audio> fallback error:`, e); }
    } else {
      console.warn(`🔊 [audio] ⚠️ no <audio> element found for "${id}"`);
    }
    return;
  }

  try {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  } catch (e) {
    console.warn(`🔊 [audio] ❌ playback failed for "${id}":`, e);
  }
}