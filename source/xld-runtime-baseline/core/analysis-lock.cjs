'use strict';
// One analysis at a time across programs (audit fix 1, item 2). XLD and XML each keep an in-process "one task at a
// time" rule, but the two could not see each other: both could write the same song folder, and two GPU jobs at once
// are what this laptop's GPU drops off the bus on. Before any analysis task, the program takes a lock file in the
// analysis root:
//   <analysis root>/.analysis-lock.json  {schemaVersion, token, pid, program, task, song, startedAt}
// created with O_EXCL, so only one program can hold it. A lock is void when its process is gone, or when it is older
// than the longest task could be (a crashed holder whose pid was reused). A held lock answers who holds it and what it
// is doing. Released when the task ends however it ends, and on process exit.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const FILE = '.analysis-lock.json';
const MAX_AGE_MS = 12 * 60 * 60 * 1000;   // the longest real task on record is well under an hour

const alive = pid => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
};
const held = new Map();   // lock file -> token, for release on exit
let exitHook = false;
function hookExit() {
  if (exitHook) return;
  exitHook = true;
  process.once('exit', () => {
    for (const [file, token] of held) {
      try { if (JSON.parse(fs.readFileSync(file, 'utf8')).token === token) fs.rmSync(file, {force: true}); } catch (_) {}
    }
  });
}

function createAnalysisLock({program, now = Date.now, isAlive = alive, maxAgeMs = MAX_AGE_MS} = {}) {
  const fileFor = root => path.join(path.resolve(root), FILE);
  async function read(root, reportIoErrors = false) {
    try { return JSON.parse(await fsp.readFile(fileFor(root), 'utf8')); } catch (error) {
      if (error.code === 'ENOENT') return null;
      if (reportIoErrors && !(error instanceof SyntaxError)) throw error;
      return {broken: true};
    }
  }
  // Is the recorded holder still doing something? A broken file (half written by a crash) counts as void once it is a
  // minute old, so a lock being written right now is not taken away.
  async function stale(root, value, reportIoErrors = false) {
    if (value?.broken) {
      try { return now() - (await fsp.stat(fileFor(root))).mtimeMs > 60000; } catch (error) {
        if (reportIoErrors && error.code !== 'ENOENT') throw error;
        return true;
      }
    }
    const started = Date.parse(value?.startedAt || '');
    return !isAlive(value?.pid) || !Number.isFinite(started) || now() - started > maxAgeMs;
  }
  // {ok: true, release} or {ok: false, error: 'analysis-locked', holder: {program, task, song, startedAt, pid}}
  async function acquire(root, {task = '', song = ''} = {}) {
    if (!root) return {ok: true, release: async () => {}};
    const file = fileFor(root), token = crypto.randomUUID();
    const body = JSON.stringify({schemaVersion: 1, token, pid: process.pid, program: program || 'XLD', task: String(task), song: String(song).slice(0, 200), startedAt: new Date(now()).toISOString()});
    await fsp.mkdir(path.dirname(file), {recursive: true});
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const handle = await fsp.open(file, 'wx');
        try { await handle.writeFile(body); await handle.sync(); } finally { await handle.close(); }
        held.set(file, token); hookExit();
        let released = false;
        return {ok: true, token, release: async () => {
          if (released) return; released = true;
          held.delete(file);
          const current = await read(root);
          if (current && current.token === token) await fsp.rm(file, {force: true});
        }};
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
      const value = await read(root);
      if (value && !(await stale(root, value))) {
        const {program: who, task: what, song: which, startedAt, pid} = value;
        return {ok: false, error: 'analysis-locked', holder: {program: who, task: what, song: which, startedAt, pid}};
      }
      // Void: take it away (only if it is still the one judged void) and try again.
      const again = await read(root);
      if (JSON.stringify(again) === JSON.stringify(value)) await fsp.rm(file, {force: true}).catch(() => {});
    }
    return {ok: false, error: 'analysis-locked', holder: (await read(root)) || null};
  }
  // Inspect only. A stale file is reclaimed by the next acquisition, never by a reader.
  async function holder(root) {
    if (!root) return null;
    const value = await read(root, true);
    if (!value || await stale(root, value, true)) return null;
    const {program, task, song, startedAt, pid} = value;
    return {program, task, song, startedAt, pid};
  }
  return {acquire, read: root => read(root), holder, file: fileFor};
}
// What to tell the user: "XML 正在分析 七里香（score-layers）".
function holderMessage(holder, locale = 'zh') {
  if (!holder) return locale === 'en' ? 'Another program is analysing' : '另一个程序正在分析';
  const who = holder.program || (locale === 'en' ? 'Another program' : '另一个程序');
  return locale === 'en' ? `${who} is analysing ${holder.song || 'a song'}${holder.task ? ` (${holder.task})` : ''}`
    : `${who} 正在分析 ${holder.song || '一首歌'}${holder.task ? `（${holder.task}）` : ''}`;
}
module.exports = {createAnalysisLock, holderMessage, FILE, MAX_AGE_MS};
