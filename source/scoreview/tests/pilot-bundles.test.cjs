'use strict';
// The two real pilot models, as `tools/build_bundle.py` wrote them. Invariants only, never
// counts: the library changes under this project and a re-run may move every number.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {ScoreView, mockCanvas} = require('./helpers.cjs');

const DATA = path.join(__dirname, '..', '..', '..', 'work', 'scoreview-20261110', 'data');
const load = name => {
  const file = path.join(DATA, name, 'bundle.json');
  return fs.existsSync(file) ? {text: fs.readFileSync(file, 'utf8'), model: JSON.parse(fs.readFileSync(file, 'utf8'))} : null;
};

for (const name of ['qilixiang', 'meguri']) {
  const bundle = load(name);
  test(`${name}: the model is one the core accepts, with every note inside the song`, {skip: !bundle && '还没有生成 bundle.json'}, () => {
    const {model} = bundle;
    const summary = ScoreView.inspect(model);
    assert.deepEqual(summary.skipped, []);
    assert.ok(summary.lanes >= 3);
    assert.ok(model.track.title && model.track.duration > 60);
    const ids = model.lanes.map(lane => lane.id);
    assert.equal(new Set(ids).size, ids.length, '轨 id 有重复');
    for (const lane of model.lanes) {
      const times = (lane.notes || lane.hits).map(item => item[0]);
      assert.ok(times.length > 0, `${lane.id} 是空的`);
      assert.ok(times.every((time, i) => i === 0 || time >= times[i - 1]), `${lane.id} 没按时间排序`);
      assert.ok(times[0] >= 0 && times[times.length - 1] <= model.track.duration + 0.01, `${lane.id} 有音符落在曲子外面`);
      if (lane.notes) {
        assert.ok(lane.notes.every(note => note[1] > 0 && note[2] >= 0 && note[2] <= 127 && note[3] >= 1 && note[3] <= 127), lane.id);
        assert.ok(lane.notes.every(note => note[0] + note[1] <= model.track.duration + 0.01), `${lane.id} 有音符拖到曲子外面`);
      } else {
        assert.ok(lane.hits.every(hit => Number.isInteger(hit[1]) && hit[1] >= 0 && hit[1] < lane.rows.length), lane.id);
      }
    }
  });

  test(`${name}: no part is left at one flat velocity`, {skip: !bundle && '还没有生成 bundle.json'}, () => {
    for (const lane of bundle.model.lanes) {
      const velocities = new Set((lane.notes || lane.hits).map(item => item[item.length - 1]));
      assert.ok(velocities.size > 4 || (lane.notes || lane.hits).length < 30, `${lane.id} 的力度只有 ${velocities.size} 档`);
    }
  });

  test(`${name}: frames across the whole song draw, in both drawings and both groupings`, {skip: !bundle && '还没有生成 bundle.json'}, () => {
    const surface = mockCanvas(390, 420);                          // a phone held upright
    const view = ScoreView.create(surface.canvas, bundle.model, () => 0);
    for (const options of [{}, {simplify: true}, {mergeTimbres: true}, {simplify: true, mergeTimbres: true}]) {
      view.setOptions({simplify: false, mergeTimbres: false, ...options});
      let withNotes = 0;
      for (let i = 1; i < 40; i++) {
        const frame = view.draw(bundle.model.track.duration * i / 40);
        if (frame.notes + frame.hits > 0) withNotes++;
      }
      assert.ok(withNotes >= 30, `${JSON.stringify(options)}：39 帧里只有 ${withNotes} 帧有音符`);
      for (const lane of view.lanes()) assert.ok(lane.shown <= lane.count && (lane.shown > 0 || options.simplify), lane.id);
    }
  });

  test(`${name}: nothing in the model says where it came from on this machine`, {skip: !bundle && '还没有生成 bundle.json'}, () => {
    // The page is published; a model must not carry local paths or account names into it.
    assert.ok(!/[A-Za-z]:\\\\|\/Users\/|\\\\Users\\\\|Download/.test(bundle.text));
  });
}

for (const name of ['qilixiang', 'meguri']) {
  const bundle = load(name);
  test(`${name}: every chord has tones to show, and every section a name inside the song`, {skip: !bundle && '还没有生成 bundle.json'}, () => {
    const {model} = bundle;
    assert.ok(model.chords.length > 20 && model.sections.length > 3);
    for (const chord of model.chords) {
      const tones = model.chordTones[chord[2]];
      assert.ok(Array.isArray(tones) && tones.length >= 2, `${chord[2]} 没有内音`);
      const names = ScoreView.toneNames(chord[2], tones);
      assert.equal(names.length, tones.length);
      assert.ok(chord[2].startsWith(names[0]), `${chord[2]} 的第一个内音应当是根音，得到 ${names[0]}`);
      assert.ok(names.every(tone => /^[A-G][#b]?$/.test(tone)), `${chord[2]} → ${names}`);
    }
    for (const [start, end, sectionName, source, raw] of model.sections) {
      assert.ok(start >= 0 && end <= model.track.duration + 0.01 && end - start >= 1, `${sectionName} ${start}–${end}`);
      assert.ok(sectionName && source === 'songformer' && raw, sectionName);
      assert.ok(!/^[a-z-]+$/.test(sectionName), `${sectionName} 还是引擎的原始标签`);
    }
    const names = model.sections.map(section => section[2]);
    assert.equal(new Set(names).size, names.length, '重复的段名应当编了号');
    const surface = mockCanvas(390, 455);
    const view = ScoreView.create(surface.canvas, model, () => 0);
    let withChord = 0, withSection = 0;
    for (let i = 1; i < 60; i++) {
      const frame = view.draw(model.track.duration * i / 60);
      if (frame.chord) withChord++;
      if (frame.section) withSection++;
    }
    assert.ok(withChord >= 50 && withSection >= 50, `59 帧里有和弦的 ${withChord} 帧，有段名的 ${withSection} 帧`);
    const counts = view.chordCounts();
    assert.ok(counts.raw >= counts.half && counts.half >= counts.second && counts.raw >= counts.beat);
  });
}

test('七里香 carries every layer; its bar grid is steady', {skip: !load('qilixiang') && '还没有生成 bundle.json'}, () => {
  const summary = ScoreView.inspect(load('qilixiang').model);
  assert.deepEqual([summary.chords, summary.sections, summary.bars, summary.energy, summary.contour, summary.captions],
    [true, true, true, true, true, true]);
  const melody = load('qilixiang').model.lanes.filter(lane => lane.kind === 'melody');
  assert.equal(melody.length, 1);
  const voiced = melody[0].contour.midi.filter(value => value !== null);
  assert.ok(voiced.length > 1000 && voiced.every(value => value > 36 && value < 84), '人声曲线不在人声音域里');
});

test('MEGURI has no bar lines: its grid is unsteady, so the model says so instead of guessing', {skip: !load('meguri') && '还没有生成 bundle.json'}, () => {
  const {model} = load('meguri');
  const summary = ScoreView.inspect(model);
  assert.equal(summary.bars, false);
  assert.equal(summary.beats, true);
  assert.deepEqual(model.bars.downbeats, []);
  assert.equal(model.lanes.some(lane => lane.kind === 'melody'), false);
});
