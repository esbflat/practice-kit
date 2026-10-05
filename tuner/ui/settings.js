// 設定画面
import { $, fillSelect } from './dom.js';
import { t } from '../lib/i18n.js';
import { noteLabel } from '../lib/music.js';
import { yin, rms } from '../lib/pitch.js';
import { FAMILIES, LEVELS, instrumentsOf, getInstrument } from '../lib/instruments.js';
import { settings, setSetting, onSettingsChange, exportAll, importAll, clearAll, downloadJson, readJsonFile } from './store.js';
import { engine, mic, on, emit, applyTheme, applyLanguage, setWakeLock, wakeLockSupported, startMic } from './core.js';

// beforeinstallprompt はモジュール評価時から拾っておく
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  const btn = document.getElementById('installBtn');
  if (btn) btn.classList.remove('hidden');
});

export function initSettings() {
  const familySelect = $('familySelect');
  const instrumentSelect = $('instrumentSelect');
  const levelSelect = $('levelSelect');
  const instrumentInfo = $('instrumentInfo');
  const setA4 = $('setA4');
  const setTolerance = $('setTolerance');
  const setNotation = $('setNotation');
  const setTranspose = $('setTranspose');
  const micSelect = $('micSelect');
  const setMinRms = $('setMinRms');
  const setMinRmsVal = $('setMinRmsVal');
  const setYin = $('setYin');
  const setYinVal = $('setYinVal');
  const calibStatus = $('calibStatus');
  const setTheme = $('setTheme');
  const setAccent = $('setAccent');
  const setLang = $('setLang');
  const setWake = $('setWakeLock');
  const wakeLockInfo = $('wakeLockInfo');
  const midiStatus = $('midiStatus');
  const setKey = $('setKey');
  const installBtn = $('installBtn');
  const installInfo = $('installInfo');

  // ---- 楽器 ----
  function fillFamilies() {
    fillSelect(familySelect, FAMILIES.map((f) => ({ value: f, label: t('family.' + f) })), settings.family);
  }
  function fillInstruments() {
    const items = instrumentsOf(settings.family).map((i) => ({ value: i.id, label: t('inst.' + i.id) }));
    const cur = items.some((i) => i.value === settings.instrument) ? settings.instrument : items[0].value;
    fillSelect(instrumentSelect, items, cur);
    if (cur !== settings.instrument) applyInstrument(cur);
  }
  function applyInstrument(id) {
    const inst = getInstrument(id);
    if (!inst) return;
    setSetting('instrument', id);
    setSetting('transpose', inst.transpose);
    renderInstrumentInfo();
  }
  function renderInstrumentInfo() {
    const inst = getInstrument(settings.instrument);
    if (!inst) { instrumentInfo.textContent = ''; return; }
    const r = inst.range[settings.level] || inst.range.mid;
    const opt = { notation: settings.notation, transpose: settings.transpose };
    instrumentInfo.textContent = `in ${inst.transpose} / ${noteLabel(r[0], opt)} – ${noteLabel(r[1], opt)} (${r[1] - r[0] + 1})`;
  }
  fillFamilies();
  fillInstruments();
  levelSelect.value = settings.level;
  renderInstrumentInfo();
  familySelect.addEventListener('change', () => { setSetting('family', familySelect.value); fillInstruments(); });
  instrumentSelect.addEventListener('change', () => applyInstrument(instrumentSelect.value));
  levelSelect.addEventListener('change', () => { setSetting('level', levelSelect.value); renderInstrumentInfo(); });

  // ---- ピッチ ----
  fillSelect(setTolerance, Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: `±${i + 1}` })), String(settings.tolerance));
  setA4.value = settings.a4;
  setNotation.value = settings.notation;
  setTranspose.value = settings.transpose;
  setA4.addEventListener('change', () => {
    const n = Math.max(430, Math.min(450, Math.round(Number(setA4.value) || 442)));
    setA4.value = n;
    setSetting('a4', n);
  });
  setTolerance.addEventListener('change', () => setSetting('tolerance', Number(setTolerance.value)));
  setNotation.addEventListener('change', () => setSetting('notation', setNotation.value));
  setTranspose.addEventListener('change', () => setSetting('transpose', setTranspose.value));
  onSettingsChange((k, v) => {
    if (k === 'a4') setA4.value = v;
    if (k === 'tolerance') setTolerance.value = String(v);
    if (k === 'notation') { setNotation.value = v; renderInstrumentInfo(); }
    if (k === 'transpose') { setTranspose.value = v; renderInstrumentInfo(); }
  });

  // ---- マイク ----
  async function fillMics() {
    const devs = await engine.listInputs();
    const items = [{ value: '', label: t('set.micDefault') }];
    devs.forEach((d, i) => items.push({ value: d.deviceId, label: d.label || t('set.micUnnamed', { n: i + 1 }) }));
    fillSelect(micSelect, items, settings.micId);
    if (!items.some((i) => i.value === settings.micId)) micSelect.value = '';
  }
  fillMics();
  $('micRefreshBtn').addEventListener('click', fillMics);
  on('mic', (m) => { if (m.on) fillMics(); });
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', fillMics);
  }
  micSelect.addEventListener('change', async () => {
    setSetting('micId', micSelect.value);
    if (mic.on) await startMic();
  });

  setMinRms.value = settings.minRms;
  setYin.value = settings.yinThreshold;
  const showThresholds = () => {
    setMinRmsVal.textContent = Number(settings.minRms).toFixed(3);
    setYinVal.textContent = Number(settings.yinThreshold).toFixed(2);
  };
  showThresholds();
  setMinRms.addEventListener('input', () => { setSetting('minRms', Number(setMinRms.value)); showThresholds(); });
  setYin.addEventListener('input', () => { setSetting('yinThreshold', Number(setYin.value)); showThresholds(); });

  // 感度の自動調整: 静音 3 秒 → 発音 3 秒
  let calibrating = false;
  $('calibBtn').addEventListener('click', async () => {
    if (calibrating) return;
    if (!mic.on) { calibStatus.textContent = t('set.calibNeedMic'); return; }
    calibrating = true;
    try {
      const quiet = await collect(3, (n) => { calibStatus.textContent = t('set.calibQuiet', { n }); }, false);
      const sound = await collect(3, (n) => { calibStatus.textContent = t('set.calibSound', { n }); }, true);
      const quietPeak = percentile(quiet.map((x) => x.rms), 0.95);
      const loud = sound.filter((x) => x.rms > Math.max(quietPeak * 2, 0.002));
      if (loud.length < 10) { calibStatus.textContent = t('set.calibNoSound'); return; }
      const soundMedian = percentile(loud.map((x) => x.rms), 0.5);
      const minRms = clamp(+Math.max(quietPeak * 2, soundMedian * 0.1).toFixed(3), 0.001, Math.max(0.001, soundMedian * 0.5));
      const dipMedian = percentile(loud.map((x) => x.dip), 0.5);
      const yinThr = clamp(+(dipMedian * 2 + 0.03).toFixed(2), 0.05, 0.4);
      setSetting('minRms', minRms);
      setSetting('yinThreshold', yinThr);
      setMinRms.value = minRms;
      setYin.value = yinThr;
      showThresholds();
      calibStatus.textContent = t('set.calibDone', { rms: minRms.toFixed(3), yin: yinThr.toFixed(2) });
    } finally {
      calibrating = false;
    }
  });
  function collect(seconds, onTick, withDip) {
    return new Promise((resolve) => {
      const out = [];
      const t0 = performance.now();
      let lastShown = -1;
      const step = () => {
        const elapsed = (performance.now() - t0) / 1000;
        const remain = Math.ceil(seconds - elapsed);
        if (remain !== lastShown) { lastShown = remain; onTick(Math.max(0, remain)); }
        const buf = engine.read();
        if (buf) {
          const r = rms(buf);
          const dip = withDip ? yin(buf, engine.sampleRate, { threshold: 0.5 }).dip : 1;
          out.push({ rms: r, dip });
        }
        if (elapsed < seconds && mic.on) requestAnimationFrame(step);
        else resolve(out);
      };
      requestAnimationFrame(step);
    });
  }

  // ---- 表示 ----
  setTheme.value = settings.theme;
  setAccent.value = settings.accent;
  setLang.value = settings.lang || document.documentElement.lang;
  setTheme.addEventListener('change', () => { setSetting('theme', setTheme.value); applyTheme(); });
  setAccent.addEventListener('change', () => { setSetting('accent', setAccent.value); applyTheme(); });
  setLang.addEventListener('change', () => { setSetting('lang', setLang.value); applyLanguage(setLang.value); });
  on('lang', (l) => {
    setLang.value = l;
    fillFamilies(); fillInstruments(); renderInstrumentInfo(); fillMics(); renderWake(); renderMidi(); renderInstall();
  });

  setWake.checked = !!settings.wakeLock;
  setWake.disabled = !wakeLockSupported;
  function renderWake() {
    wakeLockInfo.textContent = !wakeLockSupported ? t('set.wakeLockUnsupported') : t(settings.wakeLock ? 'set.wakeLockOn' : 'set.wakeLockOff');
  }
  renderWake();
  setWake.addEventListener('change', async () => {
    setSetting('wakeLock', setWake.checked);
    await setWakeLock(setWake.checked);
    renderWake();
  });
  onSettingsChange((k, v) => { if (k === 'wakeLock') { setWake.checked = !!v; renderWake(); } });
  if (settings.wakeLock) setWakeLock(true);

  // ---- 外部機器: Web MIDI / PC キー ----
  let midiLearning = false;
  function renderMidi() {
    if (!navigator.requestMIDIAccess) { midiStatus.textContent = t('set.midiUnsupported'); return; }
    if (midiLearning) midiStatus.textContent = t('set.midiWaiting');
    else midiStatus.textContent = settings.midiNote == null ? t('set.midiNone') : t('set.midiAssigned', { n: settings.midiNote });
  }
  renderMidi();
  let midiReady = false;
  async function ensureMidi() {
    if (midiReady || !navigator.requestMIDIAccess) return midiReady;
    try {
      const access = await navigator.requestMIDIAccess();
      const attach = () => { for (const input of access.inputs.values()) input.onmidimessage = onMidi; };
      attach();
      access.onstatechange = attach;
      midiReady = true;
    } catch (e) {
      console.warn('midi', e);
    }
    return midiReady;
  }
  function onMidi(ev) {
    const [status, note, vel] = ev.data;
    if ((status & 0xf0) !== 0x90 || vel === 0) return;
    if (midiLearning) {
      midiLearning = false;
      setSetting('midiNote', note);
      renderMidi();
      return;
    }
    if (settings.midiNote === note) emit('toggleRecord');
  }
  $('midiLearnBtn').addEventListener('click', async () => {
    if (!(await ensureMidi())) { renderMidi(); return; }
    midiLearning = !midiLearning;
    renderMidi();
  });
  if (settings.midiNote != null) ensureMidi();

  setKey.value = settings.recKey || '';
  setKey.addEventListener('input', () => setSetting('recKey', setKey.value.slice(-1).toLowerCase()));
  $('keyClearBtn').addEventListener('click', () => { setKey.value = ''; setSetting('recKey', ''); });

  // ---- インストール ----
  const isIos = /iP(hone|ad|od)/.test(navigator.userAgent) && !window.MSStream;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  function renderInstall() {
    if (standalone) { installInfo.textContent = t('set.installed'); installBtn.classList.add('hidden'); return; }
    if (installPrompt) { installBtn.classList.remove('hidden'); installInfo.textContent = ''; return; }
    installInfo.textContent = t(isIos ? 'set.installIos' : 'set.installUnavailable');
  }
  renderInstall();
  window.addEventListener('beforeinstallprompt', renderInstall);
  window.addEventListener('appinstalled', () => { installPrompt = null; installInfo.textContent = t('set.installed'); installBtn.classList.add('hidden'); });
  installBtn.addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => {});
    installPrompt = null;
    renderInstall();
  });

  // ---- データ管理 ----
  $('dataExportBtn').addEventListener('click', () => {
    downloadJson(exportAll(), 'pocket-tuner-' + new Date().toISOString().slice(0, 10) + '.json');
  });
  $('dataImport').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      importAll(await readJsonFile(file));
      alert(t('set.dataImportDone'));
      location.reload();
    } catch {
      alert(t('set.dataImportErr'));
    }
  });
  $('dataClearBtn').addEventListener('click', () => {
    if (!confirm(t('set.dataClearConfirm'))) return;
    clearAll();
    location.reload();
  });
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
