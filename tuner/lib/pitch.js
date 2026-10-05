// YIN ピッチ検出(de Cheveigné & Kawahara 2002)
// 差分関数 → 累積平均正規化差分(CMND)→ 絶対閾値で最初の谷 → 放物線補間

export function rms(buf) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

/**
 * @param {Float32Array} buf 時間領域サンプル(長さ N。積分窓は N/2)
 * @param {number} sampleRate
 * @param {{threshold?:number, minFreq?:number, maxFreq?:number}} opt
 * @returns {{freq:number|null, clarity:number, dip:number}}
 *   freq: 検出周波数(見つからなければ null)
 *   dip: 採用した谷の CMND 値(小さいほど周期性が強い)。clarity = 1 - dip
 */
export function yin(buf, sampleRate, opt = {}) {
  const threshold = opt.threshold ?? 0.12;
  const minFreq = opt.minFreq ?? 30;
  const maxFreq = opt.maxFreq ?? 2500;

  const w = buf.length >> 1;
  const tauMax = Math.min(w, Math.ceil(sampleRate / minFreq));
  const tauMin = Math.max(2, Math.floor(sampleRate / maxFreq));

  // 1. 差分関数 d(tau)
  const d = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let s = 0;
    for (let i = 0; i < w; i++) {
      const x = buf[i] - buf[i + tau];
      s += x * x;
    }
    d[tau] = s;
  }

  // 2. 累積平均正規化差分 d'(tau)
  const cmnd = new Float32Array(tauMax + 1);
  cmnd[0] = 1;
  let run = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    run += d[tau];
    cmnd[tau] = run === 0 ? 1 : (d[tau] * tau) / run;
  }

  // 3. 絶対閾値: 閾値を下回る最初の谷(局所最小まで下る)
  let tau = -1;
  for (let t = tauMin; t < tauMax; t++) {
    if (cmnd[t] < threshold) {
      while (t + 1 < tauMax && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }

  // 診断用: 範囲内の最小値
  let minVal = cmnd[tauMin];
  for (let t = tauMin; t < tauMax; t++) if (cmnd[t] < minVal) minVal = cmnd[t];

  if (tau < 0) return { freq: null, clarity: 1 - minVal, dip: minVal };

  // 4. 放物線補間
  let better = tau;
  if (tau > 0 && tau < tauMax) {
    const s0 = cmnd[tau - 1];
    const s1 = cmnd[tau];
    const s2 = cmnd[tau + 1];
    const denom = s0 - 2 * s1 + s2;
    if (denom !== 0) better = tau + (s0 - s2) / (2 * denom);
  }

  return { freq: sampleRate / better, clarity: 1 - cmnd[tau], dip: cmnd[tau] };
}
