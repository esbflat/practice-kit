// 楽器定義: 移調と音域(実音 MIDI 番号・3段階)

export const FAMILIES = ['woodwind', 'brass', 'strings', 'other'];

// range: [下限, 上限] は実音(concert pitch)の MIDI 番号
export const INSTRUMENTS = [
  { id: 'clarinet', family: 'woodwind', transpose: 'Bb',
    range: { easy: [50, 70], mid: [50, 77], adv: [50, 89] } },
  { id: 'flute', family: 'woodwind', transpose: 'C',
    range: { easy: [62, 86], mid: [60, 89], adv: [60, 96] } },
  { id: 'oboe', family: 'woodwind', transpose: 'C',
    range: { easy: [62, 81], mid: [58, 86], adv: [58, 91] } },
  { id: 'altosax', family: 'woodwind', transpose: 'Eb',
    range: { easy: [53, 65], mid: [51, 70], adv: [49, 81] } },
  { id: 'tenorsax', family: 'woodwind', transpose: 'Bb',
    range: { easy: [48, 60], mid: [46, 65], adv: [44, 76] } },
  { id: 'trumpet', family: 'brass', transpose: 'Bb',
    range: { easy: [58, 70], mid: [53, 77], adv: [52, 82] } },
  { id: 'horn', family: 'brass', transpose: 'F',
    range: { easy: [53, 65], mid: [48, 72], adv: [41, 77] } },
  { id: 'trombone', family: 'brass', transpose: 'C',
    range: { easy: [46, 65], mid: [41, 70], adv: [40, 74] } },
  { id: 'euphonium', family: 'brass', transpose: 'C',
    range: { easy: [46, 65], mid: [41, 70], adv: [36, 74] } },
  { id: 'tuba', family: 'brass', transpose: 'C',
    range: { easy: [34, 53], mid: [29, 58], adv: [24, 62] } },
  { id: 'violin', family: 'strings', transpose: 'C',
    range: { easy: [55, 71], mid: [55, 83], adv: [55, 96] } },
  { id: 'piano', family: 'other', transpose: 'C',
    range: { easy: [48, 72], mid: [36, 84], adv: [21, 108] } },
];

export const LEVELS = ['easy', 'mid', 'adv'];

export function getInstrument(id) {
  return INSTRUMENTS.find((i) => i.id === id) || null;
}

export function instrumentsOf(family) {
  return INSTRUMENTS.filter((i) => i.family === family);
}

// 音域の MIDI 番号を半音ごとに列挙
export function rangeNotes(instrumentId, level = 'mid') {
  const inst = getInstrument(instrumentId);
  if (!inst) return [];
  const r = inst.range[level] || inst.range.mid;
  const out = [];
  for (let m = r[0]; m <= r[1]; m++) out.push(m);
  return out;
}
