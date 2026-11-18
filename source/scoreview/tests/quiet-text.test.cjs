'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {ScoreView, mockCanvas, fullModel} = require('./helpers.cjs');

function listener(options = {}) {
  const surface = mockCanvas(960, 600);
  const model = fullModel();
  model.track = {...model.track, title: 'A quiet song', artist: 'Test Artist', album: 'Test Album'};
  model.sections = [[0, 12, 'Intro', 'songformer', 'intro'], [12, 45, 'Verse', 'songformer', 'verse']];
  model.chords = [[0, 16, 'Fm7', 1], [24, 60, 'Eb', 1]];
  model.chordTones = {Fm7: [5, 8, 0, 3], Eb: [3, 7, 10]};
  model.captions = [[18, 26, '吉他 · 进入', 'rule', {object: 'guitar', word: 'enter', at: 22, preview: false}]];
  const view = ScoreView.create(surface.canvas, model, () => 0, options);
  function frame(at) {
    surface.reset();
    const stats = view.draw(at);
    return {stats, calls: JSON.stringify(surface.calls), words: surface.texts().map(c => c.text)};
  }
  return {view, frame};
}

test('quietText stays optional; turning it off restores the original frame', () => {
  assert.equal(ScoreView.DEFAULTS.quietText, false);
  const normal = listener(), quiet = listener({quietText: true});
  normal.frame(13);
  const before = normal.frame(13);
  assert.ok(before.words.some(word => word.includes('TEST ALBUM')));
  assert.ok(!quiet.frame(13).words.some(word => word.includes('TEST ALBUM')));
  quiet.view.setOptions({quietText: false});
  quiet.frame(13);
  assert.equal(quiet.frame(13).calls, before.calls);
});

test('quiet title, chord gaps and section hints follow song time; lanes and sections stay interactive', () => {
  const {view, frame} = listener({quietText: true, loop: [12,45]});
  const at = frame(13);
  assert.ok(at.words.includes('A quiet song') && at.words.includes('Fm7'));
  assert.equal(at.stats.sectionHint.name, 'Verse');
  assert.deepEqual(at.stats.loop, [12,45]);
  const later = frame(19);
  assert.equal(later.stats.section, 'Verse');
  assert.equal(later.stats.sectionHint, undefined);
  assert.equal(later.stats.chord, null);
  assert.equal(later.stats.caption, null, 'an unexpected entrance must not be previewed');
  assert.ok(frame(22.2).words.includes('吉他 · 进入'));
  assert.deepEqual(frame(13).stats.sectionHint, at.stats.sectionHint, 'seek returns to the same hint');
  const under = view.hit(400, 580);
  assert.equal(under.kind, 'section');
  assert.equal(under.name, 'Verse');
  assert.equal(under.time, 12);
  assert.equal(under.end, 45);
  const groups = new Set();
  for (let y = 0; y < 580; y++) {
    const hit = view.hit(30,y);
    if (hit?.kind === 'lane') groups.add(hit.group);
  }
  assert.ok(groups.has('vocals') && groups.has('guitar') && groups.has('drums'));
});

test('album window keeps the current section and chord on the score, and hands captions to the shell', () => {
  const {view, frame} = listener({quietText: true});
  frame(13);
  const before = frame(13);
  view.setOptions({albumLayout: true});
  const album = frame(13);
  assert.ok(album.words.includes('Verse') && album.words.includes('Fm7'));
  assert.ok(!album.words.includes('A quiet song'));
  const cue = frame(22.2);
  assert.ok(cue.words.includes('Verse'));
  assert.equal(cue.stats.caption, '吉他 · 进入');
  assert.ok(!cue.words.includes(cue.stats.caption));
  assert.equal(view.hit(400, 580).kind, 'section');
  view.setOptions({albumLayout: false});
  frame(13);
  assert.equal(frame(13).calls, before.calls);
});

test('quiet chords grow independently of the title and fit the reserved right column at both breakpoints', () => {
  const longChord = 'C♯maj13(add9)/G♯'.repeat(5);
  for (const [width, titlePx, chordPx, margin] of [[360,12,15,10], [519,12,15,10], [520,14,18,16], [946,14,18,16]]) {
    const surface = mockCanvas(width, 390), ctx = surface.canvas.getContext('2d');
    // Give the recorder a font-sensitive ruler so enlargement must still pass the fit check.
    ctx.measureText = text => ({width: Array.from(text).length * Number(/([\d.]+)px/.exec(ctx.font)[1]) * 0.55});
    const model = fullModel();
    model.track.title = 'Title';
    model.chords = [[0,20,'Cm',1], [24,45,longChord,1]];
    const view = ScoreView.create(surface.canvas, model, () => 0, {quietText: true});
    view.draw(10);
    const title = surface.texts().find(c => c.text === 'Title');
    const short = surface.texts().find(c => c.text === 'Cm');
    assert.ok(title.font.startsWith('500 ' + titlePx + 'px '));
    assert.ok(short.font.startsWith('550 ' + chordPx + 'px '));
    assert.equal(short.y, title.y);
    assert.equal(short.x, width - margin);
    surface.reset(); view.draw(30);
    const fitted = surface.texts().find(c => c.font === short.font);
    assert.ok(fitted.text.endsWith('…') && longChord.startsWith(fitted.text.slice(0,-1)));
    assert.ok(Array.from(fitted.text).length * chordPx * .55 <= width * .33 - margin);
    surface.reset(); view.draw(22);
    assert.ok(!surface.texts().some(c => c.font === short.font));
  }
});
