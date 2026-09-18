import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDirectory = path.join(root, 'dist');
const browserEntry = path.join(distDirectory, 'browser', 'index.js');
const packageJson = JSON.parse(readFileSync(
  path.join(root, 'package.json'),
  'utf8'
));

function toPosixPath(filePath) {
  return path.relative(distDirectory, filePath).split(path.sep).join('/');
}

function hashFile(filePath) {
  return createHash('sha256')
    .update(readFileSync(filePath))
    .digest('hex');
}

function collectModuleSpecifiers(source) {
  const specifiers = new Set();
  const staticPattern =
    /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  const dynamicPattern = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const pattern of [staticPattern, dynamicPattern]) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) specifiers.add(match[1]);
    }
  }
  return [...specifiers];
}

function resolveRelativeModule(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const resolved = path.resolve(path.dirname(fromFile), specifier);
  const relative = path.relative(distDirectory, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(
      `Browser entry dependency escapes dist: ${specifier} from ${toPosixPath(fromFile)}`
    );
  }
  if (!existsSync(resolved)) {
    throw new Error(
      `Browser entry dependency is missing: ${specifier} from ${toPosixPath(fromFile)}`
    );
  }
  return resolved;
}

function collectRuntimeClosure(entryFile) {
  const pending = [entryFile];
  const visited = new Set();
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    const source = readFileSync(current, 'utf8');
    for (const specifier of collectModuleSpecifiers(source)) {
      const dependency = resolveRelativeModule(current, specifier);
      if (dependency && !visited.has(dependency)) pending.push(dependency);
    }
  }
  return [...visited].sort((left, right) =>
    toPosixPath(left).localeCompare(toPosixPath(right))
  );
}

if (!existsSync(browserEntry)) {
  throw new Error(
    'dist/browser/index.js is missing. Run TypeScript compilation first.'
  );
}

mkdirSync(distDirectory, { recursive: true });
const distPackagePath = path.join(distDirectory, 'package.json');
writeFileSync(
  distPackagePath,
  `${JSON.stringify({
    name: packageJson.name,
    version: packageJson.version,
    private: true,
    type: 'module'
  }, null, 2)}\n`,
  'utf8'
);

const browserModule = await import(
  `${pathToFileURL(browserEntry).href}?manifest-build=${encodeURIComponent(packageJson.version)}`
);
if (browserModule.GLITCH_GENERATOR_PACKAGE_VERSION !== packageJson.version) {
  throw new Error(
    'Browser entry package version does not match package.json: ' +
    `${String(browserModule.GLITCH_GENERATOR_PACKAGE_VERSION)} !== ${String(packageJson.version)}`
  );
}

const runtimeFiles = collectRuntimeClosure(browserEntry);
const manifestFiles = [distPackagePath, ...runtimeFiles]
  .map(filePath => ({
    path: toPosixPath(filePath),
    bytes: statSync(filePath).size,
    sha256: hashFile(filePath)
  }))
  .sort((left, right) => left.path.localeCompare(right.path));

const manifest = {
  format: 'xin.glitch-generator.browser-manifest/1',
  packageName: packageJson.name,
  packageVersion: packageJson.version,
  browserApiVersion:
    browserModule.GLITCH_GENERATOR_BROWSER_API_VERSION,
  entry: 'browser/index.js',
  moduleFormat: 'esm',
  files: manifestFiles
};

const manifestPath = path.join(distDirectory, 'browser-manifest.json');
writeFileSync(
  manifestPath,
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8'
);

console.log(
  `[Browser Dist] ${manifestFiles.length} files, ` +
  `${manifest.packageName}@${manifest.packageVersion}`
);
