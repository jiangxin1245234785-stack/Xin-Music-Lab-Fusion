'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const stagingRoot = path.join(root, 'desktop-build');
const stagingApp = path.join(stagingRoot, 'app');
const expectedRelativeTarget = path.join('desktop-build', 'app');
const relativeTarget = path.relative(root, stagingApp);

if (relativeTarget !== expectedRelativeTarget || relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) {
  throw new Error(`Refusing to replace unexpected staging target: ${stagingApp}`);
}

const sourcePackage = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const builderPackagePath = path.join(stagingRoot, 'package.json');
const builderPackageSource = fs.readFileSync(builderPackagePath, 'utf8');
const builderPackage = JSON.parse(builderPackageSource);
builderPackage.version = sourcePackage.version;
const electronDistCandidates = [
  process.env.ELECTRON_DIST,
  path.join(root, 'node_modules', 'electron', 'dist'),
  path.resolve(root, '..', 'smoke-resonance', 'node_modules', 'electron', 'dist')
].filter(Boolean);
const electronDist = electronDistCandidates.find(candidate =>
  fs.existsSync(path.join(candidate, 'electron.exe'))
);
if (!electronDist) {
  throw new Error(`Electron distribution unavailable: ${electronDistCandidates.join(', ')}`);
}
builderPackage.build.electronDist = electronDist;

const runtimeJavaScript = fs.readdirSync(root, { withFileTypes: true })
  .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
  .map(entry => entry.name)
  .sort((left, right) => left.localeCompare(right, 'en'));
const files = [
  ...runtimeJavaScript,
  'index.html',
  'style.css',
  'README.md',
  'OPEN_SOURCE_RESEARCH.md',
  'GLITCH_GENERATION_RESEARCH.md',
  'THIRD_PARTY_NOTICES.md'
];
const directories = ['assets', 'vendor', 'desktop', 'tools'];

const generatorPackagePath = path.join(
  root,
  'tools',
  'glitch-generator',
  '6.6.1-integration-v.3',
  'package.json'
);
if (!fs.existsSync(generatorPackagePath)) {
  throw new Error('Advanced Generator build product is missing');
}
const generatorPackage = JSON.parse(fs.readFileSync(generatorPackagePath, 'utf8'));
if (generatorPackage.version !== '6.6.1-integration-v.3') {
  throw new Error(`Advanced Generator version mismatch: ${generatorPackage.version}`);
}

fs.rmSync(stagingApp, { recursive: true, force: true });
fs.mkdirSync(stagingApp, { recursive: true });
for (const file of files) fs.copyFileSync(path.join(root, file), path.join(stagingApp, file));
for (const directory of directories) {
  fs.cpSync(path.join(root, directory), path.join(stagingApp, directory), { recursive: true, force: true });
}

for (const required of [
  'fusion.js',
  'product-control-dock.js',
  path.join('desktop', 'glitch-preset-repository.cjs'),
  path.join('tools', 'glitch-generator', '6.6.1-integration-v.3', 'demo', 'index.html'),
  path.join('tools', 'glitch-generator', '6.6.1-integration-v.3', 'dist', 'ui-debug', 'phase1-demo.js')
]) {
  if (!fs.existsSync(path.join(stagingApp, required))) {
    throw new Error(`Packaged runtime dependency missing: ${required}`);
  }
}

const appPackage = {
  name: sourcePackage.name,
  version: sourcePackage.version,
  description: sourcePackage.description,
  main: sourcePackage.main,
  author: sourcePackage.author,
  dependencies: {}
};
fs.writeFileSync(path.join(stagingApp, 'package.json'), `${JSON.stringify(appPackage, null, 2)}\n`);
fs.writeFileSync(builderPackagePath, `${JSON.stringify(builderPackage, null, 2)}\n`);

const builderCli = path.join(root, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js');
const stagingBin = path.join(stagingRoot, 'bin');
fs.mkdirSync(stagingBin, { recursive: true });
// The packaged renderer has no npm runtime dependencies. Electron Builder
// still invokes a package-manager collector, so provide a deterministic empty
// dependency tree instead of depending on a globally installed npm binary.
fs.writeFileSync(
  path.join(stagingBin, 'npm.cmd'),
  `@echo off\r\necho {"name":"${sourcePackage.name}","version":"${sourcePackage.version}","dependencies":{}}\r\n`
);
const isolatedPath = `${stagingBin}${path.delimiter}${process.env.PATH || ''}`;
let result;
try {
  result = spawnSync(process.execPath, [builderCli, '--projectDir', stagingRoot, '--win', 'portable', '--x64'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, PATH: isolatedPath }
  });
} finally {
  // electronDist is machine-specific; never leave it written into the source
  // template after a build.
  fs.writeFileSync(builderPackagePath, builderPackageSource);
}

if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status || 1;
