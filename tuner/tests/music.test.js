import test from 'node:test';
import assert from 'node:assert/strict';
import {
  midiToFreq, freqToMidiFloat, analyzeFreq, centsBetween, noteLabel, writtenMidi,
  tuningState, clampCents, mean, stddev, pitchClass, octaveOf,
} from '../lib/music.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('midi <-> freq at A4=442', () => {
  near(midiToFreq(69, 442), 442);
  near(midiToFreq(57, 442), 221);
  near(midiToFreq(69, 440), 440);
  near(freqToMidiFloat(442, 442), 69);
  near(freqToMidiFloat(220, 440), 57);
});

test('analyzeFreq gives nearest midi and cents', () => {
  const r = analyzeFreq(442, 442);
  assert.equal(r.midi, 69);
  near(r.cents, 0);
  // 10 cents sharp of A4
  const sharp = analyzeFreq(442 * Math.pow(2, 10 / 1200), 442);
  assert.equal(sharp.midi, 69);
  near(sharp.cents, 10, 1e-6);
  // 30 cents flat of A4
  const flat = analyzeFreq(442 * Math.pow(2, -30 / 1200), 442);
  assert.equal(flat.midi, 69);
  near(flat.cents, -30, 1e-6);
  // 440 at A4=442 is about -7.85 cents
  near(analyzeFreq(440, 442).cents, 1200 * Math.log2(440 / 442), 1e-9);
  assert.equal(analyzeFreq(0), null);
});

test('centsBetween', () => {
  near(centsBetween(442, 442), 0);
  near(centsBetween(884, 442), 1200);
});

test('pitchClass / octaveOf', () => {
  assert.equal(pitchClass(69), 9);
  assert.equal(octaveOf(69), 4);
  assert.equal(octaveOf(60), 4);
  assert.equal(octaveOf(59), 3);
  assert.equal(pitchClass(-1), 11);
});

test('noteLabel in three notations', () => {
  assert.equal(noteLabel(69), 'A4');
  assert.equal(noteLabel(60, { notation: 'solfege' }), 'ド4');
  assert.equal(noteLabel(70, { notation: 'de' }), 'B4');   // Bb -> ドイツ音名 B
  assert.equal(noteLabel(71, { notation: 'de' }), 'H4');   // B  -> H
  assert.equal(noteLabel(61, { notation: 'de' }), 'Cis4');
  assert.equal(noteLabel(69, { octave: false }), 'A');
});

test('transposition: concert -> written', () => {
  // 実音 Bb4(70) は Bb 楽器では C5、Eb 楽器では G5、F 楽器では F5
  assert.equal(writtenMidi(70, 'Bb'), 72);
  assert.equal(noteLabel(70, { transpose: 'Bb' }), 'C5');
  assert.equal(noteLabel(70, { transpose: 'Eb' }), 'G5');
  assert.equal(noteLabel(70, { transpose: 'F' }), 'F5');
  assert.equal(noteLabel(70, { transpose: 'C' }), 'A#4');
  // 実音 A4 → ホルン(F)では E5
  assert.equal(noteLabel(69, { transpose: 'F' }), 'E5');
});

test('tuningState / clampCents', () => {
  assert.equal(tuningState(0, 5), 'in');
  assert.equal(tuningState(5, 5), 'in');
  assert.equal(tuningState(-5.1, 5), 'low');
  assert.equal(tuningState(8, 5), 'high');
  assert.equal(clampCents(80), 50);
  assert.equal(clampCents(-80), -50);
});

test('mean / stddev', () => {
  near(mean([1, 2, 3]), 2);
  near(stddev([2, 4, 4, 4, 5, 5, 7, 9]), Math.sqrt(32 / 7));
  assert.equal(stddev([1]), 0);
  assert.equal(mean([]), 0);
});
