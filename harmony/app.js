// Harmony Pad — 鍵盤 + ダイアトニックコード学習モード
// © 2026 Kyohei Kobayashi
import { PC_SHARP, mod12, pcName, useFlats, equalFreq, justFreq, diatonicChords, detectChord, voiceChord, SCALES } from './theory.js';
import { Synth, TONES } from './synth.js';

// ---------------- i18n ----------------
const I18N = {
  ja: {
    mode_keys: '鍵盤', mode_chords: 'コード', latch: '持続', key: '調', harmonic_minor: '和声的短音階', bass: 'ベース音',
    progression: 'コード進行', prog_add: 'タップで追加', clear: 'クリア', play: '再生', stop: '停止', beats: '拍/コード', loop: 'ループ',
    prog_empty: 'プリセットを選ぶか「タップで追加」をオンにしてコードを押してください',
    quiz: '聴き取りクイズ', quiz_start: '出題', quiz_replay: 'もう一度聴く', quiz_help: '出題されたコードを聴いて、上のコードボタンから答えを選びます。',
    quiz_listen: '聴いて答えてください', quiz_good: '正解!', quiz_bad: '不正解。正解は', quiz_score: '正解 {a} / {b}',
    settings: '設定', language: '言語 / Language', tone: '音色', volume: '音量', concert_pitch: '基準ピッチ A4', temperament: '音律',
    temp_equal: '平均律', temp_just_chord: '純正律(コード根音)', temp_just_key: '純正律(調の主音)', just_root: '主音',
    instrument_key: '楽器の調(記譜)', visible_octaves: '鍵盤の幅', theme: 'テーマ', theme_light: '明', theme_dark: '暗',
    wake_lock: 'スリープ防止', wake_on: '有効', wake_off: '無効', wake_na: '非対応', install: 'アプリとしてインストール', install_btn: 'インストール',
    installed: 'インストール済みです', install_ios: 'Safari の共有ボタン → 「ホーム画面に追加」でインストールできます',
    install_other: 'ブラウザのメニューから「アプリをインストール」を選んでください',
    reset: '設定を初期化', reset_btn: '初期化', reset_done: '初期化しました', credits_note: '音声ファイルを使わず Web Audio API で合成しています。',
    preset_custom: '（手動）', written: '記譜', concert: '実音',
    presets: ['ポップス定番 I–V–vi–IV', '50年代 I–vi–IV–V', 'ツーファイブ ii–V–I', '三和音の基本 I–IV–V–I', '王道進行 IV–V–iii–vi', '小室進行 vi–IV–V–I', 'カノン進行', '循環 I–vi–ii–V', '下降 vi–V–IV–III(短調向き)'],
  },
  en: {
    mode_keys: 'Keys', mode_chords: 'Chords', latch: 'Hold', key: 'Key', harmonic_minor: 'Harmonic minor', bass: 'Bass',
    progression: 'Progression', prog_add: 'Tap to add', clear: 'Clear', play: 'Play', stop: 'Stop', beats: 'beats/chord', loop: 'Loop',
    prog_empty: 'Pick a preset, or turn on "Tap to add" and tap chords',
    quiz: 'Ear quiz', quiz_start: 'New', quiz_replay: 'Replay', quiz_help: 'Listen to the chord, then answer with the chord buttons above.',
    quiz_listen: 'Listen and answer', quiz_good: 'Correct!', quiz_bad: 'Wrong. Answer:', quiz_score: 'Score {a} / {b}',
    settings: 'Settings', language: 'Language', tone: 'Tone', volume: 'Volume', concert_pitch: 'Concert pitch A4', temperament: 'Temperament',
    temp_equal: 'Equal', temp_just_chord: 'Just (chord root)', temp_just_key: 'Just (key tonic)', just_root: 'Tonic',
    instrument_key: 'Instrument key (written)', visible_octaves: 'Keyboard width', theme: 'Theme', theme_light: 'Light', theme_dark: 'Dark',
    wake_lock: 'Keep awake', wake_on: 'On', wake_off: 'Off', wake_na: 'Unsupported', install: 'Install as app', install_btn: 'Install',
    installed: 'Already installed', install_ios: 'Safari: Share → "Add to Home Screen"', install_other: 'Use the browser menu → "Install app"',
    reset: 'Reset settings', reset_btn: 'Reset', reset_done: 'Settings reset', credits_note: 'All sounds are synthesized with the Web Audio API; no audio files.',
    preset_custom: '(custom)', written: 'written', concert: 'concert',
    presets: ['Pop I–V–vi–IV', '50s I–vi–IV–V', 'ii–V–I', 'Triads I–IV–V–I', 'IV–V–iii–vi', 'vi–IV–V–I', 'Canon', 'Turnaround I–vi–ii–V', 'Descending vi–V–IV–III'],
  },
};
const PRESETS = [[0, 4, 5, 3], [0, 5, 3, 4], [1, 4, 0], [0, 3, 4, 0], [3, 4, 2, 5], [5, 3, 4, 0], [0, 4, 5, 2, 3, 0, 3, 4], [0, 5, 1, 4], [5, 4, 3, 2]];
const TRANSPOSITIONS = [
  { id: 'C', label: 'in C', offset: 0 }, { id: 'Bb', label: 'in B♭ (Tp, Cl, Euph TC)', offset: -2 },
  { id: 'Eb', label: 'in E♭ (Eb Cl)', offset: 3 }, { id: 'EbAlto', label: 'in E♭ (Alto Sax)', offset: -9 },
  { id: 'F', label: 'in F (Hr)', offset: -7 },
];

// ---------------- state ----------------
const LS = 'pk_harmony_';
const DEFAULTS = {
  lang: navigator.language.startsWith('ja') ? 'ja' : 'en', theme: 'light', toneId: 'clarinet', volume: 60, a4: 442,
  temperament: 'justChord', justRoot: 0, transposition: 'C', visibleOct: 2, startOct: 3, latch: false, wake: false,
  mode: 'keys', keyPc: 0, scale: 'major', seventh: false, harmonic: false, bass: true, bpm: 80, beats: 4, loop: true,
};
const state = { ...DEFAULTS };
for (const k of Object.keys(DEFAULTS)) {
  const v = localStorage.getItem(LS + k);
  if (v !== null) { try { state[k] = JSON.parse(v); } catch {} }
}
const save = k => localStorage.setItem(LS + k, JSON.stringify(state[k]));
const t = (key) => (I18N[state.lang] || I18N.ja)[key] ?? key;
const $ = id => document.getElementById(id);
const synth = new Synth();
window.__synth = synth; // 動作確認用

const transOffset = () => TRANSPOSITIONS.find(x => x.id === state.transposition)?.offset ?? 0;
const flatsNow = () => useFlats(state.keyPc, state.scale);

// ---------------- 発音まわり ----------------
// id → { midi(実音) } を持ち、音律の根音が変わったら全ボイスを再調律する
const sounding = new Map();
function rootForJust() {
  if (state.temperament === 'justKey') return state.justRoot;
  const midis = [...sounding.values()];
  const ch = detectChord(midis);
  if (ch) return ch.rootPc;
  return midis.length ? mod12(Math.min(...midis)) : null;
}
function freqOf(midi, rootPc) {
  if (state.temperament === 'equal' || rootPc === null) return equalFreq(midi, state.a4);
  return justFreq(midi, rootPc, state.a4);
}
function retuneAll() {
  const root = rootForJust();
  for (const [id, midi] of sounding) synth.retune(id, freqOf(midi, root));
}
function soundOn(id, midi, delay = 0) {
  sounding.set(id, midi);
  synth.noteOn(id, freqOf(midi, rootForJust()), { delay });
  retuneAll(); updateChordName(); markKeys();
}
function soundOff(id) {
  sounding.delete(id); synth.noteOff(id);
  retuneAll(); updateChordName(); markKeys();
}
function stopEverything() {
  for (const id of [...sounding.keys()]) soundOff(id);
  stopProgression();
}

function updateChordName() {
  const el = $('chordName');
  const midis = [...sounding.values()];
  const flats = flatsNow();
  const ch = detectChord(midis, { flats });
  if (ch) {
    let html = ch.name;
    const off = transOffset();
    if (off) html += `<small>${t('written')}: ${pcName(ch.rootPc - off, { flats })}${ch.type.symbol}</small>`;
    el.innerHTML = html;
  } else if (midis.length) {
    el.textContent = midis.sort((a, b) => a - b).map(m => pcName(m, { flats })).join(' ');
  } else el.textContent = '—';
}

// ---------------- 鍵盤 ----------------
const keyEls = new Map(); // written midi → element
const isBlack = m => [1, 3, 6, 8, 10].includes(mod12(m));
function buildPiano() {
  const piano = $('piano'); piano.innerHTML = ''; keyEls.clear();
  const low = (state.startOct + 1) * 12, high = low + 12 * state.visibleOct;
  const whites = []; for (let m = low; m <= high; m++) if (!isBlack(m)) whites.push(m);
  const ww = 100 / whites.length;
  const flats = flatsNow();
  for (let m = low; m <= high; m++) {
    const el = document.createElement('div');
    el.className = 'key ' + (isBlack(m) ? 'b' : 'w');
    el.dataset.midi = m;
    el.innerHTML = `<span>${pcName(m, { flats })}${mod12(m) === 0 ? Math.floor(m / 12) - 1 : ''}</span>`;
    if (isBlack(m)) { el.style.left = `calc(${(whites.indexOf(m - 1) + 1) * ww}% - ${ww * 0.3}%)`; el.style.width = `${ww * 0.6}%`; }
    else { el.style.left = `${whites.indexOf(m) * ww}%`; el.style.width = `${ww}%`; }
    piano.appendChild(el); keyEls.set(m, el);
  }
  $('octLabel').textContent = `C${state.startOct}–C${state.startOct + state.visibleOct}`;
  const tr = TRANSPOSITIONS.find(x => x.id === state.transposition);
  $('transLabel').textContent = tr.offset ? `${tr.label} → ${t('concert')} ${tr.offset > 0 ? '+' : ''}${tr.offset}` : '';
  markKeys();
}
// 鳴っている音(on)とコードの構成音(hl)を鍵盤に表示
function markKeys() {
  const off = transOffset();
  const onWritten = new Set([...sounding.values()].map(m => m - off));
  for (const [m, el] of keyEls) el.classList.toggle('on', onWritten.has(m));
}
function highlightChordKeys(midisSounding) {
  const off = transOffset();
  const set = new Set((midisSounding || []).map(m => m - off));
  for (const [m, el] of keyEls) el.classList.toggle('hl', set.has(m));
}

const held = new Map(); // pointerId → written midi
function keyPress(written, src) {
  const id = `${src}:${written}`;
  if (state.latch && sounding.has(id)) { soundOff(id); return; }
  soundOn(id, written + transOffset());
}
function keyRelease(written, src) { if (!state.latch) soundOff(`${src}:${written}`); }
{
  const piano = $('piano');
  piano.addEventListener('pointerdown', e => {
    const el = e.target.closest('.key'); if (!el) return;
    piano.setPointerCapture(e.pointerId);
    const m = +el.dataset.midi; held.set(e.pointerId, m); keyPress(m, 'k');
  });
  piano.addEventListener('pointermove', e => {
    if (!held.has(e.pointerId) || state.latch) return;
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.key'); if (!el) return;
    const m = +el.dataset.midi, prev = held.get(e.pointerId);
    if (m !== prev) { keyRelease(prev, 'k'); held.set(e.pointerId, m); keyPress(m, 'k'); }
  });
  const up = e => { const m = held.get(e.pointerId); if (m == null) return; held.delete(e.pointerId); keyRelease(m, 'k'); };
  piano.addEventListener('pointerup', up); piano.addEventListener('pointercancel', up);
}
$('btnOctDown').onclick = () => { state.startOct = Math.max(1, state.startOct - 1); save('startOct'); buildPiano(); };
$('btnOctUp').onclick = () => { state.startOct = Math.min(6, state.startOct + 1); save('startOct'); buildPiano(); };

// ---------------- コードモード ----------------
let chords = [];
let progression = [];      // 度数の配列
let progTimer = null, progIndex = -1, progIds = [];
let quiz = { answer: null, correct: 0, total: 0, waiting: false };

function currentChords() {
  const scale = state.scale === 'minor' && state.harmonic ? 'harmonicMinor' : state.scale;
  return diatonicChords(state.keyPc, scale, state.seventh);
}
function chordVoicing(ch) {
  return voiceChord(ch.rootPc, ch.type.intervals, { rootOctave: 3, bass: state.bass });
}
function chordOn(ch, src, strum = 0.012) {
  chordOff(src);
  const notes = chordVoicing(ch);
  notes.forEach((m, i) => soundOn(`${src}:${m}`, m, i * strum));
  highlightChordKeys(notes);
}
function chordOff(src) {
  for (const id of [...sounding.keys()]) if (id.startsWith(src + ':')) soundOff(id);
}

function buildChordGrid() {
  chords = currentChords();
  const grid = $('chordGrid'); grid.innerHTML = '';
  const off = transOffset(), flats = flatsNow();
  chords.forEach((ch, i) => {
    const b = document.createElement('button');
    b.className = 'chord-btn'; b.dataset.deg = i;
    b.innerHTML = `<span class="roman">${ch.roman}</span><span class="name">${ch.name}</span>`
      + (off ? `<span class="written">${pcName(ch.rootPc - off, { flats })}${ch.type.symbol}</span>` : '');
    grid.appendChild(b);
  });
  renderProgression();
  buildPresetSelect();
}
{
  const grid = $('chordGrid');
  const active = new Map(); // pointerId → deg
  grid.addEventListener('pointerdown', e => {
    const b = e.target.closest('.chord-btn'); if (!b) return;
    const deg = +b.dataset.deg;
    active.set(e.pointerId, deg);
    stopProgression();
    chordOn(chords[deg], 'c');
    grid.querySelectorAll('.chord-btn').forEach(x => x.classList.toggle('on', +x.dataset.deg === deg));
    if ($('btnProgRecord').classList.contains('on')) { progression.push(deg); renderProgression(); $('selPreset').value = ''; }
    if (quiz.waiting) answerQuiz(deg);
  });
  const up = e => {
    const deg = active.get(e.pointerId); if (deg == null) return; active.delete(e.pointerId);
    if (!state.latch) { chordOff('c'); grid.querySelectorAll('.chord-btn').forEach(x => x.classList.remove('on')); highlightChordKeys([]); }
  };
  grid.addEventListener('pointerup', up); grid.addEventListener('pointercancel', up);
}

function buildKeySelect() {
  const sel = $('selKey'); sel.innerHTML = '';
  for (let pc = 0; pc < 12; pc++) {
    const o = document.createElement('option'); o.value = pc;
    const flats = useFlats(pc, state.scale);
    o.textContent = pcName(pc, { flats }) + (state.scale === 'minor' ? 'm' : '');
    sel.appendChild(o);
  }
  sel.value = state.keyPc;
}
function buildPresetSelect() {
  const sel = $('selPreset'); const prev = sel.value; sel.innerHTML = '';
  const o0 = document.createElement('option'); o0.value = ''; o0.textContent = t('preset_custom'); sel.appendChild(o0);
  t('presets').forEach((name, i) => {
    const o = document.createElement('option'); o.value = i;
    o.textContent = name + '  (' + PRESETS[i].map(d => chords[d].roman).join('–') + ')';
    sel.appendChild(o);
  });
  sel.value = prev;
}
function renderProgression() {
  const strip = $('progStrip'); strip.innerHTML = '';
  if (!progression.length) { strip.innerHTML = `<span class="muted">${t('prog_empty')}</span>`; return; }
  progression.forEach((deg, i) => {
    const c = document.createElement('span'); c.className = 'chip' + (i === progIndex ? ' cur' : '');
    c.innerHTML = `${chords[deg].roman} <small>${chords[deg].name}</small><span class="x">✕</span>`;
    c.onclick = e => {
      if (e.target.classList.contains('x')) { progression.splice(i, 1); $('selPreset').value = ''; renderProgression(); return; }
      stopProgression(); chordOn(chords[deg], 'c'); setTimeout(() => { if (!state.latch) { chordOff('c'); highlightChordKeys([]); } }, 700);
    };
    strip.appendChild(c);
  });
}
function playProgression() {
  if (!progression.length) return;
  stopProgression(false);
  const btn = $('btnProgPlay'); btn.innerHTML = `■ <span>${t('stop')}</span>`; btn.classList.add('on');
  progIndex = -1;
  const step = () => {
    progIndex++;
    if (progIndex >= progression.length) {
      if (!state.loop) { stopProgression(); return; }
      progIndex = 0;
    }
    const ch = chords[progression[progIndex]];
    chordOn(ch, 'p', 0.008);
    renderProgression();
    $('chordGrid').querySelectorAll('.chord-btn').forEach(x => x.classList.toggle('cur', +x.dataset.deg === progression[progIndex]));
    const ms = state.beats * 60000 / state.bpm;
    progTimer = setTimeout(() => { chordOff('p'); progTimer = setTimeout(step, 40); }, ms - 40);
  };
  step();
}
function stopProgression(render = true) {
  if (progTimer) { clearTimeout(progTimer); progTimer = null; }
  chordOff('p');
  progIndex = -1;
  const btn = $('btnProgPlay'); btn.innerHTML = `▶ <span>${t('play')}</span>`; btn.classList.remove('on');
  $('chordGrid').querySelectorAll('.chord-btn').forEach(x => x.classList.remove('cur'));
  highlightChordKeys([]);
  if (render) renderProgression();
}
$('btnProgPlay').onclick = () => progTimer ? stopProgression() : playProgression();
$('btnProgRecord').onclick = e => e.currentTarget.classList.toggle('on');
$('btnProgClear').onclick = () => { stopProgression(false); progression = []; $('selPreset').value = ''; renderProgression(); };
$('selPreset').onchange = e => { if (e.target.value === '') return; stopProgression(false); progression = [...PRESETS[+e.target.value]]; renderProgression(); };
$('inpBpm').onchange = e => { state.bpm = Math.min(200, Math.max(40, +e.target.value || 80)); e.target.value = state.bpm; save('bpm'); };
$('inpBeats').onchange = e => { state.beats = Math.min(8, Math.max(1, +e.target.value || 4)); e.target.value = state.beats; save('beats'); };
$('chkLoop').onchange = e => { state.loop = e.target.checked; save('loop'); };

// クイズ
function playQuizChord() {
  const ch = chords[quiz.answer];
  chordOn(ch, 'q'); highlightChordKeys([]);
  setTimeout(() => chordOff('q'), 1300);
}
$('btnQuizStart').onclick = () => {
  stopProgression();
  let d; do { d = Math.floor(Math.random() * 7); } while (d === quiz.answer && chords.length > 1);
  quiz.answer = d; quiz.waiting = true;
  $('quizStatus').textContent = t('quiz_listen');
  $('chordGrid').querySelectorAll('.chord-btn').forEach(x => x.classList.remove('good', 'bad'));
  playQuizChord();
};
$('btnQuizReplay').onclick = () => { if (quiz.answer != null) playQuizChord(); };
function answerQuiz(deg) {
  quiz.waiting = false; quiz.total++;
  const btns = $('chordGrid').querySelectorAll('.chord-btn');
  if (deg === quiz.answer) { quiz.correct++; $('quizStatus').textContent = t('quiz_good'); btns[deg].classList.add('good'); }
  else { $('quizStatus').textContent = `${t('quiz_bad')} ${chords[quiz.answer].roman} ${chords[quiz.answer].name}`; btns[deg].classList.add('bad'); btns[quiz.answer].classList.add('good'); }
  $('quizScore').textContent = t('quiz_score').replace('{a}', quiz.correct).replace('{b}', quiz.total);
}

// コード設定 UI
$('selKey').onchange = e => { state.keyPc = +e.target.value; save('keyPc'); stopProgression(false); buildChordGrid(); buildPiano(); };
$('scaleSeg').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  state.scale = b.dataset.scale; save('scale');
  $('scaleSeg').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  $('chkHarmonic').parentElement.style.display = state.scale === 'minor' ? '' : 'none';
  stopProgression(false); buildKeySelect(); buildChordGrid(); buildPiano();
};
$('chkSeventh').onchange = e => { state.seventh = e.target.checked; save('seventh'); buildChordGrid(); };
$('chkHarmonic').onchange = e => { state.harmonic = e.target.checked; save('harmonic'); buildChordGrid(); };
$('chkBass').onchange = e => { state.bass = e.target.checked; save('bass'); };

// ---------------- モード・上部バー ----------------
function setMode(mode) {
  state.mode = mode; save('mode');
  $('modeSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
  $('chordPanel').hidden = mode !== 'chords';
  if (mode !== 'chords') { stopProgression(false); chordOff('c'); chordOff('q'); highlightChordKeys([]); }
}
$('modeSeg').onclick = e => { const b = e.target.closest('button'); if (b) setMode(b.dataset.mode); };
$('btnLatch').onclick = () => {
  state.latch = !state.latch; save('latch');
  $('btnLatch').classList.toggle('on', state.latch);
  if (!state.latch) { for (const id of [...sounding.keys()]) if (id.startsWith('k:') || id.startsWith('c:')) soundOff(id); highlightChordKeys([]); $('chordGrid').querySelectorAll('.chord-btn').forEach(x => x.classList.remove('on')); }
};
$('btnPanic').onclick = () => { stopEverything(); highlightChordKeys([]); $('chordGrid').querySelectorAll('.chord-btn').forEach(x => x.classList.remove('on')); };

// ---------------- 設定ドロワー ----------------
const openDrawer = o => { $('drawer').classList.toggle('open', o); $('scrim').classList.toggle('show', o); };
$('btnSettings').onclick = () => openDrawer(true);
$('btnCloseDrawer').onclick = () => openDrawer(false);
$('scrim').onclick = () => openDrawer(false);

function applyI18n() {
  document.documentElement.lang = state.lang;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  $('langSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.lang === state.lang));
  const sel = $('selTone'); sel.innerHTML = '';
  TONES.forEach(tn => { const o = document.createElement('option'); o.value = tn.id; o.textContent = state.lang === 'ja' ? tn.ja : tn.en; sel.appendChild(o); });
  sel.value = state.toneId;
  updateWakeStatus();
  if (chords.length) { buildPresetSelect(); renderProgression(); }
  buildPiano();
}
$('langSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; state.lang = b.dataset.lang; save('lang'); applyI18n(); };
$('selTone').onchange = e => { state.toneId = e.target.value; save('toneId'); synth.setTone(TONES.find(x => x.id === state.toneId)); };
$('inpVolume').oninput = e => { state.volume = +e.target.value; save('volume'); synth.setVolume(state.volume / 100); };
$('inpA4').onchange = e => { state.a4 = Math.min(450, Math.max(430, +e.target.value || 442)); e.target.value = state.a4; save('a4'); retuneAll(); };
$('tempSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; state.temperament = b.dataset.temp; save('temperament'); syncTempUI(); retuneAll(); };
function syncTempUI() {
  $('tempSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.temp === state.temperament));
  $('justRootRow').style.display = state.temperament === 'justKey' ? '' : 'none';
}
$('selJustRoot').onchange = e => { state.justRoot = +e.target.value; save('justRoot'); retuneAll(); };
$('selTranspose').onchange = e => { state.transposition = e.target.value; save('transposition'); buildPiano(); buildChordGrid(); updateChordName(); };
$('octSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; state.visibleOct = +b.dataset.oct; save('visibleOct'); $('octSeg').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); buildPiano(); };
$('themeSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; state.theme = b.dataset.theme; save('theme'); applyTheme(); };
function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  $('themeSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.theme === state.theme));
}
$('btnReset').onclick = () => { for (const k of Object.keys(DEFAULTS)) localStorage.removeItem(LS + k); toast(t('reset_done')); setTimeout(() => location.reload(), 600); };

// Wake Lock
let wakeLock = null;
async function setWake(on) {
  state.wake = on; save('wake'); $('chkWake').checked = on;
  if (!('wakeLock' in navigator)) { updateWakeStatus(); return; }
  try {
    if (on && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; updateWakeStatus(); }); }
    else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch {}
  updateWakeStatus();
}
function updateWakeStatus() {
  $('wakeStatus').textContent = !('wakeLock' in navigator) ? t('wake_na') : (wakeLock ? t('wake_on') : t('wake_off'));
}
$('chkWake').onchange = e => setWake(e.target.checked);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.wake && !wakeLock) setWake(true); });

// PWA install
let installPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; });
$('btnInstall').onclick = async () => {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (standalone) return toast(t('installed'));
  if (installPrompt) { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; return; }
  toast(/iphone|ipad|ipod/i.test(navigator.userAgent) ? t('install_ios') : t('install_other'), 4000);
};

let toastTimer = null;
function toast(msg, ms = 2000) {
  const el = $('toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// ---------------- 親フレーム連携 ----------------
window.addEventListener('message', e => {
  if (e.origin !== location.origin) return;
  const m = e.data; if (!m || typeof m !== 'object') return;
  if (m.type === 'setLanguage' && (m.lang === 'ja' || m.lang === 'en')) { state.lang = m.lang; save('lang'); applyI18n(); }
  else if (m.type === 'setWakeLock') setWake(!!m.enabled);
  else if (m.type === 'pauseAll') { stopEverything(); highlightChordKeys([]); }
});

// ---------------- 初期化 ----------------
function init() {
  applyTheme();
  synth.setTone(TONES.find(x => x.id === state.toneId) || TONES[0]);
  synth.setVolume(state.volume / 100);
  $('inpVolume').value = state.volume; $('inpA4').value = state.a4;
  $('inpBpm').value = state.bpm; $('inpBeats').value = state.beats; $('chkLoop').checked = state.loop;
  $('chkSeventh').checked = state.seventh; $('chkHarmonic').checked = state.harmonic; $('chkBass').checked = state.bass;
  $('scaleSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.scale === state.scale));
  $('chkHarmonic').parentElement.style.display = state.scale === 'minor' ? '' : 'none';
  $('btnLatch').classList.toggle('on', state.latch);
  const selT = $('selTranspose'); TRANSPOSITIONS.forEach(x => { const o = document.createElement('option'); o.value = x.id; o.textContent = x.label; selT.appendChild(o); }); selT.value = state.transposition;
  const selR = $('selJustRoot'); for (let pc = 0; pc < 12; pc++) { const o = document.createElement('option'); o.value = pc; o.textContent = PC_SHARP[pc].replace('#', '♯') + ' / ' + pcName(pc, { flats: true }); selR.appendChild(o); } selR.value = state.justRoot;
  $('octSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.oct === state.visibleOct));
  syncTempUI();
  buildKeySelect();
  buildChordGrid();
  applyI18n();
  setMode(state.mode);
  if (state.wake) setWake(true);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  if (window.parent !== window) window.parent.postMessage({ type: 'childReady', app: 'harmony' }, location.origin);
}
init();
