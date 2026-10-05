// Web Audio 合成エンジン: 倍音列を式で作る音色 + ADSR 風エンベロープ
// © 2026 Kyohei Kobayashi

const N = 12; // 使う倍音の数

// 各音色の倍音列を「式」で定義する(n = 倍音番号 1..N)
function series(fn) {
  const arr = new Float32Array(N + 1);
  for (let n = 1; n <= N; n++) arr[n] = Math.max(0, fn(n));
  return arr;
}

export const TONES = [
  { id: 'clarinet', ja: 'クラリネット', en: 'Clarinet',
    // 閉管モデル: 奇数倍音が主、偶数倍音は微量
    harmonics: series(n => (n % 2 ? Math.pow(n, -1.2) : 0.03 / n)),
    attack: 0.04, release: 0.06, level: 0.30 },
  { id: 'flute', ja: 'フルート', en: 'Flute',
    harmonics: series(n => Math.pow(n, -2.2)),
    attack: 0.06, release: 0.08, level: 0.34 },
  { id: 'trumpet', ja: 'トランペット', en: 'Trumpet',
    harmonics: series(n => n <= 8 ? Math.pow(n, -0.7) : Math.pow(n, -2)),
    attack: 0.025, release: 0.06, level: 0.20 },
  { id: 'horn', ja: 'ホルン', en: 'Horn',
    harmonics: series(n => Math.pow(n, -1.6)),
    attack: 0.07, release: 0.12, level: 0.30 },
  { id: 'trombone', ja: 'トロンボーン', en: 'Trombone',
    harmonics: series(n => n <= 6 ? Math.pow(n, -0.9) : Math.pow(n, -1.8)),
    attack: 0.04, release: 0.08, level: 0.22 },
  { id: 'oboe', ja: 'オーボエ', en: 'Oboe',
    // 2〜3倍音にフォルマントの山
    harmonics: series(n => Math.exp(-Math.pow(n - 2.5, 2) / 3) + 0.05 / n),
    attack: 0.03, release: 0.06, level: 0.24 },
  { id: 'square', ja: '矩形波', en: 'Square',
    harmonics: series(n => (n % 2 ? 1 / n : 0)),
    attack: 0.02, release: 0.04, level: 0.18 },
  { id: 'saw', ja: 'のこぎり波', en: 'Saw',
    harmonics: series(n => 1 / n),
    attack: 0.02, release: 0.05, level: 0.16 },
  { id: 'sine', ja: '正弦波', en: 'Sine',
    harmonics: series(n => (n === 1 ? 1 : 0)),
    attack: 0.03, release: 0.05, level: 0.36 },
];

export class Synth {
  constructor() {
    this.ctx = null; this.master = null; this.wave = null;
    this.tone = TONES[0]; this.volume = 0.6;
    this.voices = new Map();
  }
  get running() { return !!this.ctx && this.ctx.state === 'running'; }

  ensure() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this._buildWave();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  _buildWave() {
    const h = this.tone.harmonics;
    this.wave = this.ctx.createPeriodicWave(new Float32Array(h.length), h);
  }
  setTone(tone) { this.tone = tone; if (this.ctx) this._buildWave(); }
  setVolume(v) {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.master) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
  }
  noteOn(id, freq, { delay = 0 } = {}) {
    const ctx = this.ensure();
    if (this.voices.has(id)) { this.retune(id, freq); return; }
    const t = ctx.currentTime + delay;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(this.tone.level, t + this.tone.attack);
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(this.wave);
    osc.frequency.value = freq;
    osc.connect(env).connect(this.master);
    osc.start(t);
    this.voices.set(id, { osc, env });
  }
  noteOff(id) {
    const v = this.voices.get(id);
    if (!v) return;
    this.voices.delete(id);
    const t = this.ctx.currentTime;
    v.env.gain.cancelScheduledValues(t);
    v.env.gain.setTargetAtTime(0, t, this.tone.release);
    v.osc.stop(t + this.tone.release * 8);
    v.osc.onended = () => { try { v.osc.disconnect(); v.env.disconnect(); } catch {} };
  }
  retune(id, freq) {
    const v = this.voices.get(id);
    if (v) v.osc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.015);
  }
  stopAll() { for (const id of [...this.voices.keys()]) this.noteOff(id); }
}
