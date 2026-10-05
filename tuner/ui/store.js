// localStorage ラッパー(キー接頭辞 pk_tuner_)

export const PREFIX = 'pk_tuner_';

export const DEFAULT_SETTINGS = {
  a4: 442,
  tolerance: 5,
  notation: 'en',
  transpose: 'C',
  family: 'brass',
  instrument: 'trumpet',
  level: 'mid',
  micId: '',
  minRms: 0.01,
  yinThreshold: 0.12,
  theme: 'light',
  accent: 'teal',
  wakeLock: false,
  lang: null,
  echo: false,
  fullColor: false,
  midiNote: null,
  recKey: '',
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.warn('localStorage write failed', e);
  }
}

export const settings = { ...DEFAULT_SETTINGS, ...read('settings', {}) };

const listeners = new Set();

export function onSettingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setSetting(key, value) {
  if (settings[key] === value) return;
  settings[key] = value;
  write('settings', settings);
  for (const fn of listeners) fn(key, value);
}

export function getList(name) {
  const v = read(name, []);
  return Array.isArray(v) ? v : [];
}

export function setList(name, list) {
  write(name, list);
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function exportAll() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX)) {
      try { out[k.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(k)); } catch { /* skip */ }
    }
  }
  return { app: 'tuner', version: 1, exportedAt: new Date().toISOString(), data: out };
}

export function importAll(obj) {
  if (!obj || obj.app !== 'tuner' || typeof obj.data !== 'object') throw new Error('bad format');
  for (const [k, v] of Object.entries(obj.data)) write(k, v);
}

export function clearAll() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX)) keys.push(k);
  }
  for (const k of keys) localStorage.removeItem(k);
}

export function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      try { resolve(JSON.parse(String(r.result))); } catch (e) { reject(e); }
    };
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}
