// gameAudio.js — Unified Web Audio Engine

// Create one shared audio context for the entire game
export const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// Dictionary of loaded audio buffers
const buffers = {};

// Load + decode a single sound into memory
export async function loadSound(key, url) {
  const res = await fetch(url);
  const arrayBuffer = await res.arrayBuffer();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  buffers[key] = audioBuffer;
}

// Play a loaded sound
export function playSound(key) {
  const buffer = buffers[key];
  if (!buffer) return;

  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(audioCtx.destination);
  source.start(0);
}
