'use strict';
// Mutations of adapter/roles.cjs (work/score-roles-20261114/SPEC.md: every factor of the rule has a
// test that notices it gone). Same method as adapter-mutations.cjs: only disposable copies change;
// a preload gives the copy the real module's filename, so repository files are never edited.
//   node source/scoreview/tests/roles-mutations.cjs [report.json]
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), {spawnSync} = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const FILE = 'adapter/roles.cjs';
const mutations = [];
const m = (name, find, put) => mutations.push({name, find, put});

// 1. struck together
m('cluster-width', 'const CLUSTER = 0.06;', 'const CLUSTER = 0.0;');
m('cluster-wide', 'const CLUSTER = 0.06;', 'const CLUSTER = 0.5;');
m('one-lead-per-group', 'for (const c of members) roles[c.index] = \'lead\';', 'for (const c of members) for (const g of all) if (g.notes.includes(c.index)) for (const i of g.notes) roles[i] = \'lead\';');
// skyline: held notes hide what is struck under them
m('held-under-off', 'if (active.some(i => notes[i][2] > top)) hidden.add(g);', '');
m('hold-forever', 'const HOLD = 0.5;', 'const HOLD = 1e9;');
// 2. the path
m('skyline-below', 'const BELOW = 1.0;', 'const BELOW = 0;');
m('repeat-cost', 'const REPEAT = 1.2;', 'const REPEAT = 0;');
m('leap-cost', 'const LEAP = 0.3;', 'const LEAP = 0;');
m('leap-cap', 'LEAP * Math.min(LEAP_CAP, Math.max(0, jump - STEP_FREE))', 'LEAP * Math.max(0, jump - STEP_FREE)');
m('path-backtrack', 'chosen[k] = groups[k].states[at]; at = back[k][at];', 'chosen[k] = groups[k].states[0]; at = back[k][at];');
// 3. the gates
m('gate-step', "if (f.step < (under ? STEP_MIN_UNDER : STEP_MIN)) fails.push('step');", '');
m('step-min-under', 'const STEP_MIN_UNDER = 0.5;', 'const STEP_MIN_UNDER = 0.3;');
m('gate-leap', "if (f.leap > LEAP_MAX) fails.push('leap');", '');
m('gate-block', "if (f.block > (under ? BLOCK_MAX_UNDER : BLOCK_MAX)) fails.push('block');", '');
m('block-max-under', 'const BLOCK_MAX_UNDER = 0.25;', 'const BLOCK_MAX_UNDER = 0.5;');
m('voicing-off', 'g.notes.filter(i => top - notes[i][2] <= VOICING)', 'g.notes');
m('gate-rate', "if (f.rate < RATE_MIN) fails.push('rate');", '');
m('repeats-not-collapsed', 'const seq = changesOf(near);', 'const seq = near.map(x => x.pitch);');
m('gate-ostinato', "if (f.ostinato > OSTINATO_MAX) fails.push('ostinato');", '');
m('trill-is-riff', "if (new Set(pitches).size < 3) return 0;", '');
m('gate-quiet', "if (finite(level.top) && level.lane < level.top - QUIET_DB) fails.push('quiet');", '');
m('gate-under-voice', "if (under && finite(level.voice) && level.lane < level.voice - UNDER_DB) fails.push('under');", '');
m('unknown-voice-open', 'return s === null || s === undefined ? true : Boolean(s);', 'return s === null || s === undefined ? false : Boolean(s);');
// 4. lines
m('join-off', 'if (run && c.start - run.end <= JOIN)', 'if (run && c.start - run.end <= 0)');
m('join-loose', 'const JOIN = 0.75;', 'const JOIN = 5;');
m('min-notes', 'const MIN_NOTES = 6;', 'const MIN_NOTES = 1;');
m('min-seconds', 'const MIN_SECONDS = 2.5;', 'const MIN_SECONDS = 0;');
m('min-notes-under', 'const MIN_NOTES_UNDER = 8;', 'const MIN_NOTES_UNDER = 6;');
m('min-seconds-under', 'const MIN_SECONDS_UNDER = 4.0;', 'const MIN_SECONDS_UNDER = 2.5;');
// the whole model
m('vocals-judged', "if (lane.kind === 'melody' && Array.isArray(lane.notes)) {\n      const lines = [];", "if (false) {\n      const lines = [];");
m('bass-judged', "const UNJUDGED = new Set(['bass', 'drums']);", "const UNJUDGED = new Set(['drums']);");
m('vocal-bridge', 'const VOCAL_BRIDGE = 1.5;', 'const VOCAL_BRIDGE = 0;');
m('vocal-near', 'return v >= top - VOCAL_NEAR;', 'return v >= top;');
m('levels-ignored', 'out[lane.id] = {roles: lane.notes.map(() => \'comp\'), lines: []}; });', 'out[lane.id] = {roles: lane.notes.map(() => \'comp\'), lines: []}; }); if (false)');
m('group-by-default', "options.by === 'group' ? lane.group || String(lane.id).split('/')[0] : lane.id", "options.by === 'lane' ? lane.id : lane.group || String(lane.id).split('/')[0]");

const reportFile = process.argv[2] && path.resolve(process.argv[2]);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'score-roles-mutations-'));
const report = {ok: false, date: new Date().toISOString(), baseline: null, control: null, mutations: []};
const tests = [path.join(__dirname, 'roles.test.cjs')];
function run(args, env = {}) { return spawnSync(process.execPath, args, {env: {...process.env, ...env}, encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024}); }
function suite(env = {}) {
  const r = run(['--test', '--test-reporter=tap', ...tests], env);
  return {status: r.status, signal: r.signal, error: r.error?.message || null, failed: Number(r.stdout?.match(/^# fail (\d+)$/m)?.[1] || 0),
          passed: Number(r.stdout?.match(/^# pass (\d+)$/m)?.[1] || 0), failedTests: [...(r.stdout || '').matchAll(/^not ok \d+ - (.+)$/gm)].map(x => x[1])};
}
function save() { if (reportFile) { fs.mkdirSync(path.dirname(reportFile), {recursive: true}); fs.writeFileSync(reportFile, JSON.stringify(report, null, 2)); } }
const target = path.join(ROOT, FILE);
const preload = path.join(scratch, 'preload.cjs');
const envFor = copy => ({SCORE_ROLES_TARGET: target, SCORE_ROLES_COPY: copy, NODE_OPTIONS: ((process.env.NODE_OPTIONS || '') + ' --require ' + JSON.stringify(preload)).trim()});
try {
  report.baseline = suite();
  if (report.baseline.status !== 0) throw Error('unmodified suite failed');
  fs.writeFileSync(preload, "const Module=require('node:module'),fs=require('node:fs'),path=require('node:path');const target=process.env.SCORE_ROLES_TARGET,copy=process.env.SCORE_ROLES_COPY;const m=new Module(target);m.filename=target;m.paths=Module._nodeModulePaths(path.dirname(target));require.cache[target]=m;m._compile(fs.readFileSync(copy,'utf8'),target);m.loaded=true;");
  const original = fs.readFileSync(target, 'utf8').replaceAll('\r\n', '\n');
  const plain = path.join(scratch, 'plain.cjs');
  fs.writeFileSync(plain, original);
  report.control = suite(envFor(plain));
  if (report.control.status !== 0) throw Error('unchanged preload control failed');
  for (const [i, x] of mutations.entries()) {
    const row = {name: x.name, caught: false};
    if (original.split(x.find).length !== 2) row.error = 'anchor must occur exactly once';
    else {
      const copy = path.join(scratch, i + '.cjs');
      fs.writeFileSync(copy, original.replace(x.find, x.put));
      if (run(['--check', copy]).status !== 0) row.error = 'invalid mutation syntax';
      else {
        const r = suite(envFor(copy));
        row.caught = r.status !== 0 && !r.signal && !r.error && r.failed > 0;
        row.failed = r.failed; row.failedTests = r.failedTests;
      }
    }
    report.mutations.push(row); save();
    console.log((row.caught ? 'CAUGHT ' : 'MISSED ') + x.name + (row.error ? ' ' + row.error : '') + (row.caught ? `  (${row.failedTests.join(' | ').slice(0, 140)})` : ''));
  }
  report.total = mutations.length; report.caught = report.mutations.filter(x => x.caught).length; report.ok = report.caught === report.total; save();
  console.log(JSON.stringify({ok: report.ok, total: report.total, caught: report.caught, report: reportFile || null}));
  process.exitCode = report.ok ? 0 : 1;
} catch (e) { report.error = e.stack; save(); console.error(e.stack); process.exitCode = 1; }
finally { if (path.dirname(scratch) !== os.tmpdir() || !path.basename(scratch).startsWith('score-roles-mutations-')) throw Error('unsafe scratch path'); fs.rmSync(scratch, {recursive: true, force: true}); }
