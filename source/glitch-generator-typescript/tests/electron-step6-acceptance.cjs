const { createHash } = require('node:crypto');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const ROOT = path.join(__dirname, '..');
const ARTIFACT_DIR = path.join(ROOT, 'artifacts', 'i18n-step6');
const PAGE_IDS = ['perform', 'map', 'visual', 'shader', 'advanced'];
const VIEWPORTS = [
  { id: '1280x720', width: 1280, height: 720 },
  { id: '1366x768', width: 1366, height: 768 },
  { id: '1920x1080', width: 1920, height: 1080 },
  { id: 'xml-820x900', width: 820, height: 900 }
];
const LOCALES = ['zh-CN', 'en-US'];
const ZOOMS = [1, 1.2];
const consoleIssues = [];
let rendererGone = null;

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function fail(message, details) {
  const suffix = details === undefined
    ? ''
    : `\n${JSON.stringify(details, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1)
  );
  return sorted[index];
}

function compareImages(left, right) {
  const leftSize = left.getSize();
  const rightSize = right.getSize();
  if (
    leftSize.width !== rightSize.width ||
    leftSize.height !== rightSize.height
  ) {
    return {
      comparable: false,
      leftSize,
      rightSize,
      meanAbsoluteError: Number.POSITIVE_INFINITY,
      changedPixelRatio: 1
    };
  }
  const a = left.toBitmap();
  const b = right.toBitmap();
  if (a.length !== b.length || a.length === 0) {
    return {
      comparable: false,
      leftSize,
      rightSize,
      meanAbsoluteError: Number.POSITIVE_INFINITY,
      changedPixelRatio: 1
    };
  }
  let absolute = 0;
  let changedPixels = 0;
  const pixels = a.length / 4;
  for (let offset = 0; offset < a.length; offset += 4) {
    let maximum = 0;
    for (let channel = 0; channel < 4; channel += 1) {
      const difference = Math.abs(a[offset + channel] - b[offset + channel]);
      absolute += difference;
      maximum = Math.max(maximum, difference);
    }
    if (maximum > 8) changedPixels += 1;
  }
  return {
    comparable: true,
    leftSize,
    rightSize,
    meanAbsoluteError: absolute / a.length,
    changedPixelRatio: changedPixels / pixels,
    byteIdentical: a.equals(b)
  };
}

function installStep6Harness() {
  const pages = ['perform', 'map', 'visual', 'shader', 'advanced'];
  const wait = milliseconds =>
    new Promise(resolve => setTimeout(resolve, milliseconds));
  const waitFor = async (predicate, label, timeoutMs = 15000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (predicate()) return;
      await wait(25);
    }
    throw new Error('Timed out waiting for ' + label + '.');
  };
  const required = selector => {
    const element = document.querySelector(selector);
    if (!element) throw new Error('Missing Step 6 element: ' + selector);
    return element;
  };
  const text = selector => required(selector).textContent?.trim() ?? '';
  const settle = async () => {
    await wait(35);
    await new Promise(resolve => requestAnimationFrame(resolve));
    await wait(25);
  };
  const visible = element => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return !element.closest('[hidden]') &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      rect.width > 0 && rect.height > 0;
  };
  const intersects = (left, right) =>
    Math.min(left.right, right.right) - Math.max(left.left, right.left) > 1 &&
    Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top) > 1;

  let stableCanvas = null;
  let stableContext = null;

  const switchLocalLocale = async locale => {
    const select = required('#localeSelect');
    if (select.disabled) {
      throw new Error('Local locale selector is host-controlled.');
    }
    select.value = locale;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(
      () => document.documentElement.lang === locale && select.value === locale,
      'local locale ' + locale
    );
    await settle();
  };

  const selectPage = async page => {
    if (!pages.includes(page)) throw new Error('Unknown page ' + page);
    required('[data-page-button="' + page + '"]').click();
    await waitFor(
      () => required('[data-page="' + page + '"]').hidden === false,
      page + ' page'
    );
    document.scrollingElement.scrollTop = 0;
    await settle();
  };

  const inspectVisibleLayout = async metadata => {
    const page = required('[data-page="' + metadata.page + '"]');
    const viewportWidth = document.documentElement.clientWidth;
    const scroller = document.scrollingElement;
    const horizontalOverflow =
      document.documentElement.scrollWidth > viewportWidth + 1;
    const outOfBounds = [];
    const clippedText = [];
    const keyElements = Array.from(page.querySelectorAll(
      'button, select, input, textarea, summary, canvas, .mapping-causal-summary'
    )).filter(visible);
    for (const element of keyElements) {
      const rect = element.getBoundingClientRect();
      if (rect.left < -1 || rect.right > viewportWidth + 1) {
        outOfBounds.push(
          element.id || element.getAttribute('aria-label') || element.tagName
        );
      }
      if (
        element.matches('button, summary, .mapping-causal-summary') &&
        element.clientWidth > 0 &&
        (
          element.scrollWidth > element.clientWidth + 2 ||
          element.scrollHeight > element.clientHeight + 2
        )
      ) {
        clippedText.push(
          element.id || element.textContent?.trim().slice(0, 60) || element.tagName
        );
      }
    }

    const overlaps = [];
    for (const container of document.querySelectorAll(
      '.app-header-actions, .page-tabs, .mapping-actions, ' +
      '.map-view-switch, .mapping-ab-switch'
    )) {
      if (!visible(container)) continue;
      const children = Array.from(container.children).filter(visible);
      for (let left = 0; left < children.length; left += 1) {
        for (let right = left + 1; right < children.length; right += 1) {
          if (
            intersects(
              children[left].getBoundingClientRect(),
              children[right].getBoundingClientRect()
            )
          ) {
            overlaps.push(
              (container.className || container.tagName) + ':' +
              (children[left].id || left) + '/' +
              (children[right].id || right)
            );
          }
        }
      }
    }

    scroller.scrollTop = scroller.scrollHeight;
    await wait(0);
    const bottomReachable =
      scroller.scrollHeight <= scroller.clientHeight + 1 ||
      scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
    const documentHeight = scroller.scrollHeight;
    scroller.scrollTop = 0;
    await wait(0);

    return {
      ...metadata,
      clientWidth: viewportWidth,
      clientHeight: document.documentElement.clientHeight,
      documentWidth: document.documentElement.scrollWidth,
      documentHeight,
      horizontalOverflow,
      outOfBounds,
      clippedText,
      overlaps,
      bottomReachable,
      canvasSize: {
        width: Number(required('#phase1Canvas').width),
        height: Number(required('#phase1Canvas').height)
      }
    };
  };

  const inspectPage = async metadata => {
    await selectPage(metadata.page);
    if (metadata.page !== 'map') {
      return { primary: await inspectVisibleLayout(metadata), mapDetails: null };
    }
    const intent = required('#mappingIntentDetails');
    const runtime = required('#mappingRuntimeDetails');
    intent.open = false;
    runtime.open = false;
    await settle();
    const collapsed = await inspectVisibleLayout({ ...metadata, detail: 'collapsed' });
    intent.open = true;
    runtime.open = true;
    await settle();
    const expanded = await inspectVisibleLayout({ ...metadata, detail: 'expanded' });
    intent.open = false;
    runtime.open = false;
    return { primary: collapsed, mapDetails: { collapsed, expanded } };
  };

  const hostTakeover = async () => {
    const host = globalThis.xinGlitchGeneratorLocale;
    if (!host) throw new Error('Locale host adapter is unavailable.');
    await switchLocalLocale('en-US');
    host.setLocale('zh-CN');
    await waitFor(
      () => document.documentElement.lang === 'zh-CN' &&
        required('#localeSelect').disabled &&
        required('#localeSource').dataset.source === 'host',
      'host zh-CN takeover'
    );
    const duringHost = {
      locale: document.documentElement.lang,
      selectorDisabled: required('#localeSelect').disabled,
      selectorValue: required('#localeSelect').value,
      source: required('#localeSource').dataset.source
    };
    required('#localeSelect').value = 'en-US';
    required('#localeSelect').dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    const hostRemainedAuthoritative =
      document.documentElement.lang === 'zh-CN' &&
      host.getLocale() === 'zh-CN';
    host.clearLocale();
    await waitFor(
      () => document.documentElement.lang === 'en-US' &&
        !required('#localeSelect').disabled &&
        required('#localeSource').dataset.source === 'local',
      'host locale release'
    );
    const afterRelease = {
      locale: document.documentElement.lang,
      selectorDisabled: required('#localeSelect').disabled,
      selectorValue: required('#localeSelect').value,
      source: required('#localeSource').dataset.source
    };
    await switchLocalLocale('zh-CN');
    return { duringHost, hostRemainedAuthoritative, afterRelease };
  };

  const historyRoundTrip = async () => {
    await selectPage('map');
    const amount = required('#mappingAmount');
    const oldValue = Number(amount.value);
    const nextValue = oldValue >= 3.5 ? oldValue - 0.41 : oldValue + 0.41;
    amount.focus();
    amount.value = nextValue.toFixed(2);
    amount.dispatchEvent(new Event('input', { bubbles: true }));
    amount.dispatchEvent(new Event('change', { bubbles: true }));
    amount.blur();
    await waitFor(() => !required('#undoButton').disabled, 'Undo after Amount edit');
    await switchLocalLocale('en-US');
    required('#undoButton').click();
    await waitFor(
      () => Math.abs(Number(amount.value) - oldValue) < 1e-9,
      'Amount Undo'
    );
    const localeAfterUndo = document.documentElement.lang;
    required('#redoButton').click();
    await waitFor(
      () => Math.abs(Number(amount.value) - Number(nextValue.toFixed(2))) < 1e-9,
      'Amount Redo'
    );
    const localeAfterRedo = document.documentElement.lang;
    const evidence = {
      oldValue,
      editedValue: Number(nextValue.toFixed(2)),
      afterUndo: oldValue,
      afterRedo: Number(amount.value),
      localeAfterUndo,
      localeAfterRedo,
      undoAvailableAfterRedo: !required('#undoButton').disabled
    };
    await switchLocalLocale('zh-CN');
    return evidence;
  };

  const captureStableIdentity = () => {
    stableCanvas = required('#phase1Canvas');
    stableContext = stableCanvas.getContext('webgl2');
    if (!stableContext) throw new Error('WebGL2 is unavailable.');
    return {
      contextLost: stableContext.isContextLost(),
      width: stableCanvas.width,
      height: stableCanvas.height
    };
  };

  const verifyStableIdentity = () => {
    const canvas = required('#phase1Canvas');
    const context = canvas.getContext('webgl2');
    return {
      canvasIdentityStable: canvas === stableCanvas,
      contextIdentityStable: context === stableContext,
      contextLost: context?.isContextLost() ?? true,
      width: canvas.width,
      height: canvas.height
    };
  };

  const prepareScreenshot = async (page, locale) => {
    await switchLocalLocale(locale);
    await selectPage(page);
    document.scrollingElement.scrollTop = 0;
    await settle();
    return {
      locale: document.documentElement.lang,
      page,
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight
    };
  };

  const prepareCanvasCapture = async locale => {
    await switchLocalLocale(locale);
    await selectPage('perform');
    required('#stopButton').click();
    await waitFor(
      () => required('#sourceStatus').dataset.state === 'idle',
      'stopped deterministic playback'
    );
    await settle();
    const rect = required('#phase1Canvas').getBoundingClientRect();
    return {
      x: Math.max(0, Math.floor(rect.x)),
      y: Math.max(0, Math.floor(rect.y)),
      width: Math.max(1, Math.floor(rect.width)),
      height: Math.max(1, Math.floor(rect.height))
    };
  };

  const measureRaf = async (locale, sampleCount = 90) => {
    await switchLocalLocale(locale);
    await selectPage('map');
    required('#mappingRuntimeDetails').open = true;
    required('#offlineButton').click();
    await waitFor(
      () => required('#sourceStatus').dataset.state === 'offline',
      'offline performance source'
    );
    for (let index = 0; index < 24; index += 1) {
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    const stamps = [];
    for (let index = 0; index <= sampleCount; index += 1) {
      stamps.push(await new Promise(resolve => requestAnimationFrame(resolve)));
    }
    required('#stopButton').click();
    await waitFor(
      () => required('#sourceStatus').dataset.state === 'idle',
      'performance source stop'
    );
    const intervals = stamps.slice(1).map((stamp, index) => stamp - stamps[index]);
    intervals.sort((left, right) => left - right);
    const meanMs = intervals.reduce((sum, value) => sum + value, 0) /
      Math.max(1, intervals.length);
    const pick = fraction => intervals[Math.min(
      intervals.length - 1,
      Math.max(0, Math.ceil(intervals.length * fraction) - 1)
    )] ?? 0;
    return {
      locale,
      sampleCount: intervals.length,
      meanMs,
      medianMs: pick(0.5),
      p95Ms: pick(0.95),
      approximateFps: meanMs > 0 ? 1000 / meanMs : 0,
      runtimeClock: text('#mappingRuntimeClock')
    };
  };

  const webglInfo = () => {
    const gl = required('#phase1Canvas').getContext('webgl2');
    const extension = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      vendor: extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : null,
      renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null,
      version: gl?.getParameter(gl.VERSION) ?? null,
      shadingLanguage: gl?.getParameter(gl.SHADING_LANGUAGE_VERSION) ?? null
    };
  };

  globalThis.__xinStep6Harness = {
    ready: true,
    switchLocalLocale,
    inspectPage,
    hostTakeover,
    historyRoundTrip,
    captureStableIdentity,
    verifyStableIdentity,
    prepareScreenshot,
    prepareCanvasCapture,
    measureRaf,
    webglInfo
  };
}

async function waitForWindowState(window, eventName, expected) {
  if (window.isFullScreen() === expected) return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for ${eventName}.`)),
      10000
    );
    window.once(eventName, () => {
      clearTimeout(timer);
      resolve();
    });
    window.setFullScreen(expected);
  });
}

async function run() {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const evidence = {
    format: 'xin.glitch-generator.i18n-step6-acceptance/1',
    status: 'running',
    pages: PAGE_IDS,
    viewports: VIEWPORTS,
    zoomFactors: ZOOMS,
    locales: LOCALES,
    layoutMatrix: [],
    screenshots: [],
    consoleIssues
  };
  const window = new BrowserWindow({
    show: false,
    width: 1280,
    height: 720,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: `step6-acceptance-${process.pid}`
    }
  });
  window.setMenuBarVisibility(false);
  window.webContents.on('console-message', details => {
    if (details.level === 'warning' || details.level === 'error') {
      consoleIssues.push({
        level: details.level,
        message: details.message,
        line: details.lineNumber,
        sourceId: details.sourceId
      });
    }
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    rendererGone = details;
  });

  try {
    await window.loadFile(path.join(ROOT, 'demo', 'index.html'));
    await window.webContents.executeJavaScript(
      `(${installStep6Harness.toString()})()`
    );
    await window.webContents.executeJavaScript(`
      (async () => {
        const deadline = Date.now() + 15000;
        while (Date.now() < deadline) {
          if (
            globalThis.__xinStep6Harness?.ready &&
            globalThis.xinGlitchGeneratorLocale &&
            document.querySelector('#sourceStatus')?.dataset.state === 'offline' &&
            Number(document.querySelector('#phase1Canvas')?.width) > 0
          ) return true;
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        throw new Error('Step 6 Demo startup timed out.');
      })()
    `, true);

    evidence.initialCanvas = await window.webContents.executeJavaScript(
      `globalThis.__xinStep6Harness.captureStableIdentity()`
    );
    evidence.webgl = {
      page: await window.webContents.executeJavaScript(
        `globalThis.__xinStep6Harness.webglInfo()`
      ),
      gpuFeatureStatus: app.getGPUFeatureStatus(),
      gpuInfo: await app.getGPUInfo('basic')
    };

    window.webContents.setZoomFactor(1);
    window.setContentSize(1366, 768);
    await delay(120);
    evidence.hostTakeover = await window.webContents.executeJavaScript(
      `globalThis.__xinStep6Harness.hostTakeover()`
    );
    evidence.historyRoundTrip = await window.webContents.executeJavaScript(
      `globalThis.__xinStep6Harness.historyRoundTrip()`
    );

    for (const viewport of VIEWPORTS) {
      for (const zoomFactor of ZOOMS) {
        window.webContents.setZoomFactor(zoomFactor);
        window.setContentSize(viewport.width, viewport.height);
        await delay(120);
        for (const locale of LOCALES) {
          await window.webContents.executeJavaScript(
            `globalThis.__xinStep6Harness.switchLocalLocale(${JSON.stringify(locale)})`
          );
          for (const page of PAGE_IDS) {
            const result = await window.webContents.executeJavaScript(
              `globalThis.__xinStep6Harness.inspectPage(${JSON.stringify({
                viewport: viewport.id,
                requestedContentWidth: viewport.width,
                requestedContentHeight: viewport.height,
                zoomFactor,
                locale,
                page
              })})`
            );
            evidence.layoutMatrix.push(result);
          }
        }
      }
    }

    window.webContents.setZoomFactor(1);
    await waitForWindowState(window, 'enter-full-screen', true);
    await delay(180);
    evidence.fullscreen = {
      entered: window.isFullScreen(),
      bounds: window.getBounds(),
      contentBounds: window.getContentBounds(),
      matrix: []
    };
    for (const zoomFactor of ZOOMS) {
      window.webContents.setZoomFactor(zoomFactor);
      await delay(100);
      for (const locale of LOCALES) {
        await window.webContents.executeJavaScript(
          `globalThis.__xinStep6Harness.switchLocalLocale(${JSON.stringify(locale)})`
        );
        for (const page of PAGE_IDS) {
          const result = await window.webContents.executeJavaScript(
            `globalThis.__xinStep6Harness.inspectPage(${JSON.stringify({
              viewport: 'fullscreen',
              zoomFactor,
              locale,
              page
            })})`
          );
          evidence.fullscreen.matrix.push(result);
        }
      }
    }
    window.webContents.setZoomFactor(1.2);
    const fullscreenPrepared = await window.webContents.executeJavaScript(
      `globalThis.__xinStep6Harness.prepareScreenshot('map', 'zh-CN')`
    );
    const fullscreenImage = await window.webContents.capturePage();
    const fullscreenPng = fullscreenImage.toPNG();
    const fullscreenFilename = 'zh-CN-fullscreen-zoom120-map.png';
    writeFileSync(path.join(ARTIFACT_DIR, fullscreenFilename), fullscreenPng);
    evidence.screenshots.push({
      filename: fullscreenFilename,
      page: 'map',
      locale: fullscreenPrepared.locale,
      viewport: [fullscreenPrepared.width, fullscreenPrepared.height],
      pixels: fullscreenImage.getSize(),
      bytes: fullscreenPng.length,
      sha256: sha256(fullscreenPng)
    });
    await waitForWindowState(window, 'leave-full-screen', false);
    window.webContents.setZoomFactor(1);
    window.setContentSize(1366, 768);
    await delay(150);

    for (const page of PAGE_IDS) {
      const prepared = await window.webContents.executeJavaScript(
        `globalThis.__xinStep6Harness.prepareScreenshot(${JSON.stringify(page)}, 'zh-CN')`
      );
      const image = await window.webContents.capturePage();
      const png = image.toPNG();
      const filename = `zh-CN-1366x768-${page}.png`;
      writeFileSync(path.join(ARTIFACT_DIR, filename), png);
      evidence.screenshots.push({
        filename,
        page,
        locale: prepared.locale,
        viewport: [prepared.width, prepared.height],
        pixels: image.getSize(),
        bytes: png.length,
        sha256: sha256(png)
      });
    }

    window.setContentSize(820, 900);
    window.webContents.setZoomFactor(1.2);
    await delay(150);
    const xmlPrepared = await window.webContents.executeJavaScript(
      `globalThis.__xinStep6Harness.prepareScreenshot('map', 'zh-CN')`
    );
    const xmlImage = await window.webContents.capturePage();
    const xmlPng = xmlImage.toPNG();
    const xmlFilename = 'zh-CN-xml-820x900-zoom120-map.png';
    writeFileSync(path.join(ARTIFACT_DIR, xmlFilename), xmlPng);
    evidence.screenshots.push({
      filename: xmlFilename,
      page: 'map',
      locale: xmlPrepared.locale,
      viewport: [xmlPrepared.width, xmlPrepared.height],
      pixels: xmlImage.getSize(),
      bytes: xmlPng.length,
      sha256: sha256(xmlPng)
    });

    window.setContentSize(1920, 1080);
    window.webContents.setZoomFactor(1);
    await delay(150);
    const chineseRect = await window.webContents.executeJavaScript(
      `globalThis.__xinStep6Harness.prepareCanvasCapture('zh-CN')`
    );
    const chineseCanvas = await window.webContents.capturePage(chineseRect);
    const englishRect = await window.webContents.executeJavaScript(
      `globalThis.__xinStep6Harness.prepareCanvasCapture('en-US')`
    );
    const englishCanvas = await window.webContents.capturePage(englishRect);
    evidence.webglLocaleDiff = {
      chineseRect,
      englishRect,
      ...compareImages(chineseCanvas, englishCanvas)
    };

    window.setContentSize(1366, 768);
    window.webContents.setZoomFactor(1);
    await delay(120);
    const englishPerformance = await window.webContents.executeJavaScript(
      `globalThis.__xinStep6Harness.measureRaf('en-US', 90)`
    );
    const chinesePerformance = await window.webContents.executeJavaScript(
      `globalThis.__xinStep6Harness.measureRaf('zh-CN', 90)`
    );
    evidence.performance = {
      english: englishPerformance,
      chinese: chinesePerformance,
      medianRatio: englishPerformance.medianMs > 0
        ? chinesePerformance.medianMs / englishPerformance.medianMs
        : 0,
      p95Ratio: englishPerformance.p95Ms > 0
        ? chinesePerformance.p95Ms / englishPerformance.p95Ms
        : 0
    };
    evidence.finalCanvas = await window.webContents.executeJavaScript(
      `globalThis.__xinStep6Harness.verifyStableIdentity()`
    );

    const allLayouts = [
      ...evidence.layoutMatrix,
      ...evidence.fullscreen.matrix
    ];
    const layoutFailures = [];
    for (const entry of allLayouts) {
      const variants = [entry.primary, entry.mapDetails?.expanded].filter(Boolean);
      for (const variant of variants) {
        if (
          variant.horizontalOverflow ||
          variant.outOfBounds.length > 0 ||
          variant.clippedText.length > 0 ||
          variant.overlaps.length > 0 ||
          !variant.bottomReachable
        ) {
          layoutFailures.push(variant);
        }
      }
    }
    evidence.layoutSummary = {
      requestedStates: allLayouts.length,
      inspectedVariants: allLayouts.reduce(
        (sum, entry) => sum + (entry.mapDetails ? 2 : 1),
        0
      ),
      failureCount: layoutFailures.length,
      failures: layoutFailures
    };
    evidence.consoleSummary = {
      total: consoleIssues.length,
      errors: consoleIssues.filter(issue => issue.level === 'error'),
      warnings: consoleIssues.filter(issue => issue.level === 'warning'),
      missingI18n: consoleIssues.filter(issue =>
        /\[i18n\]\s*Missing|missing translation/i.test(issue.message)
      )
    };

    if (!evidence.hostTakeover.duringHost.selectorDisabled) {
      fail('Host takeover did not disable the local locale selector.', evidence.hostTakeover);
    }
    if (
      !evidence.hostTakeover.hostRemainedAuthoritative ||
      evidence.hostTakeover.afterRelease.selectorDisabled ||
      evidence.hostTakeover.afterRelease.locale !== 'en-US'
    ) {
      fail('Host release did not restore the local locale preference.', evidence.hostTakeover);
    }
    if (
      evidence.historyRoundTrip.afterUndo !== evidence.historyRoundTrip.oldValue ||
      evidence.historyRoundTrip.afterRedo !== evidence.historyRoundTrip.editedValue ||
      evidence.historyRoundTrip.localeAfterUndo !== 'en-US' ||
      evidence.historyRoundTrip.localeAfterRedo !== 'en-US'
    ) {
      fail('Amount Undo/Redo was changed by locale switching.', evidence.historyRoundTrip);
    }
    if (layoutFailures.length > 0) {
      fail('Step 6 layout matrix contains failures.', evidence.layoutSummary);
    }
    if (
      !evidence.finalCanvas.canvasIdentityStable ||
      !evidence.finalCanvas.contextIdentityStable ||
      evidence.initialCanvas.contextLost ||
      evidence.finalCanvas.contextLost
    ) {
      fail('Canvas or WebGL2 context identity changed.', {
        initial: evidence.initialCanvas,
        final: evidence.finalCanvas
      });
    }
    if (
      !evidence.webglLocaleDiff.comparable ||
      evidence.webglLocaleDiff.meanAbsoluteError > 1 ||
      evidence.webglLocaleDiff.changedPixelRatio > 0.01
    ) {
      fail('Locale switching changed the stopped WebGL canvas.', evidence.webglLocaleDiff);
    }
    if (
      evidence.performance.medianRatio > 1.35 ||
      evidence.performance.p95Ratio > 1.6
    ) {
      fail('Chinese runtime shows an obvious relative RAF regression.', evidence.performance);
    }
    if (rendererGone) fail('Electron renderer process exited.', rendererGone);
    if (evidence.consoleSummary.errors.length > 0) {
      fail('Console errors were emitted during Step 6.', evidence.consoleSummary.errors);
    }
    if (evidence.consoleSummary.missingI18n.length > 0) {
      fail('Missing i18n diagnostics were emitted.', evidence.consoleSummary.missingI18n);
    }

    evidence.status = 'passed';
    writeFileSync(
      path.join(ARTIFACT_DIR, 'manifest.json'),
      `${JSON.stringify(evidence, null, 2)}\n`,
      'utf8'
    );
    console.log(`[Electron Step 6 acceptance] ${JSON.stringify({
      ok: true,
      layoutStates: evidence.layoutSummary.requestedStates,
      inspectedVariants: evidence.layoutSummary.inspectedVariants,
      screenshots: evidence.screenshots.length,
      webglMeanAbsoluteError: evidence.webglLocaleDiff.meanAbsoluteError,
      webglChangedPixelRatio: evidence.webglLocaleDiff.changedPixelRatio,
      medianPerformanceRatio: evidence.performance.medianRatio,
      p95PerformanceRatio: evidence.performance.p95Ratio,
      consoleWarnings: evidence.consoleSummary.warnings.length,
      consoleErrors: evidence.consoleSummary.errors.length
    })}`);
  } catch (error) {
    evidence.status = 'failed';
    evidence.failure = error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { message: String(error) };
    evidence.rendererGone = rendererGone;
    writeFileSync(
      path.join(ARTIFACT_DIR, 'manifest.json'),
      `${JSON.stringify(evidence, null, 2)}\n`,
      'utf8'
    );
    throw error;
  } finally {
    if (!window.isDestroyed()) window.destroy();
  }
}

app.whenReady()
  .then(run)
  .then(() => app.quit())
  .catch(error => {
    console.error(error);
    app.exit(1);
  });
