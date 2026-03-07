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
  return _ctx;
}

/** Call once on first user gesture to unlock + preload all buffers */
export async function unlockAndPreload() {
  const ctx = getCtx();
  if (ctx.state === 'suspended') await ctx.resume();

  const loads = Object.entries(_audioFiles).map(async ([id, url]) => {
    try {
      const res = await fetch(url);
      const arrayBuf = await res.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(arrayBuf);
      _buffers.set(id, audioBuf);
    } catch (e) {
      console.warn(`[audioEngine] Failed to load ${id}:`, e);
    }
  });
  await Promise.all(loads);
}

/** Play a pre-decoded buffer — near-zero latency */
export function playSound(id) {
  const ctx = getCtx();
  const buf = _buffers.get(id);
  if (!buf) {
    // Fallback: try the <audio> tag
    const el = document.getElementById(id);
    if (el) { try { el.currentTime = 0; el.play().catch(() => {}); } catch(e) {} }
    return;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start(0);
}