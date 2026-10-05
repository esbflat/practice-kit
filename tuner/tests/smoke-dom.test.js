// 疑似 DOM で app.js を読み込み、マイク→検出→記録→音程チェック→設定の流れを通すスモークテスト
// (ブラウザ無しで、各画面モジュールの配線ミス・未定義参照を検出する)
import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = new URL('../', import.meta.url).href;
const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');

// ---- 疑似 DOM ----
const byId = new Map();
function makeEl(tag = 'div', id = '') {
  const listeners = {};
  const el = {
    tagName: tag.toUpperCase(), id, dataset: {}, style: {}, children: [], value: '', textContent: '', innerHTML: '',
    placeholder: '', disabled: false, checked: false, offsetParent: {}, clientWidth: 375, width: 0, height: 0,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener(n, f) { (listeners[n] ||= []).push(f); },
    removeEventListener() {},
    setAttribute() {}, getAttribute() { return null; },
    appendChild(c) { this.children.push(c); return c; }, remove() {},
    querySelectorAll() { return []; }, querySelector() { return null; },
    getBoundingClientRect() { return { width: 375, height: 220 }; },
    getContext() {
      return new Proxy({}, {
        get: (_, k) => (k === 'measureText' ? () => ({ width: 10 }) : typeof k === 'string' ? () => {} : undefined),
        set: () => true,
      });
    },
    setPointerCapture() {}, scrollIntoView() {}, click() {},
    fire(n, ev = {}) { (listeners[n] || []).forEach((f) => f({ target: el, preventDefault() {}, ...ev })); },
  };
  return el;
}
for (const m of html.matchAll(/<(\w+)[^>]*\bid="([^"]+)"/g)) byId.set(m[2], makeEl(m[1], m[2]));
const tabs = ['tuner', 'record', 'check', 'settings'].map((n) => { const e = makeEl('button'); e.dataset.tab = n; return e; });
const panels = ['tuner', 'record', 'check', 'settings'].map((n) => byId.get('panel-' + n));

globalThis.document = {
  getElementById: (id) => byId.get(id) || null,
  querySelectorAll: (sel) => (sel === '.tab' ? tabs : sel === '.panel' ? panels : []),
  querySelector: () => null,
  createElement: (tag) => makeEl(tag),
  createTextNode: (s) => ({ text: s }),
  body: makeEl('body'),
  documentElement: makeEl('html'),
  addEventListener() {},
  visibilityState: 'visible',
};
const store = new Map();
const fakeStorage = (m) => ({ getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i], get length() { return m.size; } });
globalThis.localStorage = fakeStorage(store);
globalThis.sessionStorage = fakeStorage(new Map());
// 事前設定: ピアノ(in C)・初級
localStorage.setItem('pk_tuner_settings', JSON.stringify({ family: 'other', instrument: 'piano', level: 'easy' }));

let clock = 0;
globalThis.performance = { now: () => clock };
const rafQueue = [];
globalThis.requestAnimationFrame = (f) => { rafQueue.push(f); return rafQueue.length; };
function runFrames(n) {
  for (let i = 0; i < n; i++) {
    clock += 16.7;
    const q = rafQueue.splice(0);
    for (const f of q) f(clock);
  }
}

let currentFreq = 442;
const SR = 48000;
class FakeAudioContext {
  constructor() { this.sampleRate = SR; this.state = 'running'; this.currentTime = 0; this.destination = {}; }
  resume() {}
  createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
  createAnalyser() {
    return {
      fftSize: 2048, smoothingTimeConstant: 0,
      getFloatTimeDomainData(buf) {
        for (let i = 0; i < buf.length; i++) {
          buf[i] = currentFreq ? 0.3 * Math.sin(2 * Math.PI * currentFreq * i / SR) + 0.1 * Math.sin(4 * Math.PI * currentFreq * i / SR) : 0;
        }
      },
    };
  }
  createOscillator() { return { type: '', frequency: { setValueAtTime() {}, setTargetAtTime() {} }, connect() { return this; }, start() {}, stop() {} }; }
  createGain() { const g = { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} }, connect() { return g; } }; return g; }
}
globalThis.window = globalThis;
globalThis.AudioContext = FakeAudioContext;
globalThis.isSecureContext = true;
globalThis.location = { origin: 'http://localhost', reload() {} };
globalThis.parent = globalThis;
globalThis.addEventListener = () => {};
globalThis.matchMedia = () => ({ matches: false });
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '#123456' });
globalThis.MutationObserver = class { observe() {} };
globalThis.confirm = () => true;
globalThis.alert = (m) => { globalThis.lastAlert = m; };
globalThis.devicePixelRatio = 2;
Object.defineProperty(globalThis, 'navigator', { value: {
  language: 'ja-JP', userAgent: 'test',
  mediaDevices: {
    getUserMedia: async () => ({ getTracks: () => [{ stop() {}, addEventListener() {} }] }),
    enumerateDevices: async () => [{ kind: 'audioinput', deviceId: 'x', label: 'Mic X' }],
    addEventListener() {},
  },
}, configurable: true });

test('fake-DOM smoke: tuner -> record -> pitch check -> settings', async () => {
  // ---- 読み込み ----
  await import(ROOT + 'app.js');
  const { settings } = await import(ROOT + 'ui/store.js');
  const { NOTATIONS, midiToFreq } = await import(ROOT + 'lib/music.js');
  assert.equal(settings.instrument, 'piano');
  assert.equal(settings.transpose, 'C');
  assert.equal(document.documentElement.lang, 'ja');

  // ---- チューナー: マイク開始 → A4 検出 ----
  byId.get('micBtn').fire('click');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(byId.get('micStatus').textContent, '検出中', byId.get('micStatus').textContent);
  runFrames(5);
  assert.equal(byId.get('noteName').textContent, 'A4');
  assert.equal(byId.get('centsText').textContent, '+0 ¢');

  // 10 セント高い → high、全面色
  byId.get('fullColorToggle').checked = true; byId.get('fullColorToggle').fire('change');
  currentFreq = 442 * Math.pow(2, 10 / 1200);
  runFrames(3);
  assert.equal(byId.get('centsText').textContent, '+10 ¢');
  assert.equal(document.body.dataset.tune, 'high');
  // 移調 in Bb → B4、ドレミ → シ4
  byId.get('transposeSelect').value = 'Bb'; byId.get('transposeSelect').fire('change');
  runFrames(1);
  assert.equal(byId.get('noteName').textContent, 'B4');
  byId.get('notationSelect').value = 'solfege'; byId.get('notationSelect').fire('change');
  runFrames(1);
  assert.equal(byId.get('noteName').textContent, 'シ4');
  byId.get('transposeSelect').value = 'C'; byId.get('transposeSelect').fire('change');
  byId.get('notationSelect').value = 'en'; byId.get('notationSelect').fire('change');

  // ---- 記録: 録音 → 停止 → 保存 ----
  currentFreq = 442;
  byId.get('recBtn').fire('click');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(byId.get('recBtn').textContent, '停止');
  runFrames(60);
  currentFreq = 0; // 無音区間
  runFrames(10);
  currentFreq = 442;
  runFrames(30);
  byId.get('recBtn').fire('click');
  assert.equal(byId.get('playBtn').disabled, false);
  byId.get('recName').value = 'smoke';
  byId.get('recSaveBtn').fire('click');
  const recs = JSON.parse(localStorage.getItem('pk_tuner_recordings'));
  assert.equal(recs.length, 1);
  assert.equal(recs[0].name, 'smoke');
  assert.ok(recs[0].samples.length >= 95, String(recs[0].samples.length));
  assert.ok(recs[0].samples.some((s) => s.c == null), 'unvoiced samples recorded');
  // 再生
  byId.get('playBtn').fire('click');
  runFrames(20);
  assert.ok(byId.get('recTime').textContent.endsWith(' s'));
  byId.get('playBtn').fire('click');

  // ---- 音程チェック: ピアノ初級 48–72 の 25 音を自動で進める ----
  function parseLabel(s) { const m = s.match(/^([A-G]#?)(-?\d)$/); return NOTATIONS.en.indexOf(m[1]) + (Number(m[2]) + 1) * 12; }
  byId.get('chkAutoToggle').checked = true; // HTML では checked 既定(スタブは false)
  byId.get('chkStartBtn').fire('click');
  assert.equal(byId.get('chkTarget').textContent, 'C3');
  // 手動「次へ」: サンプル無しで押すと未計測として進む
  byId.get('chkNextBtn').fire('click');
  assert.equal(byId.get('chkTarget').textContent, 'C#3');
  let guard = 0;
  while (byId.get('chkTarget').textContent !== '--' && guard++ < 2000) {
    const midi = parseLabel(byId.get('chkTarget').textContent);
    currentFreq = midiToFreq(midi, 442) * Math.pow(2, (midi % 2 ? 8 : -3) / 1200); // 交互に +8 / -3 セント
    runFrames(1);
  }
  assert.ok(guard < 2000, 'check did not finish');
  assert.equal(byId.get('chkMsg').textContent, '終了しました。結果を保存できます。');
  const rows = byId.get('chkTable').children;
  assert.equal(rows.length, 26); // header + 25
  assert.equal(rows[1].children[1].textContent, '未計測');
  const cs3 = rows[2].children[1].textContent;
  assert.equal(cs3, '+8.0', cs3);
  assert.equal(rows[3].children[1].textContent, '-3.0');
  byId.get('chkPlayer').value = 'Tester';
  byId.get('chkSaveBtn').fire('click');
  const checks = JSON.parse(localStorage.getItem('pk_tuner_checks'));
  assert.equal(checks.length, 1);
  assert.equal(checks[0].results.length, 25);
  assert.equal(checks[0].player, 'Tester');

  // 比較(同じデータ同士)
  byId.get('cmpA').value = checks[0].id; byId.get('cmpB').value = checks[0].id;
  byId.get('cmpBtn').fire('click');
  assert.equal(byId.get('chkTable').children[0].children.length, 3);

  // ---- 設定: 言語切替・自動調整・データ出力 ----
  byId.get('setLang').value = 'en'; byId.get('setLang').fire('change');
  assert.equal(byId.get('micBtn').textContent, 'Stop mic');
  assert.equal(byId.get('chkStartBtn').textContent, 'Start');
  byId.get('setLang').value = 'ja'; byId.get('setLang').fire('change');

  currentFreq = 0;
  async function runFramesAsync(n) { for (let i = 0; i < n; i++) { runFrames(1); await new Promise((r) => setImmediate(r)); } }
  byId.get('calibBtn').fire('click');
  await runFramesAsync(185);                 // 静音 3 秒
  currentFreq = 442;
  await runFramesAsync(190);                 // 発音 3 秒
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(byId.get('calibStatus').textContent.startsWith('設定しました'));
  assert.ok(settings.minRms > 0 && settings.minRms < 0.2);
  assert.ok(settings.yinThreshold >= 0.05 && settings.yinThreshold <= 0.4);

  // ---- データ出力 / 親フレームメッセージ ----
  const { exportAll } = await import(ROOT + 'ui/store.js');
  const dump = exportAll();
  assert.equal(dump.app, 'tuner');
  assert.ok(dump.data.settings && dump.data.recordings.length === 1 && dump.data.checks.length === 1);



});
