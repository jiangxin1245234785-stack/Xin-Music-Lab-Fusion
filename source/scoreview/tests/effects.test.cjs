'use strict';
// Step one of the effects (work/score-fx-20261113/SPEC.md): S1 hit, S2 afterglow and
// shimmer, S3 the column of light, S4 the drums. Each rule here has a "break it on
// purpose" entry in mutations.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {ScoreView, mockCanvas, fullModel, BENCH, alike} = require('./helpers.cjs');

// The core as it was before the effects (0.7.0, frozen the day they were started). With
// `effects: 'off'` the core must draw exactly what this one draws.
const BEFORE = require('./fixtures/score-view-0.7.0.js');
const DATA = path.join(__dirname, '..', '..', '..', 'work', 'scoreview-20261110', 'data');
const pilot = name => {
  const file = path.join(DATA, name, 'bundle.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
};

// A canvas that writes down everything: every call with its arguments and every property
// set, gradients by name with their stops, in order.
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

const picture = {width: 480, height: 480};

function sameFrames(source, options, times, label) {
  const model = alike(source);
  const before = recorder(), after = recorder();
  const old = BEFORE.create(before.canvas, model, () => 0, options);
  // Names as text, the section bar as blocks: the look 0.7.0 had (looks.test.cjs holds the others).
  const now = ScoreView.create(after.canvas, model, () => 0, {laneLabels: 'text', sectionStyle: 'block', ...options});
  old.setCover(picture); now.setCover(picture);
  before.take(); after.take();
  for (const time of times) {
    old.draw(time); now.draw(time);
    const a = withoutTag(before.take()), b = after.take();
    assert.ok(a.length > 10, '旧核心没画东西，这条检查失效了');
    assert.deepEqual(b, a, `${label}：${time.toFixed(2)} 秒这一帧和改动前不一样`);
  }
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

test("effects 'off' draws exactly what the core drew before the effects, frame for frame", () => {
  assert.equal(BEFORE.VERSION, '0.7.0');
  const times = steps(0, 60, 163);
  for (const extra of [{}, {focusGroup: 'guitar', loop: [21, 45]}]) {
    sameFrames(fullModel(), {...BENCH, ...extra, effects: 'off'}, times, '试验台设置');
    sameFrames(fullModel(), {...extra, effects: 'off'}, times, '缺省设置');
  }
  for (const name of ['qilixiang', 'meguri']) {
    const model = pilot(name);
    assert.ok(model, `试点 ${name} 的 bundle.json 不在，这条比对跑不了（work/scoreview-20261110/data/${name}）`);
    sameFrames(model, {effects: 'off'}, steps(0, model.track.duration, 97).map(t => t + 0.013), name);
  }
});

test('with every effect switched off one by one, the level alone draws nothing new either', () => {
  const none = {fxHit: false, fxAfterglow: false, fxPlayline: false, fxDrums: false};
  for (const effects of ['light', 'strong']) sameFrames(fullModel(), {effects, ...none}, steps(0, 60, 61), effects);
});

// A small song to aim each effect at. Line at 62% of 800 = 496 px; 80 px a second.
const LINE = 496, PPS = 80;
const ROWS = ['kick', 'snare', 'hihat', 'openhat', 'tom', 'crash', 'ride'];
function fxModel(bars, rows = ROWS) {
  // Hits are written against ROWS; with another order of rows they are renumbered, so the
  // same drum is the same hit whatever row it sits in.
  const row = index => rows.indexOf(ROWS[index]);
  return {
    contract: 'xin.score-view/1', track: {id: 'fx', title: '', duration: 60}, audio: {src: '', offset: 0},
    lanes: [
      {id: 'piano', label: '钢琴', kind: 'pitched', group: 'piano',
       notes: [[10, 0.2, 60, 127], [10, 0.2, 64, 40], [12, 2, 67, 100], [14, 0.2, 62, 100], [16, 3, 65, 100], [20, 0.3, 60, 100]]},
      {id: 'drums', label: '鼓', kind: 'drums', group: 'drums', rows,
       hits: [[30, 0, 127], [31, 1, 127], [32, 2, 100], [33, 5, 100], [34, 4, 100], [35, 0, 50], [36, 1, 40]]
         .map(hit => [hit[0], row(hit[1]), hit[2]])}
    ],
    ...(bars === undefined ? {bars: {beatsPerBar: 4, bpm: 120, beats: [40, 40.5, 41, 41.5, 42], downbeats: [40, 42, 44], steady: true}} : bars ? {bars} : {})
  };
}
const ONLY = {
  hit: {fxHit: true, fxAfterglow: false, fxPlayline: false, fxDrums: false},
  afterglow: {fxHit: false, fxAfterglow: true, fxPlayline: false, fxDrums: false},
  playline: {fxHit: false, fxAfterglow: false, fxPlayline: true, fxDrums: false},
  drums: {fxHit: false, fxAfterglow: false, fxPlayline: false, fxDrums: true}
};
const make = (options, model = fxModel()) => {
  const surface = mockCanvas(800, 400);
  return {surface, view: ScoreView.create(surface.canvas, model, () => 0, {...BENCH, effects: 'light', ...options})};
};
const alphaOf = style => Number(/rgba\([^)]*,\s*([\d.]+)\)$/.exec(style)[1]);
// The lanes' area, top to bottom, measured from what hit() calls a lane (not from the core's own sums).
function laneSpan(view, width, height) {
  let top = null, bottom = null;
  for (let y = 0; y < height; y += 0.5) {
    const under = view.hit(width / 2, y);
    if (under && under.kind === 'lane') { if (top === null) top = y; bottom = y + 0.5; }
  }
  return {top, bottom};
}

test('the default level is light, and only the three levels and boolean switches are taken', () => {
  assert.equal(ScoreView.DEFAULTS.effects, 'light');
  for (const key of ['fxHit', 'fxAfterglow', 'fxPlayline', 'fxDrums']) assert.equal(ScoreView.DEFAULTS[key], true, key);
  const surface = mockCanvas(800, 400);
  const plain = ScoreView.create(surface.canvas, fullModel(), () => 0);
  assert.equal(plain.draw(10).fx.level, 'light');
  plain.setOptions({effects: 'medium', fxHit: 'no'});
  assert.equal(plain.options().effects, 'light');
  assert.equal(plain.options().fxHit, true);
  plain.setOptions({effects: 'off'});
  assert.equal(plain.draw(10).fx, null);
  plain.setOptions({effects: 'strong'});
  assert.equal(plain.draw(10).fx.level, 'strong');
});

test('S1: a halo opens on the line at the pitch of a note as its head arrives, and is gone within 0.15 s', () => {
  const {view, surface} = make(ONLY.hit);
  assert.equal(view.draw(9.99).fx.halos.length, 0, '还没到线就亮了');
  surface.reset();
  const halos = view.draw(10).fx.halos;
  assert.equal(halos.length, 2);
  // Each halo sits on the centre of its own note's bar, which is at the line right now.
  const onLine = surface.bars().filter(bar => Math.abs(bar.x - LINE) < 0.01);
  for (const halo of halos) {
    assert.ok(onLine.some(bar => Math.abs(bar.y + bar.height / 2 - halo.y) < 0.01), `音高 ${halo.pitch} 的光晕不在它的音符上`);
  }
  const high = halos.find(halo => halo.pitch === 64), low = halos.find(halo => halo.pitch === 60);
  assert.ok(high.y < low.y, '高音的光晕应当更靠上');
  assert.equal(view.draw(10.149).fx.halos.length, 2);
  assert.equal(view.draw(10.151).fx.halos.length, 0, '0.15 秒后光晕还在');
});

test('S1: a louder note shines brighter, and a halo only fades', () => {
  const {view} = make(ONLY.hit);
  const halos = view.draw(10).fx.halos;
  const loud = halos.find(halo => halo.pitch === 60), soft = halos.find(halo => halo.pitch === 64);
  assert.ok(loud.strength > soft.strength * 1.5, '力度 127 和 40 亮度差不多');
  let previous = Infinity;
  for (const time of [10, 10.03, 10.07, 10.11, 10.14]) {
    const strength = view.draw(time).fx.halos.find(halo => halo.pitch === 60).strength;
    assert.ok(strength < previous, `${time} 秒的光晕没有变暗`);
    previous = strength;
  }
});

test('S2: a played note keeps a glow that dims over about 0.6 s', () => {
  const {view, surface} = make(ONLY.afterglow);
  assert.equal(view.draw(10.15).fx.afterglow, 0, '还在响的音符不该算余晖');
  const glowAt = time => {
    surface.reset();
    const frame = view.draw(time);
    const x = LINE + (10 - time) * PPS;
    const over = surface.bars().filter(bar => Math.abs(bar.x - x) < 0.01);
    return {count: frame.fx.afterglow, alpha: Math.max(...over.map(bar => alphaOf(bar.style)).filter(a => a < 0.9))};
  };
  const early = glowAt(10.3), late = glowAt(10.7);
  assert.equal(early.count, 2);
  assert.ok(early.alpha > late.alpha, '余晖没有变暗');
  assert.equal(view.draw(10.79).fx.afterglow, 2);
  assert.equal(view.draw(10.81).fx.afterglow, 0, '0.6 秒后余晖还在');
});

test('S2: light runs along a held note once every 1.2 s, and a short note has none', () => {
  const {view, surface} = make(ONLY.afterglow);
  assert.equal(view.draw(14.1).fx.shimmer, 0, '0.2 秒的短音不该有流光');
  for (const time of [12.3, 12.9, 13.5]) {
    surface.reset();
    assert.equal(view.draw(time).fx.shimmer, 1);
    const band = surface.fills().find(fill => fill.style && fill.style.stops && fill.style.stops.some(stop => stop[1] === 'rgba(255,255,255,0.3)'));
    assert.ok(band, '没找到流光');
    const centre = (band.style.line[0] + band.style.line[2]) / 2;
    const noteX = LINE + (12 - time) * PPS, width = 2 * PPS - 1.5;
    const expected = ((time - 12) / 1.2) % 1;
    assert.ok(Math.abs((centre - noteX) / width - expected) < 0.01, `${time} 秒流光在 ${((centre - noteX) / width).toFixed(3)}，应在 ${expected.toFixed(3)}`);
    assert.ok(band.x >= noteX - 0.01 && band.x + band.width <= noteX + width + 0.01, '流光跑出了音符');
  }
});

test('S3: a soft column of light around the line lights only the stretch of a note inside it', () => {
  const {view, surface} = make(ONLY.playline);
  const frame = view.draw(13.8);
  assert.deepEqual(frame.fx.column, {half: 24, peak: 0.07});
  const column = surface.fills().find(fill => fill.style && fill.style.line && fill.height > 50);
  assert.ok(column && Math.abs(column.x - (LINE - 24)) < 0.01 && Math.abs(column.width - 48) < 0.01, '光柱不是线两侧各 24 像素');
  assert.equal(frame.fx.lit, 1, '只有离线 24 像素以内的那个音该被照亮');
  // The light on a note: a gradient across the column, brightest at the line, nothing at its edges.
  const lights = () => surface.fills().filter(fill => fill.style && fill.style.line && fill.height < 50);
  const [light] = lights();
  assert.deepEqual(light.style.line, [LINE - 24, 0, LINE + 24, 0]);
  assert.deepEqual(light.style.stops.map(stop => [stop[0], alphaOf(stop[1])]), [[0, 0], [0.5, 0.4], [1, 0]]);
  assert.ok(Math.abs(light.x - (LINE + 0.2 * PPS)) < 0.01 && Math.abs(light.x + light.width - (LINE + 24)) < 0.01, '照亮的应当是音头到光柱右缘那一段');
  // A long note reaching the line is lit at its head only, never along its whole length.
  for (const time of [15.75, 15.8, 15.9, 15.99]) {
    surface.reset();
    const fx = view.draw(time).fx;
    assert.equal(fx.lit, 1);
    assert.ok(fx.litWidest <= 24, `${time} 秒长音被照亮了 ${fx.litWidest} 像素`);
    for (const fill of lights()) assert.ok(fill.x >= LINE - 24 - 0.01 && fill.x + fill.width <= LINE + 24 + 0.01, '照亮伸出了光柱');
  }
  assert.equal(view.draw(13.6).fx.lit, 0, '离线 32 像素的音不该亮');
});

test('S3: on a steady bar grid the column jumps a little on each downbeat, and without one it never does', () => {
  const {view} = make(ONLY.playline);
  const on = view.draw(40).fx;
  assert.equal(on.pulse, 1);
  assert.ok(on.column.half > 24 && on.column.peak > 0.07, '强拍上光柱没跳');
  const mid = view.draw(40.09).fx.pulse;
  assert.ok(mid > 0 && mid < 1);
  assert.equal(view.draw(40.2).fx.pulse, 0, '0.18 秒后还在跳');
  assert.equal(view.draw(41).fx.pulse, 0, '弱拍不该跳');
  for (const bars of [{beatsPerBar: 4, bpm: 120, beats: [40, 40.5], downbeats: [40, 42, 44], steady: false}, null]) {
    const {view: loose} = make(ONLY.playline, fxModel(bars));
    for (const time of [40, 40.05, 42, 13]) {
      const fx = loose.draw(time).fx;
      assert.equal(fx.pulse, 0, `没有稳定小节线（${bars ? '不稳定' : '没有网格'}）却跳了`);
      assert.equal(fx.column.half, 24);
    }
  }
});

test('S4: the kick lifts the background a little and it falls back within 0.12 s', () => {
  const {view} = make(ONLY.drums);
  assert.equal(view.draw(29.99).fx.breathe, 0);
  assert.equal(view.draw(30).fx.breathe, 0.035);
  const half = view.draw(30.06).fx.breathe;
  assert.ok(half > 0.015 && half < 0.02);
  assert.equal(view.draw(30.121).fx.breathe, 0, '0.12 秒后还没落回');
  assert.ok(view.draw(35).fx.breathe < 0.035 / 2, '轻的底鼓应当呼吸得更浅');
  for (const time of [31, 32, 33, 34]) assert.equal(view.draw(time).fx.breathe, 0, `${time} 秒不是底鼓却呼吸了`);
});

test('S4: the breathing never lifts the background by more than 6%, at any level', () => {
  for (const effects of ['light', 'strong']) {
    const {view, surface} = make({...ONLY.drums, effects});
    surface.reset();
    const lift = view.draw(30).fx.breathe;
    assert.ok(lift > 0 && lift <= 0.06, `${effects} 档呼吸 ${lift}`);
    // Since 0.11.0 the lift covers the lanes' area only: the captions at the top and the section bar stay as they are.
    const span = laneSpan(view, 800, 400);
    const breath = surface.fills().find(fill => fill.width === 800 && /^rgba\(255,255,255,/.test(fill.style));
    assert.ok(breath && alphaOf(breath.style) <= 0.06, '没有找到底鼓的呼吸');
    assert.ok(Math.abs(breath.y - span.top) <= 1 && Math.abs(breath.y + breath.height - span.bottom) <= 1,
      `呼吸应当只在轨道区（${span.top}–${span.bottom}），实际 ${breath.y}–${breath.y + breath.height}`);
  }
});

test('S4: a snare flashes briefly, hats and cymbals throw sparks, and the drum dots stay', () => {
  const {view} = make(ONLY.drums);
  const {view: off} = make({effects: 'off'});
  const snare = view.draw(31).fx;
  assert.ok(snare.snare > 0 && snare.sparks === 0);
  assert.equal(view.draw(31.1).fx.snare, 0, '军鼓的闪光太长');
  for (const time of [30, 34, 35]) {
    const fx = view.draw(time).fx;
    assert.equal(fx.snare + fx.sparks, 0, `${time} 秒不是军鼓也不是镲，却闪了`);
  }
  assert.equal(view.draw(32.1).fx.sparks, 4, '踩镲应当有细碎火花');
  assert.equal(view.draw(32.31).fx.sparks, 0, '踩镲的火花太长');
  assert.equal(view.draw(33.4).fx.sparks, 7, '吊镲的火花多一些、长一些');
  assert.equal(view.draw(33.46).fx.sparks, 0);
  for (const time of [30, 31, 32.1, 33.2]) assert.equal(view.draw(time).hits, off.draw(time).hits, '鼓的小点变了');
});

test('S4: a drum is known by the name of its row, whatever order the rows come in', () => {
  for (const rows of [ROWS.slice().reverse(), ['ride', 'snare', 'crash', 'kick', 'tom', 'hihat', 'openhat']]) {
    const {view} = make(ONLY.drums, fxModel(undefined, rows));
    assert.equal(view.draw(30).fx.breathe, 0.035, `rows 是 ${rows.join(',')} 时底鼓没呼吸`);
    const snare = view.draw(31).fx;
    assert.ok(snare.snare > 0 && snare.breathe === 0 && snare.sparks === 0, '军鼓认错了');
    assert.equal(view.draw(32.1).fx.sparks, 4, '踩镲认错了');
    const tom = view.draw(34).fx;
    assert.equal(tom.breathe + tom.snare + tom.sparks, 0, '嗵鼓不该有特效');
  }
});

test('S4: a softer snare flashes less; one that is not an accent does not flash (0.22.0)', () => {
  const {view} = make(ONLY.drums);
  const loud = view.draw(31).fx.snare, soft = view.draw(36).fx.snare;
  assert.ok(loud > 0 && soft === 0, `力度 40 的军鼓（不是重音）闪 ${soft}，力度 127 的闪 ${loud}`);
  // Two accents (each loud for this song and louder than the snares around it), 10 s apart: the softer flashes less.
  const model = fxModel();
  const snare = ROWS.indexOf('snare');
  model.lanes[1].hits = [[20, snare, 127], [20.5, snare, 40], [30, snare, 100], [30.5, snare, 40]];
  const {view: two} = make(ONLY.drums, model);
  const strong = two.draw(20).fx.snare, weaker = two.draw(30).fx.snare;
  assert.ok(weaker > 0 && Math.abs(weaker / strong - 100 / 127) < 0.01, `力度 100 的重音闪 ${weaker}，力度 127 的闪 ${strong}`);
  assert.equal(two.draw(20.5).fx.snare, 0);
});

test('the effects that cover an area are drawn under the notes and the words, never over them', () => {
  for (const effects of ['light', 'strong']) {
    const surface = mockCanvas(800, 400);
    const view = ScoreView.create(surface.canvas, fullModel(), () => 0, {effects});
    for (const time of [9, 9.03, 9.5, 10, 10.05, 10.5, 30, 50]) {
      surface.reset();
      const fx = view.draw(time).fx;
      const calls = surface.calls;
      const firstNote = calls.findIndex(call => call.name === 'rect' || call.name === 'roundRect');
      const firstWord = calls.findIndex(call => call.name === 'fillText');
      assert.ok(firstNote > 0 && firstWord > 0, '这一帧没有音符或文字，检查失效了');
      // The column: a tall fill whose gradient is white at its middle (the backdrop's wash and
      // the fades at the edges are gradients too, in other colours).
      const column = calls.findIndex(call => call.name === 'fillRect' && call.args[3] > 50 && call.fillStyle && call.fillStyle.stops &&
        call.fillStyle.stops.length === 3 && /^rgba\(255,255,255,0\.\d/.test(call.fillStyle.stops[1][1]));
      assert.ok(column > 0 && column < firstNote && column < firstWord, `${time} 秒光柱画在音符或文字上面`);
      const breath = calls.findIndex(call => call.name === 'fillRect' && call.args[0] === 0 && call.args[2] === 800 &&
        typeof call.fillStyle === 'string' && /^rgba\(255,255,255,/.test(call.fillStyle));
      if (fx.breathe > 0) assert.ok(breath > 0 && breath < firstNote && breath < firstWord, `${time} 秒底鼓的呼吸盖在音符或文字上面`);
      else assert.equal(breath, -1);
    }
  }
});

test('each switch turns off its own effect and nothing else', () => {
  const at = (options, time) => make(options).view.draw(time).fx;
  const all = {fxHit: true, fxAfterglow: true, fxPlayline: true, fxDrums: true};
  const signs = {
    fxHit: fx => fx.halos.length, fxAfterglow: fx => fx.afterglow + fx.shimmer,
    fxPlayline: fx => (fx.column ? 1 : 0) + fx.lit, fxDrums: fx => fx.breathe + fx.snare + fx.sparks
  };
  const moments = {fxHit: 10, fxAfterglow: 10.3, fxPlayline: 13.8, fxDrums: 30};
  for (const key of Object.keys(signs)) {
    assert.ok(signs[key](at(all, moments[key])) > 0, `${key} 开着却没效果`);
    assert.equal(signs[key](at({...all, [key]: false}, moments[key])), 0, `${key} 关了效果还在`);
    for (const other of Object.keys(signs)) {
      if (other !== key) assert.ok(signs[other](at({...all, [key]: false}, moments[other])) > 0, `关 ${key} 把 ${other} 也关了`);
    }
  }
});

test('strong is stronger than light, by the same rules', () => {
  const light = make({effects: 'light'}).view, strong = make({effects: 'strong'}).view;
  assert.ok(strong.draw(10).fx.halos[0].strength > light.draw(10).fx.halos[0].strength);
  assert.ok(strong.draw(13.8).fx.column.peak > light.draw(13.8).fx.column.peak);
  assert.ok(strong.draw(30).fx.breathe > light.draw(30).fx.breathe);
  assert.ok(strong.draw(32.1).fx.sparks > light.draw(32.1).fx.sparks);
});

// --- what the effects may not do ---------------------------------------------

function hueOf(rgb) {
  const [r, g, b] = rgb.map(value => value / 255);
  const high = Math.max(r, g, b), low = Math.min(r, g, b), d = high - low;
  if (d < 0.04) return null;      // white or grey: brightness, no hue
  const hue = high === r ? ((g - b) / d) % 6 : high === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (hue * 60 + 360) % 360;
}
const colourOf = text => {
  let match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(text);
  if (match) return match.slice(1, 4).map(Number);
  match = /^#([0-9a-f]{6})$/i.exec(text);
  return match ? [0, 2, 4].map(i => parseInt(match[1].slice(i, i + 2), 16)) : null;
};
const coloursIn = calls => {
  const found = new Set();
  for (const call of calls) {
    for (const style of [call.fillStyle, call.strokeStyle]) {
      if (typeof style === 'string') found.add(style);
      else if (style && style.stops) for (const stop of style.stops) found.add(stop[1]);
    }
  }
  return found;
};

test('the effects only add light: every word and every note of the frame is still drawn, and no new hue appears', () => {
  for (const effects of ['light', 'strong']) {
    const off = mockCanvas(800, 400), on = mockCanvas(800, 400);
    const plain = ScoreView.create(off.canvas, fullModel(), () => 0, {effects: 'off'});
    const lit = ScoreView.create(on.canvas, fullModel(), () => 0, {effects});
    const hues = plain.lanes().map(lane => hueOf(colourOf(lane.color)));
    for (const time of steps(0, 60, 241)) {
      off.reset(); on.reset();
      plain.draw(time); lit.draw(time);
      assert.deepEqual(on.texts(), off.texts(), `${time} 秒的文字变了`);
      // Every bar the plain frame draws is drawn, in order, in the frame with effects.
      const extra = on.bars();
      let k = 0;
      for (const bar of off.bars()) {
        while (k < extra.length && JSON.stringify(extra[k]) !== JSON.stringify(bar)) k++;
        assert.ok(k < extra.length, `${time} 秒少了一个音符或色块`);
        k++;
      }
      // What the effects fill is light laid over the frame: translucent, and bright (white,
      // or a lane colour lifted toward white), never a darker or solid layer over the notes.
      const plainFills = new Set(off.calls.filter(call => /^fill(Rect)?$/.test(call.name)).map(call => JSON.stringify([call.name, call.args, call.fillStyle])));
      for (const call of on.calls) {
        if (!/^fill(Rect)?$/.test(call.name) || plainFills.has(JSON.stringify([call.name, call.args, call.fillStyle]))) continue;
        const styles = typeof call.fillStyle === 'string' ? [call.fillStyle] : call.fillStyle.stops.map(stop => stop[1]);
        for (const style of styles) {
          const match = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(style);
          assert.ok(match, `${time} 秒特效画了不透明的 ${style}`);
          assert.ok(Number(match[4]) < 1 && Math.max(...match.slice(1, 4).map(Number)) >= 150, `${time} 秒特效盖了一层 ${style}`);
        }
      }
      const before = coloursIn(off.calls);
      for (const colour of coloursIn(on.calls)) {
        if (before.has(colour)) continue;
        const rgb = colourOf(colour);
        if (!rgb) continue;
        const hue = hueOf(rgb);
        assert.ok(hue === null || hues.some(lane => lane !== null && Math.min(Math.abs(lane - hue), 360 - Math.abs(lane - hue)) < 6),
          `${time} 秒特效用了新的色相 ${colour}`);
      }
    }
  }
});

test('the effects follow the song time: the same moment draws the same frame, however it was reached', () => {
  const surface = mockCanvas(800, 400);
  const view = ScoreView.create(surface.canvas, fullModel(), () => 0, {effects: 'strong'});
  // Each call with the state it uses: a frame begins with whatever the frame before left
  // set, and only what a call reads is part of the picture.
  const uses = call => ({name: call.name, args: call.args, alpha: call.alpha, composite: call.composite,
    fill: /^fill/.test(call.name) ? call.fillStyle : null, stroke: /^stroke/.test(call.name) ? call.strokeStyle : null,
    font: call.name === 'fillText' ? call.font : null});
  const frame = time => { surface.reset(); view.draw(time); return JSON.stringify(surface.calls.map(uses)); };
  for (const time of [9, 9.5, 10, 10.05, 10.5]) {
    const first = frame(time);
    frame(time + 3.7); frame(0);
    assert.equal(frame(time), first, `${time} 秒两次画的不一样`);
  }
});
