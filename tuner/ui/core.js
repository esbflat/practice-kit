// 画面間で共有する状態: AudioEngine、イベントバス、マイク制御、テーマ、言語、Wake Lock
import { AudioEngine } from './audio.js';
import { settings, setSetting } from './store.js';
import { setLang, t } from '../lib/i18n.js';
import { applyI18n } from './dom.js';

export const engine = new AudioEngine();

// ---- イベントバス ----
// 'pitch' {time,rms,freq,midi,cents,clarity,voiced} / 'mic' {on,error} / 'lang' / 'toggleRecord' / 'pauseAll'
const handlers = new Map();

export function on(name, fn) {
  if (!handlers.has(name)) handlers.set(name, new Set());
  handlers.get(name).add(fn);
  return () => handlers.get(name).delete(fn);
}

export function emit(name, payload) {
  const set = handlers.get(name);
  if (!set) return;
  for (const fn of set) {
    try { fn(payload); } catch (e) { console.error(e); }
  }
}

// ---- マイク ----
export const mic = { on: false, error: null };

export async function startMic() {
  mic.error = null;
  try {
    if (!window.isSecureContext) throw new Error('insecure');
    await engine.startMic(settings.micId);
    mic.on = true;
  } catch (e) {
    mic.on = false;
    if (e && e.message === 'unsupported') mic.error = t('mic.unsupported');
    else if (e && e.message === 'insecure') mic.error = t('mic.needHttps');
    else mic.error = t('mic.error', { msg: (e && (e.name || e.message)) || '?' });
  }
  emit('mic', { ...mic });
  return mic.on;
}

export function stopMic() {
  engine.stopMic();
  engine.stopAllTones();
  mic.on = false;
  emit('mic', { ...mic });
}

export async function toggleMic() {
  if (mic.on) stopMic();
  else await startMic();
}

// ---- テーマ ----
export function applyTheme() {
  const root = document.documentElement;
  root.dataset.theme = settings.theme;
  root.dataset.accent = settings.accent;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const c = getComputedStyle(root).getPropertyValue('--accent').trim();
    if (c) meta.content = c;
  }
}

// ---- 言語 ----
export function applyLanguage(lang) {
  const l = setLang(lang);
  document.documentElement.lang = l;
  applyI18n(document);
  emit('lang', l);
}

// ---- Wake Lock ----
let wakeLockSentinel = null;

export const wakeLockSupported = 'wakeLock' in navigator;

export async function setWakeLock(enabled) {
  if (!wakeLockSupported) return false;
  if (enabled) {
    try {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', () => { wakeLockSentinel = null; });
      return true;
    } catch (e) {
      console.warn('wakeLock', e);
      return false;
    }
  }
  if (wakeLockSentinel) {
    try { await wakeLockSentinel.release(); } catch { /* ignore */ }
    wakeLockSentinel = null;
  }
  return false;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && settings.wakeLock && !wakeLockSentinel) setWakeLock(true);
});

// ---- 全停止(親フレームからの pauseAll など) ----
export function pauseAll() {
  emit('pauseAll');
  stopMic();
}

export { settings, setSetting };
