'use strict';
// Stage A3: the ruler over the lanes (bars or seconds) and the sung pitch contour.
const test = require('node:test');
const assert = require('node:assert/strict');
const {ScoreView, mockCanvas, fullModel, lanesOnly, BENCH} = require('./helpers.cjs');

const view = (model, options, size = [800, 400]) => {
  const surface = mockCanvas(...size);
  return {surface, view: ScoreView.create(surface.canvas, model, () => 0, {...BENCH, ...options})};
};
const LINE = 496;                       // the play line at 62% of 800
const xOf = (time, now) => Math.round(LINE + (time - now) * 80) + 0.5;
const isTime = text => /^\d+:\d\d$/.test(text);
const isBarNumber = text => /^\d+$/.test(text);
// Vertical lines that run through the lanes (taller than the ruler itself).
const throughLines = surface => surface.strokes().flatMap(path => {
  const lines = [];
  for (let i = 1; i < path.points.length; i++) {
    const a = path.points[i - 1], b = path.points[i];
    if (b.pen && a.x === b.x && a.x !== LINE && Math.abs(b.y - a.y) > 60) lines.push(a.x);   // LINE itself is the play line
  }
  return lines;
});

function withContour(values) {
  const model = fullModel();
  model.lanes[0].contour = {hop: 0.01, start: 0, midi: values};
  return model;
}
// Silence, then a held C4 from 10 s to 11 s, then silence.
const heldNote = (pitch = 60) => Array.from({length: 2000}, (_, i) => (i >= 1000 && i < 1100 ? pitch : null));

/* --- ruler ------------------------------------------------------------------ */

test('on a steady grid every bar gets a line through the lanes and its number', () => {
  const {view: ruled, surface} = view(fullModel());
  const frame = ruled.draw(1);
  assert.equal(frame.bar, 1);
  assert.deepEqual(throughLines(surface).sort((a, b) => a - b), [xOf(0, 1), xOf(2, 1)]);
  const numbers = surface.texts().filter(item => isBarNumber(item.text)).sort((a, b) => a.x - b.x);
  assert.deepEqual(numbers.map(item => item.text), ['1', '2']);
  assert.ok(Math.abs(numbers[1].x - (xOf(2, 1) + 3)) < 1e-6);
  assert.ok(!surface.texts().some(item => isTime(item.text)), '有小节线的时候不应当再画秒');
  assert.equal(ruled.draw(2.5).bar, 2);
  assert.equal(ruled.draw(-0.5).bar, null, '第一个强拍之前不在任何小节里');
});

test('a bar line lands on the play line at the moment of its downbeat', () => {
  const {view: ruled, surface} = view(fullModel());
  ruled.draw(2);
  assert.ok(throughLines(surface).includes(LINE + 0.5));
});

test('an unsteady grid gets seconds instead, and no line through the lanes', () => {
  const model = fullModel();
  model.bars = {beatsPerBar: null, bpm: 150, beats: [0, 0.4, 0.8, 1.2], downbeats: [0, 1.2], steady: false};
  const {view: ruled, surface} = view(model);
  const frame = ruled.draw(10);
  assert.equal(frame.bar, null);
  assert.deepEqual(throughLines(surface), [], '网格不稳定时画了贯穿各轨的线');
  const times = surface.texts().filter(item => isTime(item.text)).map(item => item.text);
  assert.ok(times.includes('0:10') && times.includes('0:05') && !surface.texts().some(item => isBarNumber(item.text)), `${times}`);
  const label = surface.texts().find(item => item.text === '0:10');
  assert.ok(Math.abs(label.x - (xOf(10, 10) + 3)) < 1e-6, '10 秒的刻度应当在播放线上');
});

test('a song with no beat grid at all gets the seconds ruler too', () => {
  const {view: ruled, surface} = view(lanesOnly());
  ruled.draw(65);
  const times = surface.texts().filter(item => isTime(item.text)).map(item => item.text);
  assert.ok(times.includes('1:05') && times.includes('1:00'), `${times}`);
  assert.equal(ruled.layers().bars, false);
});

test('seconds are labelled less often as the screen holds more of them', () => {
  const count = windowSeconds => {
    const {view: ruled, surface} = view(lanesOnly(), {windowSeconds});
    ruled.draw(100);
    const labels = surface.texts().filter(item => isTime(item.text)).sort((a, b) => a.x - b.x);
    for (let i = 1; i < labels.length; i++) assert.ok(labels[i].x - labels[i - 1].x >= 46, `${windowSeconds} 秒一屏时刻度挤在一起`);
    return labels.length;
  };
  assert.ok(count(6) >= 5 && count(16) >= 5 && count(60) >= 3);
});

test('bars packed tighter than their numbers are numbered every second or fourth', () => {
  const model = fullModel();
  model.track.duration = 200;
  model.bars = {beatsPerBar: 4, bpm: 240, beats: [], downbeats: Array.from({length: 190}, (_, i) => i), steady: true};
  model.bars.beats = model.bars.downbeats;
  const {view: ruled, surface} = view(model, {windowSeconds: 60});
  ruled.draw(100);
  const numbers = surface.texts().filter(item => isBarNumber(item.text)).sort((a, b) => a.x - b.x);
  assert.ok(numbers.length > 5);
  for (let i = 1; i < numbers.length; i++) assert.ok(numbers[i].x - numbers[i - 1].x >= 24, '小节号叠在一起');
  assert.ok(throughLines(surface).length > numbers.length, '线每小节都有，只是号码隔着标');
});

test('the ruler is over the lanes and under the chord band', () => {
  const {view: ruled, surface} = view(fullModel());
  ruled.draw(1);
  const number = surface.texts().find(item => isBarNumber(item.text));
  const notes = surface.bars().filter(item => item.height <= 8);
  assert.ok(number.y > 110 && number.y < Math.min(...notes.map(item => item.y)), `小节号 y=${number.y}`);
});

/* --- contour ---------------------------------------------------------------- */

test('the sung pitch is drawn as a line where there is pitch and broken where there is none', () => {
  const {view: sung, surface} = view(withContour(heldNote()));
  const frame = sung.draw(10.5);
  assert.ok(frame.contour > 50, `只画了 ${frame.contour} 个点`);
  const curves = surface.strokes().filter(path => path.points.length > 10 && path.points.some(point => point.pen)
    && new Set(path.points.map(point => point.x)).size > 10);
  assert.equal(curves.length, 2, '已唱的一段、未唱的一段');
  const xs = curves.flatMap(path => path.points.map(point => point.x));
  assert.ok(Math.min(...xs) >= xOf(10, 10.5) - 1.5 && Math.max(...xs) <= xOf(11, 10.5) + 0.5, '曲线画到了没有音高的地方');
  for (const path of curves) assert.equal(new Set(path.points.map(point => point.y)).size, 1, '一个长音应当是一条平线');
  const [past, coming] = curves[0].points[0].x < curves[1].points[0].x ? curves : [curves[1], curves[0]];
  assert.ok(Math.max(...past.points.map(point => point.x)) <= LINE + 1e-6 && Math.min(...coming.points.map(point => point.x)) > LINE);
  const alpha = style => Number(/,([\d.]+)\)$/.exec(style)[1]);
  assert.ok(alpha(past.style) > alpha(coming.style), '唱过的应当比没唱到的亮');
});

test('the line follows the pitch: higher is higher on screen, and a slide is a slope', () => {
  const slide = Array.from({length: 2000}, (_, i) => (i >= 1000 && i < 1100 ? 58 + (i - 1000) * 0.04 : null));
  const {view: sung, surface} = view(withContour(slide));
  sung.draw(12);
  const curve = surface.strokes().find(path => path.points.length > 20);
  const ys = curve.points.map(point => point.y);
  assert.ok(ys.every((y, i) => i === 0 || y <= ys[i - 1]), '音越高应当越靠上');
  assert.ok(ys[0] - ys[ys.length - 1] > 5);
});

test('the line sits on the bar of the note it belongs to', () => {
  const model = withContour(heldNote(59));                    // the vocal note at 10 s is a B3 (59)
  const {view: sung, surface} = view(model);
  sung.draw(12);
  const curve = surface.strokes().find(path => path.points.length > 20);
  const bar = surface.bars().find(item => item.style.startsWith('rgba(215,138,181') && Math.abs(item.x - (LINE + (10 - 12) * 80)) < 1e-6);
  assert.ok(Math.abs(curve.points[0].y - (bar.y + bar.height / 2)) < 1e-6, `曲线 y=${curve.points[0].y}，音符中心 ${bar.y + bar.height / 2}`);
});

test('a stretch an octave out is drawn out of the lane, not folded back into it', () => {
  const y = pitch => {
    const {view: sung, surface} = view(withContour(heldNote(pitch)));
    sung.draw(12);
    return surface.strokes().find(path => path.points.length > 20).points[0].y;
  };
  const inside = y(61), high = y(61 + 12), low = y(61 - 12);
  const noteTop = (() => {
    const {view: sung, surface} = view(withContour(heldNote(61)));
    sung.draw(12);
    return Math.min(...surface.bars().filter(item => item.style.startsWith('rgba(215,138,181')).map(item => item.y));
  })();
  assert.ok(high < noteTop - 3 && high < inside - 10, `高八度的曲线 y=${high}，应当冲出人声轨的上沿`);
  assert.ok(low > inside + 10, '低八度的曲线应当掉到人声轨下面');
  // The lane makes room for 55..67 here. A line beyond that must lie beyond the lane's
  // own top and bottom rows, which is what tells an octave slip from a high note.
  assert.ok(high < y(67) - 3 && low > y(55) + 3, `${[high, y(67), low, y(55)]}`);
});

test('the contour can be switched off, goes with its lane when the lane is hidden, and survives simplifying', () => {
  const {view: sung} = view(withContour(heldNote()));
  assert.ok(sung.draw(10.5).contour > 0);
  sung.setOptions({showContour: false});
  assert.equal(sung.draw(10.5).contour, 0);
  sung.setOptions({showContour: true, hidden: ['vocals']});
  assert.equal(sung.draw(10.5).contour, 0);
  sung.setOptions({hidden: [], simplify: true, mergeTimbres: true});
  assert.ok(sung.draw(10.5).contour > 0);
});

test('a contour with gaps, junk or nothing in it never throws', () => {
  for (const values of [[], [null, null], [60, 'x', NaN, undefined, 61], heldNote().slice(0, 1050)]) {
    const {view: sung} = view(withContour(values));
    assert.doesNotThrow(() => sung.draw(10.4));
  }
  const model = fullModel();
  delete model.lanes[0].contour;
  const {view: none} = view(model);
  assert.equal(none.draw(10.4).contour, 0);
  assert.equal(none.layers().contour, false);
});

test('a wide screen thins the points it draws instead of drawing every frame', () => {
  const always = Array.from({length: 6000}, () => 60);
  const dense = view(withContour(always), {windowSeconds: 6}).view.draw(30).contour;
  const sparse = view(withContour(always), {windowSeconds: 60}).view.draw(30).contour;
  assert.ok(dense > 550 && sparse < 2500, `${dense} / ${sparse}`);
});
