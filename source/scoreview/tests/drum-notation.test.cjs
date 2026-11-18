'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {ScoreView, mockCanvas, fullModel} = require('./helpers.cjs');

const xml = {quietText: true, showShapes: true, shapeSet: 'spindle', showTexture: true, fxPreset: 'clear', fxDynamics: 'song'};

function listener(model, options, width = 720, height = 410) {
  const surface = mockCanvas(width, height);
  const view = ScoreView.create(surface.canvas, model, () => 0, options);
  function frame(time) {
    view.draw(time);
    surface.reset();
    const stats = view.draw(time);
    const hash = createHash('sha256').update(JSON.stringify(surface.calls)).digest('hex');
    return {stats, hash};
  }
  return {view, surface, frame};
}

test('drum notation is opt-in and switching it off restores every drawing call of the quiet text scene', () => {
  assert.equal(ScoreView.DEFAULTS.drumNotation, false);
  const song = fullModel();
  const normal = listener(song, xml);
  const switched = listener(song, {...xml, drumNotation: true});
  const on = switched.frame(10.5);
  const off = normal.frame(10.5);
  assert.notEqual(on.hash, off.hash);
  assert.equal(on.stats.hits, off.stats.hits);
  assert.equal(on.stats.notes, off.stats.notes);
  assert.equal(on.stats.chord, off.stats.chord);
  assert.equal(switched.view.setOptions({drumNotation: false}).quietText, true);
  for (const time of [10.5, 21.01, 9.5]) assert.deepEqual(switched.frame(time), normal.frame(time));
});

test('each kit voice keeps its mark when rows are reordered; simultaneous and unknown hits keep their lanes', () => {
  function marks(rows, hits) {
    const model = {contract: 'xin.score-view/1', track: {duration: 50}, audio: {src: ''},
      lanes: [{id: 'drums', group: 'drums', kind: 'drums', label: '鼓', rows, hits}]};
    const scene = listener(model, {drumNotation: true, fxPreset: 'off', showBackdrop: false});
    const stats = scene.frame(12).stats;
    const ink = scene.surface.calls.find(c => c.name === 'fill' && /,0\.73\)$/.test(c.fillStyle))?.fillStyle;
    const commands = scene.surface.calls.filter(c => c.fillStyle === ink &&
      ['moveTo', 'lineTo', 'rect', 'roundRect', 'arc', 'closePath'].includes(c.name)).map(c => [c.name, ...c.args]);
    return {stats, commands};
  }
  const voices = ['crash', 'ride', 'openhat', 'hihat', 'tom', 'snare', 'kick'];
  const reversed = [...voices].reverse();
  const single = voices.map(name => {
    const expected = marks([name], [[10, 0, 100]]).commands;
    assert.ok(expected.length > 0);
    assert.deepEqual(marks(reversed, [[10, reversed.indexOf(name), 100]]).commands, expected);
    return expected;
  });
  assert.equal(new Set(single.map(commands => JSON.stringify(commands))).size, voices.length);
  const all = marks(voices, voices.map((_, i) => [10, i, 100]));
  assert.equal(all.stats.hits, 7);
  assert.deepEqual(all.commands, single.flat());
  const unknown = marks(['woodblock', 'cowbell'], [[10, 0, 100], [10, 1, 100]]);
  assert.equal(unknown.stats.hits, 2);
  assert.equal(new Set(unknown.commands.filter(c => c[0] === 'moveTo').map(c => c[2])).size, 2);
  assert.equal(marks(voices, []).stats.lanes, 0);
  function kickWidth(velocity) { return marks(['kick'], [[10, 0, velocity]]).commands.find(c => c[0] === 'roundRect')[3]; }
  assert.ok(kickWidth(127) > kickWidth(8));
});

test('layout survives a second listener, a different song, resize, seek and a return to the original options', () => {
  const model = fullModel();
  const other = fullModel();
  other.track.title = 'Other track';
  other.lanes = other.lanes.filter(lane => !lane.id.startsWith('guitar'));
  const on = {...xml, drumNotation: true, mergeTimbres: false};
  const first = listener(model, on), second = listener(other, on, 520, 290);
  const refA = first.frame(10).hash, refB = second.frame(30).hash;
  first.view.setOptions({laneHeights: 'fixed', hidden: ['bass'], laneLabels: 'text'});
  first.frame(29);
  assert.equal(second.frame(30).hash, refB);
  first.view.setModel(other);
  first.view.setOptions({laneHeights: 'loudness', hidden: [], laneLabels: 'icon'});
  first.surface.canvas.clientWidth = 520;
  first.surface.canvas.clientHeight = 290;
  assert.deepEqual(first.frame(30), second.frame(30));
  first.view.setModel(model);
  first.surface.canvas.clientWidth = 720;
  first.surface.canvas.clientHeight = 410;
  assert.equal(first.frame(10).hash, refA);
  assert.equal(second.frame(30).hash, refB);
});
