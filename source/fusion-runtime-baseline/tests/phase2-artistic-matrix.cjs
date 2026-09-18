'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { app, BrowserWindow, ipcMain } = require('electron');

const CONTRACT = 'xin.phase2-artistic-matrix/1';
const MATERIALS = Object.freeze([
  Object.freeze({ id: 'spectral-fabric', label: 'Spectral Fabric' }),
  Object.freeze({ id: 'temporal-strata', label: 'Temporal Strata' })
]);
const PRESETS = Object.freeze([
  Object.freeze({ id: 'balanced', label: 'Balanced Motion' }),
  Object.freeze({ id: 'temporal-excavation', label: 'Temporal Excavation' }),
  Object.freeze({ id: 'raster-deflection', label: 'Raster Deflection' }),
  Object.freeze({ id: 'bitplane-drift', label: 'Bitplane Drift' }),
  Object.freeze({ id: 'quantized-memory', label: 'Quantized Memory' })
]);

const sourcePath = path.resolve(String(process.env.PHASE2_AUDIO_SOURCE || ''));
const manifestPath = path.resolve(String(process.env.PHASE2_XLD_MANIFEST || ''));
const corpusPath = path.resolve(String(process.env.PHASE2_CORPUS || ''));
const outputRoot = path.resolve(String(process.env.PHASE2_MATRIX_DIR || ''));
const resultPath = path.resolve(
  String(
    process.env.PHASE2_MATRIX_RESULT ||
      path.join(outputRoot, 'phase2-artistic-matrix-report.json')
  )
);
const progressPath = path.join(outputRoot, 'phase2-artistic-matrix-progress.json');
const galleryPath = path.join(outputRoot, 'phase2-artistic-matrix-gallery.html');
const settleMs = Math.max(
  400,
  Number(process.env.PHASE2_MATRIX_SETTLE_MS) || 1100
);
const temporalGapMs = Math.max(
  160,
  Number(process.env.PHASE2_MATRIX_TEMPORAL_GAP_MS) || 320
);
const audioPrimeMs = Math.max(
  80,
  Number(process.env.PHASE2_MATRIX_AUDIO_PRIME_MS) || 180
);
const selectedSegmentIds = new Set(
  String(process.env.PHASE2_MATRIX_SEGMENTS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
);
const selectedMaterialIds = new Set(
  String(process.env.PHASE2_MATRIX_MATERIALS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
);
const selectedPresetIds = new Set(
  String(process.env.PHASE2_MATRIX_PRESETS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
);

const failures = [];
const consoleErrors = [];
const progress = {
  contract: 'xin.phase2-artistic-matrix-progress/1',
  state: 'starting',
  completed: 0,
  expected: MATERIALS.length * PRESETS.length * 5,
  current: null,
  updatedAt: new Date().toISOString()
};

function requiredFile(filePath, label) {
  if (!filePath || filePath === path.parse(filePath).root || !fs.existsSync(filePath)) {
    throw new Error(`${label} is missing: ${filePath || '(empty)'}`);
  }
  return filePath;
}

requiredFile(sourcePath, 'PHASE2_AUDIO_SOURCE');
requiredFile(manifestPath, 'PHASE2_XLD_MANIFEST');
requiredFile(corpusPath, 'PHASE2_CORPUS');
if (!outputRoot || outputRoot === path.parse(outputRoot).root) {
  throw new Error('PHASE2_MATRIX_DIR is missing');
}
fs.mkdirSync(outputRoot, { recursive: true });

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));
if (corpus.contract !== 'xin.phase2-listening-corpus/1') {
  throw new Error(`unsupported corpus contract: ${corpus.contract || 'missing'}`);
}
if (!Array.isArray(corpus.segments) || corpus.segments.length !== 5) {
  throw new Error('Phase 2 corpus must contain exactly five listening segments');
}
const ACTIVE_SEGMENTS = Object.freeze(corpus.segments.filter(segment =>
  !selectedSegmentIds.size || selectedSegmentIds.has(segment.id)
));
const ACTIVE_MATERIALS = Object.freeze(MATERIALS.filter(material =>
  !selectedMaterialIds.size || selectedMaterialIds.has(material.id)
));
const ACTIVE_PRESETS = Object.freeze(PRESETS.filter(preset =>
  !selectedPresetIds.size || selectedPresetIds.has(preset.id)
));
if (!ACTIVE_SEGMENTS.length || !ACTIVE_MATERIALS.length || !ACTIVE_PRESETS.length) {
  throw new Error('Phase 2 matrix filters selected no cells');
}
progress.expected =
  ACTIVE_SEGMENTS.length * ACTIVE_MATERIALS.length * ACTIVE_PRESETS.length;

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function safeId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withTimeout(promise, timeoutMs, label) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs} ms`)),
          timeoutMs
        );
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function updateProgress(next = {}) {
  Object.assign(progress, next, { updatedAt: new Date().toISOString() });
  writeJson(progressPath, progress);
  process.stdout.write(
    `[phase2-matrix] ${progress.completed}/${progress.expected}` +
      `${progress.current ? ` ${progress.current}` : ''}\n`
  );
}

function copyJson(value) {
  return value === null || value === undefined
    ? value
    : JSON.parse(JSON.stringify(value));
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function imageMetrics(image) {
  const sample = image.resize({ width: 64, height: 36, quality: 'good' });
  const bitmap = sample.toBitmap();
  const size = sample.getSize();
  const signature = [];
  let sum = 0;
  let sumSquares = 0;
  let nonBlack = 0;
  let chroma = 0;
  for (let index = 0; index < bitmap.length; index += 4) {
    const blue = bitmap[index] / 255;
    const green = bitmap[index + 1] / 255;
    const red = bitmap[index + 2] / 255;
    const alpha = bitmap[index + 3] / 255;
    const luminance = (red * 0.2126 + green * 0.7152 + blue * 0.0722) * alpha;
    signature.push(luminance);
    sum += luminance;
    sumSquares += luminance * luminance;
    if (luminance > 0.018) nonBlack++;
    chroma += Math.max(red, green, blue) - Math.min(red, green, blue);
  }
  const count = Math.max(1, signature.length);
  const mean = sum / count;
  return {
    width: size.width,
    height: size.height,
    meanLuminance: mean,
    luminanceStd: Math.sqrt(Math.max(0, sumSquares / count - mean * mean)),
    nonBlackCoverage: nonBlack / count,
    meanChroma: chroma / count,
    signature
  };
}

function signatureDistance(left, right) {
  const length = Math.min(left?.length || 0, right?.length || 0);
  if (!length) return null;
  let difference = 0;
  for (let index = 0; index < length; index++) {
    difference += Math.abs(finite(left[index]) - finite(right[index]));
  }
  return difference / length;
}

function statusSnapshot(value) {
  const runtime = value?.runtimeStatus || {};
  const output = runtime?.renderReport?.output || {};
  const materialFields = output?.materialFields || {};
  const unified = value?.unified || {};
  const realtime = value?.realtime || {};
  const source = value?.source || {};
  const material = value?.material || {};
  const materialRuntime = material?.runtime || material;
  const activeMaterial = materialRuntime?.material || {};
  return {
    audio: value?.audio || null,
    unified: {
      frameIndex: unified?.clock?.frameIndex ?? null,
      transport: unified?.transport || null,
      continuous: unified?.continuous || null,
      states: unified?.states || null,
      events: unified?.events || null,
      labels: unified?.labels || null,
      confidence: unified?.confidence || null
    },
    realtime: {
      frameIndex: realtime?.clock?.frameIndex ?? null,
      transport: realtime?.transport || null,
      continuous: realtime?.continuous || null,
      states: realtime?.states || null
    },
    material: {
      activeMaterialId:
        materialRuntime?.activeMaterialId ||
        material?.materialId ||
        value?.materialOutput?.materialId ||
        null,
      frameIndex:
        value?.materialOutput?.frameIndex ??
        material?.lastFrameIndex ??
        null,
      availableFieldIds:
        value?.materialOutput?.fields
          ? Object.keys(value.materialOutput.fields)
          : source?.fieldIds || [],
      parameters: value?.materialParameters || null,
      input: activeMaterial?.input || null,
      metrics: activeMaterial?.metrics || null,
      refreshIntervalMs: activeMaterial?.refreshIntervalMs ?? null
    },
    generator: {
      loadState: runtime?.loadState || null,
      presetId: runtime?.runtime?.preset?.id || null,
      evaluateCalls: runtime?.evaluateCalls ?? null,
      renderCalls: runtime?.renderCalls ?? null,
      renderStatus: runtime?.renderReport?.status || null,
      rendered: output?.rendered === true,
      frameIndex: output?.frameIndex ?? null,
      targetBindingContract: output?.targetBindingContract || null,
      targetBindingCount: output?.targetBindingCount ?? null,
      materialFieldContract: materialFields?.contract || null,
      consumedMaterialFieldIds: Array.isArray(materialFields?.availableIds)
        ? materialFields.availableIds
        : []
    },
    source: {
      available: source?.available === true,
      materialId: source?.materialId || null,
      materialFrameIndex: source?.materialFrameIndex ?? null,
      fieldIds: Array.isArray(source?.fieldIds) ? source.fieldIds : []
    },
    output: value?.output || null,
    ownership: {
      contract: value?.ownership?.contract || null,
      owner: value?.ownership?.owner || null,
      subscriber: value?.ownership?.subscriber || null,
      observedFrames: value?.ownership?.observedFrames ?? null,
      readyFrames: value?.ownership?.readyFrames ?? null,
      lastFrameIndex: value?.ownership?.lastFrameIndex ?? null,
      rafRequestsPeak: value?.ownership?.rafRequestsPeak ?? null,
      violationCount: value?.ownership?.violationCount ?? null,
      pass: value?.ownership?.pass === true
    }
  };
}

function expectedFields(materialId) {
  return materialId === 'temporal-strata' ? ['age', 'density'] : ['density'];
}

function nonBlankGate(metrics, segmentId) {
  if (segmentId === 'silence') {
    return metrics.nonBlackCoverage >= 0.15 &&
      metrics.meanLuminance >= 0.02 &&
      metrics.luminanceStd >= 0.001;
  }
  return metrics.nonBlackCoverage >= 0.015 &&
    metrics.luminanceStd >= 0.008;
}

function cellEngineeringGate(cell) {
  const expected = expectedFields(cell.materialId);
  const status = cell.status;
  const consumed = status.generator.consumedMaterialFieldIds || [];
  const checks = {
    activeMaterial: status.material.activeMaterialId === cell.materialId,
    activePreset: status.generator.presetId === cell.presetId,
    outputActive:
      status.output?.activePipeline === 'generator' &&
      status.output?.visible === true,
    sourceAvailable:
      status.source.available === true &&
      status.source.materialId === cell.materialId,
    rendererReady:
      status.generator.loadState === 'ready' &&
      status.generator.renderStatus === 'rendered' &&
      (
        status.generator.rendered === true ||
        status.output?.holdingBudgetFrame === true
      ),
    targetBindings:
      status.generator.targetBindingContract ===
        'xin.generator-target-uniform-bindings/1' &&
      status.generator.targetBindingCount === 21,
    materialFields:
      status.generator.materialFieldContract ===
        'xin.generator-material-fields/1' &&
      expected.every(id => consumed.includes(id)),
    frameOwnership:
      status.ownership?.pass === true &&
      Number(status.ownership?.violationCount || 0) === 0,
    nonBlank: nonBlankGate(cell.metrics, cell.segmentId),
    temporalBehavior:
      cell.segmentId === 'silence'
        ? cell.metrics.temporalDifference <= 0.08
        : cell.metrics.temporalDifference >= 0.00035
  };
  return {
    pass: Object.values(checks).every(Boolean),
    checks
  };
}

function htmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function galleryHtml(report) {
  const presetColumns = [
    { id: 'fx-off', label: 'FX OFF · Material 原貌' },
    ...ACTIVE_PRESETS
  ];
  const segmentSections = ACTIVE_SEGMENTS.map(segment => {
    const rows = ACTIVE_MATERIALS.map(material => {
      const cells = presetColumns.map(preset => {
        const cell = preset.id === 'fx-off'
          ? report.baselines.find(item =>
              item.segmentId === segment.id &&
              item.materialId === material.id
            )
          : report.cells.find(item =>
              item.segmentId === segment.id &&
              item.materialId === material.id &&
              item.presetId === preset.id
            );
        if (!cell) return '<td class="missing">未捕获</td>';
        const engineering = cell.engineering?.pass !== false;
        const file = htmlEscape(cell.imageFile);
        const metrics = cell.metrics || {};
        const badge = engineering ? '工程通过' : '工程警告';
        return `<td>
          <a href="${file}"><img src="${file}" alt="${htmlEscape(material.label)} × ${htmlEscape(preset.label)}"></a>
          <div class="badges">
            <span class="${engineering ? 'pass' : 'fail'}">${badge}</span>
            <span>动态差 ${finite(metrics.temporalDifference).toFixed(4)}</span>
            <span>覆盖 ${Math.round(finite(metrics.nonBlackCoverage) * 100)}%</span>
          </div>
        </td>`;
      }).join('');
      return `<tr><th>${htmlEscape(material.label)}</th>${cells}</tr>`;
    }).join('');
    const headers = presetColumns
      .map(item => `<th>${htmlEscape(item.label)}</th>`)
      .join('');
    return `<section>
      <h2>${htmlEscape(segment.label)} · ${finite(segment.timeSeconds).toFixed(3)} s</h2>
      <p>${htmlEscape(segment.listeningIntent)} · XLD: ${htmlEscape(segment.xldSection?.label || '—')}</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Material</th>${headers}</tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </section>`;
  }).join('');
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Xin Music Lab · Phase 2 艺术验收矩阵</title>
<style>
:root{color-scheme:dark;font-family:Inter,"Segoe UI","Microsoft YaHei",sans-serif;background:#07080c;color:#ececf4}
*{box-sizing:border-box}body{margin:0;padding:32px;background:radial-gradient(circle at 18% 0,#24182f 0,transparent 34%),#07080c}
header{max-width:1500px;margin:0 auto 38px}h1{font-size:34px;margin:0 0 10px}h2{margin:0 0 8px;font-size:24px}
p{color:#aaa9b8;margin:6px 0 18px;line-height:1.6}.notice{padding:14px 18px;border:1px solid #65517a;background:#15111d;border-radius:12px;color:#ddd0ed}
section{max-width:1500px;margin:0 auto 48px}.table-wrap{overflow:auto;border:1px solid #2a2835;border-radius:14px;background:#0c0d12}
table{border-collapse:collapse;width:100%;min-width:1300px}th,td{border-right:1px solid #25242e;border-bottom:1px solid #25242e;padding:10px;vertical-align:top}
thead th{position:sticky;top:0;background:#12131a;z-index:2;font-size:12px;color:#c6bfd2}tbody th{min-width:130px;text-align:left;background:#101118}
td{min-width:210px}img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;background:#000;border-radius:8px;border:1px solid #252735}
.badges{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}.badges span{font-size:10px;padding:4px 7px;border-radius:999px;background:#20212a;color:#bbb}
.badges .pass{background:#143127;color:#9be0c0}.badges .fail{background:#3c1c24;color:#ffabb9}.missing{color:#d88797}
</style>
</head>
<body>
<header>
  <h1>Phase 2 · Material × Glitch 艺术验收矩阵</h1>
  <p>固定曲目：${htmlEscape(report.corpus.track.artist)} — ${htmlEscape(report.corpus.track.title)}</p>
  <p class="notice">工程门槛只负责排除黑屏、失帧、字段未消费和 Material 完全趋同；“好不好看”仍由你决定。点击任意画面可查看原始 PNG。</p>
</header>
${segmentSections}
</body>
</html>`;
}

function installIpcFixtures() {
  let locale = 'zh-CN';
  const presetRepository = new Map();
  const track = {
    id: manifest.track.id,
    number: manifest.track.number || 8,
    title: manifest.track.title,
    artist: manifest.track.artist,
    album: manifest.track.album,
    duration: finite(manifest.timing?.duration),
    hasStructure: true,
    hasHarmony: Array.isArray(manifest.harmony) && manifest.harmony.length > 0,
    harmonyEngines: (manifest.harmony || []).map(item => item?.engine?.id).filter(Boolean)
  };
  const album = {
    id: 'phase2-radioactive-spell-wave',
    folder: manifest.track.album,
    title: manifest.track.album,
    artist: manifest.track.artist,
    album: manifest.track.album,
    trackCount: 1,
    analyzedCount: 1,
    tracks: [track]
  };

  ipcMain.handle('app:locale-get', () => ({ ok: true, locale, source: 'phase2-matrix' }));
  ipcMain.handle('app:locale-set', (_event, payload) => {
    locale = ['zh-CN', 'en-US'].includes(payload?.locale) ? payload.locale : locale;
    return { ok: true, locale, source: 'phase2-matrix' };
  });
  ipcMain.handle('app:media-control', () => ({ ok: true }));
  ipcMain.handle('app:toggle-always-on-top', () => false);
  ipcMain.handle('app:save-snapshot', () => ({ saved: false, canceled: true }));
  ipcMain.handle('fusion:settings', () => ({
    libraryRoot: path.dirname(sourcePath),
    analysisRoot: path.dirname(manifestPath),
    settingsPath: corpusPath
  }));
  ipcMain.handle('fusion:scan-library', () => ({
    ok: true,
    root: path.dirname(sourcePath),
    albumCount: 1,
    trackCount: 1,
    analyzedCount: 1,
    albums: [album],
    tracks: [track]
  }));
  ipcMain.handle('fusion:load-track', (_event, trackId) => {
    if (String(trackId) !== String(track.id)) {
      return { ok: false, error: 'track-missing' };
    }
    return {
      ok: true,
      manifest,
      filePath: manifestPath,
      sourcePath,
      audioUrl: pathToFileURL(sourcePath).href,
      coverUrl: ''
    };
  });
  ipcMain.handle('fusion:analysis-engines', () => ({ ok: true, engines: [] }));
  ipcMain.handle('fusion:analysis-task', () => null);
  ipcMain.handle('fusion:analysis-run', () => ({ ok: false, error: 'matrix-read-only' }));
  ipcMain.handle('fusion:analysis-cancel', () => ({ ok: true, task: null }));
  ipcMain.handle('fusion:open-bridge', () => ({ ok: false, canceled: true }));
  ipcMain.handle('fusion:shadow-telemetry', () => JSON.stringify({
    available: true,
    cpuPercent: 12,
    memoryKb: 256000,
    processCount: 1,
    scope: 'phase2-artistic-matrix'
  }));
  ipcMain.handle('fusion:export-glitch-preset', () => ({
    ok: true,
    path: 'phase2-matrix-export.json'
  }));
  ipcMain.handle('fusion:import-glitch-preset', () => ({
    ok: false,
    canceled: true
  }));
  ipcMain.handle('fusion:open-generator-editor', () => ({
    ok: true,
    version: '6.6.1-integration-v.3',
    fixture: 'phase2-matrix'
  }));
  ipcMain.handle('fusion:reveal-bridge', () => false);
  ipcMain.handle('fusion:analyze-in-xld', () => ({
    ok: true,
    trackId: track.id,
    fixture: 'phase2-matrix'
  }));
  ipcMain.handle('fusion:preset-repository-list', () => ({
    ok: true,
    repository: {
      contract: 'xin.glitch-preset-repository/1',
      version: 'phase2-matrix',
      root: 'phase2-matrix://Glitch Presets',
      categories: { builtIn: [], user: [], recovered: [] },
      warnings: []
    }
  }));
  ipcMain.handle('fusion:preset-repository-save', (_event, payload) => {
    presetRepository.set(payload?.filename || 'preset.json', payload?.json || '{}');
    return { ok: true };
  });
  ipcMain.handle('fusion:preset-repository-read', (_event, payload) => {
    const json = presetRepository.get(payload?.key);
    return json ? { ok: true, json } : { ok: false, error: 'not-found' };
  });
  ipcMain.handle('fusion:preset-repository-remove', (_event, payload) => ({
    ok: presetRepository.delete(payload?.key)
  }));
}

async function waitForRenderer(win, predicate, timeoutMs, label) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const ready = await win.webContents.executeJavaScript(
        `Boolean(${predicate})`,
        true
      );
      if (ready) return;
    } catch (_) {}
    await sleep(180);
  }
  throw new Error(`timed out waiting for ${label}`);
}

async function configureRenderer(win) {
  await win.webContents.executeJavaScript(`(() => {
    const stage = document.querySelector('main.stage');
    const visibleIds = new Set(['visualizer', 'generatorCanvas']);
    window.__phase2MaterialCatalog = stage?.querySelector('.visual-catalog') || null;
    window.__phase2Audio = document.querySelector('#fusionAudio') || null;
    for (const child of [...(stage?.children || [])]) {
      if (!visibleIds.has(child.id)) child.remove();
    }
    const unexpected = [...(stage?.children || [])]
      .filter(child => !visibleIds.has(child.id))
      .map(child => child.id || child.className || child.tagName);
    if (unexpected.length) {
      throw new Error('capture isolation failed: ' + unexpected.join(','));
    }
    window.SmokeResonanceDirector?.set(false);
    window.SmokeResonanceConductor?.set({ enabled: false });
    const audio = window.__phase2Audio;
    if (audio) {
      audio.playbackRate = 1;
      audio.loop = false;
    }
    return true;
  })()`, true);
  const rect = await win.webContents.executeJavaScript(`(() => {
    const box = document.querySelector('main.stage').getBoundingClientRect();
    return {
      x: Math.max(0, Math.round(box.x)),
      y: Math.max(0, Math.round(box.y)),
      width: Math.max(1, Math.round(box.width)),
      height: Math.max(1, Math.round(box.height))
    };
  })()`, true);
  return rect;
}

async function configureCell(win, materialId, presetId, enabled) {
  const result = await withTimeout(
    win.webContents.executeJavaScript(`(() => {
    const materialId = ${JSON.stringify(materialId)};
    const presetId = ${JSON.stringify(presetId)};
    const materialButton = window.__phase2MaterialCatalog?.querySelector(
      '[data-effect="' + materialId + '"]'
    );
    materialButton?.click();
    const material = window.SmokeResonanceMaterialView?.activate(
      materialId,
      'phase2-artistic-matrix'
    ) || null;
    const materialReset = window.SmokeResonanceMaterialView?.reset(
      'phase2-cell'
    ) || null;
    const preset = presetId
      ? window.SmokeResonanceGeneratorPresetControl?.select(
          presetId,
          'phase2-artistic-matrix'
        ) || null
      : null;
    const glitch = window.SmokeResonanceGlitch?.set({
      enabled: ${enabled ? 'true' : 'false'},
      fxStrength: 1,
      baseLayer: 1,
      noiseLayer: 0.8,
      burstLayer: 1.2,
      ensembleWeight: 1,
      drumWeight: 1,
      abrasionWeight: 1,
      sectionDrive: 1,
      tensionBuild: 1,
      eventSpacing: 1,
      rhythmLock: 0.72
    }) || null;
    return { material, materialReset, preset, glitch };
    })()`, true),
    8000,
    `configure ${materialId} × ${presetId}`
  );
  return result;
}

async function seekAndPlay(win, timeSeconds) {
  return withTimeout(
    win.webContents.executeJavaScript(`(async () => {
    const audio = window.__phase2Audio || document.querySelector('#fusionAudio');
    if (!audio) throw new Error('fusionAudio missing');
    const target = ${finite(timeSeconds)};
    await window.SmokeResonanceAudioSource?.attachMediaElement(audio);
    if (Math.abs(audio.currentTime - target) > 0.02) {
      await new Promise(resolve => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        audio.addEventListener('seeked', finish, { once: true });
        audio.currentTime = target;
        setTimeout(finish, 1600);
      });
    }
    await audio.play();
    return {
      currentTime: audio.currentTime,
      duration: audio.duration,
      paused: audio.paused,
      readyState: audio.readyState,
      source: audio.currentSrc || audio.src
    };
    })()`, true),
    8000,
    `seek ${finite(timeSeconds).toFixed(3)} s`
  );
}

async function readStatus(win) {
  return withTimeout(
    win.webContents.executeJavaScript(`(() => ({
    audio: (() => {
      const audio = window.__phase2Audio || document.querySelector('#fusionAudio');
      return audio ? {
        currentTime: audio.currentTime,
        duration: audio.duration,
        paused: audio.paused,
        readyState: audio.readyState
      } : null;
    })(),
    unified: window.SmokeResonanceUnifiedMusicFrame?.get() || null,
    realtime: window.SmokeResonanceRealtimeFrame?.get() || null,
    material: window.SmokeResonanceMaterialView?.status() || null,
    materialParameters: window.SmokeResonanceMaterialView?.parameters() || null,
    materialOutput: window.SmokeResonanceMaterialView?.outputs() || null,
    runtimeStatus: window.SmokeResonanceGeneratorRuntimeShadowView?.status() || null,
    source: window.SmokeResonanceGeneratorSourceView?.status() || null,
    output: window.SmokeResonanceGeneratorOutput?.status() || null,
    ownership: window.SmokeResonanceFrameOwnershipGate?.status() || null
    }))()`, true),
    8000,
    'renderer status'
  );
}

async function loadCaptureSession(win) {
  await win.loadFile(path.resolve(__dirname, '..', 'index.html'));
  await waitForRenderer(
    win,
    `document.querySelector('#fusionAudio')?.readyState >= 1`,
    20000,
    'real audio metadata'
  );
  await waitForRenderer(
    win,
    `window.SmokeResonanceGeneratorRuntimeShadowView?.status()?.loadState === 'ready'`,
    25000,
    'Generator runtime'
  );
  await waitForRenderer(
    win,
    `window.SmokeResonanceMaterialView?.registry()?.some?.(item => item.id === 'spectral-fabric')`,
    12000,
    'Phase 2 material registry'
  );
  return configureRenderer(win);
}

function createCaptureWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    show: true,
    backgroundColor: '#000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.resolve(__dirname, '..', 'desktop', 'preload.cjs')
    }
  });
  win.webContents.setAudioMuted(true);
  win.webContents.on('console-message', event => {
    const details = event || {};
    if (details.level === 'error' || details.level === 3) {
      consoleErrors.push(String(details.message || 'renderer console error'));
    }
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    failures.push(`renderer gone: ${details.reason}`);
  });
  return win;
}

async function replaceCaptureWindow(current) {
  if (current && !current.isDestroyed()) current.destroy();
  await sleep(160);
  return createCaptureWindow();
}

async function capture(win, rect, imagePath) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const image = await withTimeout(
      win.webContents.capturePage(rect),
      10000,
      `capture ${path.basename(imagePath)}`
    );
    const png = image.toPNG();
    const size = image.getSize();
    if (png.length > 0 && size.width > 0 && size.height > 0) {
      fs.writeFileSync(imagePath, png);
      return {
        image,
        imageFile: path.basename(imagePath),
        imageSha256: sha256(png)
      };
    }
    if (attempt < 3) await sleep(240);
  }
  throw new Error(`capture remained empty: ${path.basename(imagePath)}`);
}

async function waitForCaptureReady(win, materialId, presetId, requireGenerator) {
  const deadline = Date.now() + 12000;
  let last = null;
  while (Date.now() < deadline) {
    last = await withTimeout(
      win.webContents.executeJavaScript(`(() => {
      const materialStatus = window.SmokeResonanceMaterialView?.status?.();
      const runtime = window.SmokeResonanceGeneratorRuntimeShadowView?.status?.();
      const source = window.SmokeResonanceGeneratorSourceView?.status?.();
      const output = window.SmokeResonanceGeneratorOutput?.status?.();
      return {
        activeMaterialId:
          materialStatus?.runtime?.activeMaterialId ||
          materialStatus?.activeMaterialId ||
          null,
        materialFrameIndex: Number.isFinite(materialStatus?.frameIndex)
          ? materialStatus.frameIndex
          : null,
        presetId: runtime?.runtime?.preset?.id || null,
        sourceMaterialId: source?.materialId || null,
        activePipeline: output?.activePipeline || null,
        visible: output?.visible === true
      };
    })()`, true),
      4000,
      `capture readiness probe ${materialId} × ${presetId}`
    );
    const materialReady =
      last.activeMaterialId === materialId &&
      Number.isFinite(last.materialFrameIndex) &&
      last.materialFrameIndex >= 3;
    const generatorReady =
      !requireGenerator || (
        last.presetId === presetId &&
        last.sourceMaterialId === materialId &&
        last.activePipeline === 'generator' &&
        last.visible === true
      );
    if (materialReady && generatorReady) return last;
    await sleep(120);
  }
  throw new Error(
    `timed out waiting for capture readiness ${materialId} × ${presetId}: ` +
    JSON.stringify(last)
  );
}

async function captureBaseline(win, rect, material, segment) {
  updateProgress({
    current: `${segment.id} × ${material.id} × fx-off · seek`
  });
  await seekAndPlay(win, segment.timeSeconds);
  await sleep(audioPrimeMs);
  updateProgress({
    current: `${segment.id} × ${material.id} × fx-off · configure`
  });
  await configureCell(win, material.id, 'balanced', false);
  await waitForCaptureReady(win, material.id, 'balanced', false);
  await sleep(settleMs);
  const fileName =
    `${safeId(segment.id)}__${safeId(material.id)}__fx-off.png`;
  const captured = await capture(win, rect, path.join(outputRoot, fileName));
  const metrics = imageMetrics(captured.image);
  const status = statusSnapshot(await readStatus(win));
  const result = {
    segmentId: segment.id,
    materialId: material.id,
    presetId: 'fx-off',
    imageFile: captured.imageFile,
    imageSha256: captured.imageSha256,
    metrics: {
      width: metrics.width,
      height: metrics.height,
      meanLuminance: metrics.meanLuminance,
      luminanceStd: metrics.luminanceStd,
      nonBlackCoverage: metrics.nonBlackCoverage,
      meanChroma: metrics.meanChroma
    },
    signature: metrics.signature,
    status
  };
  result.engineering = {
    pass:
      nonBlankGate(metrics, segment.id) &&
      status.material.activeMaterialId === material.id,
    checks: {
      activeMaterial: status.material.activeMaterialId === material.id,
      nonBlank: nonBlankGate(metrics, segment.id)
    }
  };
  return result;
}

async function captureCell(win, rect, material, preset, segment) {
  updateProgress({
    current: `${segment.id} × ${material.id} × ${preset.id} · seek`
  });
  await seekAndPlay(win, segment.timeSeconds);
  await sleep(audioPrimeMs);
  updateProgress({
    current: `${segment.id} × ${material.id} × ${preset.id} · configure`
  });
  await configureCell(win, material.id, preset.id, true);
  await waitForCaptureReady(win, material.id, preset.id, true);
  await sleep(settleMs);
  const fileName =
    `${safeId(segment.id)}__${safeId(material.id)}__${safeId(preset.id)}.png`;
  const first = await capture(win, rect, path.join(outputRoot, fileName));
  const firstMetrics = imageMetrics(first.image);
  await sleep(temporalGapMs);
  updateProgress({
    current: `${segment.id} × ${material.id} × ${preset.id} · temporal probe`
  });
  const secondImage = await withTimeout(
    win.webContents.capturePage(rect),
    10000,
    `temporal probe ${fileName}`
  );
  const secondMetrics = imageMetrics(secondImage);
  const status = statusSnapshot(await readStatus(win));
  const cell = {
    segmentId: segment.id,
    materialId: material.id,
    presetId: preset.id,
    imageFile: first.imageFile,
    imageSha256: first.imageSha256,
    metrics: {
      width: firstMetrics.width,
      height: firstMetrics.height,
      meanLuminance: firstMetrics.meanLuminance,
      luminanceStd: firstMetrics.luminanceStd,
      nonBlackCoverage: firstMetrics.nonBlackCoverage,
      meanChroma: firstMetrics.meanChroma,
      temporalDifference: signatureDistance(
        firstMetrics.signature,
        secondMetrics.signature
      )
    },
    signature: firstMetrics.signature,
    status
  };
  cell.engineering = cellEngineeringGate(cell);
  return cell;
}

function finalizeComparisons(report) {
  const identityPairs = [];
  for (const segment of ACTIVE_SEGMENTS) {
    for (const preset of ACTIVE_PRESETS) {
      const spectral = report.cells.find(cell =>
        cell.segmentId === segment.id &&
        cell.materialId === 'spectral-fabric' &&
        cell.presetId === preset.id
      );
      const temporal = report.cells.find(cell =>
        cell.segmentId === segment.id &&
        cell.materialId === 'temporal-strata' &&
        cell.presetId === preset.id
      );
      const separation = signatureDistance(
        spectral?.signature,
        temporal?.signature
      );
      if (spectral && temporal) {
        identityPairs.push({
          segmentId: segment.id,
          presetId: preset.id,
          signatureSeparation: separation,
          distinguishable: finite(separation) >= 0.012
        });
      }
    }
  }
  for (const cell of report.cells) {
    const baseline = report.baselines.find(item =>
      item.segmentId === cell.segmentId &&
      item.materialId === cell.materialId
    );
    cell.metrics.distanceFromMaterialBaseline = signatureDistance(
      cell.signature,
      baseline?.signature
    );
  }
  report.comparisons = {
    identityPairs,
    allMaterialPairsDistinguishable:
      identityPairs.every(pair => pair.distinguishable),
    minimumMaterialSeparation: Math.min(
      ...identityPairs.map(pair => finite(pair.signatureSeparation, 1))
    )
  };
  const engineeringFailures = report.cells.filter(cell => !cell.engineering.pass);
  const baselineFailures = report.baselines.filter(cell => !cell.engineering.pass);
  report.summary = {
    expectedCells:
      ACTIVE_MATERIALS.length * ACTIVE_PRESETS.length * ACTIVE_SEGMENTS.length,
    capturedCells: report.cells.length,
    expectedBaselines: ACTIVE_MATERIALS.length * ACTIVE_SEGMENTS.length,
    capturedBaselines: report.baselines.length,
    engineeringPass:
      report.cells.length ===
        ACTIVE_MATERIALS.length * ACTIVE_PRESETS.length * ACTIVE_SEGMENTS.length &&
      report.baselines.length === ACTIVE_MATERIALS.length * ACTIVE_SEGMENTS.length &&
      engineeringFailures.length === 0 &&
      baselineFailures.length === 0 &&
      failures.length === 0,
    engineeringFailureCount: engineeringFailures.length + baselineFailures.length,
    materialPairCollapseCount:
      identityPairs.filter(pair => !pair.distinguishable).length,
    artDirectionReviewRequired:
      identityPairs.some(pair => !pair.distinguishable),
    runtimeFailureCount: failures.length,
    consoleErrorCount: consoleErrors.length,
    artisticAcceptance: 'pending-xin-review',
    artisticDecisionIsAutomated: false
  };
  for (const collection of [report.baselines, report.cells]) {
    for (const item of collection) delete item.signature;
  }
}

async function run() {
  installIpcFixtures();
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
  app.commandLine.appendSwitch('no-sandbox');
  app.setPath(
    'userData',
    path.join(os.tmpdir(), `xins-phase2-art-matrix-${process.pid}`)
  );
  await app.whenReady();
  let win = null;

  const report = {
    contract: CONTRACT,
    generatedAt: new Date().toISOString(),
    implementationRoot: path.resolve(__dirname, '..'),
    installedProductChanged: false,
    capture: {
      settleMs,
      temporalGapMs,
      audioPrimeMs,
      visibleWindow: true,
      audioOutputMuted: true,
      matrixFx: {
        fxStrength: 1,
        baseLayer: 1,
        noiseLayer: 0.8,
        burstLayer: 1.2,
        rhythmLock: 0.72
      }
    },
    corpus: copyJson(corpus),
    materials: copyJson(ACTIVE_MATERIALS),
    presets: copyJson(ACTIVE_PRESETS),
    baselines: [],
    cells: [],
    failures,
    consoleErrors
  };

  try {
    updateProgress({
      state: 'loading-capture-session',
      current: 'shared runtime'
    });
    win = createCaptureWindow();
    const rect = await loadCaptureSession(win);
    report.capture.rect = rect;
    const primeSegment = ACTIVE_SEGMENTS[0];
    const primeMaterial = ACTIVE_MATERIALS[0];
    const primePreset = ACTIVE_PRESETS[0];
    updateProgress({
      state: 'warming-capture-runtime',
      current: `${primeSegment.id} × ${primeMaterial.id} × ${primePreset.id}`
    });
    await seekAndPlay(win, primeSegment.timeSeconds);
    await sleep(audioPrimeMs);
    await configureCell(win, primeMaterial.id, primePreset.id, true);
    await waitForCaptureReady(
      win,
      primeMaterial.id,
      primePreset.id,
      true
    );
    await sleep(240);
    for (const segment of ACTIVE_SEGMENTS) {
      for (const material of ACTIVE_MATERIALS) {
        updateProgress({
          state: 'capturing-baseline',
          current: `${segment.id} × ${material.id} × fx-off`
        });
        report.baselines.push(
          await captureBaseline(win, rect, material, segment)
        );
        writeJson(
          path.join(outputRoot, 'phase2-artistic-matrix-live.json'),
          { baselines: report.baselines, cells: report.cells }
        );
      }
      for (const material of ACTIVE_MATERIALS) {
        for (const preset of ACTIVE_PRESETS) {
          const current = `${segment.id} × ${material.id} × ${preset.id}`;
          updateProgress({ state: 'capturing-cell', current });
          const cell = await captureCell(
            win,
            rect,
            material,
            preset,
            segment
          );
          report.cells.push(cell);
          writeJson(
            path.join(outputRoot, 'phase2-artistic-matrix-live.json'),
            { baselines: report.baselines, cells: report.cells }
          );
          updateProgress({
            completed: report.cells.length,
            current
          });
        }
      }
    }
    updateProgress({ state: 'finalizing', current: 'engineering comparisons' });
    updateProgress({ state: 'comparing', current: 'material identity' });
    finalizeComparisons(report);
    updateProgress({ state: 'writing-report', current: resultPath });
    writeJson(resultPath, report);
    updateProgress({ state: 'writing-gallery', current: galleryPath });
    fs.writeFileSync(galleryPath, galleryHtml(report), 'utf8');
    updateProgress({
      state: report.summary.engineeringPass
        ? 'engineering-pass'
        : 'engineering-review',
      completed: report.cells.length,
      current: null,
      resultPath,
      galleryPath
    });
    process.stdout.write(
      `${JSON.stringify({
        contract: report.contract,
        summary: report.summary,
        resultPath,
        galleryPath
      }, null, 2)}\n`
    );
    if (!report.summary.engineeringPass) process.exitCode = 1;
  } catch (error) {
    failures.push(error?.stack || error?.message || String(error));
    report.summary = {
      engineeringPass: false,
      artisticAcceptance: 'not-reached'
    };
    writeJson(resultPath, report);
    updateProgress({
      state: 'failed',
      current: null,
      error: error?.message || String(error),
      resultPath
    });
    process.exitCode = 1;
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
    app.exit(Number(process.exitCode) || 0);
  }
}

run().catch(error => {
  failures.push(error?.stack || error?.message || String(error));
  try {
    writeJson(resultPath, {
      contract: CONTRACT,
      generatedAt: new Date().toISOString(),
      summary: {
        engineeringPass: false,
        artisticAcceptance: 'not-reached'
      },
      failures
    });
  } catch (_) {}
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
  app.exit(Number(process.exitCode) || 1);
});
