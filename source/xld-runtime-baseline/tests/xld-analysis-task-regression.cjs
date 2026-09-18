const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

async function main() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'xld-task-test-'));
  const sourcePath = require.resolve('../core/analysis-service.cjs');
  const children = [];
  let spawnError = false;
  const sandbox = { module: { exports: {} }, process, __dirname: path.dirname(sourcePath),
    require(name) {
      if (name !== 'child_process') return require('node:module').createRequire(sourcePath)(name);
      return { spawn(_python, args) {
        if (spawnError) throw new Error('fixture-spawn-failed');
        const child = new EventEmitter();
        child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
        child.stdout.setEncoding = child.stderr.setEncoding = () => {};
        child.args = args;
        child.kill = () => { setImmediate(() => child.emit('close', null)); return true; };
        children.push(child);
        return child;
      }};
    }
  };
  vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), sandbox);
  await fsp.mkdir(path.join(root, 'analysis-ai/.venv/Scripts'), { recursive: true });
  await fsp.writeFile(path.join(root, 'analysis-ai/.venv/Scripts/python.exe'), 'fixture');
  await fsp.writeFile(path.join(root, 'analysis-ai/songformer_runner.py'), 'fixture');
  const audio = path.join(root, 'track.wav'); await fsp.writeFile(audio, 'fixture');
  const directory = path.join(root, 'result'); await fsp.mkdir(directory);
  const track = { id: 'test-track', filePath: audio, bridgePath: path.join(directory, 'music-lab.json') };
  const service = sandbox.module.exports.createService({ xldRoot: root, stableXldRoot: root, analysisRoot: root });
  const oldResult = { engine: { id: 'songformer' }, duration: 10, segments: [{ start: 0, end: 10, label: 'old' }] };
  const oldText = JSON.stringify(oldResult);
  const resultPath = path.join(directory, 'songformer.json');
  const manualPath = path.join(directory, 'manual-tags.json');
  await fsp.writeFile(resultPath, oldText);
  await fsp.writeFile(manualPath, '{"tags":[]}');
  const waitChild = async count => {
    for (let i = 0; i < 100 && children.length < count; i++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(children.length, count); return children[count - 1];
  };
  try {
    const first = service.run(track, 'songformer');
    const duplicate = await service.run(track, 'songformer');
    assert.equal(duplicate.error, 'analysis-busy');
    assert.equal((await service.run(track, 'demucs-6s')).error, 'analysis-busy');
    assert.equal((await service.run(track, 'basic-pitch', {stem:'bass'})).error, 'analysis-busy');
    await waitChild(1);
    service.cancel(); assert.equal((await first).error, 'analysis-cancelled');
    assert.equal(await fsp.readFile(resultPath, 'utf8'), oldText);
    assert.equal(service.task(), null);

    const early = service.run(track, 'songformer');
    assert.equal(service.cancel().ok, true);
    assert.equal((await early).error, 'analysis-cancelled');
    assert.equal(children.length, 1, 'cancel during preparation must not spawn');

    spawnError = true;
    assert.equal((await service.run(track, 'songformer')).detail, 'fixture-spawn-failed');
    assert.equal(service.task(), null);
    spawnError = false;
    const retry = service.run(track, 'songformer', { auto: false, range: [4, 6] });
    const child = await waitChild(2);
    const staging = child.args[child.args.indexOf('--output') + 1];
    assert.equal(await fsp.readFile(staging, 'utf8'), oldText, 'partial run must receive prior timeline');
    await fsp.writeFile(staging, JSON.stringify({ ...oldResult, segments: [{ start: 0, end: 10, label: 'new' }] }));
    child.emit('close', 0);
    const success = await retry;
    assert.equal(success.ok, true);
    assert.equal(success.manifest.analyses[0].segments[0].label, 'new');
    assert.equal(await fsp.readFile(manualPath, 'utf8'), '{"tags":[]}');

    const bad = service.run(track, 'songformer');
    const badChild = await waitChild(3);
    await fsp.writeFile(badChild.args[badChild.args.indexOf('--output') + 1], '{}');
    badChild.emit('close', 0);
    assert.equal((await bad).ok, false);
    assert.equal(JSON.parse(await fsp.readFile(resultPath)).segments[0].label, 'new');
    assert.equal(service.task(), null);
    const logs = (await fsp.readFile(path.join(root, 'logs/analysis.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(logs.filter(x => x.event === 'start').length, 5);
    assert.equal(logs.filter(x => x.event === 'finish').length, 5);
    assert(logs.some(x => x.status === 'failed') && logs.some(x => x.status === 'cancelled'));
    console.log('xld-analysis-task-regression: PASS (duplicate, early cancel, retry, partial merge, invalid output, manual tags, history)');
  } finally {
    const resolved = path.resolve(root);
    if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith('xld-task-test-'))
      await fsp.rm(resolved, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
