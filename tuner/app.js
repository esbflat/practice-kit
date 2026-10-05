// エントリ: 画面初期化、ピッチ検出ループ、タブ、親フレーム連携、SW 登録
import { yin, rms } from './lib/pitch.js';
import { analyzeFreq } from './lib/music.js';
import { detectLang } from './lib/i18n.js';
import { settings, setSetting } from './ui/store.js';
import { engine, emit, applyTheme, applyLanguage, setWakeLock, pauseAll } from './ui/core.js';
import { initTuner } from './ui/tuner.js';
import { initRecord } from './ui/record.js';
import { initCheck } from './ui/check.js';
import { initSettings } from './ui/settings.js';

// ---- 初期化 ----
applyTheme();
applyLanguage(settings.lang || detectLang(navigator.language));
initTuner();
initRecord();
initCheck();
initSettings();

// ---- タブ ----
const tabs = [...document.querySelectorAll('.tab')];
const panels = [...document.querySelectorAll('.panel')];
function showTab(name) {
  tabs.forEach((b) => {
    const active = b.dataset.tab === name;
    b.classList.toggle('is-active', active);
    b.setAttribute('aria-selected', String(active));
  });
  panels.forEach((p) => p.classList.toggle('is-active', p.id === 'panel-' + name));
  try { sessionStorage.setItem('pk_tuner_tab', name); } catch { /* ignore */ }
}
tabs.forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
let initialTab = 'tuner';
try { initialTab = sessionStorage.getItem('pk_tuner_tab') || 'tuner'; } catch { /* ignore */ }
showTab(initialTab);

// ---- ピッチ検出ループ(rAF ごとに YIN) ----
function frame() {
  const buf = engine.read();
  if (buf) {
    const level = rms(buf);
    const p = { time: performance.now() / 1000, rms: level, freq: null, midi: null, cents: null, clarity: 0, voiced: false };
    if (level >= settings.minRms) {
      const y = yin(buf, engine.sampleRate, { threshold: settings.yinThreshold });
      p.clarity = y.clarity;
      if (y.freq && y.freq >= 25 && y.freq <= 4500) {
        const a = analyzeFreq(y.freq, settings.a4);
        p.freq = y.freq;
        p.midi = a.midi;
        p.cents = a.cents;
        p.voiced = true;
      }
    }
    emit('pitch', p);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---- PC キーで録音開始/停止 ----
document.addEventListener('keydown', (e) => {
  if (!settings.recKey) return;
  const tag = (e.target && e.target.tagName) || '';
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(tag)) return;
  if (e.key.toLowerCase() === settings.recKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    emit('toggleRecord');
  }
});

// ---- 親フレーム連携 ----
window.addEventListener('message', (event) => {
  if (event.origin !== location.origin) return;
  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;
  switch (msg.type) {
    case 'setLanguage':
      if (msg.lang === 'ja' || msg.lang === 'en') { setSetting('lang', msg.lang); applyLanguage(msg.lang); }
      break;
    case 'setWakeLock':
      setSetting('wakeLock', !!msg.enabled);
      setWakeLock(!!msg.enabled);
      break;
    case 'pauseAll':
      pauseAll();
      break;
    default:
      break;
  }
});
if (window.parent !== window) {
  try { window.parent.postMessage({ type: 'childReady', app: 'tuner' }, location.origin); } catch { /* ignore */ }
}

// ---- Service Worker ----
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('sw', e));
  });
}
