// 記録画面: セント偏差の時系列グラフ、録音/再生/スクラブ、保存一覧
import { $, el, setupCanvas, cssVar, fmtDate } from './dom.js';
import { t } from '../lib/i18n.js';
import { noteLabel, tuningState, clampCents } from '../lib/music.js';
import { settings, getList, setList, uid } from './store.js';
import { engine, on, mic, startMic } from './core.js';

const LIST_KEY = 'recordings';
const MAX_SEC = 600;
const ZOOMS = [10, 20, 40, 60, 100, 160, 250, 400]; // px / 秒

export function initRecord() {
  const canvas = $('recCanvas');
  const recBtn = $('recBtn');
  const playBtn = $('playBtn');
  const rewindBtn = $('rewindBtn');
  const recTime = $('recTime');
  const recReadout = $('recReadout');
  const recName = $('recName');
  const recSaveBtn = $('recSaveBtn');
  const recList = $('recList');

  // samples: {t, c(cents|null), f(freq), m(midi)}
  let samples = [];
  let recording = false;
  let startTime = 0;
  let a4AtRec = settings.a4;
  let zoomIdx = 3;
  let viewStart = 0;
  let cursor = 0;
  let playing = false;
  let playT0 = 0;
  let playFrom = 0;
  let scrubbing = false;
  let noticeUntil = 0; // 一時メッセージ(マイク未開始など)を表示しておく期限

  const duration = () => (samples.length ? samples[samples.length - 1].t : 0);
  const pxPerSec = () => ZOOMS[zoomIdx];

  // ---- 録音 ----
  async function toggleRecording() {
    if (recording) { stopRecording(); return; }
    if (playing) stopPlay();
    if (!mic.on) {
      const ok = await startMic();
      if (!ok) {
        recReadout.textContent = mic.error || t('rec.needMic');
        noticeUntil = performance.now() / 1000 + 4;
        return;
      }
    }
    samples = [];
    a4AtRec = settings.a4;
    startTime = performance.now() / 1000;
    recording = true;
    cursor = 0;
    viewStart = 0;
    recReadout.textContent = '';
    renderButtons();
  }
  function stopRecording() {
    recording = false;
    cursor = 0;
    viewStart = 0;
    renderButtons();
  }
  on('pitch', (p) => {
    if (!recording) return;
    const tt = p.time - startTime;
    if (tt > MAX_SEC) { stopRecording(); return; }
    samples.push(p.voiced
      ? { t: +tt.toFixed(3), c: +p.cents.toFixed(1), f: +p.freq.toFixed(2), m: p.midi }
      : { t: +tt.toFixed(3), c: null });
    const visible = canvas.clientWidth / pxPerSec();
    if (tt > viewStart + visible * 0.85) viewStart = tt - visible * 0.85;
  });
  on('mic', (m) => { if (!m.on && recording) stopRecording(); });
  on('toggleRecord', () => toggleRecording());
  on('pauseAll', () => { if (recording) stopRecording(); stopPlay(); engine.stopTone('scrub'); });
  recBtn.addEventListener('click', toggleRecording);

  // ---- 再生 ----
  function sampleAt(time) {
    if (!samples.length) return null;
    let lo = 0;
    let hi = samples.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (samples[mid].t <= time) lo = mid; else hi = mid - 1;
    }
    const s = samples[lo];
    return Math.abs(s.t - time) < 0.2 ? s : null;
  }
  function voice(s, id) {
    if (s && s.c != null) engine.playTone(id, s.f, { type: 'sine', volume: 0.2 });
    else engine.stopTone(id);
  }
  function startPlay() {
    if (!samples.length || recording) return;
    if (cursor >= duration()) cursor = 0;
    playing = true;
    playFrom = cursor;
    playT0 = performance.now() / 1000;
    renderButtons();
  }
  function stopPlay() {
    if (!playing) return;
    playing = false;
    engine.stopTone('play');
    renderButtons();
  }
  playBtn.addEventListener('click', () => (playing ? stopPlay() : startPlay()));
  rewindBtn.addEventListener('click', () => { stopPlay(); cursor = 0; viewStart = 0; });
  $('zoomInBtn').addEventListener('click', () => { zoomIdx = Math.min(ZOOMS.length - 1, zoomIdx + 1); });
  $('zoomOutBtn').addEventListener('click', () => { zoomIdx = Math.max(0, zoomIdx - 1); });

  // ---- スクラブ(なぞり) ----
  function timeAtX(x) {
    return Math.max(0, Math.min(duration(), viewStart + x / pxPerSec()));
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (recording || !samples.length) return;
    stopPlay();
    scrubbing = true;
    canvas.setPointerCapture(e.pointerId);
    cursor = timeAtX(e.offsetX);
    voice(sampleAt(cursor), 'scrub');
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!scrubbing) return;
    cursor = timeAtX(e.offsetX);
    voice(sampleAt(cursor), 'scrub');
  });
  const endScrub = () => { if (scrubbing) { scrubbing = false; engine.stopTone('scrub'); } };
  canvas.addEventListener('pointerup', endScrub);
  canvas.addEventListener('pointercancel', endScrub);

  // ---- 保存・一覧 ----
  function saveCurrent() {
    if (!samples.length) return;
    const list = getList(LIST_KEY);
    const name = recName.value.trim() || t('rec.defaultName', { date: fmtDate() });
    list.unshift({ id: uid(), name, date: new Date().toISOString(), a4: a4AtRec, duration: +duration().toFixed(1), samples });
    setList(LIST_KEY, list);
    recName.value = '';
    renderList();
  }
  recSaveBtn.addEventListener('click', saveCurrent);

  function renderList() {
    const list = getList(LIST_KEY);
    recList.innerHTML = '';
    if (!list.length) {
      recList.appendChild(el('li', { class: 'list-empty', text: t('rec.empty') }));
      return;
    }
    for (const r of list) {
      recList.appendChild(el('li', { class: 'list-item' }, [
        el('div', { class: 'list-main' }, [
          el('div', { class: 'list-title', text: r.name }),
          el('div', { class: 'list-meta', text: t('rec.meta', { dur: r.duration, a4: r.a4 }) }),
        ]),
        el('button', { type: 'button', class: 'btn btn-sm', text: t('common.load'), onclick: () => {
          stopPlay();
          samples = r.samples || [];
          a4AtRec = r.a4;
          cursor = 0; viewStart = 0;
          renderButtons();
        } }),
        el('button', { type: 'button', class: 'btn btn-sm btn-danger', text: t('common.delete'), onclick: () => {
          if (!confirm(t('common.confirmDelete', { name: r.name }))) return;
          setList(LIST_KEY, getList(LIST_KEY).filter((x) => x.id !== r.id));
          renderList();
        } }),
      ]));
    }
  }
  on('lang', () => { renderList(); renderButtons(); });
  renderList();

  function renderButtons() {
    recBtn.textContent = t(recording ? 'rec.stop' : 'rec.start');
    recBtn.classList.toggle('is-on', recording);
    playBtn.textContent = t(playing ? 'rec.pause' : 'rec.play');
    const has = samples.length > 0 && !recording;
    playBtn.disabled = !has;
    rewindBtn.disabled = !has;
    recSaveBtn.disabled = !has;
  }
  renderButtons();

  // ---- 描画ループ ----
  function frame() {
    const now = performance.now() / 1000;
    if (recording) {
      cursor = now - startTime;
    } else if (playing) {
      cursor = playFrom + (now - playT0);
      if (cursor >= duration()) { cursor = duration(); stopPlay(); }
      else {
        voice(sampleAt(cursor), 'play');
        const visible = canvas.clientWidth / pxPerSec();
        if (cursor > viewStart + visible * 0.9) viewStart = cursor - visible * 0.1;
        if (cursor < viewStart) viewStart = Math.max(0, cursor - visible * 0.1);
      }
    }
    recTime.textContent = cursor.toFixed(1) + ' s';
    if (!recording && now >= noticeUntil) {
      const s = sampleAt(cursor);
      recReadout.textContent = s && s.c != null
        ? `${noteLabel(s.m, { notation: settings.notation, transpose: settings.transpose })} ${s.c > 0 ? '+' : ''}${s.c.toFixed(0)} ¢ ${s.f.toFixed(1)} Hz`
        : '';
    }
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function draw() {
    if (!canvas.offsetParent) return;
    const { ctx, w, h } = setupCanvas(canvas);
    const pad = 14;
    const yOf = (c) => h / 2 - (clampCents(c) / 50) * (h / 2 - pad);
    const xOf = (tt) => (tt - viewStart) * pxPerSec();
    const ok = cssVar('--ok'); const low = cssVar('--low'); const high = cssVar('--high');
    const muted = cssVar('--muted'); const border = cssVar('--border');

    ctx.clearRect(0, 0, w, h);
    // 許容帯
    ctx.fillStyle = ok;
    ctx.globalAlpha = 0.18;
    ctx.fillRect(0, yOf(settings.tolerance), w, yOf(-settings.tolerance) - yOf(settings.tolerance));
    ctx.globalAlpha = 1;
    // 横線
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    for (const c of [-50, -25, 0, 25, 50]) {
      ctx.beginPath(); ctx.moveTo(0, yOf(c)); ctx.lineTo(w, yOf(c)); ctx.stroke();
    }
    ctx.fillStyle = muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('+50', 2, yOf(50) + 7);
    ctx.fillText('0', 2, yOf(0) - 7);
    ctx.fillText('-50', 2, yOf(-50) - 7);
    // 時間目盛
    const step = pxPerSec() >= 100 ? 1 : pxPerSec() >= 40 ? 2 : 5;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (let s = Math.ceil(viewStart / step) * step; xOf(s) <= w; s += step) {
      const x = xOf(s);
      ctx.beginPath(); ctx.moveTo(x, h - 6); ctx.lineTo(x, h); ctx.stroke();
      ctx.fillText(String(s), x, h - 6);
    }
    // 波形(セント偏差)
    ctx.lineWidth = 2;
    let prev = null;
    for (const s of samples) {
      const x = xOf(s.t);
      if (x < -5) { prev = s; continue; }
      if (x > w + 5) break;
      if (s.c == null) { prev = null; continue; }
      if (prev && prev.c != null && s.t - prev.t < 0.12 && prev.m === s.m) {
        ctx.strokeStyle = tuningState(s.c, settings.tolerance) === 'in' ? ok : s.c < 0 ? low : high;
        ctx.beginPath();
        ctx.moveTo(xOf(prev.t), yOf(prev.c));
        ctx.lineTo(x, yOf(s.c));
        ctx.stroke();
      } else {
        ctx.fillStyle = tuningState(s.c, settings.tolerance) === 'in' ? ok : s.c < 0 ? low : high;
        ctx.fillRect(x - 1, yOf(s.c) - 1, 2, 2);
      }
      prev = s;
    }
    // カーソル
    if (samples.length) {
      const x = xOf(cursor);
      ctx.strokeStyle = cssVar('--accent');
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
  }
}
