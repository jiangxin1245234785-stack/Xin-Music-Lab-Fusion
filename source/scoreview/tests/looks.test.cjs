'use strict';
// PRESETS-SPEC.md §5 (lane icons, `laneLabels`) and §6 (the section bar as thin lines,
// `sectionStyle`). The old look ('text', 'block') drawing exactly what 0.8.0 drew is held
// in presets.test.cjs. Each rule here has an entry in mutations.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const {ScoreView, mockCanvas, fullModel} = require('./helpers.cjs');

const GROUPS = ['vocals', 'piano', 'guitar', 'bass', 'violin', 'strings', 'drums', 'other'];
const oneLane = (group, extra = {}) => ({
  contract: 'xin.score-view/1', track: {id: 'i', title: '', duration: 10}, audio: {src: '', offset: 0},
  lanes: [group === 'drums'
    ? {id: group, label: `名字-${group}`, kind: 'drums', group, rows: ['kick', 'snare', 'hihat'], hits: [[1, 0, 100]]}
    : {id: group, label: `名字-${group}`, kind: 'pitched', group, notes: [[1, 1, 60, 100], [2, 1, 72, 100]]}],
  ...extra
});
const draw = (model, options, at = 0.5, width = 800, height = 400) => {
  const surface = mockCanvas(width, height);
  const view = ScoreView.create(surface.canvas, model, () => 0, {effects: 'off', ...options});
  const stats = view.draw(at);
  return {surface, view, stats};
};
// The calls between the icon's save and restore.
const iconCalls = surface => {
  const calls = surface.calls, out = [];
  for (let i = 0; i < calls.length; i++) {
    if (calls[i].name !== 'save') continue;
    let j = i + 1;
    while (j < calls.length && calls[j].name !== 'restore') j++;
    const inside = calls.slice(i + 1, j);
    // An icon: one path, stroked once, with round ends.
    if (inside.length > 2 && inside[0].name === 'beginPath' && inside[inside.length - 1].name === 'stroke' &&
        inside.filter(call => call.name === 'stroke').length === 1 && inside[inside.length - 1].lineCap === 'round') out.push(inside);
    i = j;
  }
  return out;
};
const points = calls => {
  const list = [];
  for (const call of calls) {
    if (call.name === 'moveTo' || call.name === 'lineTo') list.push([call.args[0], call.args[1]]);
    if (call.name === 'quadraticCurveTo') list.push([call.args[0], call.args[1]], [call.args[2], call.args[3]]);
    if (call.name === 'arc') list.push([call.args[0] - call.args[2], call.args[1] - call.args[2]], [call.args[0] + call.args[2], call.args[1] + call.args[2]]);
  }
  return list;
};

test('every group of the colour table has a drawn icon: strokes only, round ends, in the lane colour, the name gone', () => {
  for (const group of GROUPS) {
    const {surface, stats, view} = draw(oneLane(group), {laneLabels: 'icon'});
    assert.equal(stats.labels.length, 1);
    assert.equal(stats.labels[0].shown, 'icon', `${group} 没有图标`);
    const [icon] = iconCalls(surface);
    assert.ok(icon, `${group} 的图标没画`);
    assert.ok(!icon.some(call => /^fill/.test(call.name)), `${group} 的图标里有实心的填充`);
    const strokes = icon.filter(call => call.name === 'stroke');
    assert.equal(strokes.length, 1);
    assert.equal(strokes[0].lineCap, 'round');
    const colour = view.lanes()[0].color;
    const hex = '#' + /rgba\((\d+),(\d+),(\d+),1\)/.exec(strokes[0].strokeStyle).slice(1).map(v => Number(v).toString(16).padStart(2, '0')).join('');
    assert.equal(hex, colour, `${group} 的图标不是这条轨自己的颜色`);
    // One stroke width for every icon, in proportion to its size.
    assert.ok(Math.abs(strokes[0].lineWidth / stats.labels[0].size - 1.7 / 24) < 1e-9, `${group} 的线宽不统一`);
    assert.ok(!surface.texts().some(item => item.text === `名字-${group}`), `${group} 画了图标还写了名字`);
  }
});

test('the icons are not copies of each other', () => {
  const shapes = GROUPS.map(group => {
    const {surface, stats} = draw(oneLane(group), {laneLabels: 'icon'});
    const {x, y, size} = stats.labels[0];
    return JSON.stringify(points(iconCalls(surface)[0]).map(([px, py]) => [Math.round((px - x) / size * 240), Math.round((py - y) / size * 240)]));
  });
  assert.equal(new Set(shapes).size, GROUPS.length);
});

test('an icon stays in the name column and inside its own lane; the column is no wider', () => {
  for (const narrow of [false, true]) {
    const width = narrow ? 400 : 800, gutter = narrow ? 58 : 84;
    const {surface, stats} = draw(fullModel(), {laneLabels: 'icon'}, 10, width, 400);
    const text = draw(fullModel(), {laneLabels: 'text'}, 10, width, 400).surface;
    // The fade the names sit on is the same width as before.
    const fade = s => s.fills().find(fill => fill.x === 0 && fill.style && fill.style.stops && fill.style.line && fill.style.line[2] === gutter + 26);
    assert.ok(fade(surface) && fade(text), '名字那一栏的底变了');
    assert.equal(fade(surface).width, fade(text).width);
    const icons = iconCalls(surface);
    assert.ok(icons.length >= 3);
    for (const icon of icons) {
      for (const [px] of points(icon)) assert.ok(px >= 0 && px <= gutter, `图标伸出了名字那一栏（x = ${px}）`);
    }
    for (const label of stats.labels.filter(item => item.shown === 'icon')) {
      const box = stats.heights[label.lane];
      assert.ok(label.size + 2 <= box + 1e-9, `${label.lane} 的图标比轨还高`);
    }
  }
});

// Where a lane is on the canvas, found from what `hit` answers down the name column.
const laneSpans = (view, x, height) => {
  const spans = {};
  for (let y = 0; y < height; y += 0.25) {
    const answer = view.hit(x, y);
    if (!answer || answer.kind !== 'lane') continue;
    const span = spans[answer.id] || (spans[answer.id] = {top: y, bottom: y});
    span.bottom = y + 0.25;
  }
  return spans;
};
// A model with levels that differ, so the lanes' heights (and icons' brightness) move.
const loudModel = () => {
  const model = fullModel();
  const loud = (base, swing) => Array.from({length: 60}, (_, i) => base + swing * Math.sin(i / 7));
  model.levels = {hop: 1, groups: {vocals: loud(-12, 6), guitar: loud(-30, 10), bass: loud(-18, 4), drums: loud(-45, 3)}};
  return model;
};

test('every icon is one size whatever its lane, follows the name size, and sits on one vertical line in the middle of its lane', () => {
  for (const [width, font, gutter] of [[800, 13, 84], [400, 11, 58]]) {
    for (const height of [400, 360]) {
      for (const at of [5, 10, 30, 50]) {
        const {view, stats} = draw(loudModel(), {laneLabels: 'icon', laneHeights: 'loudness'}, at, width, height);
        const icons = stats.labels.filter(item => item.shown === 'icon');
        assert.ok(icons.length >= 3, `${width}×${height} ${at} 秒图标太少`);
        const spans = laneSpans(view, gutter / 2, height);
        for (const icon of icons) {
          assert.ok(Math.abs(icon.size - font * 1.7) < 1e-9, `${icon.lane} 的图标 ${icon.size}，应当都是 ${font * 1.7}`);
          assert.ok(Math.abs(icon.x + icon.size / 2 - gutter / 2) < 0.01, `${icon.lane} 的图标中心不在名字栏正中那条竖线上`);
          const span = spans[icon.lane];
          assert.ok(Math.abs(icon.y + icon.size / 2 - (span.top + span.bottom) / 2) < 0.3, `${icon.lane} 的图标不在轨道垂直正中`);
        }
      }
    }
  }
});

test('every icon is drawn in the same square: its outline centred, about as large as the others', () => {
  for (const group of GROUPS) {
    const {surface, stats} = draw(oneLane(group), {laneLabels: 'icon'});
    const {x, y, size} = stats.labels[0];
    const unit = points(iconCalls(surface)[0]).map(([px, py]) => [(px - x) / size * 24, (py - y) / size * 24]);
    const xs = unit.map(p => p[0]), ys = unit.map(p => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    // Curves are checked at their control points, so the outline is a little generous.
    assert.ok(Math.abs((x0 + x1) / 2 - 12) < 1.2 && Math.abs((y0 + y1) / 2 - 12) < 1.2, `${group} 的图标不在方格正中`);
    assert.ok(Math.max(x1 - x0, y1 - y0) >= 16 && Math.max(x1 - x0, y1 - y0) <= 21, `${group} 的图标明显偏大或偏小`);
    assert.ok(x0 >= 0 && y0 >= 0 && x1 <= 24 && y1 <= 24, `${group} 的图标出了方格`);
  }
});

test('in icon mode a short lane is raised to fit its icon, the room coming from the tall ones; the total stays; text mode is untouched', () => {
  const least = 13 * 1.7 + 6;
  let raised = 0;
  for (const height of [400, 320, 260, 230]) {
    for (const at of [5, 10, 30, 50]) {
      const options = {laneHeights: 'loudness'};
      const text = draw(loudModel(), {...options, laneLabels: 'text'}, at, 800, height).stats.heights;
      const icon = draw(loudModel(), {...options, laneLabels: 'icon'}, at, 800, height).stats.heights;
      const ids = Object.keys(text), sum = h => ids.reduce((total, id) => total + h[id], 0);
      assert.ok(Math.abs(sum(icon) - sum(text)) < 0.05, `${height} 高 ${at} 秒：总高度变了`);
      if (ids.length * least > sum(text)) continue;
      for (const id of ids) {
        assert.ok(icon[id] >= least - 0.01, `${height} 高 ${at} 秒：${id} 只有 ${icon[id]}，放不下图标`);
        if (text[id] < least) raised++;
        // A lane that was tall enough only gives up room, never gains it.
        if (text[id] >= least) assert.ok(icon[id] <= text[id] + 0.01, `${id} 本来够高，却变高了`);
      }
      // The tallest lane gives up the most.
      const tallest = ids.reduce((a, b) => (text[a] >= text[b] ? a : b));
      for (const id of ids) assert.ok(text[tallest] - icon[tallest] >= text[id] - icon[id] - 0.01);
    }
  }
  assert.ok(raised > 0, '这组设置里没有一条轨需要抬高，检查失效了');
});

test('where there is not room for every lane at icon height, the heights stay as they are and an icon goes only where it does not fit', () => {
  const {stats} = draw(loudModel(), {laneLabels: 'icon', laneHeights: 'loudness'}, 10, 800, 200);
  const text = draw(loudModel(), {laneLabels: 'text', laneHeights: 'loudness'}, 10, 800, 200).stats.heights;
  assert.deepEqual(stats.heights, text, '放不下时不该改高度');
  const side = 13 * 1.7;
  let none = 0;
  for (const label of stats.labels) {
    if (stats.heights[label.lane] < side + 2) { assert.equal(label.shown, 'none'); none++; }
    else assert.equal(label.shown, 'icon');
  }
  assert.ok(none > 0, '这个画布上每条轨都放得下，检查失效了');
});

test("an icon's brightness follows its lane's loudness, slowly, between half and full", () => {
  const surface = mockCanvas(800, 400);
  const view = ScoreView.create(surface.canvas, loudModel(), () => 0, {effects: 'off', laneLabels: 'icon'});
  let previous = null, spread = 0, between = 0;
  for (let at = 0; at < 60; at += 0.05) {
    const levels = Object.fromEntries(view.draw(at).labels.filter(item => item.shown === 'icon').map(item => [item.lane, item.level]));
    for (const value of Object.values(levels)) { assert.ok(value >= 0.5 && value <= 1); if (value > 0.55 && value < 0.95) between++; }
    // The loudest stem (vocals) is brighter than the quietest (drums).
    assert.ok(levels.vocals > levels.drums, `${at.toFixed(2)} 秒最响的人声不比最轻的鼓亮`);
    spread = Math.max(spread, levels.vocals - levels.drums);
    if (previous) for (const id of Object.keys(levels)) assert.ok(Math.abs(levels[id] - previous[id]) <= 0.04, `${id} 的亮度在 ${at.toFixed(2)} 秒跳了`);
    previous = levels;
  }
  assert.ok(spread > 0.2, '响的和轻的亮度差得太少，看不出来');
  // A scale, not on and off: in-between loudness gives in-between brightness.
  assert.ok(between > 100, '亮度只有亮和暗两档，没有中间');
  // The stroke carries the level as its alpha, in the lane's own colour.
  surface.reset();
  const label = view.draw(30).labels.find(item => item.lane === 'drums');
  const stroke = iconCalls(surface).map(icon => icon.find(call => call.name === 'stroke')).find(call => call.strokeStyle.endsWith(`,${label.level})`));
  assert.ok(stroke, '图标的亮度没有用在线上');
});

test('a lane with no icon of its own, or sharing its group with another lane on screen, keeps its name', () => {
  const odd = draw(oneLane('kazoo'), {laneLabels: 'icon'});
  assert.equal(odd.stats.labels[0].shown, 'text');
  assert.ok(odd.surface.texts().some(item => item.text === '名字-kazoo'));
  // Timbre tracks shown apart: two guitar lanes, both by name; the other lanes by icon.
  const split = draw(fullModel(), {laneLabels: 'icon', mergeTimbres: false}, 10);
  const shown = Object.fromEntries(split.stats.labels.map(item => [item.lane, item.shown]));
  assert.deepEqual(shown, {vocals: 'icon', 'guitar/clean electric guitar': 'text', 'guitar/acoustic guitar': 'text', bass: 'icon', drums: 'icon'});
  const merged = draw(fullModel(), {laneLabels: 'icon'}, 10);
  assert.ok(merged.stats.labels.every(item => item.shown === 'icon'), '合并后吉他只有一条，应当用图标');
});

test("a lane's name is still there to be asked for at its icon", () => {
  const {view, stats} = draw(fullModel(), {laneLabels: 'icon'}, 10);
  for (const label of stats.labels) {
    const answer = view.hit(label.x + label.size / 2, label.y + label.size / 2);
    const lane = view.lanes().find(item => item.id === label.lane);
    assert.equal(answer.kind, 'lane');
    assert.equal(answer.label, lane.label);
  }
});

test('with one lane listened to alone, icons are drawn as the names were: on top of the dimming, at full strength', () => {
  const {surface} = draw(fullModel(), {laneLabels: 'icon', focusGroup: 'bass'}, 10);
  const veil = surface.calls.findIndex(call => call.name === 'fillRect' && /^rgba\(26,29,33,0\.62\)$/.test(call.fillStyle));
  const firstIcon = surface.calls.findIndex(call => call.name === 'quadraticCurveTo');
  assert.ok(veil > 0 && firstIcon > veil, '图标应当画在压暗之后，和文字一样');
  for (const icon of iconCalls(surface)) assert.match(icon.find(call => call.name === 'stroke').strokeStyle, /,1\)$/);
});

// --- the section bar ------------------------------------------------------------

const barModel = () => {
  const model = fullModel();
  // Sections of all widths at 800 px: the bar runs 16..784 over 60 s, 12.8 px a second.
  model.sections = [[0, 10, '主歌 1', 'songformer', 'verse'], [10, 12, '主歌 2', 'songformer', 'verse'],
                    [12, 13.2, '主歌 3', 'songformer', 'verse'], [13.2, 13.7, '主歌 4', 'songformer', 'verse'],
                    [20, 60, '副歌', 'songformer', 'chorus']];
  return model;
};
const barTexts = (surface, height = 400) => surface.texts().filter(item => item.y > height - 45).map(item => item.text);

test('line: a name is written whole or not at all, never cut to half a word', () => {
  const {surface, stats} = draw(barModel(), {sectionStyle: 'line'}, 30);
  const written = barTexts(surface);
  assert.deepEqual(written.slice().sort(), ['主歌 1', '副歌'].sort());
  assert.deepEqual(stats.sectionNames.slice().sort(), written.slice().sort());
  // The block style shortens the same names; the line style never does.
  const block = draw(barModel(), {sectionStyle: 'block'}, 30);
  assert.ok(barTexts(block.surface).includes('主'), '色块样式本来会截成半个词，这条检查失效了');
});

test("line: the current section's name is always written, and a neighbour's name it would run into steps aside", () => {
  for (const at of [11, 12.5, 13.4]) {
    const {surface} = draw(barModel(), {sectionStyle: 'line'}, at);
    const now = barModel().sections.find(section => at >= section[0] && at < section[1])[2];
    const written = surface.texts().filter(item => item.y > 355);
    assert.ok(written.some(item => item.text === now), `${at} 秒正在播的「${now}」没写`);
    const current = written.find(item => item.text === now);
    for (const other of written) {
      if (other === current) continue;
      const end = other.x + other.text.length * 6;
      assert.ok(end + 4 <= current.x || other.x >= current.x + now.length * 6 + 4, `${at} 秒「${other.text}」压到了「${now}」`);
    }
    assert.equal(current.style, 'rgba(255,255,255,0.95)');
  }
  // A short current section whose name runs on over the next one: that one's name steps aside.
  const model = fullModel();
  model.sections = [[0, 10, '主歌 1', 'songformer', 'verse'], [10, 11, '副歌 1', 'songformer', 'chorus'], [11, 30, '主歌 2', 'songformer', 'verse']];
  const {surface} = draw(model, {sectionStyle: 'line'}, 10.5);
  const written = barTexts(surface);
  assert.ok(written.includes('副歌 1'), '正在播的短段没写名字');
  assert.ok(!written.includes('主歌 2'), '下一段的名字压到了正在播的那段');
  const {surface: later} = draw(model, {sectionStyle: 'line'}, 20);
  assert.ok(barTexts(later).includes('主歌 2'), '放得下的名字应当写');
});

test('line: the section being played is a thicker, brighter line; those gone by dimmer than those to come; plain type', () => {
  const {surface} = draw(barModel(), {sectionStyle: 'line'}, 11);
  // Each section is beginPath, moveTo, lineTo, stroke, low on the canvas.
  const c = surface.calls;
  const segs = c.filter((call, i) => call.name === 'stroke' && call.lineCap === 'round' && i > 2 && c[i - 3].name === 'beginPath' &&
    c[i - 2].name === 'moveTo' && c[i - 1].name === 'lineTo' && c[i - 1].args[1] > 340);
  assert.equal(segs.length, 5);
  const alpha = call => Number(/,([\d.]+)\)$/.exec(call.strokeStyle)[1]);
  const [played, current, ...coming] = segs;
  assert.ok(current.lineWidth > played.lineWidth && current.lineWidth > coming[0].lineWidth, '当前段的线没有更粗');
  assert.ok(alpha(current) > alpha(coming[0]) && alpha(coming[0]) > alpha(played), '亮暗不是 当前 > 未到 > 已过');
  for (const item of surface.texts().filter(t => t.y > 355)) assert.match(item.font, /^400 /, '段名用了粗体');
});

test('line: the bar is no taller than the blocks, it can still be touched where it could before, and it leaves no state behind', () => {
  const extent = surface => {
    let low = Infinity, high = -Infinity;
    for (const call of surface.calls) {
      if (!['moveTo', 'lineTo', 'fillText', 'roundRect', 'rect', 'fillRect'].includes(call.name)) continue;
      const y = call.args[call.name === 'fillText' ? 2 : 1];
      // The bar is 363..391 here; the lanes and the play line end above 356.
      if (y < 357) continue;
      const h = ['roundRect', 'rect', 'fillRect'].includes(call.name) ? call.args[3] : 0;
      low = Math.min(low, y - (call.name === 'moveTo' || call.name === 'lineTo' ? 2.5 : 0)); high = Math.max(high, y + h);
    }
    return [low, high];
  };
  const line = draw(barModel(), {sectionStyle: 'line'}, 30), block = draw(barModel(), {sectionStyle: 'block'}, 30);
  const [lineTop, lineBottom] = extent(line.surface), [blockTop, blockBottom] = extent(block.surface);
  assert.ok(lineTop >= blockTop - 0.01 && lineBottom <= blockBottom + 0.01, `细线占了 ${lineTop}–${lineBottom}，色块 ${blockTop}–${blockBottom}`);
  for (const x of [20, 100, 160, 400, 700, 783]) {
    for (const y of [360, 370, 377, 390, 398]) assert.deepEqual(line.view.hit(x, y), block.view.hit(x, y), `(${x}, ${y}) 点到的不一样`);
  }
  // Drawn in line, then switched to block: the same frame as a view that only ever drew blocks.
  const surface = mockCanvas(800, 400);
  const switched = ScoreView.create(surface.canvas, barModel(), () => 0, {effects: 'off', sectionStyle: 'line'});
  switched.draw(30);
  switched.setOptions({sectionStyle: 'block'});
  surface.reset();
  switched.draw(30);
  // Compared with a view that drew blocks once before (any view's first frame starts from a fresh canvas).
  const {surface: fresh, view: blocks} = draw(barModel(), {sectionStyle: 'block'}, 30);
  fresh.reset();
  blocks.draw(30);
  // Each call with the state it uses (a call also carries whatever state the frame before left set).
  const style = value => (value && typeof value === 'object' ? {line: value.line, circles: value.circles, stops: value.stops} : value);
  const uses = call => ({name: call.name, args: call.args, alpha: call.alpha, composite: call.composite,
    fill: /^fill/.test(call.name) ? style(call.fillStyle) : null, font: call.name === 'fillText' ? call.font : null,
    stroke: /^stroke/.test(call.name) ? [call.strokeStyle, call.lineWidth, call.lineCap] : null});
  assert.deepEqual(surface.calls.map(uses), fresh.calls.map(uses), '从细线切回色块后画面不一样（细线留下了画布状态）');
});

test('the two new options take only their own values', () => {
  const {view} = draw(fullModel(), {});
  view.setOptions({laneLabels: 'emoji', sectionStyle: 'dots'});
  assert.deepEqual([view.options().laneLabels, view.options().sectionStyle], [ScoreView.DEFAULTS.laneLabels, ScoreView.DEFAULTS.sectionStyle]);
  view.setOptions({laneLabels: 'icon', sectionStyle: 'line'});
  assert.deepEqual([view.options().laneLabels, view.options().sectionStyle], ['icon', 'line']);
});
