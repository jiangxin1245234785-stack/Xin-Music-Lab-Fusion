'use strict';
// Stage two, B2: what a host needs to make the score touchable: which lane or section is
// under a point, a lane listened to alone, a stretch being repeated.
const test = require('node:test');
const assert = require('node:assert/strict');
const {ScoreView, mockCanvas, fullModel, lanesOnly, BENCH} = require('./helpers.cjs');

const view = (model, options) => {
  const surface = mockCanvas(800, 400);
  return {surface, view: ScoreView.create(surface.canvas, model, () => 0, {...BENCH, mergeTimbres: true, ...options})};
};
const dims = surface => surface.calls.filter(call => call.name === 'fillRect' && call.args[0] === 0 && call.args[2] === 800 && /,0\.62\)$/.test(String(call.fillStyle)));

test('a point on a lane names the lane and its group; the section bar still answers for itself', () => {
  const {view: score} = view(fullModel());
  const frame = score.draw(10);
  const lanes = score.lanes();
  assert.ok(lanes.length >= 3);
  let top = null;
  const seen = [];
  for (let y = 0; y < 400; y++) {
    const under = score.hit(400, y);
    if (under && under.kind === 'lane' && under.id !== seen[seen.length - 1]) seen.push(under.id);
    if (under && under.kind === 'lane' && top === null) top = y;
  }
  assert.deepEqual(seen, lanes.map(lane => lane.id), '从上到下应当依次点到每一条轨');
  assert.ok(top > 40, '曲名那一带不是轨');
  const first = score.hit(400, top + 2);
  assert.equal(typeof first.group, 'string');
  assert.ok(Object.keys(frame.heights).includes(first.id));
  assert.equal(score.hit(-5, top + 2), null);
  const bar = [...Array(400).keys()].map(y => score.hit(400, y)).find(under => under && under.kind === 'section');
  assert.ok(bar && typeof bar.time === 'number');
});

test('a song without sections still lets its lanes be touched', () => {
  const {view: score} = view(lanesOnly());
  score.draw(10);
  assert.ok([...Array(400).keys()].some(y => (score.hit(400, y) || {}).kind === 'lane'));
});

test('a lane listened to alone: every other lane steps back and it does not', () => {
  const {view: score, surface} = view(fullModel());
  score.draw(10);
  assert.equal(dims(surface).length, 0);
  assert.equal(score.lastFrame().focus, null);
  const boxes = [];
  for (let y = 0; y < 400; y++) {
    const under = score.hit(400, y);
    if (under && under.kind === 'lane') (boxes.find(box => box.id === under.id) || boxes[boxes.push({id: under.id, group: under.group, top: y}) - 1]).bottom = y;
  }
  const target = boxes[1];
  score.setOptions({focusGroup: target.group});
  surface.reset();
  assert.equal(score.draw(10).focus, target.group);
  const veils = dims(surface);
  assert.equal(veils.length, boxes.filter(box => box.group !== target.group).length);
  for (const box of boxes) {
    const covered = veils.some(call => call.args[1] <= box.top + 1 && call.args[1] + call.args[3] >= box.bottom - 1);
    assert.equal(covered, box.group !== target.group, box.id);
  }
  score.setOptions({focusGroup: null});
  surface.reset();
  score.draw(10);
  assert.equal(dims(surface).length, 0);
});

test('a group that is not on screen dims nothing', () => {
  for (const group of ['other', '', 5]) {
    const {view: score, surface} = view(fullModel(), {focusGroup: group});
    assert.equal(score.draw(10).focus, null);
    assert.equal(dims(surface).length, 0);
  }
});

test('the stretch being repeated is framed on the section bar, and a bad range is refused', () => {
  const {view: score, surface} = view(fullModel());
  score.draw(10);
  assert.equal(surface.calls.filter(call => call.name === 'strokeRect').length, 0);
  score.setOptions({loop: [21, 45]});
  surface.reset();
  assert.deepEqual(score.draw(10).loop, [21, 45]);
  const [frame] = surface.calls.filter(call => call.name === 'strokeRect');
  const under = x => score.hit(x, frame.args[1] + frame.args[3] / 2);
  assert.equal(under(frame.args[0] + 3).time, 21, '框的左边应当落在这一段的开头');
  assert.equal(under(frame.args[0] + frame.args[2] - 3).time, 21, '框的右边还在这一段里');
  for (const bad of [[45, 21], [1], 'x', [NaN, 3], null]) {
    score.setOptions({loop: bad});
    surface.reset();
    assert.equal(score.draw(10).loop, null);
    assert.equal(surface.calls.filter(call => call.name === 'strokeRect').length, 0);
  }
  const bare = view(lanesOnly(), {loop: [1, 5]});
  assert.doesNotThrow(() => bare.view.draw(2));
  assert.equal(bare.view.lastFrame().loop, null, '没有段落条的歌没有地方画框');
});
