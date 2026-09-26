'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('app.js');
const html = read('index.html');
const css = read('style.css');
const main = read('desktop/main.cjs');
const preload = read('desktop/preload.cjs');
const core = read('core/analysis-service.cjs');

for (const id of [
  'deleteAnalysisButton', 'deleteAllAnalysisButton', 'exportMusicLabButton',
  'tagStart', 'tagEnd', 'tagLabel', 'tagNote', 'saveTagButton', 'manualTagList',
  'labEyebrow', 'labTitle', 'labNote', 'harmonyPolicy'
]) {
  assert(html.includes(`id="${id}"`), `missing UI element ${id}`);
  assert(app.includes(`'${id}'`), `missing DOM binding ${id}`);
}

for (const api of [
  'deleteAnalysisResult', 'loadAnnotations', 'saveAnnotation',
  'deleteAnnotation', 'getMusicLabManifest', 'exportMusicLabManifest'
]) assert(preload.includes(`${api}:`), `missing preload API ${api}`);

assert(!preload.includes('webFrame'), 'font control must not zoom the Electron viewport');
assert(!app.includes('setZoomFactor'), 'renderer must use typography scaling only');
assert(css.includes('--font-scale'), 'font scale CSS variable is missing');
assert(app.includes('function nextUncoveredRange'), 'long-track coverage detection is missing');
assert(app.includes('AI_MIN_RANGE_SECONDS = 15'), 'one-second SongFormer tail guard is missing');
assert(app.includes("setSegmentStatus('runtime.segment.success'"), 'segment task must visibly leave the running state');
assert(main.includes("contract: 'xld.music-lab/2'"), 'Music Lab harmony contract is missing');
// The ids have one definition now (core/result-engines.cjs); these two used to carry their own copy.
assert(main.includes("require('../core/result-engines.cjs')"), 'main must take the engine ids from the registry');
assert(core.includes("require('./result-engines.cjs')"), 'the service must take the engine ids from the registry');
assert(core.includes("'features-harmony'"), 'shared harmony feature cache is missing');
assert(main.includes('harmony: harmonyAnalyses.map(normalizeTimeline)'), 'Music Lab harmony lane export is missing');
assert(app.includes("activeLab: 'section'"), 'lab isolation state is missing');
assert(app.includes("'harmony-all'"), 'lab-scoped deletion is missing');
assert(html.includes('data-lab="harmony"'), 'Harmony Lab switcher is missing');
assert(fs.existsSync(path.join(__dirname, '..', 'analysis-harmony', 'harmony_runner.py')), 'Harmony runner must ship with the source tree');
assert(fs.existsSync(path.join(__dirname, '..', 'analysis-harmony', 'vendor', 'ace', 'ACE', 'inference.py')), 'Vendored consonance-ACE code is missing');
assert(!fs.existsSync(path.join(__dirname, '..', 'analysis-harmony', 'btc', 'weights')), 'Chord weights must stay in runtime/, not in source');
assert(core.includes("'.next.' + task.taskId + '.json'"), 'analysis staging output is missing');
assert(core.includes('promoteResult(staging, output,'), 'validated result promotion is missing');
assert(main.includes("RESULT_ENGINE_IDS.some(id => file === `${id}.json`)"), 'result loading must ignore metadata JSON');

console.log('repair-static: ok');
