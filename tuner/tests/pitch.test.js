import test from 'node:test';
import assert from 'node:assert/strict';
import { yin, rms } from '../lib/pitch.js';
import { analyzeFreq, centsBetween } from '../lib/music.js';

const SR = 48000;
const N = 4096;

function synth(freq, { harmonics = [1], amp = 0.5, noise = 0, phase = 0.3 } = {}) {
  const buf = new Float32Array(N);
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
  for (let i = 0; i < N; i++) {
    let v = 0;
    harmonics.forEach((h, k) => { v += (amp / (k + 1)) * Math.sin(2 * Math.PI * freq * h * i / SR + phase); });
    buf[i] = v + noise * rnd();
  }
  return buf;
}

test('rms of silence and sine', () => {
  assert.equal(rms(new Float32Array(N)), 0);
  const r = rms(synth(440, { amp: 1 }));
  assert.ok(Math.abs(r - Math.SQRT1_2) < 0.01, String(r));
});

test('yin detects pure sine within 1 cent', () => {
  for (const f of [55, 110, 220, 261.63, 442, 880, 1760]) {
    const r = yin(synth(f), SR, { threshold: 0.12 });
    assert.ok(r.freq, `no pitch for ${f}`);
    const c = Math.abs(centsBetween(r.freq, f));
    assert.ok(c < 1, `${f} Hz -> ${r.freq.toFixed(3)} (${c.toFixed(2)} cents)`);
    assert.ok(r.clarity > 0.9, `clarity ${r.clarity}`);
  }
});

test('yin detects harmonic-rich tone (brass-like) without octave error', () => {
  for (const f of [58.27, 116.54, 233.08, 466.16, 932.33]) {
    const r = yin(synth(f, { harmonics: [1, 2, 3, 4, 5] }), SR);
    assert.ok(r.freq, `no pitch for ${f}`);
    const c = Math.abs(centsBetween(r.freq, f));
    assert.ok(c < 2, `${f} Hz -> ${r.freq.toFixed(3)} (${c.toFixed(2)} cents)`);
  }
});

test('yin returns null on silence and on white noise', () => {
  const s = yin(new Float32Array(N), SR);
  assert.equal(s.freq, null);
  const n = yin(synth(0, { amp: 0, noise: 0.5 }), SR);
  assert.equal(n.freq, null);
});

test('yin with light noise still within 3 cents', () => {
  const f = 349.23;
  const r = yin(synth(f, { harmonics: [1, 2, 3], noise: 0.05 }), SR);
  assert.ok(r.freq);
  assert.ok(Math.abs(centsBetween(r.freq, f)) < 3);
});

test('end to end: slightly sharp A4 reads as A4 with positive cents', () => {
  const f = 442 * Math.pow(2, 12 / 1200);
  const r = yin(synth(f, { harmonics: [1, 2, 3] }), SR);
  const a = analyzeFreq(r.freq, 442);
  assert.equal(a.midi, 69);
  assert.ok(Math.abs(a.cents - 12) < 1.5, String(a.cents));
});

test('yin performance: one 4096-sample frame well under a 16 ms frame budget', () => {
  const buf = synth(220, { harmonics: [1, 2, 3] });
  yin(buf, SR); // warm up
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) yin(buf, SR);
  const ms = (performance.now() - t0) / 20;
  assert.ok(ms < 16, `avg ${ms.toFixed(2)} ms`);
});
