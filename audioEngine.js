// audioEngine.js — Web Audio API pre-decoded buffer playback
// Drop-in replacement for the <audio> tag swipe sounds

let _ctx = null;
const _buffers = new Map();
const _audioFiles = {};

// Register all your swipe sounds + other SFX here
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
 * STEP 1 — Call this synchronously (no await before it) inside the tap handler.
 * Creates the AudioContext and calls resume() while still inside the gesture
 * trust window that mobile Safari requires.
 * Returns the resume promise — caller can await it or ignore it.
 */
export function unlockAudioContext() {
  const ctx = getCtx();
  console.log(`🔊 [audio] unlockAudioContext called — context state: ${ctx.state}`);
  if (ctx.state === 'suspended') {
    return ctx.resume().then(() => {
      console.log(`🔊 [audio] context resumed — new state: ${ctx.state}`);
    });
  }
  console.log(`🔊 [audio] context was not suspended — state: ${ctx.state}`);
  return Promise.resolve();
}

/**
 * STEP 2 — Call this after unlockAudioContext(). Safe to await.
 * Fetches and decodes all audio files into memory buffers.
 */
export async function preloadBuffers() {
  const ctx = getCtx();
  console.log(`🔊 [audio] preloadBuffers called — context state: ${ctx.state}`);

  const loads = Object.entries(_audioFiles).map(async ([id, url]) => {
    const t0 = performance.now();
    try {
      const res = await fetch(url);
      const arrayBuf = await res.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(arrayBuf);
      _buffers.set(id, audioBuf);
      console.log(`🔊 [audio] ✅ loaded ${id} in ${Math.round(performance.now() - t0)}ms`);
    } catch (e) {
      console.warn(`🔊 [audio] ❌ Failed to load ${id} in ${Math.round(performance.now() - t0)}ms:`, e);
    }
  });

  await Promise.all(loads);
  console.log(`🔊 [audio] all files loaded — ${_buffers.size} buffers ready`);
}

/** Play a pre-decoded buffer — near-zero latency */
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
      console.warn(`🔊 [audio] ⚠️ no <audio> element found for id "${id}"`);
    }
    return;
  }

  try {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  } catch (e) {
    console.warn(`🔊 [audio] ❌ createBufferSource/start failed for "${id}":`, e);
  }
}