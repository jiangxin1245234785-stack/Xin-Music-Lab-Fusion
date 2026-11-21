'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const derived = require('../core/derived-assets.cjs');

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xld-other-route-'));
  try {
    const track = {id: 'fixture-track', artist: 'Test', album: 'Album', title: 'Route fixture'};
    const assets = derived.createDerivedAssets({analysisRoot: root});
    const directory = assets.directory(track);
    const active = new Map();
    await fs.mkdir(directory, {recursive: true});
    for (const stem of ['piano', 'strings', 'winds', 'other']) {
      const file = `${stem}.mid`;
      await fs.writeFile(path.join(directory, file), stem);
      active.set(stem, {ok: true, engine: 'test', model: 'test', runId: `${stem}-run`, sourceRunId: 'source', noteCount: 1, file});
    }

    // Inject fixture results at the asset reader boundary; routing and persistence are real.
    const createDerivedAssets = derived.createDerivedAssets;
    derived.createDerivedAssets = () => ({
      ...assets,
      readStems: async () => ({ok: true, runId: 'source'}),
      readMidi: async (_, stem) => active.get(stem) || {ok: false, error: 'midi-missing'}
    });
    const {createMidiMerge} = require('../core/midi-merge.cjs');
    derived.createDerivedAssets = createDerivedAssets;
    const merge = createMidiMerge({analysisRoot: root});
    const stems = plan => plan.parts.map(part => part.stem).sort();
    const sidecar = path.join(directory, 'midi', 'other-route.json');
    assert.equal(await assets.readOtherRoute(track), null);
    await assert.rejects(fs.access(sidecar), {code: 'ENOENT'});
    const legacy = await merge.plan(track);
    assert.deepEqual(stems(legacy), ['piano', 'strings', 'winds']);
    await assert.rejects(fs.access(sidecar), {code: 'ENOENT'});

    assert.deepEqual(await assets.setOtherRoute(track, 'direct', true), {ok: true, route: 'direct'});
    assert.equal(await createDerivedAssets({analysisRoot: root}).readOtherRoute(track), 'direct');
    assert.equal(await assets.readOtherRoute({...track, id: 'other-track'}), null);
    const direct = await merge.plan(track);
    assert.deepEqual(stems(direct), ['other', 'piano']);
    assert.notEqual(direct.fingerprint, legacy.fingerprint);

    await assert.rejects(assets.setOtherRoute(track, 'unknown'), /other-route-invalid/);
    assert.equal(await assets.readOtherRoute(track), 'direct');
    const piano = active.get('piano');
    active.delete('piano');
    const onlyOther = await merge.plan(track);
    assert.equal(onlyOther.ok, true);
    assert.deepEqual(stems(onlyOther), ['other']);
    active.get('other').noteCount = 0;
    assert.equal((await merge.plan(track)).error, 'merge-needs-parts');
    active.set('piano', piano);

    await assets.setOtherRoute(track, 'split');
    await assert.rejects(assets.setOtherRoute(track, 'direct', true), /midi-batch-source-changed/);
    assert.equal(await assets.readOtherRoute(track), 'split');
    const split = await merge.plan(track);
    assert.deepEqual(stems(split), ['piano', 'strings', 'winds']);
    assert.equal(split.fingerprint, legacy.fingerprint);
    assert.equal(await fs.readFile(path.join(directory, 'other.mid'), 'utf8'), 'other');
    await fs.writeFile(sidecar, '{');
    assert.equal((await merge.read(track)).error, 'other-route-invalid');
    await assert.rejects(assets.setOtherRoute(track, 'direct', true), /other-route-invalid/);
    assert.equal(await fs.readFile(sidecar, 'utf8'), '{');
    await assets.setOtherRoute(track, 'direct');
    assert.equal(await assets.readOtherRoute(track), 'direct');
  } finally {
    await fs.rm(root, {recursive: true, force: true});
  }
  console.log('Other route: isolated persistence, exclusive merge parts, solo other, legacy fingerprint and invalid sidecar passed');
}

main().catch(error => {console.error(error); process.exitCode = 1;});
