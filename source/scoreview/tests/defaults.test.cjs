'use strict';
// The defaults the user chose (work/score-export-20261114/SPEC.md B1, B7): icons for the lane names,
// the thin section line, the "object · event" marks, the clear preset. "Nothing given" is tested
// here as nothing given: the frame must be the one the chosen look draws, and each old look, asked
// for by name, must still draw exactly what 0.10.0 (frozen before the defaults moved) drew.
// The other suites pin text / block where they were written against them; these do not.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {ScoreView, mockCanvas, fullModel, cutAtBar, barTopOf, alike} = require('./helpers.cjs');

const BEFORE = require('./fixtures/score-view-0.10.0.js');
const DATA = path.join(__dirname, '..', '..', '..', 'work', 'scoreview-20261110', 'data');
const steps = (from, to, count) => Array.from({length: count}, (_, i) => from + (to - from) * i / (count - 1));
const CHOSEN = {laneLabels: 'icon', sectionStyle: 'line', captionStyle: 'mark', fxPreset: 'clear', backdropLevel: 'loudness'};

// A model with a mark row (a fifth item, as adapter/cues.cjs writes it) and a sentence row.
function markedModel() {
  const model = fullModel();
  model.captions = [
    [7.9, 12.5, '人声 · 首现', 'rule', {object: 'vocals', word: 'first', at: 10, preview: true, score: 1.2}],
    [30, 35, '先听人声和吉他。', 'manual']
  ];
  return model;
}

// Every call with its arguments and drawing state, for frame-by-frame comparison.
function frames(core, model, options, times) {
  const surface = mockCanvas(800, 400);
  const view = core.create(surface.canvas, model, () => 0, options);
  view.setCover({width: 480, height: 480});
  view.draw(0);
  const barTop = barTopOf(view, 400, 400);
  return times.map(time => {
    surface.reset();
    const stats = view.draw(time);
    return {calls: JSON.stringify(surface.calls), stats, barTop};
  });
}

test('the defaults are the chosen look: icon, line, mark, clear (and the backdrop follows the loudness)', () => {
  assert.equal(ScoreView.VERSION, '0.31.2');
  for (const [key, value] of Object.entries(CHOSEN)) assert.equal(ScoreView.DEFAULTS[key], value, key);
  const surface = mockCanvas(800, 400);
  const view = ScoreView.create(surface.canvas, markedModel(), () => 0);
  for (const [key, value] of Object.entries(CHOSEN)) assert.equal(view.options()[key], value, `view.options().${key}`);
  const at10 = view.draw(10);
  assert.ok(at10.labels.length && at10.labels.every(label => label.shown === 'icon'), JSON.stringify(at10.labels));
  assert.ok(Array.isArray(at10.sectionNames) && at10.sectionNames.length > 0, '细线段落条应当写出段名');
  assert.equal(at10.mark && at10.mark.text, '人声 · 首现');
  assert.equal(at10.fx.preset, 'clear');
});

test('nothing given draws exactly what the chosen look, given by name, draws', () => {
  const times = steps(0, 60, 121).concat([7.95, 9.9, 10, 10.4, 12.4, 30.5]);
  for (const model of [markedModel(), fullModel()]) {
    const given = frames(ScoreView, model, CHOSEN, times), none = frames(ScoreView, model, {}, times);
    none.forEach((frame, i) => {
      assert.equal(frame.calls, given[i].calls, `${times[i]} 秒：什么都不给和明说选定的样子画的不一样`);
      assert.deepEqual(frame.stats, given[i].stats);
    });
  }
});

test('each old look, asked for by name, draws exactly what 0.10.0 drew (the kick aside: it lifts the lanes only)', () => {
  assert.equal(BEFORE.VERSION, '0.10.0');
  const pilots = ['qilixiang', 'meguri'].map(name => {
    const file = path.join(DATA, name, 'bundle.json');
    assert.ok(fs.existsSync(file), `试点 ${name} 的 bundle.json 不在，这条比对跑不了`);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  });
  let compared = 0, breaths = 0;
  const looks = [
    {laneLabels: 'text', sectionStyle: 'block', captionStyle: 'sentence'},
    {laneLabels: 'text'}, {sectionStyle: 'block'}, {captionStyle: 'sentence'},
    {laneLabels: 'icon', sectionStyle: 'line', captionStyle: 'mark'}
  ];
  for (const look of looks) {
    for (const fxPreset of ['off', 'clear', 'strong']) {
      // 0.10.0 is told everything (its own defaults were text / block / sentence); the new core the same.
      const options = {laneLabels: 'text', sectionStyle: 'block', captionStyle: 'sentence', ...look, fxPreset};
      // Both cores get the same input, one the old and the new rules agree on (helpers.alike).
      for (const model of [markedModel(), ...pilots].map(alike)) {
        const times = steps(0, model.track.duration, 61).map(t => t + 0.013).concat([9.02, 10, 10.02, 30.01]);
        const old = frames(BEFORE, model, options, times), now = frames(ScoreView, model, options, times);
        now.forEach((frame, i) => {
          compared++;
          if (frame.calls === old[i].calls) { assert.deepEqual(frame.stats, old[i].stats); return; }
          // The one difference allowed: the breath's rectangle, from the whole canvas to the lanes.
          // Effects cut at the section bar's top edge (0.12.0) are put back first (helpers.cjs cutAtBar).
          const a = JSON.parse(old[i].calls), b = cutAtBar(a, JSON.parse(frame.calls), frame.barTop);
          if (JSON.stringify(a) === JSON.stringify(b)) { assert.deepEqual(frame.stats, old[i].stats); return; }
          assert.equal(b.length, a.length, `${JSON.stringify(look)} ${fxPreset} ${times[i]} 秒：调用数不同`);
          const differ = b.map((call, j) => JSON.stringify(call) === JSON.stringify(a[j]) ? null : j).filter(j => j !== null);
          assert.equal(differ.length, 1, `${JSON.stringify(look)} ${fxPreset} ${times[i]} 秒：不止呼吸一处不同`);
          const was = a[differ[0]], is = b[differ[0]];
          assert.ok(was.name === 'fillRect' && is.name === 'fillRect' && /^rgba\(255,255,255,/.test(is.fillStyle) && is.fillStyle === was.fillStyle);
          assert.deepEqual([was.args[1], was.args[3]], [0, 400]);
          assert.ok(is.args[1] > 400 * 0.12 && is.args[1] + is.args[3] < 400 && is.args[0] === 0 && is.args[2] === 800);
          assert.deepEqual(frame.stats, old[i].stats);
          breaths++;
        });
      }
    }
  }
  assert.ok(compared > 2000 && breaths > 0, `${compared} 帧，其中 ${breaths} 帧有呼吸`);
});

test("backdropLevel 'steady': the backdrop keeps the middle brightness; 'loudness' (the default) follows the song", () => {
  // A whole song of ten minutes (a video export draws every frame of it), loudness moving all the way through.
  const model = fullModel();
  model.track.duration = 600;
  model.energy = {hop: 0.1, db: Array.from({length: 6000}, (_, i) => -40 + 30 * Math.abs(Math.sin(i / 37)))};
  const run = (options, times) => {
    const surface = mockCanvas(800, 400);
    const view = ScoreView.create(surface.canvas, model, () => 0, options);
    view.setCover({width: 480, height: 480});
    return times.map(time => {
      surface.reset();
      const stats = view.draw(time);
      const cover = surface.calls.find(call => call.name === 'drawImage');
      return {level: stats.backdrop.level, strength: stats.backdrop.strength, alpha: cover && cover.alpha};
    });
  };
  const whole = steps(0, 600, 1201), steady = run({backdropLevel: 'steady'}, whole), loud = run({}, whole);
  assert.ok(steady.every(frame => frame.level === 0.5), JSON.stringify(steady.filter(frame => frame.level !== 0.5).slice(0, 3)));
  assert.equal(new Set(steady.filter(frame => frame.alpha !== undefined).map(frame => frame.alpha)).size, 1, '整首的封面亮度都不变');
  // The section wash's strength depends on the level and on how much of a section is around; inside one section
  // (24–42 s: more than BLEND's 2 s from both of 「主歌 1」's ends) only the level could move it.
  assert.equal(new Set(run({backdropLevel: 'steady'}, steps(24, 42, 37)).map(frame => frame.strength)).size, 1, '段落色的亮度也不变');
  assert.ok(Math.abs(steady[0].alpha - 0.24) < 1e-9, `封面取中间亮度 0.14 + 0.2 × 0.5，实际 ${steady[0].alpha}`);
  assert.ok(new Set(loud.map(frame => frame.level)).size > 10, '缺省时亮度应当跟着响度走');
  const surface = mockCanvas();
  const view = ScoreView.create(surface.canvas, model, () => 0, {backdropLevel: 'steady'});
  view.setOptions({backdropLevel: 'bright'});
  assert.equal(view.options().backdropLevel, 'steady', '不认识的值不该被接受');
  view.setOptions({backdropLevel: 'loudness'});
  assert.equal(view.options().backdropLevel, 'loudness');
});
