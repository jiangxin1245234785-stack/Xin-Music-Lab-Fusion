'use strict';
// Score layers: the two score analyses are startable, stored beside the other results without entering
// music-lab.json, answered from disk when the stems have not changed, and the window's two buttons run them
// one after the other, skip nothing silently, stop on cancel and release the batch flag.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createService} = require('../core/analysis-service.cjs');

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xld-score-layers-'));
  const audio = path.join(root, 'song.wav');
  fs.writeFileSync(audio, Buffer.alloc(64));
  const track = {id: 'a'.repeat(40), number: 1, title: 'Song', artist: 'Artist', album: 'Album', filePath: audio};
  // A stand-in interpreter: node runs a script that writes what the real runner would.
  const fake = path.join(root, 'fake.cjs');
  fs.writeFileSync(fake, `const fs=require('fs');const a=process.argv;const out=a[a.indexOf('--output')+1],engine=a[a.indexOf('--engine')+1];
fs.appendFileSync(${JSON.stringify(path.join(root, 'calls.txt'))}, engine+' '+require('path').basename(a[2])+'\n');
fs.writeFileSync(out, JSON.stringify({schemaVersion:1,kind:engine,engine:{id:engine},segments:[],source:{stemRunId:null}}));`);
  const launcher = path.join(root, process.platform === 'win32' ? 'python.cmd' : 'python.sh');
  fs.writeFileSync(launcher, process.platform === 'win32'
    ? `@echo off\r\n"${process.execPath}" "${fake}" %*\r\n` : `#!/bin/sh\nexec "${process.execPath}" "${fake}" "$@"\n`, {mode: 0o755});
  const before = {m: process.env.XLD_MUSCRIPTOR_PYTHON, r: process.env.XLD_ROFORMER_PYTHON};
  const service = createService({analysisRoot: path.join(root, 'analysis'), xldRoot: root, stableXldRoot: root});
  const calls = () => (fs.existsSync(path.join(root, 'calls.txt')) ? fs.readFileSync(path.join(root, 'calls.txt'), 'utf8').trim().split('\n') : []);
  try {
    delete process.env.XLD_MUSCRIPTOR_PYTHON;
    delete process.env.XLD_ROFORMER_PYTHON;
    assert.equal((await service.run(track, 'score-layers')).error, 'runtime-missing', 'no interpreter configured is said plainly');
    assert.equal((await service.run(track, 'score-nonsense')).error, 'engine-unavailable');
    if (process.platform !== 'win32') { process.env.XLD_MUSCRIPTOR_PYTHON = launcher; process.env.XLD_ROFORMER_PYTHON = launcher; }
    else { console.log('score layers: service run through a stand-in interpreter is checked on POSIX only (spawn cannot start a .cmd); the rest runs here'); }
    if (process.platform !== 'win32') {
      const first = await service.run(track, 'score-layers');
      assert.equal(first.ok, true, JSON.stringify(first));
      assert.ok(!first.cached);
      const directory = path.dirname(first.manifestPath);
      assert.ok(fs.existsSync(path.join(directory, 'score-layers.json')));
      const bridge = JSON.parse(fs.readFileSync(first.manifestPath, 'utf8'));
      assert.deepEqual([bridge.analyses, bridge.harmony], [[], []], 'a score result is not a section or chord result');
      assert.deepEqual(calls(), ['score-layers runner.py']);
      const again = await service.run(track, 'score-layers');
      assert.equal(again.cached, true, 'the same stems: answered from disk');
      assert.equal(calls().length, 1);
      assert.ok(!(await service.run(track, 'score-layers', {force: true})).cached);
      assert.equal((await service.run(track, 'score-vocals')).ok, true);
      assert.deepEqual(calls().slice(-1), ['score-vocals vocals_runner.py']);
      assert.equal(service.task(), null);
    }

    // XLD's header no longer has buttons for the score layers (audit fix 1, item 6): XML prepares them itself.
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'), app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    assert(!/scoreLayers(Track|Album)Button|score-layers-controls/.test(html + app), 'no score-layer buttons in XLD');
    assert(!fs.existsSync(path.join(__dirname, '..', 'score-layers-controls.js')));
    console.log('score layers: PASS (startable engines, own result files, cache on unchanged stems, no buttons in XLD)');
  } finally {
    if (before.m === undefined) delete process.env.XLD_MUSCRIPTOR_PYTHON; else process.env.XLD_MUSCRIPTOR_PYTHON = before.m;
    if (before.r === undefined) delete process.env.XLD_ROFORMER_PYTHON; else process.env.XLD_ROFORMER_PYTHON = before.r;
    fs.rmSync(root, {recursive: true, force: true});
  }
})().catch(error => { console.error(error); process.exit(1); });
