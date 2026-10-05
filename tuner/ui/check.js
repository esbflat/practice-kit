// 音程チェック画面: 音域の各音を順に吹いて平均セント偏差を集計、保存・比較・JSON 入出力
import { $, el, setupCanvas, cssVar } from './dom.js';
import { t } from '../lib/i18n.js';
import { noteLabel, mean, stddev, tuningState, clampCents } from '../lib/music.js';
import { rangeNotes } from '../lib/instruments.js';
import { settings, onSettingsChange, getList, setList, uid, downloadJson, readJsonFile } from './store.js';
import { on } from './core.js';

const LIST_KEY = 'checks';
const WINDOW = 24;      // 安定判定に使うサンプル数(約 0.4 秒)
const STD_MAX = 12;     // この標準偏差(セント)以下なら安定とみなす
const MIN_MANUAL = 3;   // 手動で進めるときに平均を採用する最小サンプル数

export function initCheck() {
  const target = $('chkTarget');
  const progress = $('chkProgress');
  const live = $('chkLive');
  const msg = $('chkMsg');
  const startBtn = $('chkStartBtn');
  const nextBtn = $('chkNextBtn');
  const finishBtn = $('chkFinishBtn');
  const autoToggle = $('chkAutoToggle');
  const rangeInfo = $('chkRangeInfo');
  const resultCard = $('chkResult');
  const canvas = $('chkCanvas');
  const table = $('chkTable');
  const playerInput = $('chkPlayer');
  const instrInput = $('chkInstrLabel');
  const saveBtn = $('chkSaveBtn');
  const list = $('chkList');
  const cmpA = $('cmpA');
  const cmpB = $('cmpB');

  let notes = [];
  let idx = 0;
  let results = [];   // {midi, cents|null, n}
  let window_ = [];
  let active = false;
  let lastCommitTime = 0;
  let shown = null;   // 表示中のデータ(series 配列)

  const label = (midi) => noteLabel(midi, { notation: settings.notation, transpose: settings.transpose });

  function renderRangeInfo() {
    const ns = rangeNotes(settings.instrument, settings.level);
    rangeInfo.textContent = ns.length
      ? t('chk.rangeInfo', { inst: t('inst.' + settings.instrument), n: ns.length, lo: label(ns[0]), hi: label(ns[ns.length - 1]) })
      : '';
  }
  onSettingsChange((k) => { if (['instrument', 'level', 'notation', 'transpose'].includes(k)) { renderRangeInfo(); if (active) renderTarget(); } });
  renderRangeInfo();

  // ---- 進行 ----
  function start() {
    notes = rangeNotes(settings.instrument, settings.level);
    if (!notes.length) return;
    idx = 0;
    results = [];
    window_ = [];
    active = true;
    resultCard.classList.add('hidden');
    renderTarget();
    renderButtons();
  }
  function abort() {
    active = false;
    target.textContent = '--';
    progress.textContent = '';
    live.textContent = '';
    msg.textContent = t('chk.ready');
    renderButtons();
  }
  function commit(centsOrNull) {
    results.push({ midi: notes[idx], cents: centsOrNull == null ? null : +centsOrNull.toFixed(1), n: window_.length });
    window_ = [];
    lastCommitTime = performance.now() / 1000;
    idx++;
    if (idx >= notes.length) finish();
    else renderTarget();
  }
  function manualNext() {
    if (!active) return;
    commit(window_.length >= MIN_MANUAL ? mean(window_) : null);
  }
  function finish() {
    if (!active) return;
    while (idx < notes.length) { results.push({ midi: notes[idx], cents: null, n: 0 }); idx++; }
    active = false;
    target.textContent = '--';
    live.textContent = '';
    progress.textContent = '';
    msg.textContent = t('chk.done');
    renderButtons();
    show([{ name: '', results, color: cssVar('--accent') }]);
    resultCard.classList.remove('hidden');
  }
  on('pitch', (p) => {
    if (!active || !p.voiced) return;
    if (p.time - lastCommitTime < 0.3) return; // 直前の音の尾を無視
    if (p.midi !== notes[idx]) { live.textContent = ''; return; }
    window_.push(p.cents);
    if (window_.length > 60) window_.shift();
    live.textContent = (p.cents > 0 ? '+' : '') + p.cents.toFixed(0) + ' ¢';
    live.dataset.state = tuningState(p.cents, settings.tolerance);
    if (autoToggle.checked && window_.length >= WINDOW) {
      const recent = window_.slice(-WINDOW);
      if (stddev(recent) <= STD_MAX) commit(mean(recent));
    }
  });
  on('pauseAll', () => { if (active) abort(); });
  on('mic', (m) => { if (!m.on && active) abort(); });

  startBtn.addEventListener('click', () => (active ? abort() : start()));
  nextBtn.addEventListener('click', manualNext);
  finishBtn.addEventListener('click', finish);

  function renderTarget() {
    target.textContent = label(notes[idx]);
    progress.textContent = t('chk.progress', { i: idx + 1, n: notes.length });
    live.textContent = '';
    msg.textContent = t('chk.blow');
  }
  function renderButtons() {
    startBtn.textContent = t(active ? 'chk.abort' : 'chk.start');
    startBtn.classList.toggle('btn-primary', !active);
    nextBtn.disabled = !active;
    finishBtn.disabled = !active;
  }
  renderButtons();

  // ---- 保存・一覧・比較 ----
  function datasetName(d) {
    const parts = [d.player, d.instrument].filter(Boolean);
    return parts.length ? parts.join(' / ') : t('chk.unnamed');
  }
  saveBtn.addEventListener('click', () => {
    if (!results.length) return;
    const lst = getList(LIST_KEY);
    lst.unshift({
      id: uid(),
      player: playerInput.value.trim(),
      instrument: instrInput.value.trim() || t('inst.' + settings.instrument),
      instrumentId: settings.instrument,
      level: settings.level,
      transpose: settings.transpose,
      a4: settings.a4,
      date: new Date().toISOString(),
      results,
    });
    setList(LIST_KEY, lst);
    renderList();
  });

  function renderList() {
    const lst = getList(LIST_KEY);
    list.innerHTML = '';
    if (!lst.length) list.appendChild(el('li', { class: 'list-empty', text: t('chk.empty') }));
    for (const d of lst) {
      list.appendChild(el('li', { class: 'list-item' }, [
        el('div', { class: 'list-main' }, [
          el('div', { class: 'list-title', text: datasetName(d) }),
          el('div', { class: 'list-meta', text: `${(d.date || '').slice(0, 10)} / A4=${d.a4} / ${d.results.length}` }),
        ]),
        el('button', { type: 'button', class: 'btn btn-sm', text: t('common.load'), onclick: () => {
          show([{ name: datasetName(d), results: d.results, color: cssVar('--accent') }]);
          resultCard.classList.remove('hidden');
          resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } }),
        el('button', { type: 'button', class: 'btn btn-sm btn-danger', text: t('common.delete'), onclick: () => {
          if (!confirm(t('common.confirmDelete', { name: datasetName(d) }))) return;
          setList(LIST_KEY, getList(LIST_KEY).filter((x) => x.id !== d.id));
          renderList();
        } }),
      ]));
    }
    for (const sel of [cmpA, cmpB]) {
      const cur = sel.value;
      sel.innerHTML = '';
      sel.appendChild(el('option', { value: '', text: '—' }));
      for (const d of lst) sel.appendChild(el('option', { value: d.id, text: datasetName(d) }));
      sel.value = cur;
    }
  }
  $('cmpBtn').addEventListener('click', () => {
    const lst = getList(LIST_KEY);
    const a = lst.find((d) => d.id === cmpA.value);
    const b = lst.find((d) => d.id === cmpB.value);
    if (!a || !b) { alert(t('chk.selectTwo')); return; }
    show([
      { name: datasetName(a), results: a.results, color: cssVar('--accent') },
      { name: datasetName(b), results: b.results, color: cssVar('--muted') },
    ]);
    resultCard.classList.remove('hidden');
    resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('chkExportBtn').addEventListener('click', () => {
    downloadJson({ app: 'tuner', kind: 'checks', items: getList(LIST_KEY) }, 'pitch-check-' + new Date().toISOString().slice(0, 10) + '.json');
  });
  $('chkImport').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const obj = await readJsonFile(file);
      const items = Array.isArray(obj) ? obj : Array.isArray(obj.items) ? obj.items : obj.results ? [obj] : null;
      if (!items) throw new Error('format');
      const lst = getList(LIST_KEY);
      let n = 0;
      for (const it of items) {
        if (!it || !Array.isArray(it.results)) continue;
        if (!it.id || lst.some((x) => x.id === it.id)) it.id = uid();
        lst.unshift(it);
        n++;
      }
      setList(LIST_KEY, lst);
      renderList();
      alert(t('chk.importDone', { n }));
    } catch {
      alert(t('chk.importErr'));
    }
  });
  on('lang', () => { renderList(); renderButtons(); renderRangeInfo(); if (!active) msg.textContent = t(results.length ? 'chk.done' : 'chk.ready'); if (shown) show(shown); });
  renderList();

  // ---- 結果表示 ----
  function show(series) {
    shown = series;
    drawBars(canvas, series, label);
    table.innerHTML = '';
    const head = el('tr', {}, [el('th', { text: t('chk.colNote') })]);
    for (const s of series) head.appendChild(el('th', { text: series.length > 1 ? s.name : t('chk.colCents') }));
    if (series.length === 1) head.appendChild(el('th', { text: t('chk.colCount') }));
    table.appendChild(head);
    const midis = unionMidis(series);
    for (const m of midis) {
      const tr = el('tr', {}, [el('td', { text: label(m) })]);
      for (const s of series) {
        const r = s.results.find((x) => x.midi === m);
        const td = el('td', { text: r && r.cents != null ? (r.cents > 0 ? '+' : '') + r.cents.toFixed(1) : t('chk.skipped') });
        if (r && r.cents != null) td.dataset.state = tuningState(r.cents, settings.tolerance);
        tr.appendChild(td);
      }
      if (series.length === 1) {
        const r = series[0].results.find((x) => x.midi === m);
        tr.appendChild(el('td', { text: r ? String(r.n) : '' }));
      }
      table.appendChild(tr);
    }
  }
  window.addEventListener('resize', () => { if (shown && canvas.offsetParent) drawBars(canvas, shown, label); });
  // タブ切替直後はサイズ 0 の可能性があるので、表示されたら描き直す
  const obs = new MutationObserver(() => { if (shown && canvas.offsetParent) drawBars(canvas, shown, label); });
  obs.observe($('panel-check'), { attributes: true, attributeFilter: ['class'] });
}

function unionMidis(series) {
  const set = new Set();
  for (const s of series) for (const r of s.results) set.add(r.midi);
  return [...set].sort((a, b) => a - b);
}

function drawBars(canvas, series, label) {
  const { ctx, w, h } = setupCanvas(canvas);
  const midis = unionMidis(series);
  const padL = 28; const padB = 22; const padT = 8;
  const plotW = w - padL - 4;
  const plotH = h - padT - padB;
  const yOf = (c) => padT + plotH / 2 - (clampCents(c) / 50) * (plotH / 2);
  const ok = cssVar('--ok'); const low = cssVar('--low'); const high = cssVar('--high');
  const muted = cssVar('--muted'); const border = cssVar('--border');

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = ok;
  ctx.globalAlpha = 0.18;
  ctx.fillRect(padL, yOf(settings.tolerance), plotW, yOf(-settings.tolerance) - yOf(settings.tolerance));
  ctx.globalAlpha = 1;
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.fillStyle = muted;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const c of [-50, -25, 0, 25, 50]) {
    ctx.beginPath(); ctx.moveTo(padL, yOf(c)); ctx.lineTo(w - 4, yOf(c)); ctx.stroke();
    ctx.fillText(String(c), padL - 3, yOf(c));
  }
  if (!midis.length) return;
  const group = plotW / midis.length;
  const barW = Math.max(2, (group * 0.8) / series.length);
  const labelEvery = Math.max(1, Math.ceil(midis.length / Math.floor(plotW / 28)));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  midis.forEach((m, i) => {
    const x0 = padL + i * group + group * 0.1;
    series.forEach((s, j) => {
      const r = s.results.find((x) => x.midi === m);
      if (!r || r.cents == null) return;
      const x = x0 + j * barW;
      const y = yOf(r.cents);
      const base = yOf(0);
      ctx.fillStyle = series.length > 1 ? s.color
        : tuningState(r.cents, settings.tolerance) === 'in' ? ok : r.cents < 0 ? low : high;
      ctx.fillRect(x, Math.min(y, base), barW, Math.max(1, Math.abs(base - y)));
    });
    if (i % labelEvery === 0) {
      ctx.fillStyle = muted;
      ctx.fillText(label(m), padL + i * group + group / 2, h - padB + 4);
    }
  });
  if (series.length > 1) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let x = padL + 4;
    for (const s of series) {
      ctx.fillStyle = s.color;
      ctx.fillRect(x, padT, 10, 10);
      ctx.fillStyle = muted;
      ctx.fillText(s.name, x + 13, padT);
      x += 13 + ctx.measureText(s.name).width + 12;
    }
  }
}
