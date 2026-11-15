'use strict';
// Stage A5: the backdrop (section colour, loudness) and lane heights that follow each stem's loudness.
const test = require('node:test');
const assert = require('node:assert/strict');
const {ScoreView, mockCanvas, fullModel, lanesOnly, BENCH} = require('./helpers.cjs');

const view = (model, options, size = [800, 400]) => {
  const surface = mockCanvas(...size);
  return {surface, view: ScoreView.create(surface.canvas, model, () => 0, {...BENCH, ...options})};
};
const sum = values => Object.values(values).reduce((total, value) => total + value, 0);

// Quiet for the first half minute, loud for the second.
function twoLevels() {
  const model = fullModel();
  model.energy = {hop: 0.1, db: Array.from({length: 600}, (_, i) => (i < 300 ? -30 : -10))};
  return model;
}
// 引子 (0..21): the guitar is loud and the bass silent. 主歌 1 (21..45): the other way round.
function swapping() {
  const model = fullModel();
  const row = (first, second) => Array.from({length: 60}, (_, i) => (i < 21 ? first : second));
  model.levels = {hop: 1, groups: {vocals: row(-20, -20), guitar: row(-10, -90), bass: row(-90, -10), drums: row(-20, -20)}};
  return model;
}
const GUITAR = 'guitar/clean electric guitar';

/* --- backdrop -------------------------------------------------------------- */

test('the backdrop takes the colour of the section being played', () => {
  const {view: lit} = view(fullModel());
  const intro = lit.draw(10).backdrop, verse = lit.draw(30).backdrop, again = lit.draw(55).backdrop;
  assert.ok(intro && verse && intro.strength > 0);
  assert.notDeepEqual(intro.colour, verse.colour);
  assert.deepEqual(verse.colour, again.colour, '两段主歌应当是同一个底色');
});

test('the colour turns slowly across a section boundary instead of snapping', () => {
  const {view: lit} = view(fullModel());
  const before = lit.draw(19).backdrop.colour, after = lit.draw(23).backdrop.colour, on = lit.draw(21).backdrop.colour;
  on.forEach((channel, i) => assert.ok(channel >= Math.min(before[i], after[i]) && channel <= Math.max(before[i], after[i])));
  assert.notDeepEqual(on, before);
  assert.notDeepEqual(on, after);
  let last = before;
  for (let time = 19; time <= 23; time += 0.25) {
    const colour = lit.draw(time).backdrop.colour;
    colour.forEach((channel, i) => assert.ok(Math.abs(channel - last[i]) <= 60, `${time} 秒处底色跳了 ${Math.abs(channel - last[i])}`));
    last = colour;
  }
});

test('between sections the backdrop fades away', () => {
  const {view: lit} = view(fullModel());
  assert.equal(lit.draw(47.5).backdrop.strength, 0);
  assert.ok(lit.draw(45.3).backdrop.strength > 0 && lit.draw(45.3).backdrop.strength < lit.draw(40).backdrop.strength);
});

test('the backdrop is brighter where the song is louder, by the song\'s own quiet and loud', () => {
  const {view: lit} = view(twoLevels());
  const quiet = lit.draw(10).backdrop, loud = lit.draw(55).backdrop;
  assert.ok(quiet.level < 0.05 && loud.level > 0.95, `${quiet.level} / ${loud.level}`);
  assert.ok(loud.strength > quiet.strength * 2);
  const ramp = [28, 29.5, 30, 30.5, 32].map(time => lit.draw(time).backdrop.level);
  assert.ok(ramp.every((value, i) => i === 0 || value >= ramp[i - 1]) && ramp[2] > 0.2 && ramp[2] < 0.8, `响度应当平滑地升上去：${ramp}`);
});

test('a song with loudness but no sections still breathes; a song with neither has no backdrop', () => {
  const model = twoLevels();
  delete model.sections;
  const {view: lit} = view(model);
  const frame = lit.draw(55).backdrop;
  assert.ok(frame.strength > 0.2);
  assert.deepEqual(frame.colour, [128, 146, 200]);
  assert.equal(view(lanesOnly()).view.draw(10).backdrop, null);
});

test('the backdrop can be switched off', () => {
  const {view: lit} = view(fullModel(), {showBackdrop: false});
  assert.equal(lit.draw(10).backdrop, null);
  lit.setOptions({showBackdrop: true});
  assert.ok(lit.draw(10).backdrop);
});

/* --- lane heights ------------------------------------------------------------ */

test('fixed lane heights do not move, whatever the stems are doing', () => {
  const {view: still} = view(swapping());
  assert.deepEqual(still.draw(10).heights, still.draw(30).heights);
  assert.deepEqual(still.draw(10).heights, view(fullModel()).view.draw(10).heights, '固定轨高不应当受响度数据影响');
});

test('with loudness, a loud stem gets more of the screen and a silent one keeps a thin strip', () => {
  const fixed = view(swapping()).view.draw(10).heights;
  const {view: moving} = view(swapping(), {laneHeights: 'loudness'});
  const intro = moving.draw(10).heights, verse = moving.draw(30).heights;
  assert.ok(intro[GUITAR] > fixed[GUITAR] * 1.2 && intro.bass < fixed.bass * 0.5, JSON.stringify(intro));
  assert.ok(intro.bass > 4, `静音的轨只剩 ${intro.bass} 像素`);
  assert.ok(verse.bass > fixed.bass * 1.2 && verse[GUITAR] < fixed[GUITAR] * 0.5, '下一段应当反过来');
  assert.ok(Math.abs(sum(intro) - sum(fixed)) < 0.5 && Math.abs(sum(verse) - sum(fixed)) < 0.5, '各轨加起来的高度不应当变');
});

test('lane heights glide across a section boundary and hold still inside a section', () => {
  const {view: moving} = view(swapping(), {laneHeights: 'loudness'});
  assert.deepEqual(moving.draw(5).heights, moving.draw(15).heights, '段落里面不应当动');
  const before = moving.draw(19).heights.bass, after = moving.draw(23).heights.bass, on = moving.draw(21).heights.bass;
  assert.ok(on > before + 3 && on < after - 3, `交界处应当在两者之间：${before} / ${on} / ${after}`);
  let last = moving.draw(19.5).heights.bass, biggest = 0;
  for (let time = 19.5; time <= 22.5; time += 1 / 60) {
    const now = moving.draw(time).heights.bass;
    biggest = Math.max(biggest, Math.abs(now - last));
    last = now;
  }
  assert.ok(biggest < 1.5, `一帧之内轨高跳了 ${biggest.toFixed(2)} 像素`);
});

test('a hidden lane takes no share: the lanes on screen divide the screen among themselves', () => {
  const {view: moving} = view(swapping(), {laneHeights: 'loudness', hidden: [GUITAR, 'guitar/acoustic guitar']});
  const heights = moving.draw(10).heights;
  assert.ok(!(GUITAR in heights));
  assert.ok(heights.vocals > heights.bass * 2, '吉他藏起来之后，人声和鼓应当分到它让出来的地方');
  // With the loud guitar gone, voice and drums are each about half of what is on screen:
  // they must come out taller than their fixed height, not be measured against a stem nobody sees.
  const fixed = view(swapping(), {hidden: [GUITAR, 'guitar/acoustic guitar']}).view.draw(10).heights;
  assert.ok(heights.vocals > fixed.vocals * 1.05 && heights.drums > fixed.drums * 1.05, JSON.stringify([heights, fixed]));
  // Against the silent bass they stand four to one (the square root of an equal half share
  // of three lanes, over the floor); counted against the hidden guitar it would be under two.
  assert.ok(heights.vocals / heights.bass > 3 * fixed.vocals / fixed.bass, `${heights.vocals / heights.bass} 对 ${fixed.vocals / fixed.bass}`);
});

test('notes stay inside their lane as it grows and shrinks', () => {
  const {view: moving, surface} = view(swapping(), {laneHeights: 'loudness'});
  for (const time of [10, 20.6, 21, 21.4, 30]) {
    surface.reset();
    const frame = moving.draw(time);
    const notes = surface.bars().filter(item => item.height <= 8 && item.y < 360);
    const top = Math.min(...notes.map(item => item.y)), bottom = Math.max(...notes.map(item => item.y + item.height));
    assert.ok(bottom - top <= sum(frame.heights) + 5 * 14 + 16, `${time} 秒处音符画出了轨的范围`);
  }
});

test('without stem levels, or with every stem silent, "loudness" is the same as fixed', () => {
  const none = fullModel();
  delete none.levels;
  assert.deepEqual(view(none, {laneHeights: 'loudness'}).view.draw(10).heights, view(none).view.draw(10).heights);
  assert.equal(ScoreView.inspect(none).levels, false);
  const silent = fullModel();
  for (const group of Object.keys(silent.levels.groups)) silent.levels.groups[group] = Array(60).fill(-200);
  assert.deepEqual(view(silent, {laneHeights: 'loudness'}).view.draw(10).heights, view(silent).view.draw(10).heights);
  for (const broken of [{hop: 0, groups: {}}, {hop: 1, groups: 'x'}, 'x', {hop: 1, groups: {bass: 'x'}}]) {
    const model = fullModel();
    model.levels = broken;
    assert.doesNotThrow(() => view(model, {laneHeights: 'loudness'}).view.draw(10));
  }
});

test('a song with no sections settles its lane heights in ten-second windows', () => {
  const model = swapping();
  delete model.sections;
  const {view: moving} = view(model, {laneHeights: 'loudness'});
  assert.deepEqual(moving.draw(2).heights, moving.draw(8).heights);
  assert.ok(moving.draw(35).heights.bass > moving.draw(5).heights.bass * 2);
});

/* --- album cover ------------------------------------------------------------- */

const picture = (width, height) => ({width, height});
const covers = surface => surface.calls.filter(call => call.name === 'drawImage');

test('the album cover is drawn only when asked for and only when there is a picture', () => {
  const {view: lit, surface} = view(twoLevels());
  assert.equal(lit.setCover(picture(600, 600)), true);
  lit.draw(10);
  assert.equal(covers(surface).length, 0, '没选封面背景时不应当画封面');
  assert.equal(lit.draw(10).backdrop.cover, 0);
  lit.setOptions({backdrop: 'cover'});
  surface.reset();
  assert.ok(lit.draw(10).backdrop.cover > 0);
  assert.equal(covers(surface).length, 1);
  lit.setCover(null);
  surface.reset();
  const plain = lit.draw(10).backdrop;
  assert.equal(covers(surface).length, 0);
  assert.equal(plain.cover, 0);
  assert.equal(plain.strength, view(twoLevels()).view.draw(10).backdrop.strength, '没有封面就是原来的段落色');
  lit.setCover(picture(600, 600));
  lit.setOptions({showBackdrop: false});
  surface.reset();
  assert.equal(lit.draw(10).backdrop, null);
  assert.equal(covers(surface).length, 0);
});

test('the cover fills the canvas, centred, cropped rather than stretched', () => {
  for (const [canvas, image] of [[[800, 400], [600, 600]], [[340, 460], [600, 600]], [[800, 400], [1600, 400]], [[400, 400], [300, 900]]]) {
    const {view: lit, surface} = view(fullModel(), {backdrop: 'cover'}, canvas);
    lit.setCover(picture(...image));
    surface.reset();
    lit.draw(10);
    const [, x, y, wide, tall] = covers(surface)[0].args;
    assert.ok(x <= 0.01 && y <= 0.01 && x + wide >= canvas[0] - 0.01 && y + tall >= canvas[1] - 0.01, `没铺满：${[x, y, wide, tall]}`);
    assert.ok(Math.abs(wide / tall - image[0] / image[1]) < 1e-6, '封面的宽高比变了');
    assert.ok(Math.abs(x + wide / 2 - canvas[0] / 2) < 0.01 && Math.abs(y + tall / 2 - canvas[1] / 2) < 0.01, '封面没有居中');
    assert.ok(Math.abs(wide - canvas[0]) < 0.01 || Math.abs(tall - canvas[1]) < 0.01, '封面放得比需要的大');
  }
});

test('the cover is faded: brighter where the song is louder, never more than a third of itself', () => {
  const {view: lit, surface} = view(twoLevels(), {backdrop: 'cover'});
  lit.setCover(picture(600, 600));
  const quiet = lit.draw(10).backdrop.cover;
  surface.reset();
  const loud = lit.draw(55).backdrop.cover;
  assert.ok(quiet >= 0.1 && loud > quiet * 1.8 && loud <= 0.35, `${quiet} / ${loud}`);
  assert.equal(covers(surface)[0].alpha, loud, '封面应当按这个透明度画上去');
  assert.equal(surface.canvas.getContext().globalAlpha, 1, '画完封面要把透明度还回去');
});

test('on top of the cover the section wash is lighter, and the cover stays between sections', () => {
  const alone = view(fullModel()).view.draw(10).backdrop.strength;
  const {view: lit, surface} = view(fullModel(), {backdrop: 'cover'});
  lit.setCover(picture(600, 600));
  const over = lit.draw(10).backdrop.strength;
  assert.ok(over < alone * 0.7 && over > 0, `${over} / ${alone}`);
  surface.reset();
  const gap = lit.draw(47.5).backdrop;
  assert.equal(gap.strength, 0);
  assert.ok(gap.cover > 0 && covers(surface).length === 1);
});

test('a song with nothing but lanes can still have a cover behind it', () => {
  const {view: lit, surface} = view(lanesOnly(), {backdrop: 'cover'});
  assert.equal(lit.draw(10).backdrop, null);
  lit.setCover(picture(600, 600));
  surface.reset();
  assert.ok(lit.draw(10).backdrop.cover > 0);
  assert.equal(covers(surface).length, 1);
});

test('something that is not a picture is refused, and a model says whether it carries a cover', () => {
  const {view: lit, surface} = view(fullModel(), {backdrop: 'cover'});
  for (const bad of [undefined, 'x', {}, {width: 0, height: 10}, {width: NaN, height: 10}, {width: 10}]) {
    assert.equal(lit.setCover(bad), false);
    surface.reset();
    assert.doesNotThrow(() => lit.draw(10));
    assert.equal(covers(surface).length, 0);
  }
  assert.equal(lit.setCover({naturalWidth: 300, naturalHeight: 200, width: 0, height: 0}), true, '还没排版的 <img> 用它本来的尺寸');
  assert.equal(ScoreView.inspect(fullModel()).cover, true);
  const none = fullModel();
  delete none.cover;
  assert.equal(ScoreView.inspect(none).cover, false);
  for (const broken of ['x', {}, {src: ''}, {src: 5}]) assert.equal(ScoreView.inspect({...fullModel(), cover: broken}).cover, false);
});

const veils = surface => surface.calls.filter(call => call.name === 'fillRect' && call.fillStyle && call.fillStyle.stops && call.fillStyle.line[0] === call.fillStyle.line[2]);
const alphaOf = colour => Number(/,([\d.]+)\)$/.exec(colour)[1]);

test('behind the notes the cover is held back, with soft edges, and the header keeps it whole', () => {
  for (const options of [{}, {laneHeights: 'loudness'}]) {
    const {view: lit, surface} = view(swapping(), {backdrop: 'cover', ...options});
    lit.setCover(picture(600, 600));
    surface.reset();
    const frame = lit.draw(10);
    assert.ok(frame.backdrop.behindNotes < frame.backdrop.cover * 0.6 && frame.backdrop.behindNotes > 0, JSON.stringify(frame.backdrop));
    const [veil] = veils(surface);
    assert.ok(veil && veils(surface).length === 1);
    const [, y, wide, tall] = veil.args, stops = veil.fillStyle.stops;
    assert.equal(wide, 800);
    const notes = surface.bars().filter(item => item.height <= 8 && item.y < 360);
    const top = Math.min(...notes.map(item => item.y)), bottom = Math.max(...notes.map(item => item.y + item.height));
    const full = [y + stops[1][0] * tall, y + stops[2][0] * tall];
    assert.ok(full[0] <= top + 2 && full[1] >= bottom - 2, `压暗的部分 ${full} 没盖住音符 ${[top, bottom]}`);
    assert.ok(y > 40, '压暗不应当伸到曲名那里');
    assert.equal(alphaOf(stops[0][1]), 0);
    assert.equal(alphaOf(stops[3][1]), 0);
    assert.ok(alphaOf(stops[1][1]) >= 0.4 && alphaOf(stops[1][1]) === alphaOf(stops[2][1]));
    assert.ok(stops.every((stop, i) => stop[0] >= 0 && stop[0] <= 1 && (i === 0 || stop[0] >= stops[i - 1][0])), JSON.stringify(stops));
    assert.ok(full[0] - y >= 10 && y + tall - full[1] >= 10, '边缘应当是渐变的');
  }
});

test('without a cover on screen nothing is held back', () => {
  const {view: lit, surface} = view(swapping());
  lit.setCover(picture(600, 600));
  lit.draw(10);
  assert.equal(veils(surface).length, 0);
  lit.setOptions({backdrop: 'cover'});
  lit.setCover(null);
  surface.reset();
  lit.draw(10);
  assert.equal(veils(surface).length, 0);
});
