'use strict';
// 车窗地貌 batch 6, item 5: the route board in English, and the distance run instead of the song's time.
const assert = require('node:assert/strict');
const test = require('node:test');
const Led = require('../score-terrain-led.js');

test('station names to upper-case English, numbers kept; names it does not know stay as they are', () => {
  const cases = {'引子': 'INTRO', '主歌 1': 'VERSE 1', '导歌': 'PRE', '副歌 2': 'CHORUS 2', '间奏': 'BREAK', '器乐段': 'INST', '独奏': 'SOLO', '桥段': 'BRIDGE',
    '尾奏': 'OUTRO', 'Chorus 3': 'CHORUS 3', 'pre-chorus': 'PRE', 'Interlude': 'BREAK', 'instrumental 2': 'INST 2', '过门': '过门', 'Section A': 'Section A', '': ''};
  for (const [zh, en] of Object.entries(cases)) assert.equal(Led.englishSection(zh), en, zh);
});

test('the readout: miles at 79 mph in tenths, rounded down (never ahead of the train); time when asked for nothing', () => {
  assert.equal(Led.TRAIN_MPH, 79);
  assert.deepEqual(Led.readout({readout: 'miles'}, 104.4, 304), {now: '2.2', total: ' / 6.6 MI'});
  assert.deepEqual(Led.readout({readout: 'miles'}, 0, 60), {now: '0.0', total: ' / 1.3 MI'});
  assert.deepEqual(Led.readout({}, 104.4, 304), {now: '1:44', total: ' / 5:04'});
  assert.ok(Math.abs(Led.milesOf(3600) - 79) < 1e-12);
});

test('English names that do not fit shorten the word before the number first (CHORUS 2 -> CHO 2); a crowded route as before', () => {
  const rows = Led.headerRows(16, 12);
  const label = (names, cols) => Led.headerModel({title: 'T', sections: names.map((n, i) => [i * 30, i * 30 + 30, n]), time: 100, duration: names.length * 30, readout: 'miles'}, cols, rows, 16, 12);
  // 七里香's nine stations: whole at XML's collapsed width (478 dots), the words shortened with the sidebar open (407)
  const qili = ['INTRO', 'VERSE 1', 'PRE', 'CHORUS 1', 'INST', 'CHORUS 2', 'VERSE 2', 'CHORUS 3', 'OUTRO'];
  assert.deepEqual(label(qili, 478).labels, qili);
  assert.deepEqual(label(qili, 407).labels, ['INTRO', 'VER 1', 'PRE', 'CHO 1', 'INST', 'CHO 2', 'VER 2', 'CHO 3', 'OUTRO']);
  // 25 stations (Flowers of Romance): a letter and the number, every slot within its width, none run together
  const many = Array.from({length: 25}, (_, i) => ['INTRO', 'VERSE', 'CHORUS', 'INST'][i % 4] + ' ' + (1 + Math.floor(i / 4)));
  const M = label(many, 407);
  assert.ok(M.labels, 'every station keeps a label');
  for (const l of M.labels) assert.ok(Led.width(l, 12) <= M.plan.step - 3, l + ' fits its slot');
  assert.equal(M.labels[2], 'C1');
});
