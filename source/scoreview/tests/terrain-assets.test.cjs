'use strict';
// 车窗地貌's hand-painted materials (batch 7): the table in score-terrain-assets.js names every shipped file, the files are
// there with the hashes the table records, the set stays under 8 MB, and where pictures cannot load (Node) the look
// draws with its own code.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const Assets = require('../score-terrain-assets.js');
const terrain = require('../score-terrain.js');
const DIR = path.join(__dirname, '..', 'assets', 'terrain');

test('the table covers GPT\'s whole set, every file is there with its hash, under 8 MB', () => {
  assert.equal(Assets.TABLE.length, 101);
  const keys = new Set(Assets.TABLE.map(t => t.key));
  assert.equal(keys.size, 101, 'no key twice');
  for (const kind of ['roadside/pole-a', 'roadside/windpump-wheel-a', 'roadside/bird-f', 'station/station-sign-c', 'station/crossing-signal-lit-r-b',
    'station/town-depot-b', 'carriage/curtain-left-a', 'carriage/led-bezel-b', 'ground-sky/plain-tile-a', 'ground-sky/rail-strip-a',
    'overlay/range-texture-d', 'overlay/haze-strip-b']) assert.ok(keys.has(kind), kind);
  let total = 0;
  for (const t of Assets.TABLE) {
    const bytes = fs.readFileSync(path.join(DIR, t.file));
    assert.equal(bytes.length, t.bytes, t.file);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), t.sha256, t.file);
    assert.ok(t.k > 0 && t.k <= 1, 'never upscaled: ' + t.file);
    assert.ok(Array.isArray(t.anchor) && Array.isArray(t.bbox), t.file);
    total += bytes.length;
  }
  assert.ok(total <= 8 * 1024 * 1024, 'the set is ' + total + ' bytes');
  const onDisk = [];
  const walk = d => { for (const e of fs.readdirSync(d, {withFileTypes: true})) e.isDirectory() ? walk(path.join(d, e.name)) : onDisk.push(path.relative(DIR, path.join(d, e.name)).split(path.sep).join('/')); };
  walk(DIR);
  assert.deepEqual(onDisk.sort(), Assets.TABLE.map(t => t.file).sort(), 'nothing on disk outside the table');
});

test('no pictures (Node): never ready, the look draws with code', async () => {
  assert.equal(await Assets.ready(), false);
  assert.equal(Assets.isReady(), false);
  assert.equal(Assets.get('roadside/pole-a'), null);
  assert.equal(await terrain.ready(), false);
  const ctx = new Proxy({}, {get: (t, k) => k in t ? t[k] : k === 'canvas' ? {width: 800, height: 450} : k === 'measureText' ? () => ({width: 10}) : k === 'getTransform' ? undefined : () => ({addColorStop() {}}), set: (t, k, v) => { t[k] = v; return true; }});
  const song = {track: {duration: 60, title: 't', artist: 'a'}, lanes: [{group: 'bass', notes: [[1, 20, 40, 90]]}], sections: []};
  const S = terrain.draw(ctx, {song, w: 800, h: 450, time: 10});
  assert.equal(S.art, 'code');
});
