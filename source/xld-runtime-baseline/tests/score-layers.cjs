'use strict';
// Score layers: the two score analyses are startable, stored beside the other results without entering
// music-lab.json, answered from disk when the stems have not changed, and the window's two buttons run them
// one after the other, skip nothing silently, stop on cancel and release the batch flag.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createService} = require('../core/analysis-service.cjs');
const controls = require('../score-layers-controls.js');

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

    // The window's buttons, against a bridge that records what it was asked.
    const button = () => ({disabled: false, textContent: '', listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; }});
    const asked = [], lines = [], progress = [];
    const state = {busy: false, cancelled: false, flags: []};
    const answers = {'t2 score-vocals': {ok: false, detail: 'Traceback\n人声曲线需要的扩展没有装：karaoke-v1'}, 't3 score-layers': {ok: true, cached: true}};
    const make = (extra = {}) => controls.create({
      bridge: {runAnalysis: async (id, engine) => { asked.push(`${id} ${engine}`); if (extra.cancelAt === asked.length) state.cancelled = true; return answers[`${id} ${engine}`] || {ok: true}; }},
      trackButton: button(), albumButton: button(), getTrack: () => ({id: 't1', title: 'One'}),
      getAlbum: () => ({tracks: [{id: 't1', title: 'One'}, {id: 't2', title: 'Two'}, {id: 't3', title: 'Three'}]}),
      isBusy: () => state.busy, setBatch: value => { state.busy = value; state.cancelled = false; state.flags.push(value); },
      onProgress: value => progress.push({...value}),
      isCancelled: () => state.cancelled, log: text => lines.push(text), t: (key, params) => key + (params ? ' ' + JSON.stringify(params) : '')});
    const panel = make();
    assert.equal(controls.create({}), null);
    const one = await panel.run(button(), [{id: 't1', title: 'One'}]);
    assert.deepEqual(asked, ['t1 score-layers', 't1 score-vocals'], 'both analyses, the layers first');
    assert.deepEqual(one, {made: 2, kept: 0, failed: 0, cancelled: false});
    assert.deepEqual(progress.map(p=>[p.index,p.total]),[[0,2],[1,2],[2,2]],'task-card progress has the same total and index as the button');
    progress.length=0;
    asked.length = 0;
    const album = await panel.run(button(), [{id: 't1', title: 'One'}, {id: 't2', title: 'Two'}, {id: 't3', title: 'Three'}]);
    assert.equal(asked.length, 6, 'a failure on one song does not stop the album');
    assert.deepEqual(album, {made: 4, kept: 1, failed: 1, cancelled: false});
    assert.deepEqual(progress.map(p=>[p.index,p.total]),Array.from({length:7},(_,i)=>[i,6]),'an album advances all six steps, including failure and cache hit');
    assert.ok(lines.some(line => line.includes('runtime.score.failed') && line.includes('Two') && line.includes('karaoke-v1') && !line.includes('Traceback')), 'the failure names the song and the last line of the reason');
    assert.deepEqual(state.flags.slice(-2), [true, false], 'the batch flag is released');
    asked.length = 0;
    state.busy = true;
    assert.equal(await panel.run(button(), [{id: 't1', title: 'One'}]), null, 'nothing starts while something else is running');
    assert.equal(asked.length, 0);
    state.busy = false;
    const stopping = make({cancelAt: 3});
    const stopped = await stopping.run(button(), [{id: 't1', title: 'One'}, {id: 't2', title: 'Two'}, {id: 't3', title: 'Three'}]);
    assert.equal(stopped.cancelled, true);
    assert.equal(asked.length, 3, 'cancel stops before the next step');
    assert.equal(state.busy, false);
    console.log('score layers: PASS (startable engines, own result files, cache on unchanged stems, track and album buttons, failure, cancel)');
  } finally {
    if (before.m === undefined) delete process.env.XLD_MUSCRIPTOR_PYTHON; else process.env.XLD_MUSCRIPTOR_PYTHON = before.m;
    if (before.r === undefined) delete process.env.XLD_ROFORMER_PYTHON; else process.env.XLD_ROFORMER_PYTHON = before.r;
    fs.rmSync(root, {recursive: true, force: true});
  }
})().catch(error => { console.error(error); process.exit(1); });
