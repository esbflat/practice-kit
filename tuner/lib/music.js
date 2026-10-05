// 音名・周波数・セントの変換(純粋関数。Node でもブラウザでも動く)

export const NOTATIONS = {
  en: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
  solfege: ['ド', 'ド#', 'レ', 'レ#', 'ミ', 'ファ', 'ファ#', 'ソ', 'ソ#', 'ラ', 'ラ#', 'シ'],
  de: ['C', 'Cis', 'D', 'Dis', 'E', 'F', 'Fis', 'G', 'Gis', 'A', 'B', 'H'],
};

// 実音(concert)→ 記譜音にするための半音オフセット
export const TRANSPOSE_OFFSET = { C: 0, Bb: 2, Eb: 9, F: 7 };

export const DEFAULT_A4 = 442;

export function midiToFreq(midi, a4 = DEFAULT_A4) {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

export function freqToMidiFloat(freq, a4 = DEFAULT_A4) {
  return 69 + 12 * Math.log2(freq / a4);
}

// 周波数 → 最寄りの MIDI 番号と、そこからのセント偏差(-50..+50)
export function analyzeFreq(freq, a4 = DEFAULT_A4) {
  if (!(freq > 0)) return null;
  const m = freqToMidiFloat(freq, a4);
  const midi = Math.round(m);
  return { midi, cents: (m - midi) * 100 };
}

export function centsBetween(freq, refFreq) {
  return 1200 * Math.log2(freq / refFreq);
}

export function pitchClass(midi) {
  return ((midi % 12) + 12) % 12;
}

export function octaveOf(midi) {
  return Math.floor(midi / 12) - 1;
}

export function writtenMidi(midi, transpose = 'C') {
  return midi + (TRANSPOSE_OFFSET[transpose] || 0);
}

export function noteLabel(midi, { notation = 'en', transpose = 'C', octave = true } = {}) {
  const w = writtenMidi(midi, transpose);
  const names = NOTATIONS[notation] || NOTATIONS.en;
  return names[pitchClass(w)] + (octave ? String(octaveOf(w)) : '');
}

export function clampCents(c) {
  return Math.max(-50, Math.min(50, c));
}

// 'in' | 'low' | 'high'
export function tuningState(cents, tolerance = 5) {
  if (Math.abs(cents) <= tolerance) return 'in';
  return cents < 0 ? 'low' : 'high';
}

export function mean(arr) {
  if (!arr.length) return 0;
  let s = 0;
  for (const v of arr) s += v;
  return s / arr.length;
}

export function stddev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  let s = 0;
  for (const v of arr) s += (v - m) * (v - m);
  return Math.sqrt(s / (arr.length - 1));
}
