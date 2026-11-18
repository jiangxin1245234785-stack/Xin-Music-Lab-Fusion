'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {ScoreView, mockCanvas, fullModel} = require('./helpers.cjs');

function draw(model, options, width, height) {
  const surface = mockCanvas(width, height);
  const view = ScoreView.create(surface.canvas, model, () => 10, options);
  const stats = view.draw(10);
  return {surface, view, stats};
}

test('compact labels leave the legacy and spacious XML drawing paths intact', () => {
  assert.equal(ScoreView.DEFAULTS.denseLaneLabels, false);
  for (const options of [{mergeTimbres: true}, {mergeTimbres: false}, {laneLabels: 'text'}]) {
    const a = draw(fullModel(), options, 1200, 800);
    const b = draw(fullModel(), {...options, denseLaneLabels: true}, 1200, 800);
    assert.deepEqual(b.stats, a.stats);
    assert.equal(JSON.stringify(b.surface.calls), JSON.stringify(a.surface.calls));
  }
});

test('every compact icon and number fits its column and keeps the original hit target', () => {
  const model = fullModel();
  model.lanes = Array.from({length: 33}, (_, i) => ({
    id: 'winds/p' + i, label: String(i + 1), kind: 'pitched', group: 'winds', groupLabel: '管乐',
    notes: [[10, .5, 40 + i, 90]]
  }));
  const options = {mergeTimbres: false, laneLabels: 'icon'};
  const {view, surface, stats: old} = draw(model, options, 785, 364);
  assert.ok(old.labels.some(l => l.shown === 'none'));
  surface.reset(); const before = view.draw(10), calls = surface.calls.slice();
  view.setOptions({denseLaneLabels: true});
  surface.reset(); const after = view.draw(10);
  assert.equal(after.notes, before.notes);
  assert.deepEqual(after.labels.map(l => l.number), Array.from({length: 33}, (_, i) => i + 1));
  for (const l of after.labels) {
    assert.equal(l.shown, 'icon'); assert.ok(l.size > 0);
    assert.equal(view.hit(l.x + l.size / 2, l.y + l.size / 2)?.id, l.lane);
    assert.ok(surface.texts().some(t => t.text === String(l.number) && Math.abs(t.x - (l.x + l.size + 1)) < .02));
    for (const prev of after.labels.slice(0, l.number - 1)) {
      const collided = Math.abs(l.x - prev.x) < l.size + 13 && Math.abs(l.y - prev.y) < l.size - .02;
      assert.equal(collided, false, prev.number + ' and ' + l.number);
    }
  }
  view.setOptions({denseLaneLabels: false}); surface.reset();
  assert.deepEqual(view.draw(10), before); assert.equal(JSON.stringify(surface.calls), JSON.stringify(calls));
});
