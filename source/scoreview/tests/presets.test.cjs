'use strict';
// Step 1.5 of the effects (work/score-fx-20261113/PRESETS-SPEC.md): named presets of the
// four effects. 'light' and 'strong' must draw exactly what 0.8.0 drew, 'off' what 0.7.0
// drew (effects.test.cjs holds that one); each other preset must really differ from
// 'clear' in the amounts it is said to change. Each rule has an entry in mutations.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {ScoreView, mockCanvas, fullModel, BENCH, breathOnLanes, cutAtBar, barTopOf} = require('./helpers.cjs');

// The core as it was before the presets (0.8.0, frozen the day they were started).
const BEFORE = require('./fixtures/score-view-0.8.0.js');
const DATA = path.join(__dirname, '..', '..', '..', 'work', 'scoreview-20261110', 'data');
const pilot = name => {
  const file = path.join(DATA, name, 'bundle.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
};

// A canvas that writes down every call with its arguments, every property set, and every
// gradient with its stops, in order.
function recorder(width = 800, height = 400) {
  const log = [];
  let made = 0;
  const id = value => (value && typeof value === 'object' ? value.id || 'object' : value);
  const gradient = kind => (...args) => {
    const name = `${kind}-${made++}`;
    log.push(['create', kind, ...args]);
    return {id: name, addColorStop: (at, colour) => log.push(['stop', name, at, colour])};
  };
  const target = {
    measureText: text => ({width: String(text).length * 6}),
    createLinearGradient: gradient('linear'), createRadialGradient: gradient('radial')
  };
  const context = new Proxy(target, {
    get: (object, key) => (key in object ? object[key]
      : typeof key === 'string' ? (...args) => log.push(['call', key, ...args.map(id)]) : undefined),
    set: (object, key, value) => { log.push(['set', key, id(value)]); return true; }
  });
  const canvas = {width, height, clientWidth: width, clientHeight: height, getContext: () => context};
  return {canvas, log, take: () => log.splice(0, log.length)};
}

// The old core drew a "和弦" tag beside the chord; this one does not (PRESETS-SPEC.md §8).
// Take exactly that tag out of an old frame: the four settings before it and the text itself.
function withoutTag(log) {
  const at = log.findIndex(entry => entry[0] === 'call' && entry[1] === 'fillText' && entry[2] === '和弦');
  if (at < 0) return log;
  const before = log.slice(at - 4, at).map(entry => entry[0] === 'set' && entry[1]);
  assert.deepEqual(before, ['font', 'textAlign', 'textBaseline', 'fillStyle'], '旧核心画「和弦」的那几步变了，这条检查要更新');
  return log.slice(0, at - 4).concat(log.slice(at + 1));
}

const steps = (from, to, count) => Array.from({length: count}, (_, i) => from + (to - from) * i / (count - 1));
const OLD_FX_KEYS = ['level', 'halos', 'afterglow', 'shimmer', 'lit', 'litWidest', 'column', 'pulse', 'breathe', 'snare', 'sparks'];
const oldPart = fx => fx && Object.fromEntries(OLD_FX_KEYS.map(key => [key, fx[key]]));

// `oldOptions` go to 0.8.0, `newOptions` to this core; every frame and every statistic
// 0.8.0 reports must be the same.
function sameAs080(model, oldOptions, newOptions, times, label) {
  const before = recorder(), after = recorder();
  const old = BEFORE.create(before.canvas, model, () => 0, oldOptions);
  // The lane names as text and the section bar as blocks: the look 0.8.0 had (looks.test.cjs holds the others).
  const now = ScoreView.create(after.canvas, model, () => 0, {laneLabels: 'text', sectionStyle: 'block', ...newOptions});
  old.setCover({width: 480, height: 480}); now.setCover({width: 480, height: 480});
  old.draw(0); now.draw(0);
  const barTop = barTopOf(now, 400, 400);
  before.take(); after.take();
  for (const time of times) {
    const a = old.draw(time), b = now.draw(time);
    const drawnBefore = withoutTag(before.take()), drawnAfter = cutAtBar(drawnBefore, after.take(), barTop);
    assert.ok(drawnBefore.length > 10, '旧核心没画东西，这条检查失效了');
    assert.deepEqual(breathOnLanes(drawnBefore, drawnAfter, 800, 400), drawnBefore, `${label}：${time.toFixed(2)} 秒这一帧和 0.8.0 不一样（只许底鼓呼吸从整屏变成轨道区、特效在段落条上沿截住）`);
    assert.deepEqual(oldPart(b.fx), oldPart(a.fx), `${label}：${time.toFixed(2)} 秒的特效统计和 0.8.0 不一样`);
  }
}

test("effects 'light', 'strong' and 'off' draw exactly what 0.8.0 drew, frame for frame; so do the presets they name", () => {
  assert.equal(BEFORE.VERSION, '0.8.0');
  const times = steps(0, 60, 163);
  const pairs = [['light', 'clear'], ['strong', 'strong'], ['off', 'off']];
  for (const [effects, preset] of pairs) {
    for (const extra of [{}, {focusGroup: 'guitar', loop: [21, 45]}]) {
      sameAs080(fullModel(), {...BENCH, ...extra, effects}, {...BENCH, ...extra, effects}, times, `试验台 ${effects}`);
      sameAs080(fullModel(), {...extra, effects}, {...extra, effects}, times, `缺省设置 ${effects}`);
      sameAs080(fullModel(), {...extra, effects}, {...extra, fxPreset: preset}, times, `fxPreset ${preset}`);
    }
    for (const name of ['qilixiang', 'meguri']) {
      const model = pilot(name);
      assert.ok(model, `试点 ${name} 的 bundle.json 不在，这条比对跑不了（work/scoreview-20261110/data/${name}）`);
      sameAs080(model, {effects}, {effects}, steps(0, model.track.duration, 97).map(t => t + 0.013), `${name} ${effects}`);
    }
  }
  // Nothing given at all: the same default as 0.8.0.
  sameAs080(fullModel(), {}, {}, steps(0, 60, 61), '什么都不给');
  // With each switch off one at a time, still the same.
  for (const key of ['fxHit', 'fxAfterglow', 'fxPlayline', 'fxDrums']) {
    sameAs080(fullModel(), {effects: 'light', [key]: false}, {fxPreset: 'clear', [key]: false}, steps(0, 60, 41), `关 ${key}`);
  }
});

test('the six presets, and how they and the level name each other', () => {
  assert.deepEqual(Object.keys(ScoreView.FX_PRESETS), ['clear', 'keys', 'ink', 'stage', 'strong', 'off']);
  assert.equal(ScoreView.DEFAULTS.fxPreset, 'clear');
  assert.equal(ScoreView.FX_PRESETS.off, null);
  // 'clear' is 0.8.0's 'light', value for value, and its new amounts draw nothing.
  assert.deepEqual({...ScoreView.FX_PRESETS.clear}, {halo: 0.5, haloLife: 0.15, haloReach: 1, hitSparks: 0,
    light: 0.55, afterglow: 0.6, shimmer: 0.3, sound: 0, burn: 0, column: 0.07, columnHalf: 24, near: 0.4, pulse: 1,
    breathe: 0.035, snare: 0.3, sparks: 4});
  const surface = mockCanvas(800, 400);
  const view = ScoreView.create(surface.canvas, fullModel(), () => 0);
  assert.equal(view.options().fxPreset, 'clear');
  assert.equal(view.draw(10).fx.preset, 'clear');
  view.setOptions({fxPreset: 'keys'});
  assert.deepEqual([view.options().fxPreset, view.options().effects], ['keys', 'light']);
  assert.equal(view.draw(10).fx.preset, 'keys');
  view.setOptions({fxPreset: 'shiny'});
  assert.equal(view.options().fxPreset, 'keys', '不认识的名字不该被接受');
  view.setOptions({effects: 'strong'});
  assert.deepEqual([view.options().fxPreset, view.options().effects], ['strong', 'strong']);
  view.setOptions({fxPreset: 'off'});
  assert.equal(view.options().effects, 'off');
  assert.equal(view.draw(10).fx, null);
  view.setOptions({effects: 'light'});
  assert.equal(view.options().fxPreset, 'clear');
  view.setOptions({effects: 'off', fxPreset: 'ink'});
  assert.deepEqual([view.options().fxPreset, view.options().effects], ['ink', 'light'], '同时给时以搭配为准');
});

// A small song to aim each effect at (the same as effects.test.cjs). Line at 62% of 800 =
// 496 px; 80 px a second.
const LINE = 496, PPS = 80;
const ROWS = ['kick', 'snare', 'hihat', 'openhat', 'tom', 'crash', 'ride'];
const fxModel = () => ({
  contract: 'xin.score-view/1', track: {id: 'fx', title: '', duration: 60}, audio: {src: '', offset: 0},
  lanes: [
    {id: 'piano', label: '钢琴', kind: 'pitched', group: 'piano',
     notes: [[10, 0.2, 60, 127], [10, 0.2, 64, 40], [12, 2, 67, 100], [14, 0.2, 62, 100], [16, 3, 65, 100], [20, 0.3, 60, 100]]},
    {id: 'drums', label: '鼓', kind: 'drums', group: 'drums', rows: ROWS,
     hits: [[30, 0, 127], [31, 1, 127], [32, 2, 100], [33, 5, 100], [34, 4, 100], [35, 0, 50], [36, 1, 40]]}
  ],
  bars: {beatsPerBar: 4, bpm: 120, beats: [40, 40.5, 41, 41.5, 42], downbeats: [40, 42, 44], steady: true}
});
const make = fxPreset => {
  const surface = mockCanvas(800, 400);
  return {surface, view: ScoreView.create(surface.canvas, fxModel(), () => 0, {...BENCH, fxPreset})};
};
const at = (fxPreset, time) => make(fxPreset).view.draw(time).fx;
const alphaOf = style => Number(/rgba\([^)]*,\s*([\d.]+)\)$/.exec(style)[1]);

test('keys: a narrower, brighter column; fuller halos with sparks at the line; a played note goes dark', () => {
  // The column: 13.9 s puts the next note 8 px from the line, inside both columns.
  const clear = at('clear', 13.9), keys = at('keys', 13.9);
  assert.ok(keys.column.half < clear.column.half && keys.column.half <= 12, '琴键灯的光柱不比清亮窄');
  assert.ok(keys.column.peak > clear.column.peak * 1.5, '琴键灯的光柱不比清亮亮');
  assert.ok(keys.lit === 1 && keys.litWidest <= 12, '琴键灯照亮的不在窄光柱里');
  // Halos: brighter, wider, and sparks fly off the line.
  const halo = fx => fx.halos.find(item => item.pitch === 60);
  assert.ok(halo(at('keys', 10.02)).strength > halo(at('clear', 10.02)).strength * 1.4, '琴键灯的光晕不比清亮亮');
  assert.ok(halo(at('keys', 10.02)).reach > halo(at('clear', 10.02)).reach * 1.4, '琴键灯的光晕不比清亮大');
  assert.equal(at('clear', 10.05).hitSparks, 0);
  assert.ok(at('keys', 10.05).hitSparks >= 6, '琴键灯碰线没有火星');
  assert.equal(at('keys', 10.21).hitSparks, 0, '火星 0.2 秒后还在');
  // Burnt: 0.8 s after the two notes at 10 s ended they sit under a veil of the ground.
  const {view, surface} = make('keys');
  const fx = view.draw(11).fx;
  assert.equal(at('clear', 11).burnt, 0);
  assert.ok(fx.burnt >= 2, '弹过的音没有暗下去');
  const x = LINE + (10 - 11) * PPS;
  const veils = surface.bars().filter(bar => Math.abs(bar.x - x) < 0.01 && /^rgba\(26,29,33,/.test(bar.style));
  assert.equal(veils.length, 2, '弹过的音上没有盖一层底色');
  for (const bar of veils) assert.equal(alphaOf(bar.style), 0.5);
  // It darkens as the afterglow lets go: half way through, half the veil.
  const {view: mid, surface: midSurface} = make('keys');
  mid.draw(10.375);
  const half = midSurface.bars().filter(bar => /^rgba\(26,29,33,/.test(bar.style)).map(bar => alphaOf(bar.style));
  assert.ok(half.length && half.every(alpha => alpha > 0.2 && alpha < 0.3), `一半的时候应当暗一半，现在 ${half}`);
});

test('ink: no halos and no sparks; a sounding note lifted; the longest afterglow; only a faint kick', () => {
  for (const time of [10, 10.05, 10.1]) {
    const fx = at('ink', time);
    assert.equal(fx.halos.length + fx.hitSparks, 0, `${time} 秒墨迹有光晕`);
  }
  assert.equal(at('ink', 32.05).sparks + at('ink', 33.05).sparks, 0, '墨迹有火花');
  assert.equal(at('ink', 31.02).snare, 0, '墨迹的军鼓闪了');
  assert.ok(at('clear', 31.02).snare > 0);
  // Not even an invisible flash: nothing round is laid down (halos and flashes are the only radial fills).
  for (const time of [10.02, 31.02]) {
    const {view, surface} = make('ink');
    view.draw(time);
    assert.ok(!surface.calls.some(call => call.fillStyle && call.fillStyle.circles), `${time} 秒墨迹画了圆形的光`);
  }
  const kick = at('ink', 30).breathe;
  assert.ok(kick > 0 && kick < at('clear', 30).breathe, '墨迹的底鼓应当比清亮更轻，但还在');
  assert.equal(at('ink', 40.02).pulse, 0, '墨迹的强拍跳了');
  assert.equal(at('ink', 13.9).lit, 0, '墨迹不该照亮快到线的音');
  // Sounding: lifted toward white while it sounds, and not after.
  const {view, surface} = make('ink');
  assert.equal(at('clear', 13).sounding, 0);
  assert.equal(view.draw(13).fx.sounding, 1, '墨迹正在响的音没有变亮');
  const lift = surface.bars().filter(bar => /^rgba\(255,255,255,/.test(bar.style));
  assert.ok(lift.some(bar => Math.abs(bar.x - (LINE - PPS)) < 0.01 && alphaOf(bar.style) === 0.28), '变亮的不是正在响的那个音');
  assert.equal(view.draw(14.25).fx.sounding, 0, '音响完了还亮着');
  // Afterglow: still there 1 s after the end (where clear's is long gone), gone by 1.2 s.
  assert.equal(at('clear', 11.2).afterglow, 0);
  assert.equal(at('ink', 11.2).afterglow, 2, '墨迹的余晖不比清亮长');
  assert.equal(at('ink', 11.41).afterglow, 0, '墨迹的余晖超过 1.2 秒');
});

test('stage: the kick, the snare and the downbeat stronger, the melody softer', () => {
  assert.ok(at('stage', 30).breathe > at('clear', 30).breathe * 1.5, '舞台的底鼓不比清亮强');
  assert.ok(at('stage', 31.02).snare > at('clear', 31.02).snare * 1.5, '舞台的军鼓不比清亮强');
  assert.ok(at('stage', 32.05).sparks > at('clear', 32.05).sparks, '舞台的火花不比清亮多');
  const beat = time => fx => fx.column.peak;
  assert.ok(beat()(at('stage', 40.02)) > beat()(at('clear', 40.02)) * 1.5, '舞台的强拍不比清亮跳得高');
  const halo = fx => fx.halos.find(item => item.pitch === 60).strength;
  assert.ok(halo(at('stage', 10.02)) < halo(at('clear', 10.02)) * 0.7, '舞台的旋律光晕没有减弱');
  // Between hits and away from a downbeat the column is about as quiet as clear's.
  assert.ok(Math.abs(at('stage', 13.9).column.peak - at('clear', 13.9).column.peak) < 0.02);
});

test('strong and off, as presets, are the levels of the same name', () => {
  assert.ok(at('strong', 13.9).column.peak > at('clear', 13.9).column.peak);
  assert.equal(at('off', 10), null);
});

test('every preset keeps to the rules: the breath within 6%, the area effects under the notes and words, light that is translucent and of no new hue', () => {
  const presets = Object.keys(ScoreView.FX_PRESETS).filter(key => ScoreView.FX_PRESETS[key]);
  for (const key of presets) {
    const amounts = ScoreView.FX_PRESETS[key];
    assert.ok(amounts.breathe <= 0.06, `${key} 的呼吸超过 6%`);
    assert.ok(amounts.haloLife >= 0.1 && amounts.haloLife <= 0.6, `${key} 的光晕时长出了 0.1–0.6 秒`);
    // The afterglow may run to 1.2 s for ink's fading, and only there (PRESETS-SPEC.md).
    assert.ok(amounts.afterglow >= 0.1 && amounts.afterglow <= (key === 'ink' ? 1.2 : 0.6), `${key} 的余晖时长不对`);
    assert.ok(at(key, 30).breathe <= 0.06);
  }
  const hueOf = rgb => {
    const [r, g, b] = rgb.map(value => value / 255);
    const high = Math.max(r, g, b), low = Math.min(r, g, b), d = high - low;
    if (d < 0.04) return null;
    const hue = high === r ? ((g - b) / d) % 6 : high === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (hue * 60 + 360) % 360;
  };
  for (const key of presets) {
    const off = mockCanvas(800, 400), on = mockCanvas(800, 400);
    const look = {laneLabels: 'text', sectionStyle: 'block'};
    const plain = ScoreView.create(off.canvas, fullModel(), () => 0, {...look, effects: 'off'});
    const lit = ScoreView.create(on.canvas, fullModel(), () => 0, {...look, fxPreset: key});
    plain.draw(0);
    // Where the section bar starts, from what hit() calls the bar (it answers from 6 px above it).
    let barTop = 400;
    for (let y = 300; y < 400; y += 0.01) { const under = plain.hit(400, y); if (under && (under.kind === 'section' || under.kind === 'bar')) { barTop = y + 6; break; } }
    const hues = plain.lanes().map(lane => {
      const m = /^#(..)(..)(..)$/.exec(lane.color);
      return hueOf(m.slice(1).map(v => parseInt(v, 16)));
    });
    for (const time of steps(0, 60, 121)) {
      off.reset(); on.reset();
      plain.draw(time); lit.draw(time);
      assert.deepEqual(on.texts(), off.texts(), `${key} ${time} 秒的文字变了`);
      const calls = on.calls;
      const firstNote = calls.findIndex(call => call.name === 'rect' || call.name === 'roundRect');
      const firstWord = calls.findIndex(call => call.name === 'fillText');
      const column = calls.findIndex(call => call.name === 'fillRect' && call.args[3] > 50 && call.fillStyle && call.fillStyle.stops &&
        call.fillStyle.stops.length === 3 && /^rgba\(255,255,255,0\.\d/.test(call.fillStyle.stops[1][1]));
      assert.ok(column > 0 && column < firstNote && column < firstWord, `${key} ${time} 秒光柱画在音符或文字上面`);
      const plainFills = new Set(off.calls.filter(call => /^fill(Rect)?$/.test(call.name)).map(call => JSON.stringify([call.name, call.args, call.fillStyle])));
      for (const call of calls) {
        if (!/^fill(Rect)?$/.test(call.name) || plainFills.has(JSON.stringify([call.name, call.args, call.fillStyle]))) continue;
        // Nothing an effect fills reaches the top 12 % (the captions) or the section bar (B7, 2026-11-14).
        if (call.name === 'fillRect') {
          assert.ok(call.args[1] >= 400 * 0.12, `${key} ${time} 秒特效画进了顶部 12%：${JSON.stringify(call.args)}`);
          // Half a pixel of slack: a halo's square on the lowest lane may graze the bar's edge, where its gradient is already 0.
          assert.ok(call.args[1] + call.args[3] <= barTop + 0.5, `${key} ${time} 秒特效画进了段落条：${JSON.stringify(call.args)}，段落条从 ${barTop}`);
        }
        const styles = typeof call.fillStyle === 'string' ? [call.fillStyle] : call.fillStyle.stops.map(stop => stop[1]);
        for (const style of styles) {
          const match = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(style);
          assert.ok(match && Number(match[4]) < 1, `${key} ${time} 秒特效画了不透明的 ${style}`);
          const rgb = match.slice(1, 4).map(Number);
          // Light, or (keys' burnt notes) the ground itself laid over a played note.
          const ground = rgb.join() === '26,29,33';
          assert.ok(Math.max(...rgb) >= 150 || (ground && key === 'keys'), `${key} ${time} 秒特效盖了一层 ${style}`);
          const hue = hueOf(rgb);
          assert.ok(ground || hue === null || hues.some(lane => lane !== null && Math.min(Math.abs(lane - hue), 360 - Math.abs(lane - hue)) < 6),
            `${key} ${time} 秒特效用了新的色相 ${style}`);
        }
      }
    }
  }
});

test('the presets differ from each other in what they draw', () => {
  const frames = {};
  for (const key of ['clear', 'keys', 'ink', 'stage', 'strong']) {
    const {view, surface} = make(key);
    frames[key] = [10.02, 11, 13, 13.9, 30, 31.02, 40.02].map(time => { surface.reset(); view.draw(time); return JSON.stringify(surface.calls); }).join('\n');
  }
  const keys = Object.keys(frames);
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) assert.notEqual(frames[keys[i]], frames[keys[j]], `${keys[i]} 和 ${keys[j]} 画的一样`);
  }
});
