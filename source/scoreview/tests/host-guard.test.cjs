'use strict';
// XML's score scene and the video export turn on neither the lead / accompaniment drawing (work/score-roles-20261114)
// nor the instrument shapes (work/score-shapes-20261114): they never pass `showRoles` or `showShapes`, so the core keeps its default (off). Read-only
// source guard; it reads the hosts' files and changes nothing. Each path can be pointed at a copy
// (SCOREVIEW_GUARD_*), which is how tests/mutations.cjs checks that this test notices the word put in.
// When the user decides to turn it on, this test is the one to change.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..', '..', '..');
const HOSTS = [
  ['XML 谱面场景', process.env.SCOREVIEW_GUARD_SCENE || path.join(REPO, 'source', 'fusion-runtime-baseline', 'score-scene.js')],
  ['XML 导出的 IPC', process.env.SCOREVIEW_GUARD_EXPORT_IPC || path.join(REPO, 'source', 'fusion-runtime-baseline', 'desktop', 'score-export-ipc.cjs')],
  ['导出引擎的缺省样子', process.env.SCOREVIEW_GUARD_EXPORT_MAIN || path.join(REPO, 'source', 'scoreview', 'export', 'export-main.cjs')],
  ['导出引擎的绘制页', process.env.SCOREVIEW_GUARD_EXPORT_RENDER || path.join(REPO, 'source', 'scoreview', 'export', 'export-render.js')]
];

test('XML and the video export pass neither showRoles nor showShapes: both drawings stay off there', () => {
  for (const [name, file] of HOSTS) {
    assert.ok(fs.existsSync(file), `${name}：${file} 不在，这条守卫读不到`);
    const text = fs.readFileSync(file, 'utf8');
    for (const option of ['showRoles', 'showShapes', 'shapeSet', 'shapeLinks', 'pitchWeight']) assert.ok(!new RegExp(option).test(text), `${name}（${path.basename(file)}）里出现了 ${option}：XML 和导出都不开它`);
  }
  // The guard reads the files that really build the options: the scene's options and the export's look are there.
  assert.match(fs.readFileSync(HOSTS[0][1], 'utf8'), /showTexture: true/);
  assert.match(fs.readFileSync(HOSTS[1][1], 'utf8'), /look\.showTexture = true/);
  assert.match(fs.readFileSync(HOSTS[2][1], 'utf8'), /const LOOK = Object\.freeze\(/);
});
