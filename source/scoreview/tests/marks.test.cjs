'use strict';
// The "object · event" marks in the core (captionStyle 'mark', work/score-cues-20261113/SPEC.md §3),
// and 'sentence' drawing exactly what 0.9.2 drew. Each rule has an entry in mutations.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {ScoreView, fullModel, BENCH, breathOnLanes, cutAtBar, barTopOf} = require('./helpers.cjs');
const {cues} = require('../adapter/cues.cjs');

// The core as it was before the marks (0.9.2, frozen the day they were started).
const BEFORE = require('./fixtures/score-view-0.9.2.js');
const DATA = path.join(__dirname, '..', '..', '..', 'work', 'scoreview-20261110', 'data');
const pilot = name => {
  const file = path.join(DATA, name, 'bundle.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
};
const page = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'audition', 'page.json'), 'utf8'));

// A canvas that writes down every call with its arguments and every property set, in order.
function recorder(width = 800, height = 400) {
  const log = [];
  let made = 0;
  const id = value => (value && typeof value === 'object' ? value.id || 'object' : value);
  const gradient = kind => (...args) => {
    const name = `${kind}-${made++}`;
    log.push(['create', kind, ...args]);
    return {id: name, addColorStop: (at, colour) => log.push(['stop', name, at, colour])};
  };
  const target = {measureText: text => ({width: String(text).length * 6}), createLinearGradient: gradient('linear'), createRadialGradient: gradient('radial')};
  const context = new Proxy(target, {
    get: (object, key) => (key in object ? object[key] : typeof key === 'string' ? (...args) => log.push(['call', key, ...args.map(id)]) : undefined),
    set: (object, key, value) => { log.push(['set', key, id(value)]); return true; }
  });
  const canvas = {width, height, clientWidth: width, clientHeight: height, getContext: () => context};
  return {canvas, log, take: () => log.splice(0, log.length)};
}
const steps = (from, to, count) => Array.from({length: count}, (_, i) => from + (to - from) * i / (count - 1));

const A = [8, 12.5, '鼓 · 首现', 'rule', {object: 'drums', word: 'first', at: 10, preview: true, score: 1.2}];
const B = [14, 16.5, '仅 · 吉他', 'rule', {object: 'guitar', word: 'only', at: 14, preview: false, score: 1.1}];
const C = [20, 22.5, '全体 · 骤强', 'rule', {object: 'all', word: 'surge', at: 20, preview: false, score: 0.9}];
const D = [28, 32.5, '主旋律 → 人声', 'rule', {object: 'vocals', word: 'lead', at: 30, preview: true, score: 0.8}];
const marked = () => { const model = fullModel(); model.captions = [A, B, C, D]; return model; };
const view = (model, options) => { const surface = recorder(); return {surface, view: ScoreView.create(surface.canvas, model, () => 0, {...BENCH, effects: 'light', captionStyle: 'mark', ...options})}; };
const frame = (made, time) => { made.surface.take(); const stats = made.view.draw(time); return {stats, log: made.surface.take()}; };
const texts = log => log.filter(e => e[0] === 'call' && e[1] === 'fillText').map(e => e[2]);
// The fill style in force at each text drawn.
function textStyles(log) {
  let style = null;
  const out = [];
  for (const entry of log) {
    if (entry[0] === 'set' && entry[1] === 'fillStyle') style = entry[2];
    if (entry[0] === 'call' && entry[1] === 'fillText') out.push({text: entry[2], x: entry[3], y: entry[4], style});
  }
  return out;
}
const rgbOf = style => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(String(style)); return m ? m.slice(1, 4).join(',') : null; };
const hexRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(',');

// --- 'sentence' is 0.9.2 -----------------------------------------------------------------------

function sameAs092(model, options, times, label) {
  const before = recorder(), after = recorder();
  const old = BEFORE.create(before.canvas, model, () => 0, options);
  const now = ScoreView.create(after.canvas, model, () => 0, {...options});
  old.setCover({width: 480, height: 480}); now.setCover({width: 480, height: 480});
  old.draw(0); now.draw(0);
  const barTop = barTopOf(now, 400, 400);
  before.take(); after.take();
  for (const time of times) {
    const a = old.draw(time), b = now.draw(time);
    const drawnBefore = before.take(), drawnAfter = after.take();
    assert.ok(drawnBefore.length > 10, '旧核心没画东西，这条检查失效了');
    // Allowed: the breath on the lanes only (0.11.0) and effects cut at the section bar's top edge (0.12.0).
    assert.deepEqual(breathOnLanes(drawnBefore, cutAtBar(drawnBefore, drawnAfter, barTop), 800, 400), drawnBefore, `${label}：${time.toFixed(2)} 秒这一帧和 0.9.2 不一样（只许底鼓呼吸从整屏变成轨道区、特效在段落条上沿截住）`);
    assert.deepEqual(b, a, `${label}：${time.toFixed(2)} 秒的统计和 0.9.2 不一样`);
  }
}

test("captionStyle 'sentence' draws exactly what 0.9.2 drew, frame for frame, sentences or marks", () => {
  assert.equal(BEFORE.VERSION, '0.9.2');
  // The default is the marks since 0.11.0 (defaults.test.cjs); 0.9.2's frame is 'sentence' asked for.
  assert.equal(ScoreView.DEFAULTS.captionStyle, 'mark');
  let frames = 0;
  const around = rows => rows.flatMap(row => [row[0] - 0.1, row[0] + 0.05, row[0] + 0.2, (row[4] && row[4].at) || row[0], ((row[4] && row[4].at) || row[0]) + 0.5, row[1] - 0.1, row[1] + 0.1]);
  for (const style of [{captionStyle: 'sentence'}]) {
    for (const look of [{fxPreset: 'off'}, {fxPreset: 'clear'}, {fxPreset: 'strong'}, {fxPreset: 'keys'}]) {
      for (const labels of [{laneLabels: 'text', sectionStyle: 'block'}, {laneLabels: 'icon', sectionStyle: 'line'}]) {
        const options = {...look, ...labels, ...style};
        sameAs092(marked(), {...BENCH, ...options}, steps(0, 40, 81).concat(around([A, B, C, D])), `试验台 ${JSON.stringify(options)}`);
        frames += 81 + 28;
        for (const name of ['qilixiang', 'meguri']) {
          const model = pilot(name);
          assert.ok(model, `试点 ${name} 的 bundle.json 不在，这条比对跑不了（work/scoreview-20261110/data/${name}）`);
          const hidden = (page.songs[name] || {}).hidden || [];
          const marks = cues(model, {hidden});
          for (const rows of [model.captions, marks]) {
            const times = steps(0, model.track.duration, 41).map(t => t + 0.013).concat(around(rows.slice(0, 6)));
            sameAs092({...model, captions: rows}, {...options, hidden}, times, `${name} ${JSON.stringify(options)}`);
            frames += times.length;
          }
        }
      }
    }
  }
  assert.ok(frames > 1000, String(frames));
});

// --- the three states --------------------------------------------------------------------------

test('a foreshadowed mark shows dim ahead of its moment, with a hairline running out to it; lit at it; gone after', () => {
  const made = view(marked(), {mergeTimbres: true, laneLabels: 'icon'});
  assert.equal(frame(made, 7.9).stats.caption, null);
  const ahead = frame(made, 9).stats.mark;
  assert.equal(ahead.state, 'preview');
  assert.ok(Math.abs(ahead.alpha - 0.42) < 1e-9 && Math.abs(ahead.line - 0.5) < 1e-9, JSON.stringify(ahead));
  const early = frame(made, 8.05).stats.mark;
  assert.ok(early.alpha < 0.42 * 0.3, '预告也是淡入的');
  const at = frame(made, 10);
  assert.equal(at.stats.mark.state, 'on');
  assert.equal(at.stats.mark.line, null);
  const lit = frame(made, 10.4).stats.mark;
  assert.ok(Math.abs(lit.alpha - 0.94) < 1e-9, String(lit.alpha));
  assert.ok(lit.alpha > ahead.alpha * 2);
  const going = frame(made, 12.4).stats.mark;
  assert.equal(going.state, 'out');
  assert.ok(going.alpha < 0.94 && going.alpha > 0);
  assert.equal(frame(made, 12.6).stats.caption, null);
  // The same words in every state.
  for (const time of [9, 10.4, 12.4]) assert.equal(frame(made, time).stats.caption, '鼓 · 首现');
});

test('a surprise is not foreshadowed: nothing before its moment, lit at it, no hairline', () => {
  const made = view(marked());
  assert.equal(frame(made, 13.95).stats.caption, null);
  const now = frame(made, 14.4).stats.mark;
  assert.equal(now.state, 'on');
  assert.equal(now.line, null);
  assert.ok(Math.abs(now.alpha - 0.94) < 1e-9);
  // Even a surprise row that starts early (a host's mistake) shows nothing before its moment.
  const early = marked();
  early.captions = [[13, 16.5, '仅 · 吉他', 'rule', {object: 'guitar', word: 'only', at: 14, preview: false}]];
  const shown = view(early);
  assert.equal(frame(shown, 13.5).stats.caption, null);
  assert.equal(frame(shown, 14.4).stats.mark.state, 'on');
  const rows = cues({...pilot('qilixiang') || marked()});
  for (const row of rows) if (!row[4].preview) assert.equal(row[0], row[4].at);
});

test('the hairline is drawn under the mark and is as wide as the mark exactly when the moment comes', () => {
  const made = view(marked(), {mergeTimbres: true, laneLabels: 'icon'});
  const lineOf = log => log.filter(e => e[0] === 'call' && e[1] === 'fillRect' && e[5] === 1);
  const half = lineOf(frame(made, 9).log), nearly = lineOf(frame(made, 9.98).log);
  assert.equal(half.length, 1);
  const full = nearly[0][4] / 0.99;
  assert.ok(Math.abs(half[0][4] - full / 2) < 0.5, `${half[0][4]} / ${full}`);
  assert.equal(lineOf(frame(made, 10.2).log).length, 0);
});

test("with effects off there is no fading, no hairline and no flash: the mark appears and goes", () => {
  const made = view(marked(), {fxPreset: 'off', mergeTimbres: true, laneLabels: 'icon'});
  const ahead = frame(made, 8.02).stats.mark;
  assert.equal(ahead.alpha, 0.42);
  assert.equal(ahead.line, null);
  const at = frame(made, 10.01);
  assert.equal(at.stats.mark.alpha, 0.94);
  assert.equal(at.stats.mark.flash, 0);
  // Off, nothing glows: the drum colour is stroked once more than with no caption (the mark's own icon), no more.
  const drumStrokes = log => { let style = null, n = 0; for (const e of log) { if (e[0] === 'set' && e[1] === 'strokeStyle') style = e[2]; if (e[0] === 'call' && e[1] === 'stroke' && rgbOf(style) === hexRgb('#e8663a')) n++; } return n; };
  assert.equal(drumStrokes(at.log), drumStrokes(frame(view(marked(), {fxPreset: 'off', mergeTimbres: true, laneLabels: 'icon', showCaptions: false}), 10.01).log) + 1, '特效关时轨名不发光');
  assert.equal(frame(made, 12.45).stats.mark.alpha, 0.94);
  assert.equal(frame(made, 12.55).stats.caption, null);
});

// --- what is drawn -------------------------------------------------------------------------------

test('icon labels: the object is its lane icon in the lane colour; text labels: its name in the lane colour; the rest white', () => {
  const model = marked();
  const drums = '#e8663a';
  const icon = frame(view(model, {mergeTimbres: true, laneLabels: 'icon'}), 10.5);
  assert.equal(icon.stats.mark.icon, true);
  const iconTexts = textStyles(icon.log).filter(t => t.y < 100);
  assert.ok(iconTexts.some(t => t.text === ' · 首现' && rgbOf(t.style) === '255,255,255'), JSON.stringify(iconTexts));
  assert.ok(!iconTexts.some(t => t.text === '鼓'), '图标模式不写对象名');
  const words = frame(view(model, {mergeTimbres: true, laneLabels: 'text'}), 10.5);
  assert.equal(words.stats.mark.icon, false);
  const named = textStyles(words.log).find(t => t.text === '鼓' && t.y < 100);
  assert.ok(named && rgbOf(named.style) === hexRgb(drums), JSON.stringify(named));
  // "全体" has no icon; "仅 · X" and "主旋律 → X" name the object last.
  const all = frame(view(model, {mergeTimbres: true, laneLabels: 'icon'}), 20.5);
  assert.equal(all.stats.mark.icon, false);
  assert.ok(textStyles(all.log).some(t => t.text === '全体' && rgbOf(t.style) === '255,255,255'));
  const only = textStyles(frame(view(model, {mergeTimbres: true, laneLabels: 'text'}), 14.5).log).filter(t => t.y < 100);
  const prefix = only.find(t => t.text === '仅 · '), object = only.find(t => t.text === '吉他');
  assert.ok(prefix && object && object.x > prefix.x, JSON.stringify(only));
  const lead = frame(view(model, {mergeTimbres: true, laneLabels: 'icon'}), 30.5);
  assert.ok(texts(lead.log).includes('主旋律 → ') && lead.stats.mark.icon);
});

test('the lane a mark names lights up as the mark lights, then settles; other lanes do not', () => {
  const made = view(marked(), {mergeTimbres: true, laneLabels: 'icon'});
  const at = frame(made, 10.3);
  const drums = at.stats.labels.find(l => l.lane === 'drums');
  assert.ok(drums.flash > 0.7 && drums.flash < 0.8, JSON.stringify(drums));
  assert.ok(drums.level >= 0.55 + 0.45 * drums.flash - 1e-9);
  assert.ok(at.stats.labels.filter(l => l.lane !== 'drums').every(l => !l.flash));
  // The halo: the drum icon stroked once more under itself, wider and fainter, in the drums' own colour; no canvas shadow.
  const strokes = [];
  let width = null, style = null;
  for (const e of at.log) {
    if (e[0] === 'set' && e[1] === 'lineWidth') width = e[2];
    if (e[0] === 'set' && e[1] === 'strokeStyle') style = e[2];
    if (e[0] === 'call' && e[1] === 'stroke' && rgbOf(style) === hexRgb('#e8663a')) strokes.push({width, style});
  }
  const plain = Math.min(...strokes.map(s => s.width)), halo = strokes.find(s => s.width > plain * 1.5);
  assert.ok(halo && Number(/,([\d.]+)\)$/.exec(halo.style)[1]) <= 0.35, JSON.stringify(strokes));
  const shadows = log => log.filter(e => e[0] === 'set' && /^shadow/.test(e[1])).length;
  assert.equal(shadows(at.log), shadows(frame(view(marked(), {mergeTimbres: true, laneLabels: 'icon', showCaptions: false}), 10.3).log), '标注不加画布阴影');
  assert.equal(at.log.filter(e => e[1] === 'save').length, at.log.filter(e => e[1] === 'restore').length, 'save 和 restore 要成对');
  assert.ok(!frame(made, 11.4).stats.labels.some(l => l.flash), '1.2 秒后回落');
  assert.ok(!frame(made, 9.5).stats.labels.some(l => l.flash), '预告时不亮');
  const textFrame = frame(view(marked(), {mergeTimbres: true, laneLabels: 'text'}), 10.3);
  const text = textFrame.stats.labels.find(l => l.lane === 'drums');
  assert.ok(text.flash > 0.7, '文字轨名也亮');
  assert.ok(textFrame.log.some(e => e[0] === 'call' && e[1] === 'strokeText' && e[2] === '鼓'), '文字轨名描一圈同色光晕');
  assert.ok(!frame(made, 20.2).stats.labels.some(l => l.flash), '全体不点名任何一条轨');
});

test('no new colours: everything a mark frame paints is a lane colour, white, or what the frame paints without it', () => {
  for (const labels of ['icon', 'text']) {
    for (const time of [9, 10.2, 14.5, 20.5, 30.2]) {
      const withMark = frame(view(marked(), {mergeTimbres: true, laneLabels: labels}), time).log;
      const without = frame(view(marked(), {mergeTimbres: true, laneLabels: labels, showCaptions: false}), time).log;
      const colours = log => new Set(log.filter(e => e[0] === 'set' && ['fillStyle', 'strokeStyle', 'shadowColor'].includes(e[1])).map(e => rgbOf(e[2])).filter(Boolean));
      const allowed = colours(without);
      allowed.add('255,255,255');
      for (const colour of colours(withMark)) assert.ok(allowed.has(colour), `${labels} ${time}: 新颜色 ${colour}`);
    }
  }
});

test('the mark sits where the caption sits: over no lane and no section bar, and nothing is put behind it', () => {
  for (const labels of ['icon', 'text']) {
    const made = view(marked(), {mergeTimbres: true, laneLabels: labels, sectionStyle: 'line'});
    const {log} = frame(made, 10.5);
    const old = frame(view({...marked(), captions: [[8, 12.5, '鼓 · 首现', 'rule']]}, {mergeTimbres: true, laneLabels: labels, sectionStyle: 'line'}), 10.5).log;
    const mine = textStyles(log).filter(t => (t.text === ' · 首现' || t.text === '鼓') && t.y < 100);
    const sentence = textStyles(old).find(t => t.text === '鼓 · 首现');
    assert.ok(mine.length && mine.every(t => t.y === sentence.y && t.x >= sentence.x), JSON.stringify({mine, sentence}));
    for (const t of mine) for (const dy of [0, 8, 18]) assert.equal(made.view.hit(t.x + 2, t.y + dy), null, `${labels}: 标注压在了轨或段落条上`);
    // No backing box: the only rectangles the mark adds are the hairline (none at this time).
    const rects = l => l.filter(e => e[0] === 'call' && /Rect$/.test(e[1])).length;
    const bare = frame(view(marked(), {mergeTimbres: true, laneLabels: labels, sectionStyle: 'line', showCaptions: false}), 10.5).log;
    assert.equal(rects(log), rects(bare));
  }
});

test("in 'mark' style a row with no fifth item is still a sentence, and a mark too wide for its room is left out whole", () => {
  const model = marked();
  model.captions = [[9, 15, '先听人声和吉他。', 'manual']];
  const marks = frame(view(model, {captionStyle: 'mark'}), 12).log, sentences = frame(view(model, {captionStyle: 'sentence'}), 12).log;
  assert.deepEqual(marks, sentences);
  const narrow = recorder(150, 400);
  const tight = ScoreView.create(narrow.canvas, marked(), () => 0, {...BENCH, captionStyle: 'mark', effects: 'light'});
  const stats = tight.draw(30.5);
  assert.equal(stats.mark.shown, false);
  assert.ok(!textStyles(narrow.take()).some(t => t.y < 100 && /主旋律|人声/.test(t.text)));
});

test('captionStyle takes only its two values, and showCaptions false hides marks too', () => {
  const made = view(marked());
  assert.equal(made.view.setOptions({captionStyle: 'loud'}).captionStyle, 'mark');
  assert.equal(made.view.setOptions({captionStyle: 'sentence'}).captionStyle, 'sentence');
  assert.equal(frame(made, 10.5).stats.mark, undefined);
  made.view.setOptions({captionStyle: 'mark', showCaptions: false});
  const hidden = frame(made, 10.5).stats;
  assert.equal(hidden.caption, null);
  assert.ok(!hidden.labels.some(l => l.flash));
});
