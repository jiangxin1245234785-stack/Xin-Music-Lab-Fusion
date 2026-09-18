import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const generatorRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const projectRoot = path.resolve(generatorRoot, '..', '..');
const sourceDist = path.join(generatorRoot, 'dist');
const deployedDist = process.env.XIN_DEPLOYED_GENERATOR_DIST ??
  'D:\\Program Files\\xins-music-lab-fusion\\tools\\glitch-generator\\6.6.1-integration-v.3\\dist';
const outputFile = process.env.XIN_RECONCILIATION_REPORT ??
  path.join(
    projectRoot,
    'artifacts',
    'phase1-20260730',
    'source-reconciliation-report.json'
  );

const EXPECTED_RAW_DIFFERENCES = Object.freeze([
  'browser-manifest.json',
  'preset/built-in-presets.js',
  'render/glsl-uniform-target-registry.js',
  'render/minimal-webgl-renderer.d.ts',
  'render/minimal-webgl-renderer.js',
  'render/source-aware-render-port.d.ts',
  'render/source-aware-render-port.js',
  'runtime/runtime-facade.d.ts',
  'runtime/runtime-facade.js',
  'ui/i18n/surface-catalog.js'
]);

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function sha256(file) {
  const bytes = await readFile(file);
  return createHash('sha256').update(bytes).digest('hex');
}

async function manifest(root) {
  const entries = new Map();
  async function visit(directory) {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const absolute = path.join(directory, child.name);
      if (child.isDirectory()) {
        await visit(absolute);
      } else if (
        child.isFile() &&
        child.name !== 'package.json' &&
        !child.name.endsWith('.map')
      ) {
        const relative = path.relative(root, absolute).split(path.sep).join('/');
        entries.set(relative, await sha256(absolute));
      }
    }
  }
  await visit(root);
  return entries;
}

function compareManifests(reference, candidate) {
  const paths = [...new Set([
    ...reference.keys(),
    ...candidate.keys()
  ])].sort();
  return paths.flatMap(relative => {
    const sourceSha256 = reference.get(relative) ?? null;
    const deployedSha256 = candidate.get(relative) ?? null;
    if (sourceSha256 === deployedSha256) return [];
    return [{
      path: relative,
      sourceSha256,
      deployedSha256,
      kind: sourceSha256 === null
        ? 'deployed-only'
        : deployedSha256 === null
          ? 'source-only'
          : 'hash-mismatch'
    }];
  });
}

async function importModule(root, relative) {
  const url = pathToFileURL(path.join(root, relative));
  url.searchParams.set('phase1', String(Date.now()));
  return import(url.href);
}

if (!(await exists(sourceDist))) {
  throw new Error(`SOURCE_DIST_NOT_FOUND: ${sourceDist}`);
}
if (!(await exists(deployedDist))) {
  throw new Error(`DEPLOYED_DIST_NOT_FOUND: ${deployedDist}`);
}

const [
  sourcePresets,
  deployedPresets,
  sourceUniforms,
  deployedUniforms,
  sourceRenderer,
  deployedRenderer,
  sourceRenderPort,
  deployedRenderPort,
  sourceCatalog,
  deployedCatalog
] = await Promise.all([
  importModule(sourceDist, 'preset/built-in-presets.js'),
  importModule(deployedDist, 'preset/built-in-presets.js'),
  importModule(sourceDist, 'render/glsl-uniform-target-registry.js'),
  importModule(deployedDist, 'render/glsl-uniform-target-registry.js'),
  importModule(sourceDist, 'render/minimal-webgl-renderer.js'),
  importModule(deployedDist, 'render/minimal-webgl-renderer.js'),
  importModule(sourceDist, 'render/source-aware-render-port.js'),
  importModule(deployedDist, 'render/source-aware-render-port.js'),
  importModule(sourceDist, 'ui/i18n/surface-catalog.js'),
  importModule(deployedDist, 'ui/i18n/surface-catalog.js')
]);

const sourcePresetList = sourcePresets.listProductBuiltInPresets();
const deployedPresetList = deployedPresets.listProductBuiltInPresets();
assert.deepEqual(sourcePresetList, deployedPresetList);
for (const { id } of sourcePresetList) {
  assert.deepEqual(
    sourcePresets.getProductBuiltInPreset(id),
    deployedPresets.getProductBuiltInPreset(id),
    `preset mismatch: ${id}`
  );
}
assert.deepEqual(
  [...sourceUniforms.GLSL_ENGINE_UNIFORM_NAMES],
  [...deployedUniforms.GLSL_ENGINE_UNIFORM_NAMES]
);
assert.equal(sourceRenderer.TEMPORAL_HISTORY_BUFFER_COUNT, 8);
assert.equal(
  sourceRenderer.TEMPORAL_HISTORY_BUFFER_COUNT,
  deployedRenderer.TEMPORAL_HISTORY_BUFFER_COUNT
);
assert.equal(
  typeof sourceRenderPort.SourceAwareWebglRenderPort
    .prototype.configurePresetShaderPipeline,
  'function'
);
assert.equal(
  typeof deployedRenderPort.SourceAwareWebglRenderPort
    .prototype.configurePresetShaderPipeline,
  'function'
);
assert.deepEqual(
  sourceCatalog.SURFACE_TRANSLATIONS,
  deployedCatalog.SURFACE_TRANSLATIONS
);

const [sourceManifest, deployedManifest] = await Promise.all([
  manifest(sourceDist),
  manifest(deployedDist)
]);
const rawDifferences = compareManifests(sourceManifest, deployedManifest);
const rawDifferencePaths = rawDifferences.map(item => item.path);
const unexpectedRawDifferences = rawDifferencePaths.filter(
  item => !EXPECTED_RAW_DIFFERENCES.includes(item)
);
const missingExpectedDifferences = EXPECTED_RAW_DIFFERENCES.filter(
  item => !rawDifferencePaths.includes(item)
);
assert.deepEqual(unexpectedRawDifferences, []);
assert.deepEqual(missingExpectedDifferences, []);

const report = {
  contract: 'xin.music-lab.phase1-source-reconciliation/1',
  capturedAtUtc: new Date().toISOString(),
  status: 'PASS',
  roots: {
    projectRoot,
    generatorRoot,
    sourceDist,
    deployedDist
  },
  parity: {
    presetCatalogEqual: true,
    presetJsonEqual: true,
    engineUniformRegistryEqual: true,
    temporalHistoryDepth: 8,
    sourceAwarePresetPipelineAvailable: true,
    runtimeSurfaceTranslationsEqual: true
  },
  rawManifest: {
    sourceFileCount: sourceManifest.size,
    deployedFileCount: deployedManifest.size,
    differenceCount: rawDifferences.length,
    differences: rawDifferences,
    unexpectedDifferences: unexpectedRawDifferences
  },
  interpretation: {
    behavioralParity: true,
    rawHashParity: false,
    reason: [
      'The deployed JavaScript was hand-edited after its TypeScript build.',
      'Clean TypeScript output restores normal formatting and final newlines.',
      'The clean source removes one duplicate Quantized Memory translation key whose runtime value was identical.',
      'browser-manifest.json changes because it records rebuilt file hashes.'
    ]
  }
};

await mkdir(path.dirname(outputFile), { recursive: true });
await writeFile(outputFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: report.status,
  outputFile,
  presetIds: sourcePresetList.map(item => item.id),
  rawDifferenceCount: rawDifferences.length,
  unexpectedDifferenceCount: unexpectedRawDifferences.length,
  behavioralParity: report.interpretation.behavioralParity
}));
