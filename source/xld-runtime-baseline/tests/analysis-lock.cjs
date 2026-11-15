'use strict';
// Audit fix 1, item 2: one analysis at a time across programs (core/analysis-lock.cjs). Two real processes contend
// for one temp analysis root; nothing here touches a real one.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {createAnalysisLock, holderMessage, FILE} = require('../core/analysis-lock.cjs');

const HOLDER = `
const {createAnalysisLock} = require(process.argv[1]);
createAnalysisLock({program: 'XML'}).acquire(process.argv[2], {task: 'score-layers', song: '七里香'}).then(lock => {
  process.stdout.write(lock.ok ? 'held\\n' : 'refused\\n');
  process.stdin.on('data', async text => { if (String(text).includes('release')) { await lock.release(); process.stdout.write('released\\n'); } });
});`;
function holder(root) {
  const child = spawn(process.execPath, ['-e', HOLDER, require.resolve('../core/analysis-lock.cjs'), root], {stdio: ['pipe', 'pipe', 'inherit']});
  const lines = [];
  child.stdout.on('data', d => lines.push(...String(d).split('\n').filter(Boolean)));
  const until = async word => { for (let i = 0; i < 200 && !lines.includes(word); i++) await new Promise(r => setTimeout(r, 25)); assert(lines.includes(word), 'holder said ' + word); };
  return {child, until};
}

(async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'xld-lock-'));
  try {
    const xld = createAnalysisLock({program: 'XLD'});
    // --- another program holds it: refused, told who and what -----------------------------------------------------
    const other = holder(root);
    await other.until('held');
    const refused = await xld.acquire(root, {task: 'muscriptor-large', song: 'Goodbye'});
    assert.equal(refused.ok, false);
    assert.equal(refused.error, 'analysis-locked');
    assert.deepEqual([refused.holder.program, refused.holder.task, refused.holder.song, refused.holder.pid], ['XML', 'score-layers', '七里香', other.child.pid]);
    assert.equal(holderMessage(refused.holder), 'XML 正在分析 七里香（score-layers）');
    // --- it releases: taken ---------------------------------------------------------------------------------------
    other.child.stdin.write('release\n');
    await other.until('released');
    const mine = await xld.acquire(root, {task: 'demucs-6s', song: 'A'});
    assert.equal(mine.ok, true, 'free after the holder released');
    const again = await createAnalysisLock({program: 'XML'}).acquire(root, {});
    assert.equal(again.ok, false, 'one holder at a time');
    await mine.release();
    assert(!fs.existsSync(path.join(root, FILE)), 'released = file gone');
    other.child.kill();
    // --- the holder dies without releasing: void ----------------------------------------------------------------
    const dying = holder(root);
    await dying.until('held');
    dying.child.kill('SIGKILL');
    await new Promise(r => dying.child.once('exit', r));
    const after = await xld.acquire(root, {task: 'x'});
    assert.equal(after.ok, true, 'a dead holder\'s lock is void');
    // A release only removes its own lock.
    await fsp.writeFile(path.join(root, FILE), JSON.stringify({token: 'someone-else', pid: process.pid, program: 'XML', startedAt: new Date().toISOString()}));
    await after.release();
    assert(fs.existsSync(path.join(root, FILE)), 'a release never removes another holder\'s lock');
    await fsp.rm(path.join(root, FILE));
    // --- too old (a crashed holder whose pid was reused): void ----------------------------------------------------
    await fsp.writeFile(path.join(root, FILE), JSON.stringify({token: 't', pid: process.pid, program: 'XML', startedAt: new Date(Date.now() - 13 * 3600e3).toISOString()}));
    const old = await xld.acquire(root, {});
    assert.equal(old.ok, true, 'a lock older than any task is void');
    await old.release();
    // --- half written: void once a minute old, kept while it may still be being written ----------------------------
    await fsp.writeFile(path.join(root, FILE), '{"tok');
    assert.equal((await xld.acquire(root, {})).ok, false, 'a fresh broken file may be one being written');
    const minuteAgo = new Date(Date.now() - 120e3);
    fs.utimesSync(path.join(root, FILE), minuteAgo, minuteAgo);
    const broken = await xld.acquire(root, {});
    assert.equal(broken.ok, true, 'an old broken file is void');
    await broken.release();
    // --- the analysis service takes it before any task --------------------------------------------------------------
    const {createService} = require('../core/analysis-service.cjs');
    const audio = path.join(root, 'song.wav'); await fsp.writeFile(audio, 'x');
    const service = createService({analysisRoot: root, program: 'XLD'});
    const blocker = holder(root);
    await blocker.until('held');
    const run = await service.run({id: 'track-1234567890', filePath: audio, title: 'Song'}, 'demucs-6s');
    assert.equal(run.error, 'analysis-locked', 'XLD does not start while XML analyses');
    assert.equal(run.holder.program, 'XML');
    assert(/XML 正在分析/.test(run.detail));
    blocker.child.stdin.write('release\n'); await blocker.until('released'); blocker.child.kill();
    const free = await service.run({id: 'track-1234567890', filePath: audio, title: 'Song'}, 'demucs-6s');
    assert.notEqual(free.error, 'analysis-locked', 'and starts once it is free');
    assert(!fs.existsSync(path.join(root, FILE)), 'and gives it back however it ends (here: ' + free.error + ')');
    console.log('analysis lock: ok (two processes: refused with who and what, released, dead holder void, too old void, half-written file handled, release only its own, the service takes and returns it)');
  } finally {
    await fsp.rm(root, {recursive: true, force: true});
  }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(process.exitCode || 0), 100));
