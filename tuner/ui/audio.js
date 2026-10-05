// Web Audio: マイク入力(AnalyserNode)とオシレーター発音

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.stream = null;
    this.source = null;
    this.analyser = null;
    this.buf = null;
    this.tones = new Map(); // id -> {osc, gain}
  }

  ensureContext() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  get sampleRate() {
    return this.ctx ? this.ctx.sampleRate : 48000;
  }

  get running() {
    return !!this.stream;
  }

  async startMic(deviceId) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('unsupported');
    }
    this.ensureContext();
    this.stopMic();
    const audio = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    };
    if (deviceId) audio.deviceId = { exact: deviceId };
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio });
    } catch (e) {
      if (deviceId) {
        // 指定デバイスが無効なら既定で再試行
        delete audio.deviceId;
        stream = await navigator.mediaDevices.getUserMedia({ audio });
      } else {
        throw e;
      }
    }
    this.stream = stream;
    this.source = this.ctx.createMediaStreamSource(stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 4096;
    this.analyser.smoothingTimeConstant = 0;
    this.source.connect(this.analyser);
    this.buf = new Float32Array(this.analyser.fftSize);
    stream.getTracks().forEach((tr) => {
      tr.addEventListener('ended', () => this.stopMic());
    });
  }

  stopMic() {
    if (this.stream) {
      this.stream.getTracks().forEach((tr) => tr.stop());
      this.stream = null;
    }
    if (this.source) {
      try { this.source.disconnect(); } catch { /* ignore */ }
      this.source = null;
    }
    this.analyser = null;
  }

  // 時間領域データを読む(マイク停止中は null)
  read() {
    if (!this.analyser) return null;
    this.analyser.getFloatTimeDomainData(this.buf);
    return this.buf;
  }

  // 発音: 同じ id なら周波数だけ更新
  playTone(id, freq, { type = 'triangle', volume = 0.2 } = {}) {
    const ctx = this.ensureContext();
    const now = ctx.currentTime;
    let tone = this.tones.get(id);
    if (!tone) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume, now + 0.02);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      tone = { osc, gain, volume };
      this.tones.set(id, tone);
    } else {
      tone.osc.frequency.setTargetAtTime(freq, now, 0.01);
      tone.gain.gain.cancelScheduledValues(now);
      tone.gain.gain.setTargetAtTime(volume, now, 0.02);
    }
  }

  stopTone(id) {
    const tone = this.tones.get(id);
    if (!tone) return;
    const now = this.ctx.currentTime;
    tone.gain.gain.cancelScheduledValues(now);
    tone.gain.gain.setTargetAtTime(0, now, 0.02);
    tone.osc.stop(now + 0.15);
    this.tones.delete(id);
  }

  stopAllTones() {
    for (const id of [...this.tones.keys()]) this.stopTone(id);
  }

  async listInputs() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
    const devs = await navigator.mediaDevices.enumerateDevices();
    return devs.filter((d) => d.kind === 'audioinput');
  }
}
