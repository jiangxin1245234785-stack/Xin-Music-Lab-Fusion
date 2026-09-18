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
assert(main.includes("const HARMONY_ENGINE_IDS = ['chord-cqt', 'chord-cens', 'chord-hybrid', 'chord-btc']"), 'Harmony engine registry is missing');
assert(core.includes("'features-harmony'"), 'shared harmony feature cache is missing');
assert(main.includes('harmony: harmonyAnalyses.map(normalizeTimeline)'), 'Music Lab harmony lane export is missing');
assert(app.includes("activeLab: 'section'"), 'lab isolation state is missing');
assert(app.includes("'harmony-all'"), 'lab-scoped deletion is missing');
assert(html.includes('data-lab="harmony"'), 'Harmony Lab switcher is missing');
const runtimeRoot = process.env.XLD_RUNTIME_ROOT || 'D:/Program Files/xin-local-deck-beta';
assert(fs.existsSync(path.join(runtimeRoot, 'analysis-harmony', 'harmony_runner.py')), 'Shared Harmony runner is missing');
assert(core.includes("'.next.' + task.taskId + '.json'"), 'analysis staging output is missing');
assert(core.includes('promoteResult(staging, output,'), 'validated result promotion is missing');
assert(main.includes("RESULT_ENGINE_IDS.some(id => file === `${id}.json`)"), 'result loading must ignore metadata JSON');

console.log('repair-static: ok');
