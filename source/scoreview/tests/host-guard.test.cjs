'use strict';
// What the hosts may turn on. Since work/xml-round-20261115/SPEC-B4.md the user's pick from gate15 is on in XML:
// XML's score scene and its video export may pass `showShapes` and `shapeSet`, and the set is only ever 'spindle'
// (struck / plucked notes with a head, strings as a spindle). Each of the two names may appear there only in the
// exact forms below, so a stray `showShapes: true` or another set anywhere else in those files is caught. The video
// engine's own look (export-main / export-render) still turns on nothing: the shapes reach a video only through
// what XML passes. No host passes `shapeLinks`, `pitchWeight`, `coverAdapt`, `textureAdapt` or `showRoles`; the
// core keeps them off. Read-only source guard; it reads the hosts' files and changes nothing. Each path can be
// pointed at a copy (SCOREVIEW_GUARD_*), which is how tests/mutations.cjs checks that this test notices the word put in.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..', '..', '..');
// [name, file, the only forms in which showShapes / shapeSet may appear there, each exactly once]
const HOSTS = [
  ['XML 谱面场景', process.env.SCOREVIEW_GUARD_SCENE || path.join(REPO, 'source', 'fusion-runtime-baseline', 'score-scene.js'),
    ["{showShapes: true, shapeSet: 'spindle'}", '{showShapes: false}']],
  ['XML 导出的 IPC', process.env.SCOREVIEW_GUARD_EXPORT_IPC || path.join(REPO, 'source', 'fusion-runtime-baseline', 'desktop', 'score-export-ipc.cjs'),
    ["look.showShapes = true; look.shapeSet = 'spindle';"]],
  ['导出引擎的缺省样子', process.env.SCOREVIEW_GUARD_EXPORT_MAIN || path.join(REPO, 'source', 'scoreview', 'export', 'export-main.cjs'), []],
  ['导出引擎的绘制页', process.env.SCOREVIEW_GUARD_EXPORT_RENDER || path.join(REPO, 'source', 'scoreview', 'export', 'export-render.js'), []]
];
const NEVER = ['showRoles', 'shapeLinks', 'pitchWeight', 'coverAdapt', 'textureAdapt'];
const SHAPE_NAMES = ['showShapes', 'shapeSet'];

test('no host passes showRoles, shapeLinks, pitchWeight, coverAdapt or textureAdapt', () => {
  for (const [name, file] of HOSTS) {
    assert.ok(fs.existsSync(file), `${name}：${file} 不在，这条守卫读不到`);
    const text = fs.readFileSync(file, 'utf8');
    for (const option of NEVER) assert.ok(!new RegExp(option).test(text), `${name}（${path.basename(file)}）里出现了 ${option}：XML 和导出都不开它`);
  }
});

test("XML's scene and export pass showShapes / shapeSet only in their allowed forms, and the set only as 'spindle'", () => {
  for (const [name, file, allowed] of HOSTS) {
    let text = fs.readFileSync(file, 'utf8');
    for (const form of allowed) {
      const count = text.split(form).length - 1;
      assert.equal(count, 1, `${name}（${path.basename(file)}）里「${form}」应当正好出现一次，现在 ${count} 次`);
      text = text.split(form).join('');
    }
    for (const option of SHAPE_NAMES) assert.ok(!new RegExp(option).test(text), `${name}（${path.basename(file)}）里在允许的写法之外出现了 ${option}`);
  }
  // Any set named in the hosts is the spindle.
  for (const [name, file] of HOSTS.slice(0, 2)) {
    const sets = fs.readFileSync(file, 'utf8').match(/shapeSet\s*[:=]\s*['"][^'"]*['"]/g) || [];
    for (const set of sets) assert.match(set, /'spindle'$/, `${name} 里的 shapeSet 只能是 'spindle'：${set}`);
  }
});

test('the guard reads the files that really build the options', () => {
  // The scene's options and the export's look are there, and the shapes go into them.
  const scene = fs.readFileSync(HOSTS[0][1], 'utf8');
  assert.match(scene, /showTexture: true/);
  assert.match(scene, /showTexture: true,\.\.\.shapeOptions\(shapes\),/);
  assert.match(fs.readFileSync(HOSTS[1][1], 'utf8'), /look\.showTexture = true/);
  assert.match(fs.readFileSync(HOSTS[2][1], 'utf8'), /const LOOK = Object\.freeze\(/);
});
