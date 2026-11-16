'use strict';
// Scripted answers for XLD's native dialogs, for isolated acceptance runs only (fixes.2, 2026-11-15). A real click on a
// button that opens a file dialog or a confirmation box cannot be completed by automation on Windows; with this the
// button, its IPC and everything behind it run for real and only the dialog's answer comes from a script.
//
// Active only when BOTH hold:  XLD_TEST === '1'  and  XLD_TEST_DIALOG_ANSWERS names a file.
// A normal start - packaged or not - never sets XLD_TEST, so the hook never installs there (tests/test-dialogs.cjs).
// The file holds a JSON queue; each dialog takes the first entry and the file is rewritten without it:
//   {"open": ["D:\\...\\song.flac"]}   -> showOpenDialog answers {canceled: false, filePaths: [...]}
//   {"message": 1}                     -> showMessageBox answers {response: 1}
// With the queue empty a dialog answers "cancelled" (it is never shown).
const fs = require('node:fs');

function active(env = process.env) {
  return env.XLD_TEST === '1' && typeof env.XLD_TEST_DIALOG_ANSWERS === 'string' && env.XLD_TEST_DIALOG_ANSWERS.length > 0;
}
function next(file) {
  let queue = [];
  try { queue = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { queue = []; }
  const answer = Array.isArray(queue) && queue.length ? queue.shift() : null;
  try { fs.writeFileSync(file, JSON.stringify(queue)); } catch (_) {}
  return answer;
}
// Replaces dialog.showOpenDialog / showMessageBox when active(env). Returns whether it did.
function install(dialog, env = process.env) {
  if (!active(env) || !dialog) return false;
  const file = env.XLD_TEST_DIALOG_ANSWERS;
  dialog.showOpenDialog = async () => { const a = next(file); return a && Array.isArray(a.open) ? {canceled: false, filePaths: a.open} : {canceled: true, filePaths: []}; };
  dialog.showMessageBox = async () => { const a = next(file); return {response: a && Number.isInteger(a.message) ? a.message : 0, checkboxChecked: false}; };
  return true;
}
module.exports = {install, active};
