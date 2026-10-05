// チューナー画面: 針式メーター、音名、基準音、返音、全面色
import { $, fillSelect, setupCanvas, cssVar } from './dom.js';
import { t } from '../lib/i18n.js';
import { NOTATIONS, TRANSPOSE_OFFSET, midiToFreq, noteLabel, tuningState, clampCents } from '../lib/music.js';
import { settings, setSetting, onSettingsChange } from './store.js';
import { engine, on, mic, toggleMic } from './core.js';

const HOLD_SEC = 0.5; // 無音になってから表示を保持する秒数

export function initTuner() {
  const canvas = $('meterCanvas');
  const noteName = $('noteName');
  const centsText = $('centsText');
  const hzText = $('hzText');
  const micBtn = $('micBtn');
  const micStatus = $('micStatus');
  const a4Input = $('a4Input');
  const toleranceSelect = $('toleranceSelect');
  const transposeSelect = $('transposeSelect');
  const notationSelect = $('notationSelect');
  const refNote = $('refNote');
  const refOctave = $('refOctave');
  const refBtn = $('refBtn');
  const refHint = $('refHint');
  const echoToggle = $('echoToggle');
  const fullColorToggle = $('fullColorToggle');

  let last = null;      // 直近の有声ピッチ
  let lastTime = 0;
  let shownCents = 0;   // 針の表示位置(なめらかに追従)
  let refPlaying = false;

  // ---- コントロール初期化 ----
  fillSelect(toleranceSelect, Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: `±${i + 1}` })), String(settings.tolerance));
  a4Input.value = settings.a4;
  transposeSelect.value = settings.transpose;
  notationSelect.value = settings.notation;
  echoToggle.checked = !!settings.echo;
  fullColorToggle.checked = !!settings.fullColor;

  function fillRefNotes() {
    const names = NOTATIONS[settings.notation] || NOTATIONS.en;
    const cur = refNote.value || '9'; // 既定 A
    fillSelect(refNote, names.map((n, i) => ({ value: String(i), label: n })), cur);
  }
  fillRefNotes();

  function setA4(v) {
    const n = Math.max(430, Math.min(450, Math.round(Number(v) || 442)));
    setSetting('a4', n);
    a4Input.value = n;
  }
  a4Input.addEventListener('change', () => setA4(a4Input.value));
  $('a4Minus').addEventListener('click', () => setA4(settings.a4 - 1));
  $('a4Plus').addEventListener('click', () => setA4(settings.a4 + 1));
  toleranceSelect.addEventListener('change', () => setSetting('tolerance', Number(toleranceSelect.value)));
  transposeSelect.addEventListener('change', () => setSetting('transpose', transposeSelect.value));
  notationSelect.addEventListener('change', () => setSetting('notation', notationSelect.value));
  echoToggle.addEventListener('change', () => {
    setSetting('echo', echoToggle.checked);
    if (!echoToggle.checked) engine.stopTone('echo');
  });
  fullColorToggle.addEventListener('change', () => {
    setSetting('fullColor', fullColorToggle.checked);
    if (!fullColorToggle.checked) delete document.body.dataset.tune;
  });

  // 設定タブ側で変わったときも追従
  onSettingsChange((key, value) => {
    if (key === 'a4') a4Input.value = value;
    if (key === 'tolerance') toleranceSelect.value = String(value);
    if (key === 'transpose') transposeSelect.value = value;
    if (key === 'notation') { notationSelect.value = value; fillRefNotes(); updateRefHint(); }
    if (key === 'echo') echoToggle.checked = !!value;
    if (key === 'fullColor') fullColorToggle.checked = !!value;
    if (key === 'a4' || key === 'transpose') updateRefHint();
    if (refPlaying && (key === 'a4' || key === 'transpose')) engine.playTone('ref', refFreq());
  });

  // ---- マイク ----
  function renderMic() {
    micBtn.textContent = t(mic.on ? 'mic.stop' : 'mic.start');
    micBtn.classList.toggle('is-on', mic.on);
    micStatus.textContent = mic.error || t(mic.on ? 'mic.listening' : 'mic.idle');
    micStatus.classList.toggle('is-error', !!mic.error);
  }
  micBtn.addEventListener('click', () => toggleMic());
  on('mic', renderMic);
  renderMic();

  // ---- 基準音 ----
  // 選んだ音名は「表示移調後の記譜音」として扱い、実音に戻して鳴らす
  function refFreq() {
    const pc = Number(refNote.value);
    const oct = Number(refOctave.value);
    const written = (oct + 1) * 12 + pc;
    const concert = written - (TRANSPOSE_OFFSET[settings.transpose] || 0);
    return midiToFreq(concert, settings.a4);
  }
  function updateRefHint() {
    refHint.textContent = `${refFreq().toFixed(1)} Hz`;
  }
  function setRefPlaying(onFlag) {
    refPlaying = onFlag;
    if (onFlag) engine.playTone('ref', refFreq(), { type: 'triangle', volume: 0.2 });
    else engine.stopTone('ref');
    refBtn.textContent = t(onFlag ? 'tuner.refStop' : 'tuner.refPlay');
    refBtn.classList.toggle('is-on', onFlag);
  }
  refBtn.addEventListener('click', () => setRefPlaying(!refPlaying));
  refNote.addEventListener('change', () => { updateRefHint(); if (refPlaying) engine.playTone('ref', refFreq()); });
  refOctave.addEventListener('change', () => { updateRefHint(); if (refPlaying) engine.playTone('ref', refFreq()); });
  updateRefHint();

  on('pauseAll', () => { setRefPlaying(false); engine.stopTone('echo'); delete document.body.dataset.tune; });
  on('lang', () => { renderMic(); refBtn.textContent = t(refPlaying ? 'tuner.refStop' : 'tuner.refPlay'); });

  // ---- ピッチ受信 ----
  on('pitch', (p) => {
    if (p.voiced) {
      last = p;
      lastTime = p.time;
      if (settings.echo) engine.playTone('echo', p.freq, { type: 'sine', volume: 0.12 });
    } else if (settings.echo && p.time - lastTime > 0.15) {
      engine.stopTone('echo');
    }
  });
  on('mic', (m) => { if (!m.on) { last = null; engine.stopTone('echo'); delete document.body.dataset.tune; } });

  // ---- 描画ループ ----
  function render() {
    const now = performance.now() / 1000;
    const active = last && now - lastTime < HOLD_SEC;
    const target = active ? clampCents(last.cents) : 0;
    shownCents += (target - shownCents) * 0.35;
    if (Math.abs(target - shownCents) < 0.05) shownCents = target;

    if (active) {
      const state = tuningState(last.cents, settings.tolerance);
      noteName.textContent = noteLabel(last.midi, { notation: settings.notation, transpose: settings.transpose });
      noteName.dataset.state = state;
      const c = last.cents;
      centsText.textContent = (c > 0 ? '+' : '') + c.toFixed(0) + ' ¢';
      centsText.dataset.state = state;
      hzText.textContent = last.freq.toFixed(1) + ' Hz';
      if (settings.fullColor) document.body.dataset.tune = state;
    } else {
      noteName.textContent = '--';
      noteName.dataset.state = '';
      centsText.textContent = '--';
      centsText.dataset.state = '';
      hzText.textContent = '-- Hz';
      if (settings.fullColor) delete document.body.dataset.tune;
    }
    drawMeter(canvas, shownCents, active ? tuningState(last.cents, settings.tolerance) : null, settings.tolerance);
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
}

function drawMeter(canvas, cents, state, tolerance) {
  if (!canvas.offsetParent) return; // 非表示タブなら描かない
  const { ctx, w, h } = setupCanvas(canvas);
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h * 0.92;
  const r = Math.min(w * 0.46, h * 0.82);
  const maxDeg = 55;
  const toAngle = (c) => (c / 50) * maxDeg * (Math.PI / 180);
  const fg = cssVar('--fg') || '#222';
  const muted = cssVar('--muted') || '#888';
  const ok = cssVar('--ok') || '#16a34a';
  const low = cssVar('--low') || '#2563eb';
  const high = cssVar('--high') || '#dc2626';
  const accent = cssVar('--accent') || '#0f766e';

  // 外弧
  ctx.lineWidth = 10;
  ctx.lineCap = 'butt';
  ctx.strokeStyle = cssVar('--border') || '#ccc';
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2 + toAngle(-50), -Math.PI / 2 + toAngle(50));
  ctx.stroke();
  // 低い側(青)・高い側(赤)の薄い帯
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = low;
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2 + toAngle(-50), -Math.PI / 2 + toAngle(-tolerance));
  ctx.stroke();
  ctx.strokeStyle = high;
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2 + toAngle(tolerance), -Math.PI / 2 + toAngle(50));
  ctx.stroke();
  ctx.globalAlpha = 1;
  // 中央の緑帯
  ctx.strokeStyle = ok;
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2 + toAngle(-tolerance), -Math.PI / 2 + toAngle(tolerance));
  ctx.stroke();

  // 目盛り
  ctx.strokeStyle = muted;
  ctx.fillStyle = muted;
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let c = -50; c <= 50; c += 5) {
    const a = toAngle(c);
    const major = c % 25 === 0;
    const r1 = r - 8;
    const r2 = r1 - (major ? 12 : 6);
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(cx + r1 * Math.sin(a), cy - r1 * Math.cos(a));
    ctx.lineTo(cx + r2 * Math.sin(a), cy - r2 * Math.cos(a));
    ctx.stroke();
    if (major) {
      const rl = r2 - 12;
      ctx.fillText(c > 0 ? '+' + c : String(c), cx + rl * Math.sin(a), cy - rl * Math.cos(a));
    }
  }

  // 針
  const a = toAngle(clampCents(cents));
  ctx.strokeStyle = state === 'in' ? ok : state === 'low' ? low : state === 'high' ? high : muted;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + (r - 14) * Math.sin(a), cy - (r - 14) * Math.cos(a));
  ctx.stroke();
  ctx.fillStyle = state ? accent : fg;
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.fill();
}
