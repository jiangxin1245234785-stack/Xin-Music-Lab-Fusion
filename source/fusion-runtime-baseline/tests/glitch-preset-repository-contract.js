'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const repositoryApi = require('../desktop/glitch-preset-repository.cjs');

test('Phase V-4 file repository keeps categories isolated and writes atomically', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xin-preset-repo-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const repository = repositoryApi.createRepository({ root });
  await repository.initialize();

  assert.equal(repositoryApi.CONTRACT, 'xin.glitch-preset-repository/1');
  assert.equal(repositoryApi.VERSION, '5.4.0-file-repository');
  assert.deepEqual(repository.status().categories, [
    'builtIn', 'user', 'recovered'
  ]);
  assert.throws(
    () => repositoryApi.createRepository({}),
    /PRESET_REPOSITORY_ROOT_REQUIRED/
  );

  const userJson = JSON.stringify({
    schemaVersion: 15,
    id: 'my-preset',
    name: 'My Preset',
    mappings: []
  });
  const recoveredJson = JSON.stringify({
    schemaVersion: 15,
    id: 'crash-recovery',
    name: 'Crash Recovery',
    mappings: []
  });
  const saved = await repository.save('user', userJson, 'my-preset.json');
  await repository.save('recovered', recoveredJson, 'crash-recovery.json');
  assert.equal(saved.category, 'user');
  assert.equal(saved.readOnly, false);

  let listing = await repository.list();
  assert.deepEqual(listing.categories.builtIn, []);
  assert.deepEqual(listing.categories.user.map(entry => entry.id), ['my-preset']);
  assert.deepEqual(
    listing.categories.recovered.map(entry => entry.id),
    ['crash-recovery']
  );
  assert.equal(listing.categories.recovered[0].readOnly, true);
  assert.deepEqual(listing.warnings, []);

  const loaded = await repository.read('user', 'my-preset.json');
  assert.equal(loaded.ok, true);
  assert.equal(loaded.json, userJson);

  const replacementJson = JSON.stringify({
    schemaVersion: 15,
    id: 'my-preset',
    name: 'My Preset Updated',
    mappings: [{ id: 'fixture' }]
  });
  await repository.save('user', replacementJson, 'my-preset.json');
  const replacement = await repository.read('user', 'my-preset.json');
  assert.equal(replacement.entry.name, 'My Preset Updated');
  assert.equal(replacement.json, replacementJson);
  assert.equal(
    (await fs.readdir(path.join(root, 'user')))
      .some(filename => filename.includes('.tmp-')),
    false
  );

  await assert.rejects(
    () => repository.save('builtIn', userJson, 'forbidden.json'),
    /PRESET_REPOSITORY_CATEGORY_READ_ONLY/
  );
  await assert.rejects(
    () => repository.save('user', '{broken', 'broken.json'),
    /PRESET_REPOSITORY_JSON_PARSE_FAILED/
  );
  await assert.rejects(
    () => repository.read('user', '../my-preset.json'),
    /PRESET_REPOSITORY_KEY_INVALID/
  );
  await assert.rejects(
    () => repository.remove('recovered', 'crash-recovery.json'),
    /PRESET_REPOSITORY_ENTRY_READ_ONLY/
  );
  await repository.remove('user', 'my-preset.json');
  listing = await repository.list();
  assert.equal(listing.categories.user.length, 0);
  assert.equal(listing.categories.recovered.length, 1);
});

test('Phase V-4 repository core owns no mapping, GPU, RAF or wall clock', async () => {
  const source = await fs.readFile(
    path.resolve(__dirname, '..', 'desktop', 'glitch-preset-repository.cjs'),
    'utf8'
  );
  for (const forbidden of [
    'requestAnimationFrame',
    'getContext(',
    'Math.random(',
    'performance.now(',
    'Date.now(',
    "sourceId: 'audio.",
    'targetId:'
  ]) assert.equal(source.includes(forbidden), false, forbidden);
});
