'use strict';
// `npm run test:vocals:python`: runs tests/score-vocals-split.py under the RoFormer interpreter. npm runs scripts
// through cmd.exe on Windows, where a quoted relative path to an .exe does not start, so node finds and starts it.
// Interpreter: XLD_ROFORMER_PYTHON if set, else the repository's runtime/0.5.0/envs/roformer.
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const exe = process.platform === 'win32' ? 'python.exe' : path.join('bin', 'python');
const python = [process.env.XLD_ROFORMER_PYTHON, path.resolve(__dirname, '../../../runtime/0.5.0/envs/roformer', exe)].find(file => file && fs.existsSync(file));
if (!python) { console.error('score vocals split: no RoFormer interpreter (set XLD_ROFORMER_PYTHON)'); process.exit(2); }
const run = spawnSync(python, ['-X', 'utf8', path.join(__dirname, 'score-vocals-split.py')], {stdio: 'inherit', env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'}});
process.exit(run.status === null ? 1 : run.status);
