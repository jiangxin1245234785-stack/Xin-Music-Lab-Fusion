const assert = require('node:assert/strict');
const test = require('node:test');
const flag = require('../score-flag.js');

const song = {
  track: {title: 'Workshop test', duration: 30},
  lanes: [
    {id: 'violin', group: 'strings', kind: 'pitched', notes: [[5, 4, 72, 95], [18, .5, 69, 90]]},
    {id: 'flute', group: 'winds', kind: 'pitched', notes: [[9, 1, 79, 80]]},
    {id: 'kit', group: 'drums', kind: 'drums', rows: ['kick', 'snare'], hits: [[7, 0, 100], [9, 1, 110]]},
    {id: 'texture', group: 'other', kind: 'texture', level: {hop: 1, db: [-17]}}
  ],
  levels: {hop: 1, groups: {strings: Array.from({length: 30}, (_, i) => i >= 5 && i < 9 ? -17 : -80)}}
};
const frameAt = (time, extra) => ({song, w: 1920, h: 1080, time, ...extra});
const getViolin = detail => detail.notes.find(note => note.id === 'violin:0');

test('a held note feeds through the fixed needle and freezes at the same score time', () => {
  const first = flag.inspect(frameAt(4)).detail;
  const playingFrame = frameAt(7, {playing: true});
  const playing = flag.inspect(playingFrame).detail;
  const stopped = flag.inspect(frameAt(7, {playing: false})).detail;
  const later = flag.inspect(frameAt(10)).detail;
  const joined = flag.inspect(frameAt(14)).detail;
  const seeked = flag.inspect(frameAt(7)).detail;
  assert.equal(playing.playheadX, 1252);
  assert.deepEqual(stopped, playing);
  assert.deepEqual(seeked, playing);
  assert.equal(getViolin(first).stage, 'loose');
  assert.equal(getViolin(playing).stage, 'at-needle');
  assert.equal(getViolin(later).stage, 'strip');
  assert.equal(getViolin(joined).stage, 'flag');
  assert.equal(getViolin(playing).progress, .5);
  assert.equal(getViolin(playing).wovenThrough, 7);
  assert.equal(getViolin(later).x0, getViolin(playing).x0 - 3 * playing.pxPerSecond);
  assert.equal(getViolin(later).x1, getViolin(playing).x1 - 3 * playing.pxPerSecond);
  const needle = playing.active.find(note => note.lane === 'violin');
  assert.equal(needle.x, playing.playheadX);
  assert.equal(flag.noteAt(needle.x, needle.y, playingFrame).id, 'violin:0');
  assert.equal(flag.timeAt(needle.x, needle.y, playingFrame), 7);
});

test('the workbench accommodates source groups and real rests', () => {
  const hit = flag.inspect(frameAt(7)).detail;
  assert.deepEqual(hit.bands.map(b => [b.key,b.basis]), [['strings','stems'],['winds','score'],['drums','score']]);
  assert.equal(hit.active.find(note => note.lane === 'kit').pitch, 36);
  const rest = flag.inspect(frameAt(15)).detail;
  assert.equal(rest.active.length, 0);
  assert.ok(rest.notes.every(note => note.start > rest.time || note.end <= rest.time));
  assert.deepEqual(flag.inspect(frameAt(30)).detail.active, []);
  assert.deepEqual(flag.inspect(frameAt(0)).detail.active, []);
  assert.ok(flag.inspect(frameAt(7,{hidden:['strings']})).detail.active.every(note => note.group !== 'strings'));
});

test('portrait geometry keeps the complete workspace and a valid time scale', () => {
  const frame = frameAt(7,{w:540,h:960});
  const detail = flag.inspect(frame).detail;
  const note = detail.active.find(note => note.lane === 'violin');
  assert.ok(detail.left >= 0 && detail.right <= frame.w);
  assert.ok(detail.top >= 0 && detail.bottom <= frame.h);
  assert.equal(detail.active.length, 2);
  assert.equal(note.x, detail.playheadX);
  assert.equal(flag.timeAt(note.x,note.y,frame), 7);
  assert.equal(flag.timeAt(note.x,frame.h,frame), null);
});

test('recorded groups can supply cloth width without supplying a fabricated stitch', () => {
  const model = {
    ...song,
    lanes: [...song.lanes.filter(lane => lane.group !== 'strings'),
      {id: 'vocal-level', group: 'vocals', kind: 'texture', level: {hop: 1, db: [-20]}}],
    levels: {hop: 1, groups: {...song.levels.groups, other: Array(30).fill(-15)}}
  };
  const detail = flag.inspect(frameAt(7,{song:model})).detail;
  assert.deepEqual(detail.bands.map(b => b.key), ['vocals','strings','winds','drums']);
  const strings = detail.bands.find(b => b.key === 'strings');
  assert.equal(strings.basis, 'stems');
  assert.ok(strings.stations[1].activity > .85);
  assert.ok(detail.notes.every(note => !['strings','vocals','other'].includes(note.group)));
});
