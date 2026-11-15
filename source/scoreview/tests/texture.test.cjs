'use strict';
// The stems without notes as a low band (work/score-dynamics-20261114/SPEC-REST.md).
// `showTexture: false` (the core's default) must draw exactly what 0.12.0 drew; with it on, a
// texture lane of the model becomes a band at the foot of the lanes that follows its loudness.
// The adapter makes that lane from the levels layer. Each rule has an entry in mutations.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {ScoreView, mockCanvas, fullModel, barTopOf} = require('./helpers.cjs');
const adapter = require(process.env.SCOREVIEW_ADAPTER || path.join(__dirname, '..', 'adapter', 'track-model.cjs'));
const {cues} = require(process.env.SCOREVIEW_CUES || path.join(__dirname, '..', 'adapter', 'cues.cjs'));

const BEFORE = require('./fixtures/score-view-0.12.0.js');
const DATA = path.join(__dirname, '..', '..', '..', 'work', 'scoreview-20261110', 'data');
const LEVELS = path.join(__dirname, '..', '..', '..', 'work', 'score-dynamics-20261114', 'texture-levels.json');
const steps = (from, to, count) => Array.from({length: count}, (_, i) => from + (to - from) * i / (count - 1));
const pilot = name => {
  const file = path.join(DATA, name, 'bundle.json');
  assert.ok(fs.existsSync(file), `试点 ${name} 的 bundle.json 不在`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
};
// A pilot with the xml-fixture's levels layer (it has 'other') and the adapter's texture lane.
const withTexture = name => {
  assert.ok(fs.existsSync(LEVELS), 'texture-levels.json 不在，这条比对跑不了');
  const model = pilot(name);
  model.levels = JSON.parse(fs.readFileSync(LEVELS, 'utf8'))[name];
  adapter.textureInto(model, 'zh', {});
  return model;
};
// The small model with a texture lane whose loudness is given per second.
const small = db => {
  const model = fullModel();
  model.lanes.push({id: 'texture', label: '其它', kind: 'texture', group: 'other', groupLabel: '其它', level: {hop: 1, db}});
  return model;
};
function frames(core, model, options, times) {
  const surface = mockCanvas(800, 400);
  const view = core.create(surface.canvas, model, () => 0, options);
  view.setCover({width: 480, height: 480});
  view.draw(0);
  return {view, list: times.map(time => { surface.reset(); const stats = view.draw(time); return {calls: JSON.stringify(surface.calls), stats, surface: surface.calls.slice()}; })};
}

test("the default is off; showTexture takes booleans, textureAt 'below' or 'above'", () => {
  assert.equal(ScoreView.DEFAULTS.showTexture, false);
  assert.equal(ScoreView.DEFAULTS.textureAt, 'below');
  const view = ScoreView.create(mockCanvas().canvas, small(Array(60).fill(-20)), () => 0);
  assert.equal(view.draw(10).texture, undefined, '缺省时不该画带子');
  view.setOptions({showTexture: 'yes', textureAt: 'middle'});
  assert.deepEqual([view.options().showTexture, view.options().textureAt], [false, 'below'], '不认识的值不该被接受');
  view.setOptions({showTexture: true, textureAt: 'above'});
  assert.deepEqual([view.options().showTexture, view.options().textureAt], [true, 'above']);
  assert.ok(view.draw(10).texture, '打开后应当画带子');
  assert.equal(view.layers().texture, true);
});

test('off, and nothing given, draw exactly what 0.12.0 drew, a texture lane in the model or not', () => {
  assert.equal(BEFORE.VERSION, '0.12.0');
  let compared = 0;
  for (const model of [fullModel(), small(Array(60).fill(-20)), withTexture('qilixiang'), withTexture('meguri')]) {
    const times = steps(0, model.track.duration, 41).map(t => t + 0.013).concat([9.02, 10, 10.02, 30.01]);
    // The swell is left out here: SPEC-FIX §7 widened it on purpose after 0.12.0 (dynamics.test.cjs holds it).
    for (const look of [{}, {fxPreset: 'strong'}, {laneLabels: 'text', sectionStyle: 'block', focusGroup: 'guitar'}]) {
      const old = frames(BEFORE, model, look, times).list;
      for (const given of [look, {...look, showTexture: false}]) {
        frames(ScoreView, model, given, times).list.forEach((frame, i) => {
          assert.equal(frame.calls, old[i].calls, `${JSON.stringify(given)} ${times[i]} 秒：和 0.12.0 画的不一样`);
          assert.deepEqual(frame.stats, old[i].stats);
          compared++;
        });
      }
    }
  }
  assert.ok(compared > 900, String(compared));
});

test('the band sits at the foot, half the least lane height, out of the loudness heights; above the drums when asked', () => {
  const model = small(Array(60).fill(-20));
  const off = frames(ScoreView, model, {laneHeights: 'loudness'}, [10, 30]).list;
  const below = frames(ScoreView, model, {laneHeights: 'loudness', showTexture: true}, [10, 30]).list;
  const band = below[0].stats.texture;
  assert.equal(band.at, 'below');
  const least = 13 * 1.7 + 3 * 2;
  assert.equal(band.bottom - band.top, Math.round(least / 2), `带子高 ${band.bottom - band.top}`);
  // It is under every lane and its height does not follow the loudness: the same at 10 s and 30 s.
  const view = frames(ScoreView, model, {showTexture: true}, [10]).view;
  assert.deepEqual(below[1].stats.texture.top, band.top);
  assert.deepEqual(below[1].stats.texture.bottom, band.bottom);
  // The lanes give up exactly the band and its gap, in proportion: the total of their heights is that much less.
  const total = list => Object.values(list).reduce((sum, value) => sum + value, 0);
  assert.ok(Math.abs(total(off[0].stats.heights) - total(below[0].stats.heights) - (band.bottom - band.top + ScoreView.TEXTURE.gap)) < 0.05,
    `${total(off[0].stats.heights)} → ${total(below[0].stats.heights)}`);
  // Under the bar? never: the band ends above the section bar.
  assert.ok(band.bottom <= barTopOf(view, 400, 400) - 6, '带子伸到段落条上了');
  // Above the drums: the drums come after it.
  const above = frames(ScoreView, model, {showTexture: true, textureAt: 'above'}, [10]);
  const drums = above.view.hit(400, above.list[0].stats.texture.bottom + ScoreView.TEXTURE.gap + 2);
  assert.equal(drums && drums.id, 'drums', '「鼓上」时带子下面应当是鼓');
  const t = above.list[0].stats.texture;
  assert.equal(above.view.hit(400, (t.top + t.bottom) / 2).group, 'other');
  // The drums moved down out of its way: just above the band is not the drums.
  const overhead = above.view.hit(400, t.top - ScoreView.TEXTURE.gap / 2 - 1);
  assert.ok(!overhead || overhead.id !== 'drums', '「鼓上」时鼓没有挪到带子下面');
  const drumIcon = above.list[0].stats.labels.find(label => label.lane === 'drums');
  assert.ok(drumIcon && drumIcon.y > t.bottom, `鼓的图标应当在带子下面：${JSON.stringify(drumIcon)}，带子到 ${t.bottom}`);
});

test('under the floor nothing is drawn, not even a line; louder is thicker and lighter', () => {
  const db = Array.from({length: 60}, (_, s) => (s < 20 ? -80 : s < 40 ? -40 : -14));
  const {list} = frames(ScoreView, small(db), {showTexture: true, windowSeconds: 4}, [10, 30, 50]);
  const [quiet, middle, loud] = list;
  // 10 s: the whole screen (8–12 s) is under the floor.
  assert.equal(quiet.stats.texture.now, 0);
  assert.equal(quiet.stats.texture.drawn, 0, '门槛以下也画了');
  assert.ok(!quiet.surface.some(call => call.name === 'fill' && call.fillStyle && call.fillStyle.stops && call.fillStyle.stops.some(stop => /154,161,169/.test(stop[1]))), '门槛以下也有带子的填充');
  assert.ok(middle.stats.texture.now >= ScoreView.TEXTURE.thinnest - 1e-6 && middle.stats.texture.now < loud.stats.texture.now, `${middle.stats.texture.now} ${loud.stats.texture.now}`);
  assert.ok(loud.stats.texture.drawn > 0);
  // Thicker: the outline's highest point above the middle.
  const reach = frame => {
    const middleY = (frame.stats.texture.top + frame.stats.texture.bottom) / 2;
    const ys = frame.surface.filter(call => (call.name === 'moveTo' || call.name === 'lineTo') && call.args[1] >= frame.stats.texture.top - 1 && call.args[1] <= frame.stats.texture.bottom + 1).map(call => Math.abs(call.args[1] - middleY));
    return Math.max(0, ...ys);
  };
  assert.ok(reach(loud) > reach(middle) * 1.3, `${reach(middle)} ${reach(loud)}`);
  assert.ok(reach(loud) <= (loud.stats.texture.bottom - loud.stats.texture.top) / 2 + 1e-9, '带子超出了自己的高度');
  // Lighter: the stops at the line.
  const lightAt = frame => {
    const fill = frame.surface.find(call => call.name === 'fill' && call.fillStyle && call.fillStyle.stops);
    return Math.max(...fill.fillStyle.stops.map(stop => Number(/,([\d.]+)\)$/.exec(stop[1])[1])));
  };
  assert.ok(lightAt(loud) > lightAt(middle));
  assert.ok(lightAt(loud) <= 0.3 + 1e-9, `带子最亮 ${lightAt(loud)}，不许超过 0.3（音符是实色）`);
  // Ahead of the line it is dimmer, as notes not yet played are: the same loudness, less light.
  const fill = loud.surface.find(call => call.name === 'fill' && call.fillStyle && call.fillStyle.stops);
  const line = fill.fillStyle.stops.filter(stop => Math.abs(stop[0] - Math.round(800 * 0.35) / 800) < 1e-9).map(stop => Number(/,([\d.]+)\)$/.exec(stop[1])[1]));
  assert.equal(line.length, 2, '播放线处应当有一亮一暗两个色标');
  assert.ok(line[1] < line[0] * 0.7, `线右边应当更暗：${line}`);
});

test('thickness by the stem\'s own range while it sounds: the same shape anywhere in dB; a narrow one swings less; never a bar of one width', () => {
  const shape = s => (s < 10 ? -90 : -24 + 8 * Math.sin(s / 3));
  const base = ScoreView.create(mockCanvas().canvas, small(Array.from({length: 60}, (_, s) => shape(s))), () => 0, {showTexture: true}).texture();
  const louder = ScoreView.create(mockCanvas().canvas, small(Array.from({length: 60}, (_, s) => shape(s) + 10)), () => 0, {showTexture: true}).texture();
  base.amount.forEach((value, k) => assert.ok(Math.abs(value - louder.amount[k]) < 1e-6, `整条响 10 dB 后第 ${k} 秒的厚度变了`));
  assert.ok(base.amount.slice(0, 10).every(value => value === 0), '门槛以下应当是 0');
  const sounding = base.amount.slice(10);
  assert.ok(Math.min(...sounding) >= ScoreView.TEXTURE.thinnest - 1e-6 && Math.max(...sounding) <= 1 + 1e-6);
  assert.ok(Math.max(...sounding) - Math.min(...sounding) > 0.7, '范围够的分轨应当从细走到粗');
  // A stem that hardly moves (2 dB): toward the middle, not from thinnest to thickest.
  const narrow = ScoreView.create(mockCanvas().canvas, small(Array.from({length: 60}, (_, s) => -20 + (s % 2 ? 1 : -1))), () => 0, {showTexture: true}).texture();
  assert.equal(narrow.squeeze, Math.round(narrow.range / 6 * 1000) / 1000);
  const span = Math.max(...narrow.amount) - Math.min(...narrow.amount);
  assert.ok(span < 0.4 && span > 0.1, `动态小的分轨厚度摆幅应当收窄：${span}`);
  // On both pilots: at the thickest (90 % and up) no more than a fifth of the time it sounds.
  for (const name of ['meguri', 'qilixiang']) {
    const curve = ScoreView.create(mockCanvas().canvas, withTexture(name), () => 0, {showTexture: true}).texture();
    const on = curve.amount.filter(value => value > 0);
    const thick = on.filter(value => value >= 0.9).length / on.length;
    assert.ok(thick <= 0.2, `${name} 最粗的时间占响着时的 ${(thick * 100).toFixed(1)}%`);
  }
});

test('in the neutral colour, no brighter than a note, untouched by the effects, with the swell only', () => {
  const model = small(Array(60).fill(-12));
  const plain = frames(ScoreView, model, {showTexture: true, fxPreset: 'off'}, [10.02, 30]).list;
  const lit = frames(ScoreView, model, {showTexture: true, fxPreset: 'strong'}, [10.02, 30]).list;
  const fillsOf = frame => frame.surface.filter(call => call.name === 'fill' && call.fillStyle && call.fillStyle.stops && call.fillStyle.stops.every(stop => /^rgba\(154,161,169,/.test(stop[1])));
  for (const [a, b] of plain.map((frame, i) => [frame, lit[i]])) {
    assert.deepEqual(JSON.stringify(fillsOf(b)), JSON.stringify(fillsOf(a)), '特效改动了带子');
    assert.ok(fillsOf(a).length === 2, '带子应当是一条淡的轮廓加一条亮的芯');
  }
  // The neutral colour is the 'other' group's own.
  assert.ok(fillsOf(plain[0]).length);
  // Under the drums ('below') the kick's breath stops above it: no effect reaches the band.
  const kick = frames(ScoreView, model, {showTexture: true, fxPreset: 'strong'}, [10.02]).list[0];
  const breath = kick.surface.filter(call => call.name === 'fillRect' && /^rgba\(255,255,255,/.test(call.fillStyle) && call.args[0] === 0 && call.args[2] === 800);
  assert.ok(breath.length === 1 && kick.stats.fx.breathe > 0, '这一帧应当有底鼓呼吸');
  assert.ok(breath[0].args[1] + breath[0].args[3] <= kick.stats.texture.top, `呼吸盖到了带子：${JSON.stringify(breath[0].args)}，带子从 ${kick.stats.texture.top}`);
  // With the swell, its light moves; without, it does not.
  const songModel = small(Array(60).fill(-12));
  songModel.energy = {hop: 0.1, db: Array.from({length: 600}, (_, i) => (i < 300 ? -30 : -8))};
  const light = options => frames(ScoreView, songModel, {showTexture: true, ...options}, [15, 45]).list.map(frame => fillsOf(frame)[1].fillStyle.stops.map(stop => stop[1]).join());
  const [quiet, loud] = light({fxDynamics: 'song'});
  assert.notEqual(quiet, loud, '跟随起伏时带子的明暗应当跟着变');
  const [still1, still2] = light({});
  assert.equal(still1, still2, '不跟随时带子的明暗只看它自己的响度');
});

test('texture lanes on different frames merge on each one\'s own hop', () => {
  // One lane every second, -30 dB throughout; one every half second, silent for 30 s then -30 dB.
  const model = fullModel();
  model.lanes.push({id: 'texture', label: '其它', kind: 'texture', group: 'other', level: {hop: 1, db: Array(60).fill(-30)}});
  model.lanes.push({id: 'texture-b', label: '其它', kind: 'texture', group: 'other', level: {hop: 0.5, db: Array.from({length: 120}, (_, k) => (k < 60 ? -120 : -30))}});
  const curve = ScoreView.create(mockCanvas().canvas, model, () => 0, {showTexture: true}).texture();
  assert.ok(Math.abs(curve.db[10] - (-30)) < 0.01, `前 30 秒只有一条：${curve.db[10]}`);
  assert.ok(Math.abs(curve.db[40] - (-30 + 10 * Math.log10(2))) < 0.01, `后 30 秒两条相加：${curve.db[40]}`);
});

test('with the swell on, the band is still no lighter than 0.3, measured on the thickest band; focusing another stem dims it', () => {
  // Quiet for half the song, then loud: at 45 s the band is at its thickest (above its own 98th share) and the swell at its top.
  const model = small(Array.from({length: 60}, (_, s) => (s < 30 ? -40 : -12)));
  model.energy = {hop: 0.1, db: Array.from({length: 600}, (_, i) => (i < 300 ? -30 : -8))};
  const brightest = frame => Math.max(...frame.surface.filter(call => call.name === 'fill' && call.fillStyle && call.fillStyle.stops)
    .flatMap(call => call.fillStyle.stops.map(stop => Number(/,([\d.]+)\)$/.exec(stop[1])[1]))));
  for (const options of [{}, {fxDynamics: 'song'}, {fxDynamics: 'song', fxPreset: 'strong'}]) {
    const [, loud] = frames(ScoreView, model, {showTexture: true, ...options}, [15, 45]).list;
    if (options.fxDynamics) assert.ok(loud.stats.fx.swell > 0.95, '这一刻应当在最响端');
    assert.ok(loud.stats.texture.now > 0.999, `这一刻带子应当最粗，现在 ${loud.stats.texture.now}`);
    if (options.fxDynamics) assert.ok(brightest(loud) > 0.29, `最粗、最响的这一刻带子应当到 0.3 附近，现在 ${brightest(loud)}`);
    assert.ok(brightest(loud) <= 0.3 + 1e-9, `${JSON.stringify(options)} 带子最亮 ${brightest(loud)}，超过 0.3`);
  }
  // Another stem listened to alone: the band steps back under the same veil as the other lanes.
  const focused = frames(ScoreView, model, {showTexture: true, focusGroup: 'guitar'}, [30]).list[0];
  const t = focused.stats.texture;
  const veil = focused.surface.filter(call => call.name === 'fillRect' && call.fillStyle === 'rgba(26,29,33,0.62)');
  assert.ok(veil.some(call => Math.abs(call.args[1] - t.top) < 1e-6 && Math.abs(call.args[3] - (t.bottom - t.top)) < 1e-6), '聚焦别的分轨时带子没有压暗');
  const own = frames(ScoreView, model, {showTexture: true, focusGroup: 'other'}, [30]).list[0];
  assert.ok(!own.surface.some(call => call.name === 'fillRect' && call.fillStyle === 'rgba(26,29,33,0.62)' && Math.abs(call.args[1] - t.top) < 1e-6), '只听「其它」时它自己不该被压暗');
});

test('no effect lights the band: under the drums, effects stop at the drums\' foot', () => {
  for (const name of ['meguri', 'qilixiang']) {
    const model = withTexture(name);
    for (const fxPreset of ['clear', 'keys', 'stage', 'strong']) {
      const plainSurface = mockCanvas(800, 400), litSurface = mockCanvas(800, 400);
      const plain = ScoreView.create(plainSurface.canvas, model, () => 0, {fxPreset: 'off', showTexture: true});
      const lit = ScoreView.create(litSurface.canvas, model, () => 0, {fxPreset, fxDynamics: 'song', showTexture: true});
      let reached = 0;
      for (const time of steps(1, model.track.duration - 1, Math.round(model.track.duration / 2))) {
        plainSurface.reset(); litSurface.reset();
        plain.draw(time);
        const stats = lit.draw(time);
        const foot = stats.texture.top - ScoreView.TEXTURE.gap;
        const plainFills = new Set(plainSurface.calls.filter(call => call.name === 'fillRect').map(call => JSON.stringify([call.args, call.fillStyle])));
        for (const call of litSurface.calls) {
          if (call.name !== 'fillRect' || plainFills.has(JSON.stringify([call.args, call.fillStyle]))) continue;
          // Either edge of the rectangle, whatever the sign of its height (a negative one reaches up from y).
          const bottom = Math.max(call.args[1], call.args[1] + call.args[3]);
          assert.ok(bottom <= foot + 1e-9, `${name} ${fxPreset} ${time} 秒特效画进了带子：${JSON.stringify(call.args)}，带子从 ${stats.texture.top}`);
          assert.ok(call.args[3] >= 0, `${name} ${fxPreset} ${time} 秒画了负高度的矩形：${JSON.stringify(call.args)}`);
          if (foot - bottom < 0.01) reached++;
        }
      }
      if (name === 'meguri' && fxPreset !== 'keys') assert.ok(reached > 0, `${name} ${fxPreset}：没有一笔被截在鼓轨下沿，这条检查没碰到要守的情况`);
    }
  }
});

test('several stems without notes are one band, their loudness added; the band answers hit() as its group', () => {
  const model = fullModel();
  model.lanes.push({id: 'texture', label: '其它', kind: 'texture', group: 'other', level: {hop: 1, db: Array(60).fill(-30)}});
  model.lanes.push({id: 'texture-2', label: '其它2', kind: 'texture', group: 'other', level: {hop: 1, db: Array(60).fill(-30)}});
  const one = frames(ScoreView, small(Array(60).fill(-30 + 10 * Math.log10(2))), {showTexture: true}, [10]).list[0];
  const two = frames(ScoreView, model, {showTexture: true}, [10]);
  assert.ok(Math.abs(two.list[0].stats.texture.now - one.stats.texture.now) < 0.002, `两条相加 ${two.list[0].stats.texture.now}，应当是 ${one.stats.texture.now}`);
  assert.equal(two.view.layers().lanes, 5, '带子不算进普通轨');
  const t = two.list[0].stats.texture;
  assert.deepEqual(two.view.hit(400, (t.top + t.bottom) / 2), {kind: 'lane', id: 'texture', group: 'other', label: '其它', texture: true});
  // Its label: the wave icon in the name column (or its name in text mode).
  assert.ok(two.list[0].stats.labels.some(label => label.lane === 'texture' && label.shown === 'icon'));
  const waves = two.list[0].surface.filter(call => call.name === 'stroke' && /^rgba\(154,161,169,/.test(call.strokeStyle));
  assert.equal(waves.length, 1, '名字栏里应当画出波纹图标');
  const text = frames(ScoreView, model, {showTexture: true, laneLabels: 'text'}, [10]).list[0];
  assert.ok(text.stats.labels.some(label => label.lane === 'texture' && label.shown === 'text'));
});

test('the adapter: the other stem, and only it, becomes the texture lane; none without a levels layer or without other; no marks for it', () => {
  const model = pilot('meguri');
  model.levels = JSON.parse(fs.readFileSync(LEVELS, 'utf8')).meguri;
  const health = {};
  adapter.textureInto(model, 'zh', health);
  const lane = model.lanes.find(item => item.kind === 'texture');
  assert.ok(lane, '没有出带子那条轨');
  // Only 'other': MEGURI's vocals (no notes) and violin (its own stem) are not folded in.
  assert.deepEqual(lane.members, ['other'], '带子只取「其它」分轨');
  assert.equal(lane.group, 'other');
  assert.equal(lane.label, '其它');
  assert.equal(lane.notes, undefined, '不许造音符');
  assert.deepEqual(lane.level.db, model.levels.groups.other, '带子的响度就是「其它」分轨的响度');
  assert.equal(lane.level.hop, model.levels.hop);
  // A levels layer without 'other': no band.
  const noOther = pilot('meguri');
  noOther.levels = {hop: 1, groups: {vocals: Array(60).fill(-20), piano: Array(60).fill(-20)}};
  const whyNot = {};
  adapter.textureInto(noOther, 'zh', whyNot);
  assert.ok(!noOther.lanes.some(item => item.kind === 'texture'), '没有「其它」分轨也出了带子');
  assert.equal(whyNot.texture.ok, false);
  // An 'other' under the floor the whole song (the Chopin nocturne, FLAG, Ceremony): no lane, and the reason; one frame above it is enough.
  assert.equal(adapter.TEXTURE_FLOOR, ScoreView.TEXTURE.floor, '适配器和核心的门槛应当是同一个数');
  const silent = pilot('meguri');
  silent.levels = {hop: 1, groups: {other: Array(60).fill(-60)}};
  const whySilent = {};
  adapter.textureInto(silent, 'zh', whySilent);
  assert.ok(!silent.lanes.some(item => item.kind === 'texture'), '「其它」整首无声也出了带子');
  assert.equal(whySilent.texture.ok, false);
  assert.match(whySilent.texture.why, /以下/);
  const once = pilot('meguri');
  once.levels = {hop: 1, groups: {other: Array.from({length: 60}, (_, s) => (s === 30 ? -49 : -60))}};
  adapter.textureInto(once, 'zh', {});
  assert.ok(once.lanes.some(item => item.kind === 'texture'), '「其它」有一秒过了门槛就该出带子');
  // English.
  const en = pilot('meguri'); en.levels = model.levels; adapter.textureInto(en, 'en', {});
  assert.equal(en.lanes.at(-1).label, 'Other');
  // No levels layer: no lane, and the reason.
  const bare = pilot('meguri'); delete bare.levels;
  const why = {};
  adapter.textureInto(bare, 'zh', why);
  assert.ok(!bare.lanes.some(item => item.kind === 'texture'));
  assert.equal(why.texture.ok, false);
  // Through modelFrom: a song with no levels layer gets no texture lane, one with it does.
  const stems = {guitar: {notes: [{start: 1, end: 2, pitch: 60, velocity: 90}, {start: 30, end: 31, pitch: 62, velocity: 90}]}};
  const without = adapter.modelFrom({stems, track: {id: 'x', title: 'x'}, duration: 60});
  assert.ok(!without.model.lanes.some(item => item.kind === 'texture'));
  const levels = {hop: 1, groups: {guitar: Array(60).fill(-20), other: Array.from({length: 60}, (_, s) => (s < 30 ? -90 : -14))}};
  const made = adapter.modelFrom({stems, track: {id: 'x', title: 'x'}, duration: 60, layers: {kind: 'score-layers', levels}});
  const texture = made.model.lanes.find(item => item.kind === 'texture');
  assert.ok(texture && texture.members.join() === 'other');
  // A stem without notes beside 'other' (piano, vocals) stays out of the band.
  const pair = adapter.modelFrom({stems, track: {id: 'x', title: 'x'}, duration: 60,
    layers: {kind: 'score-layers', levels: {hop: 1, groups: {guitar: Array(60).fill(-20), other: Array(60).fill(-20), piano: Array(60).fill(-20), vocals: Array(60).fill(-15)}}}});
  const only = pair.model.lanes.find(item => item.kind === 'texture');
  assert.deepEqual(only.members, ['other'], '没有音符的钢琴、人声分轨不该并进带子');
  assert.equal(only.level.db[10], -20);
  // It is never named by a mark or a caption, however loud it comes in.
  for (const row of made.model.captions || []) assert.ok(!/其它|Other/.test(row[2]), `出了带子的标注：${row[2]}`);
  const loudModel = withTexture('qilixiang');
  for (const row of cues(loudModel, {})) assert.ok(row[4].object !== 'other', `出了「其它」的标注：${row[2]}`);
});
