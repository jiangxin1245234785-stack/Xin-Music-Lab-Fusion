'use strict';
// The effects follow the song's rise and fall (work/score-dynamics-20261114/SPEC.md).
// fxDynamics 'off' (the core's default) must draw exactly what 0.11.0 drew; 'song' moves the
// preset's brightness and reach along a slow curve made from the whole-song loudness. Each rule
// here has an entry in mutations.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {ScoreView, mockCanvas, fullModel, BENCH, cutAtBar, barTopOf, alike} = require('./helpers.cjs');

const BEFORE = require('./fixtures/score-view-0.11.0.js');
const DATA = path.join(__dirname, '..', '..', '..', 'work', 'scoreview-20261110', 'data');
const steps = (from, to, count) => Array.from({length: count}, (_, i) => from + (to - from) * i / (count - 1));
const pilot = name => {
  const file = path.join(DATA, name, 'bundle.json');
  assert.ok(fs.existsSync(file), `试点 ${name} 的 bundle.json 不在，这条比对跑不了`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
};

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

// A loudness envelope from a function of the time, every 0.1 s.
const envelope = (seconds, db) => ({hop: 0.1, db: Array.from({length: Math.round(seconds * 10)}, (_, i) => db(i / 10))});
const curveOf = energy => {
  const model = fullModel();
  model.energy = energy;
  model.track.duration = energy.db.length * energy.hop;
  const view = ScoreView.create(mockCanvas().canvas, model, () => 0, {fxDynamics: 'song'});
  return {view, e: time => view.swellAt(time), curve: view.swell()};
};

test("the default is 'off'; only 'song' and 'off' are taken", () => {
  assert.equal(ScoreView.VERSION, '0.22.0');
  assert.equal(ScoreView.DEFAULTS.fxDynamics, 'off');
  const view = ScoreView.create(mockCanvas().canvas, fullModel(), () => 0);
  assert.equal(view.options().fxDynamics, 'off');
  assert.equal(view.draw(10).fx.swell, undefined, "'off' 时帧统计里不该有起伏");
  view.setOptions({fxDynamics: 'song'});
  assert.equal(view.options().fxDynamics, 'song');
  view.setOptions({fxDynamics: 'loud'});
  assert.equal(view.options().fxDynamics, 'song', '不认识的值不该被接受');
  view.setOptions({fxDynamics: 'off'});
  assert.equal(view.options().fxDynamics, 'off');
});

test("'off', and nothing given, draw exactly what 0.11.0 drew, frame for frame, but for effects cut at the section bar", () => {
  assert.equal(BEFORE.VERSION, '0.11.0');
  // Both cores get the same input, one the old and the new rules agree on (helpers.alike).
  const models = [fullModel(), pilot('qilixiang'), pilot('meguri')].map(alike);
  let compared = 0, cut = 0;
  for (const fxPreset of ['clear', 'keys', 'ink', 'stage', 'strong', 'off']) {
    for (const look of [{}, {laneLabels: 'text', sectionStyle: 'block', captionStyle: 'sentence'}, {focusGroup: 'guitar', loop: [21, 45]}]) {
      for (const model of models) {
        const times = steps(0, model.track.duration, 41).map(t => t + 0.013).concat([9.02, 10, 10.02, 30.01]);
        const old = frames(BEFORE, model, {...look, fxPreset}, times);
        for (const given of [{...look, fxPreset}, {...look, fxPreset, fxDynamics: 'off'}]) {
          frames(ScoreView, model, given, times).forEach((frame, i) => {
            // The one difference allowed: an effect that reached into the section bar is cut at its top edge (helpers.cjs cutAtBar).
            const back = frame.calls === old[i].calls ? frame.calls : JSON.stringify(cutAtBar(JSON.parse(old[i].calls), JSON.parse(frame.calls), frame.barTop));
            if (frame.calls !== old[i].calls) cut++;
            assert.equal(back, old[i].calls, `${fxPreset} ${JSON.stringify(given)} ${times[i]} 秒：和 0.11.0 画的不一样（只许特效在段落条上沿截住）`);
            assert.deepEqual(frame.stats, old[i].stats);
            compared++;
          });
        }
      }
    }
  }
  assert.ok(compared > 2000, `${compared} 帧`);
  // The cut does happen on the pilots (else this proves nothing about it), and only now and then.
  assert.ok(cut > 0 && cut < compared / 4, `${compared} 帧里 ${cut} 帧有截住的特效`);
});

test("a song without a loudness envelope: the swell is the middle, and 'song' draws what 'off' draws", () => {
  const model = fullModel();
  delete model.energy;
  const times = steps(0, 60, 121).concat([9.02, 10, 10.02, 30.01]);
  for (const fxPreset of ['clear', 'keys', 'ink', 'stage', 'strong']) {
    const off = frames(ScoreView, model, {fxPreset}, times), song = frames(ScoreView, model, {fxPreset, fxDynamics: 'song'}, times);
    song.forEach((frame, i) => {
      assert.equal(frame.calls, off[i].calls, `${fxPreset} ${times[i]} 秒：没有响度层时 'song' 画得和 'off' 不一样`);
      assert.equal(frame.stats.fx.swell, 0.5);
    });
  }
  const view = ScoreView.create(mockCanvas().canvas, model, () => 0, {fxDynamics: 'song'});
  assert.equal(view.swell(), null);
  assert.equal(view.swellAt(33), 0.5);
});

test('smoothing: drum hits do not shake the swell; it follows phrases, rising in about 1.5 s and falling in about 4', () => {
  // A song that steps between -24 and -8 dB every 20 s, with a kick every half second (+10 dB for a tenth).
  const drums = t => ((t % 0.5) < 0.1 ? 10 : 0) + (Math.floor(t / 20) % 2 ? -8 : -24) - (Math.floor(t * 7.3) % 3);
  const {e, curve} = curveOf(envelope(160, drums));
  // Shaking shows as a large second difference (up then down within two tenths of a second); a phrase
  // step, however steep, does not. Measured: 0.04 here; 0.17 without the evening out, 0.11 without the
  // follower. (The step size itself is no measure since SPEC-FIX §7: the S-curve makes the middle steeper.)
  let shake = 0;
  for (let t = 1; t < 159; t += 0.1) shake = Math.max(shake, Math.abs(e(t + 0.1) - 2 * e(t) + e(t - 0.1)));
  // The 16 dB phrase steps themselves move it about 0.05 a tenth of a second at most; a kick passed
  // through unsmoothed would move it about 0.09 (10 dB over a 16 dB range, times the rise's 0.14).
  assert.ok(shake < 0.06, `鼓点让起伏来回抖了 ${shake.toFixed(3)}`);
  // Inside a long loud stretch it holds still: no beat-by-beat wobble.
  const held = steps(32, 39, 71).map(e);
  assert.ok(Math.max(...held) - Math.min(...held) < 0.05, `稳定的一段里起伏在抖：${Math.min(...held).toFixed(3)}–${Math.max(...held).toFixed(3)}`);
  assert.ok(curve.range > 10, JSON.stringify(curve));
  // From one tenth of the way to nine tenths: going up at 20 s about 1.5 s (plus the evening out),
  // coming down at 40 s about 4 s.
  // Timed on the follower itself: the S that pushes the scale out (SPEC-FIX §7) is undone first, since it
  // makes the crossings near either end quicker without the follower being any faster.
  const p = ScoreView.SWELL.pull;
  const unpushed = t => { const v = e(t), g = Math.abs(2 * v - 1); return 0.5 + Math.sign(v - 0.5) * Math.pow(g, 1 / p) / 2; };
  const cross = (from, level, rising) => { for (let t = from; t < from + 15; t += 0.01) if (rising ? unpushed(t) >= level : unpushed(t) <= level) return t; return Infinity; };
  const top = unpushed(38), rise = cross(18, 0.9 * top, true) - cross(18, 0.1 * top, true), fall = cross(38, 0.1 * top, false) - cross(38, 0.9 * top, false);
  assert.ok(rise > 0.8 && rise < 2.6, `上升用了 ${rise.toFixed(2)} 秒`);
  assert.ok(fall > 3.2 && fall < 6, `回落用了 ${fall.toFixed(2)} 秒`);
  assert.ok(fall > rise * 1.5, `回落（${fall.toFixed(2)} 秒）应当明显比上升（${rise.toFixed(2)} 秒）慢`);
});

test("normalised to the song's own range; the silence before and after it does not count", () => {
  const shape = t => (t < 30 ? -30 : t < 60 ? -18 : -10) + 2 * Math.sin(t);
  const base = curveOf(envelope(90, shape));
  // Its own quiet end is 0 and its loud end 1, wherever the song sits in dB.
  assert.ok(base.e(15) < 0.25 && base.e(45) > 0.3 && base.e(45) < 0.8 && base.e(80) > 0.75, `${base.e(15)} ${base.e(45)} ${base.e(80)}`);
  assert.ok(Math.min(...steps(1, 89, 177).map(base.e)) < 0.02 && Math.max(...steps(1, 89, 177).map(base.e)) > 0.98, '这首歌自己的两头应当正好是 0 和 1');
  const louder = curveOf(envelope(90, t => shape(t) + 15));
  for (const t of steps(1, 89, 45)) assert.ok(Math.abs(louder.e(t) - base.e(t)) < 1e-6, `整首响 15 dB 后 ${t} 秒的起伏变了`);
  // Twenty seconds of silence at each end: the music's values do not move (they are only later).
  const padded = curveOf(envelope(130, t => (t < 20 || t >= 110 ? -120 : shape(t - 20))));
  assert.deepEqual(padded.curve.sounding, [20, 110]);
  assert.equal(padded.curve.low, base.curve.low);
  assert.equal(padded.curve.high, base.curve.high);
  for (const t of steps(3, 89, 44)) assert.ok(Math.abs(padded.e(t + 20) - base.e(t)) < 1e-6, `开头结尾的静音改变了 ${t} 秒的起伏`);
});

test("three points: the quiet end is 0, the song's usual loudness (its median) 0.5, the loud end 1, each half straight", () => {
  // Half the song on one plateau: the median sits on it, so the swell there is the preset itself.
  const song = curveOf(envelope(100, t => (t < 20 ? -30 : t < 70 ? -18 : -8)));
  assert.equal(song.curve.middle, -18);
  assert.equal(song.curve.upper, 1, '响的一头比平常高 10 dB，上半段不收');
  for (const t of [35, 45, 60]) assert.ok(Math.abs(song.e(t) - 0.5) < 0.005, `中位数那一段的起伏应当是 0.5，${t} 秒是 ${song.e(t)}`);
  assert.ok(song.e(15) < 0.01 && song.e(90) > 0.99, `${song.e(15)} ${song.e(90)}`);
  // Each half straight: going up from the plateau to the loud end, the swell passes 0.75 where the
  // followed level is half way there in dB, i.e. between the two plateaus, rising all the way.
  const rising = steps(68.5, 74, 56).map(song.e);
  assert.ok(rising.every((value, i) => i === 0 || value >= rising[i - 1]) && rising[0] < 0.55 && rising.at(-1) > 0.9);
  // Where most of the song is loud, its usual loudness is still 0.5: the swell sits in the middle most of the time.
  const pop = curveOf(envelope(100, t => (t < 10 ? -30 : t < 85 ? -12 + Math.sin(t) : -6)));
  const middling = steps(15, 80, 131).map(pop.e).filter(value => value > 0.3 && value < 0.7).length / 131;
  assert.ok(middling > 0.8, `一直很响的歌，平常的地方应当在 0.5 附近：${middling}`);
});

test('a song pressed loud all the way: less than SWELL.upper dB from its usual loudness to its loud end opens up that much less', () => {
  const pressed = curveOf(envelope(100, t => (t < 20 ? -30 : t < 80 ? -12 : -11)));   // the loud end 1 dB over the usual
  assert.ok(Math.abs(pressed.curve.high - pressed.curve.middle - 1) < 0.05, JSON.stringify(pressed.curve));
  assert.equal(ScoreView.SWELL.upper, 1.5);
  assert.equal(pressed.curve.upper, Math.round((pressed.curve.high - pressed.curve.middle) / 1.5 * 1000) / 1000);
  assert.equal(pressed.curve.squeeze, 1, '整首范围够，不该整体收窄');
  // 1 dB over the usual is two thirds of the upper half (0.83 before the pull toward the middle, 0.72 after it): up, not to the end.
  const push = x => Math.pow(x, 2);
  assert.ok(Math.abs(pressed.e(95) - (0.5 + push(1 / 1.5) / 2)) < 0.02, `响 1 dB 的副歌应当到 0.72 左右，现在 ${pressed.e(95)}`);
  assert.ok(pressed.e(95) < 0.95, '压得满的歌响 1 dB 不该放到头');
  assert.ok(pressed.e(10) < 0.01, '安静那一半照旧到 0');
  for (const t of [30, 50, 70]) assert.ok(Math.abs(pressed.e(t) - 0.5) < 0.005, `平常的响度仍是 0.5，${t} 秒是 ${pressed.e(t)}`);
  const open = curveOf(envelope(100, t => (t < 20 ? -30 : t < 80 ? -12 : -8)));      // 4 dB: the whole upper half
  assert.equal(open.curve.upper, 1);
  assert.ok(open.e(95) > 0.99);
});

test('the scale is drawn in toward the middle: three quarters of the way up is 0.625, a quarter is 0.375; the middle and both ends stay', () => {
  // Plateaus at the quiet end, a quarter, the usual, three quarters and the loud end of the upper and lower halves.
  const song = curveOf(envelope(160, t => (t < 30 ? -30 : t < 50 ? -24 : t < 110 ? -18 : t < 130 ? -13 : -8)));
  assert.equal(song.curve.middle, -18);
  const at = t => song.e(t);
  assert.ok(at(15) < 0.01 && Math.abs(at(80) - 0.5) < 0.005 && at(150) > 0.99, `${at(15)} ${at(80)} ${at(150)}`);
  const push = x => Math.pow(x, 2);
  assert.ok(Math.abs(at(40) - (0.5 - push(0.5) / 2)) < 0.01, `四分之一处应当推到 ${(0.5 - push(0.5) / 2).toFixed(3)}，现在 ${at(40)}`);
  assert.ok(Math.abs(at(120) - (0.5 + push(0.5) / 2)) < 0.01, `四分之三处应当推到 ${(0.5 + push(0.5) / 2).toFixed(3)}，现在 ${at(120)}`);
  // The quiet end: what lasts close to nothing; what answers each hit at least 40 % of the preset (SPEC-FIX §8.2).
  for (const key of ['light', 'shimmer', 'near', 'pulse', 'sparks']) assert.ok(ScoreView.SWELL_QUIET[key] <= 0.15, `${key} 安静端还有 ${ScoreView.SWELL_QUIET[key]}`);
  for (const key of ['halo', 'hitSparks', 'breathe', 'snare']) assert.ok(ScoreView.SWELL_QUIET[key] >= 0.4, `${key} 安静端只剩 ${ScoreView.SWELL_QUIET[key]}`);
});

test('a song with little range swings less, toward the middle; one with enough range uses all of it', () => {
  const narrow = curveOf(envelope(90, t => (t < 45 ? -14 : -11)));      // 3 dB: half the swing
  assert.ok(narrow.curve.range > 2.5 && narrow.curve.range < 3.5, JSON.stringify(narrow.curve));
  assert.equal(narrow.curve.squeeze, Math.round(narrow.curve.range / 6 * 1000) / 1000);
  const values = steps(1, 89, 177).map(narrow.e);
  assert.ok(Math.min(...values) > 0.2 && Math.max(...values) < 0.8, `动态小的歌摆幅没收：${Math.min(...values)}–${Math.max(...values)}`);
  assert.ok(Math.max(...values) - Math.min(...values) > 0.4, '动态小的歌也该有一点起伏');
  const wide = curveOf(envelope(90, t => (t < 45 ? -20 : -8)));
  assert.equal(wide.curve.squeeze, 1);
  assert.ok(wide.e(30) < 0.02 && wide.e(80) > 0.98);
});

test('the swell is a function of the time alone: any order, any view, any wall clock gives the same frame', () => {
  const model = pilot('meguri');
  const times = steps(0, 300, 61).map(t => t + 0.037);
  const forward = frames(ScoreView, model, {fxDynamics: 'song'}, times);
  // Shuffled, in one view.
  const order = times.map((_, i) => (i * 37) % times.length);
  const surface = mockCanvas(800, 400);
  const view = ScoreView.create(surface.canvas, model, () => 0, {fxDynamics: 'song'});
  view.setCover({width: 480, height: 480});
  view.draw(0);      // as frames() does: its first draw sizes the canvas
  const realNow = Date.now, perf = globalThis.performance && globalThis.performance.now;
  try {
    let fake = 0;
    Date.now = () => (fake += 7919);
    if (perf) globalThis.performance.now = () => (fake += 104729);
    for (const i of order) {
      surface.reset();
      const stats = view.draw(times[i]);
      assert.equal(JSON.stringify(surface.calls), forward[i].calls, `${times[i]} 秒：打乱顺序或换了墙上时钟，画面变了`);
      assert.deepEqual(stats.fx, forward[i].stats.fx);
      assert.equal(view.swellAt(times[i]), view.swellAt(times[i]));
    }
  } finally {
    Date.now = realNow;
    if (perf) globalThis.performance.now = perf;
  }
  // The swell moves on this song (else the check above proves nothing).
  assert.ok(new Set(forward.map(frame => frame.stats.fx.swell)).size > 10);
});

// A small song with the same notes twice: once in a quiet half, once in a loud one.
const ROWS = ['kick', 'snare', 'hihat', 'openhat', 'tom', 'crash', 'ride'];
const twoHalves = () => ({
  contract: 'xin.score-view/1', track: {id: 'dyn', title: '', duration: 120}, audio: {src: '', offset: 0},
  lanes: [
    {id: 'piano', label: '钢琴', kind: 'pitched', group: 'piano', notes: [[30, 0.2, 60, 110], [32, 2, 67, 100], [90, 0.2, 60, 110], [92, 2, 67, 100]]},
    {id: 'drums', label: '鼓', kind: 'drums', group: 'drums', rows: ROWS,
     hits: [[40, 0, 127], [41, 1, 127], [42, 2, 100], [100, 0, 127], [101, 1, 127], [102, 2, 100]]}
  ],
  bars: {beatsPerBar: 4, bpm: 120, beats: [50, 50.5, 110, 110.5], downbeats: [50, 110], steady: true},
  energy: envelope(120, t => (t < 60 ? -30 : -8))
});
const fxAt = (options, time) => ScoreView.create(mockCanvas().canvas, twoHalves(), () => 0, {...BENCH, ...options}).draw(time).fx;
const halo = fx => (fx.halos.find(item => item.pitch === 60) || {strength: 0}).strength;

test("quiet stretches hold the effects back, loud ones open them up; each hit still answers; times stay", () => {
  for (const fxPreset of ['clear', 'strong', 'stage', 'keys']) {
    const q = {fxPreset, fxDynamics: 'song'};
    // Quiet half (30 s): less than the preset, but still there. Loud half (90 s): more (or as much where it is already at 'strong').
    assert.ok(fxAt(q, 30.02).swell < 0.05 && fxAt(q, 90.02).swell > 0.95);
    const quietHalo = halo(fxAt(q, 30.02)), loudHalo = halo(fxAt(q, 90.02)), plainHalo = halo(fxAt({fxPreset}, 30.02));
    assert.ok(quietHalo > 0 && quietHalo < plainHalo * 0.5, `${fxPreset} 安静处光晕 ${quietHalo}（原样 ${plainHalo}）`);
    assert.ok(loudHalo >= plainHalo, `${fxPreset} 响处光晕 ${loudHalo}（原样 ${plainHalo}）`);
    const quietKick = fxAt(q, 40).breathe, loudKick = fxAt(q, 100).breathe, plainKick = fxAt({fxPreset}, 40).breathe;
    assert.ok(quietKick > 0 && quietKick < plainKick && loudKick >= plainKick && loudKick <= 0.06, `${fxPreset} 底鼓 ${quietKick} / ${plainKick} / ${loudKick}`);
    const quietSnare = fxAt(q, 41.02).snare, loudSnare = fxAt(q, 101.02).snare;
    assert.ok(quietSnare > 0 && quietSnare < loudSnare, `${fxPreset} 军鼓 ${quietSnare} / ${loudSnare}`);
    assert.ok(fxAt(q, 32.5).column.peak < fxAt({fxPreset}, 32.5).column.peak, `${fxPreset} 安静处光柱没收`);
    // Times do not move: the halo is gone at the same moment, the afterglow lasts as long.
    const life = ScoreView.FX_PRESETS[fxPreset].haloLife;
    assert.equal(fxAt(q, 90 + life + 0.001).halos.length, 0);
    assert.ok(fxAt(q, 90 + life - 0.01).halos.length > 0);
    const glow = ScoreView.FX_PRESETS[fxPreset].afterglow;
    assert.ok(fxAt(q, 30.2 + glow - 0.01).afterglow > 0 && fxAt(q, 30.2 + glow + 0.01).afterglow === 0, `${fxPreset} 安静处余晖时长变了`);
  }
  // 'clear' at the loud end is 'strong' amount for amount; in the middle it is 'clear' itself.
  const loud = fxAt({fxPreset: 'clear', fxDynamics: 'song'}, 90.02).amounts;
  for (const key of Object.keys(ScoreView.SWELL_QUIET)) {
    const strong = ScoreView.FX_PRESETS.strong[key], clear = ScoreView.FX_PRESETS.clear[key];
    assert.ok(Math.abs(loud[key] - (clear > 0 ? strong : clear)) < 1e-3, `清亮在最响处的 ${key} = ${loud[key]}，应当是 ${clear > 0 ? strong : clear}`);
  }
});

test("at every swell, every amount stays within the preset's quiet share and 'strong', and times never change", () => {
  // A slow ramp from -40 to -10 dB: the swell walks from 0 to 1 across it.
  const model = twoHalves();
  model.energy = envelope(120, t => -40 + t / 4);
  for (const fxPreset of ['clear', 'keys', 'ink', 'stage', 'strong']) {
    const preset = ScoreView.FX_PRESETS[fxPreset];
    const view = ScoreView.create(mockCanvas().canvas, model, () => 0, {...BENCH, fxPreset, fxDynamics: 'song'});
    const seen = new Set();
    for (const time of steps(0, 120, 241)) {
      const fx = view.draw(time).fx;
      seen.add(Math.round(fx.swell * 10));
      for (const key of Object.keys(ScoreView.SWELL_QUIET)) {
        const base = preset[key], value = fx.amounts[key];
        const top = Math.max(base, ScoreView.FX_PRESETS.strong[key]);
        assert.ok(value <= top + 1e-9, `${fxPreset} 起伏 ${fx.swell} 时 ${key} = ${value}，超过了浓（${top}）`);
        // A count (sparks) is rounded to a whole one.
        assert.ok(value >= base * ScoreView.SWELL_QUIET[key] - (Number.isInteger(base) && base > 1 ? 0.5 : 1e-3), `${fxPreset} 起伏 ${fx.swell} 时 ${key} = ${value}，比安静的下限还低`);
        if (!(base > 0)) assert.equal(value, base, `${fxPreset} 原本没有的 ${key} 被起伏造出来了`);
      }
    }
    assert.ok(seen.size >= 10, `起伏没走遍 0–1：${[...seen]}`);
  }
  // In the middle exactly the preset (the core's own function, through a flat song with a known middle).
  const flat = twoHalves();
  delete flat.energy;
  for (const fxPreset of ['clear', 'keys', 'ink', 'stage', 'strong']) {
    const fx = ScoreView.create(mockCanvas().canvas, flat, () => 0, {...BENCH, fxPreset, fxDynamics: 'song'}).draw(30).fx;
    for (const key of Object.keys(ScoreView.SWELL_QUIET)) assert.equal(fx.amounts[key], Math.round(ScoreView.FX_PRESETS[fxPreset][key] * 10000) / 10000, `${fxPreset} 中间值时 ${key} 不是原样`);
  }
  // Times are not among the amounts that follow.
  for (const key of ['haloLife', 'afterglow', 'columnHalf', 'burn']) assert.ok(!(key in ScoreView.SWELL_QUIET), `${key} 不该跟着起伏`);
});

test("'off' (素) stays off with the swell on; the top 12 % and the section bar stay as they are", () => {
  const model = pilot('meguri');
  const times = steps(0, model.track.duration, 61).map(t => t + 0.013);
  const off = frames(ScoreView, model, {fxPreset: 'off'}, times), song = frames(ScoreView, model, {fxPreset: 'off', fxDynamics: 'song'}, times);
  song.forEach((frame, i) => { assert.equal(frame.calls, off[i].calls, `素 + 起伏在 ${times[i]} 秒画了东西`); assert.equal(frame.stats.fx, null); });
});

test('no effect lights the section bar or the top 12 %, in any preset, at any swell: cut at the bar top edge exactly', () => {
  // Both pilots (drums on the lowest lane, snares and cymbals near the bar), every preset, the swell off and on,
  // every 2 s of the song: an effect's fill may end on the bar's top edge and never below it.
  let cutSeen = 0;
  for (const name of ['meguri', 'qilixiang']) {
    const model = pilot(name);
    for (const fxPreset of ['clear', 'keys', 'ink', 'stage', 'strong']) {
      for (const fxDynamics of ['off', 'song']) {
        const plainSurface = mockCanvas(800, 400), litSurface = mockCanvas(800, 400);
        const plain = ScoreView.create(plainSurface.canvas, model, () => 0, {fxPreset: 'off'});
        const lit = ScoreView.create(litSurface.canvas, model, () => 0, {fxPreset, fxDynamics});
        plain.draw(0);
        const barTop = barTopOf(plain, 400, 400);
        for (const time of steps(0.3, model.track.duration - 0.3, Math.round(model.track.duration / 2))) {
          plainSurface.reset(); litSurface.reset();
          plain.draw(time); lit.draw(time);
          assert.deepEqual(litSurface.texts(), plainSurface.texts(), `${name} ${fxPreset} ${fxDynamics} ${time} 秒的文字变了`);
          const plainFills = new Set(plainSurface.calls.filter(call => call.name === 'fillRect').map(call => JSON.stringify([call.args, call.fillStyle])));
          for (const call of litSurface.calls) {
            if (call.name !== 'fillRect' || plainFills.has(JSON.stringify([call.args, call.fillStyle]))) continue;
            const bottom = call.args[1] + call.args[3];
            assert.ok(call.args[1] >= 400 * 0.12, `${name} ${fxPreset} ${fxDynamics} ${time} 秒特效画进了顶部 12%：${JSON.stringify(call.args)}`);
            assert.ok(bottom <= barTop, `${name} ${fxPreset} ${fxDynamics} ${time} 秒特效画进了段落条：${JSON.stringify(call.args)}，段落条从 ${barTop}`);
            if (barTop - bottom < 0.01) cutSeen++;
          }
        }
      }
    }
  }
  assert.ok(cutSeen > 0, '两首歌里没有一笔被段落条截住，这条检查没碰到要守的情况');

});
