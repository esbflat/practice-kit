// 音楽理論ユーティリティ(平均律・純正律・ダイアトニックコード・コード判定)
// © 2026 Kyohei Kobayashi

export const PC_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const PC_FLAT  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export const SOLFEGE  = ['ド', 'ド#', 'レ', 'レ#', 'ミ', 'ファ', 'ファ#', 'ソ', 'ソ#', 'ラ', 'ラ#', 'シ'];

// 調号で♭を使う主音(長調基準)。短調は平行長調で判定する
const FLAT_KEYS = new Set([5, 10, 3, 8, 1, 6]); // F Bb Eb Ab Db Gb

export const SCALES = {
  major:         [0, 2, 4, 5, 7, 9, 11],
  minor:         [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
};

// 純正律(5リミット)の、根音からの各音程の周波数比
export const JUST_RATIOS = [1, 16 / 15, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 45 / 32, 3 / 2, 8 / 5, 5 / 3, 9 / 5, 15 / 8];

export const mod12 = n => ((n % 12) + 12) % 12;

export function useFlats(keyPc, mode) {
  const majorPc = mode === 'major' ? keyPc : mod12(keyPc + 3);
  return FLAT_KEYS.has(majorPc);
}

export function pcName(pc, { flats = false, style = 'en' } = {}) {
  pc = mod12(pc);
  if (style === 'solfege') return SOLFEGE[pc].replace('#', flats ? '♭' : '#');
  const n = flats ? PC_FLAT[pc] : PC_SHARP[pc];
  return n.replace('#', '♯').replace('b', '♭');
}

export function midiName(midi, opts) {
  return pcName(midi, opts) + (Math.floor(midi / 12) - 1);
}

export function equalFreq(midi, a4 = 442) {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

// 根音 rootPc を平均律で決め、そこから純正比で各音を求める
export function justFreq(midi, rootPc, a4 = 442) {
  const interval = mod12(midi - rootPc);
  const rootMidi = midi - interval;
  return equalFreq(rootMidi, a4) * JUST_RATIOS[interval];
}

// ---- コードの種類 ----
// intervals: 根音からの半音数。symbol: 表記。roman: ローマ数字の修飾
export const CHORD_TYPES = [
  { id: 'maj',   intervals: [0, 4, 7],        symbol: '',      roman: 'upper' },
  { id: 'min',   intervals: [0, 3, 7],        symbol: 'm',     roman: 'lower' },
  { id: 'dim',   intervals: [0, 3, 6],        symbol: 'dim',   roman: 'lower°' },
  { id: 'aug',   intervals: [0, 4, 8],        symbol: 'aug',   roman: 'upper+' },
  { id: 'sus2',  intervals: [0, 2, 7],        symbol: 'sus2',  roman: 'upper' },
  { id: 'sus4',  intervals: [0, 5, 7],        symbol: 'sus4',  roman: 'upper' },
  { id: 'maj7',  intervals: [0, 4, 7, 11],    symbol: 'maj7',  roman: 'upper' },
  { id: 'dom7',  intervals: [0, 4, 7, 10],    symbol: '7',     roman: 'upper' },
  { id: 'min7',  intervals: [0, 3, 7, 10],    symbol: 'm7',    roman: 'lower' },
  { id: 'm7b5',  intervals: [0, 3, 6, 10],    symbol: 'm7♭5',  roman: 'lowerø' },
  { id: 'dim7',  intervals: [0, 3, 6, 9],     symbol: 'dim7',  roman: 'lower°' },
  { id: 'mMaj7', intervals: [0, 3, 7, 11],    symbol: 'mM7',   roman: 'lower' },
  { id: 'augMaj7', intervals: [0, 4, 8, 11],  symbol: 'augM7', roman: 'upper+' },
  { id: 'six',   intervals: [0, 4, 7, 9],     symbol: '6',     roman: 'upper' },
  { id: 'min6',  intervals: [0, 3, 7, 9],     symbol: 'm6',    roman: 'lower' },
];
const TYPE_BY_ID = Object.fromEntries(CHORD_TYPES.map(t => [t.id, t]));

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

const SEVENTH_SUFFIX = { maj7: 'maj7', dom7: '7', min7: '7', m7b5: 'ø7', dim7: '°7', mMaj7: 'mM7', augMaj7: '+M7', six: '6', min6: '6' };
function romanLabel(degree, type, seventh) {
  const base = ROMAN[degree];
  const r = type.roman;
  let s = r.startsWith('lower') ? base.toLowerCase() : base;
  if (seventh && SEVENTH_SUFFIX[type.id]) return s + SEVENTH_SUFFIX[type.id];
  if (r.endsWith('°')) s += '°';
  else if (r.endsWith('ø')) s += 'ø';
  else if (r.endsWith('+')) s += '+';
  return s;
}

// 音程の集合からコードタイプを特定(完全一致のみ)
function matchType(intervals) {
  const key = intervals.join(',');
  return CHORD_TYPES.find(t => t.intervals.join(',') === key) || null;
}

/**
 * 調のダイアトニックコードを返す
 * @param keyPc 主音のピッチクラス
 * @param mode 'major' | 'minor' | 'harmonicMinor'
 * @param seventh 7th コードにするか
 */
export function diatonicChords(keyPc, mode = 'major', seventh = false) {
  const scale = SCALES[mode];
  const flats = useFlats(keyPc, mode === 'major' ? 'major' : 'minor');
  return scale.map((_, deg) => {
    const picks = seventh ? [0, 2, 4, 6] : [0, 2, 4];
    const pcs = picks.map(k => mod12(keyPc + scale[(deg + k) % 7]));
    const intervals = pcs.map(pc => mod12(pc - pcs[0]));
    const type = matchType(intervals) || { id: 'unknown', intervals, symbol: '?', roman: 'upper' };
    return {
      degree: deg,
      rootPc: pcs[0],
      pcs,
      type,
      name: pcName(pcs[0], { flats }) + type.symbol,
      roman: romanLabel(deg, type, seventh),
    };
  });
}

/**
 * 調の第 deg 度を根音に、指定したコード種で作る(丸サ進行のような非ダイアトニック用)
 */
export function chordFromDegree(keyPc, mode, deg, typeId) {
  const scale = SCALES[mode];
  const type = TYPE_BY_ID[typeId];
  const rootPc = mod12(keyPc + scale[deg]);
  const flats = useFlats(keyPc, mode === 'major' ? 'major' : 'minor');
  return {
    degree: deg, rootPc, type,
    pcs: type.intervals.map(i => mod12(rootPc + i)),
    name: pcName(rootPc, { flats }) + type.symbol,
    roman: romanLabel(deg, type, type.intervals.length >= 4),
  };
}

/**
 * 鳴っている MIDI ノート集合からコードを推定する
 * 返り値: { rootPc, type, name, bassPc } または null
 */
export function detectChord(midis, { flats = false } = {}) {
  if (!midis.length) return null;
  const sorted = [...midis].sort((a, b) => a - b);
  const bassPc = mod12(sorted[0]);
  const pcSet = [...new Set(sorted.map(mod12))];
  if (pcSet.length < 2) return null;
  let best = null;
  for (const rootPc of pcSet) {
    const intervals = pcSet.map(pc => mod12(pc - rootPc)).sort((a, b) => a - b);
    const type = matchType(intervals);
    if (!type) continue;
    // 最低音が根音のものを優先、次に音数が少ない(単純な)もの
    const score = (rootPc === bassPc ? 10 : 0) - type.intervals.length * 0.1;
    if (!best || score > best.score) best = { rootPc, type, score };
  }
  if (!best) return null;
  const name = pcName(best.rootPc, { flats }) + best.type.symbol
    + (bassPc !== best.rootPc ? '/' + pcName(bassPc, { flats }) : '');
  return { rootPc: best.rootPc, type: best.type, name, bassPc };
}

/**
 * コードのボイシング(MIDI ノート配列)を作る。根音を rootOctave に置き、上へ積む
 */
export function voiceChord(rootPc, intervals, { rootOctave = 3, bass = false } = {}) {
  const rootMidi = (rootOctave + 1) * 12 + rootPc;
  const notes = intervals.map(i => rootMidi + i);
  if (bass) notes.unshift(rootMidi - 12);
  return notes;
}

// 移調楽器の記譜用: 実音 pc → 記譜 pc(offset は 実音 = 記譜 + offset)
export function writtenPc(soundingPc, offset) {
  return mod12(soundingPc - offset);
}

export { TYPE_BY_ID };
