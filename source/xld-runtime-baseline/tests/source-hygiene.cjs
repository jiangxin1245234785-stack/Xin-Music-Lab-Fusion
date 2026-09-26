'use strict';
// Control characters do not belong in source. A NUL written into a string literal survives every syntax check,
// every lint and every test — node parses it, the app runs — and only shows up when a tool calls the file binary.
// It got in three times in one session, each time from a shell heredoc eating the backslash of an escape.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const SKIP = new Set(['node_modules', '.git', 'vendor', 'weights', 'models']);
const EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.json', '.html', '.css', '.py', '.md']);
const files = [];
(function walk(directory) {
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    if (SKIP.has(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (EXTENSIONS.has(path.extname(entry.name))) files.push(file);
  }
})(root);

const offenders = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  // Tab, newline and carriage return are the only control characters that belong in these files.
  const index = [...text].findIndex(character => {
    const code = character.codePointAt(0);
    return code < 32 && code !== 9 && code !== 10 && code !== 13;
  });
  if (index >= 0) {
    const line = text.slice(0, index).split('\n').length;
    offenders.push(`${path.relative(root, file)}:${line} (U+${text.codePointAt(index).toString(16).padStart(4, '0').toUpperCase()})`);
  }
}
assert.deepEqual(offenders, [], 'control characters in source: ' + offenders.join(', '));
assert(files.length > 100, 'the scan should have found the whole source tree, found ' + files.length);
console.log(`source hygiene: ok (${files.length} files, no stray control characters)`);
