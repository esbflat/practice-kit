import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { INSTRUMENTS, FAMILIES, LEVELS, getInstrument, instrumentsOf, rangeNotes } from '../lib/instruments.js';
import { DICT, t, setLang, detectLang } from '../lib/i18n.js';
import { TRANSPOSE_OFFSET } from '../lib/music.js';

const here = dirname(fileURLToPath(import.meta.url));

test('every instrument has valid family, transpose and ordered ranges', () => {
  for (const inst of INSTRUMENTS) {
    assert.ok(FAMILIES.includes(inst.family), inst.id);
    assert.ok(inst.transpose in TRANSPOSE_OFFSET, inst.id);
    for (const lv of LEVELS) {
      const [lo, hi] = inst.range[lv];
      assert.ok(lo < hi, `${inst.id} ${lv}`);
    }
    // 上級ほど広い
    const w = (lv) => inst.range[lv][1] - inst.range[lv][0];
    assert.ok(w('easy') <= w('mid') && w('mid') <= w('adv'), inst.id);
    // 辞書に楽器名がある
    assert.ok(DICT.ja['inst.' + inst.id] && DICT.en['inst.' + inst.id], inst.id);
  }
  assert.equal(getInstrument('nope'), null);
  assert.ok(instrumentsOf('brass').length >= 5);
});

test('rangeNotes enumerates chromatic notes', () => {
  const ns = rangeNotes('trumpet', 'easy');
  assert.equal(ns[0], 58);
  assert.equal(ns[ns.length - 1], 70);
  assert.equal(ns.length, 13);
  assert.deepEqual(rangeNotes('nope'), []);
});

test('i18n: ja and en have identical key sets', () => {
  const ja = Object.keys(DICT.ja).sort();
  const en = Object.keys(DICT.en).sort();
  assert.deepEqual(ja, en);
});

test('i18n: every data-i18n key in index.html exists in the dictionary', () => {
  const html = readFileSync(join(here, '..', 'index.html'), 'utf8');
  const keys = new Set();
  for (const m of html.matchAll(/data-i18n(?:-ph)?="([^"]+)"/g)) keys.add(m[1]);
  assert.ok(keys.size > 40);
  for (const k of keys) assert.ok(k in DICT.ja, 'missing ja: ' + k);
});

test('i18n: dynamic keys used by ui/*.js exist in the dictionary', () => {
  const dir = join(here, '..', 'ui');
  const files = ['tuner.js', 'record.js', 'check.js', 'settings.js', 'core.js'];
  for (const f of files) {
    const src = readFileSync(join(dir, f), 'utf8');
    for (const m of src.matchAll(/\bt\('([a-zA-Z.]+)'/g)) {
      if (m[1].endsWith('.')) continue; // 'inst.' + id のような接頭辞連結は楽器テスト側で検証
      assert.ok(m[1] in DICT.ja, `${f}: missing key ${m[1]}`);
    }
  }
});

test('t() substitutes params and falls back to en / key', () => {
  setLang('ja');
  assert.equal(t('chk.progress', { i: 2, n: 10 }), '2 / 10');
  assert.equal(t('nonexistent.key'), 'nonexistent.key');
  setLang('en');
  assert.equal(t('tab.tuner'), 'Tuner');
  assert.equal(detectLang('ja-JP'), 'ja');
  assert.equal(detectLang('en-US'), 'en');
  assert.equal(detectLang(undefined), 'en');
});

test('sw.js precache list covers every js/css/html file in the app', () => {
  const sw = readFileSync(join(here, '..', 'sw.js'), 'utf8');
  for (const f of ['./index.html', './style.css', './app.js', './manifest.json', './icon.svg',
    './lib/music.js', './lib/pitch.js', './lib/instruments.js', './lib/i18n.js',
    './ui/store.js', './ui/dom.js', './ui/audio.js', './ui/core.js', './ui/tuner.js', './ui/record.js', './ui/check.js', './ui/settings.js']) {
    assert.ok(sw.includes(`'${f}'`), 'sw.js missing ' + f);
  }
});
