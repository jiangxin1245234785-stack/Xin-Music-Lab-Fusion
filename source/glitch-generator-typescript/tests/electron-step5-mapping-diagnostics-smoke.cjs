const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const consoleErrors = [];
let rendererGone = null;

function fail(message, details) {
  const suffix = details === undefined
    ? ''
    : `\n${JSON.stringify(details, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

async function run() {
  const window = new BrowserWindow({
    show: false,
    width: 820,
    height: 900,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: `step5-mapping-diagnostics-${process.pid}`
    }
  });

  window.webContents.on('console-message', details => {
    if (details.level === 'error') {
      consoleErrors.push({
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
    await window.loadFile(path.join(__dirname, '..', 'demo', 'index.html'));

    const result = await window.webContents.executeJavaScript(`
      (async () => {
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
          if (!element) throw new Error('Missing Step 5 element: ' + selector);
          return element;
        };
        const text = selector =>
          required(selector).textContent?.trim() ?? '';
        const containsHan = value => /[\\u3400-\\u9fff]/u.test(value);
        const nextSurfaceTurn = async () => {
          await wait(40);
          await new Promise(resolve => requestAnimationFrame(resolve));
          await wait(20);
        };
        const switchLocalLocale = async locale => {
          const select = required('#localeSelect');
          if (select.disabled) {
            throw new Error('Local language selector unexpectedly disabled.');
          }
          select.value = locale;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          await waitFor(
            () => document.documentElement.lang === locale &&
              select.value === locale,
            'locale ' + locale
          );
          await nextSurfaceTurn();
        };

        await waitFor(
          () => globalThis.xinGlitchGeneratorLocale &&
            required('#sourceStatus').dataset.state === 'offline' &&
            Number(required('#phase1Canvas').width) > 0,
          'offline deterministic Demo startup'
        );

        const canvas = required('#phase1Canvas');
        const webgl = canvas.getContext('webgl2');
        if (!webgl) throw new Error('The real Demo did not expose WebGL2.');

        required('[data-page-button="map"]').click();
        await waitFor(
          () => required('[data-page="map"]').hidden === false,
          'Map page'
        );
        await waitFor(
          () => text('#mappingIntentSummary').length > 20 &&
            text('#mappingRuntimeSummary').length > 20 &&
            required('#mappingRuntimePipeline').children.length >= 7,
          'MappingCard summaries and runtime trace'
        );

        const intentDetails = required('#mappingIntentDetails');
        const runtimeDetails = required('#mappingRuntimeDetails');
        intentDetails.open = false;
        runtimeDetails.open = false;
        await nextSurfaceTurn();

        const initialLocale = document.documentElement.lang;
        const initialIntent = text('#mappingIntentSummary');
        const initialRuntime = text('#mappingRuntimeSummary');
        const collapsed = {
          intentClosed: !intentDetails.open,
          runtimeClosed: !runtimeDetails.open,
          intentVisible: required('#mappingIntentSummary').getClientRects().length > 0,
          runtimeVisible: required('#mappingRuntimeSummary').getClientRects().length > 0,
          intent: initialIntent,
          runtime: initialRuntime
        };

        intentDetails.open = true;
        runtimeDetails.open = true;
        await nextSurfaceTurn();

        const engineering = {
          source: text('#mappingIntentSource'),
          target: text('#mappingIntentTarget'),
          rawIds: text('#mappingIntentRawIds'),
          reasonCodes: text('#mappingRawReasonCodes'),
          provider: text('#mappingRuntimeProvider'),
          clock: text('#mappingRuntimeClock'),
          pipelineCount: required('#mappingRuntimePipeline').children.length,
          pipelineStages: Array.from(
            required('#mappingRuntimePipeline').children,
            item => item.dataset.stage ?? ''
          )
        };

        const amount = required('#mappingAmount');
        const intentBeforeAmount = text('#mappingIntentSummary');
        const oldAmount = Number(amount.value);
        const newAmount = oldAmount >= 3.5
          ? oldAmount - 0.37
          : oldAmount + 0.37;
        amount.focus();
        amount.value = newAmount.toFixed(2);
        amount.dispatchEvent(new Event('input', { bubbles: true }));
        const intentAfterImmediateInput = text('#mappingIntentSummary');
        amount.dispatchEvent(new Event('change', { bubbles: true }));
        amount.blur();
        await waitFor(
          () => required('#undoButton').disabled === false,
          'amount Undo transaction'
        );

        // Explicitly restart the deterministic source, then prove that both
        // the Engine Clock and the trace-derived runtime surface advance.
        required('#offlineButton').click();
        await waitFor(
          () => required('#sourceStatus').dataset.state === 'offline',
          'restarted offline source'
        );
        const clockAtRestart = text('#mappingRuntimeClock');
        const runtimeAtRestart = [
          text('#mappingRuntimeSummary'),
          text('#sourceReadout'),
          text('#finalReadout')
        ].join('|');
        await waitFor(
          () => text('#mappingRuntimeClock') !== clockAtRestart &&
            text('#mappingRuntimeSummary').length > 20 &&
            text('#mappingRawReasonCodes').includes('/') &&
            required('#mappingRuntimePipeline').children.length >= 7,
          'offline runtime and Engine Clock advancement'
        );
        const offlineAdvance = {
          clockBefore: clockAtRestart,
          clockAfter: text('#mappingRuntimeClock'),
          runtimeBefore: runtimeAtRestart,
          runtimeAfter: [
            text('#mappingRuntimeSummary'),
            text('#sourceReadout'),
            text('#finalReadout')
          ].join('|'),
          reasonCodesAfter: text('#mappingRawReasonCodes'),
          pipelineCountAfter:
            required('#mappingRuntimePipeline').children.length
        };

        // Freeze playback so text changes below can only come from locale.
        required('#stopButton').click();
        await waitFor(
          () => required('#sourceStatus').dataset.state === 'idle',
          'stopped offline source'
        );
        await nextSurfaceTurn();

        const stableState = () => ({
          activePage: required('[data-page-button][data-active="true"]')
            .dataset.pageButton,
          preset: required('#presetSelect').value,
          presetName: required('#presetName').value,
          sessionSeed: required('#sessionSeed').value,
          mapping: required('#mappingSelect').value,
          mappingAmount: required('#mappingAmount').value,
          mappingCount: required('#mappingSelect').options.length,
          undoDisabled: required('#undoButton').disabled,
          redoDisabled: required('#redoButton').disabled,
          fxEnabled: required('#fxRackToggle').dataset.enabled,
          fxPressed: required('#fxRackToggle').getAttribute('aria-pressed'),
          sourceState: required('#sourceStatus').dataset.state,
          intentDetailsOpen: intentDetails.open,
          runtimeDetailsOpen: runtimeDetails.open,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          canvasConnected: canvas.isConnected,
          viewportWidth: document.documentElement.clientWidth,
          documentWidth: document.documentElement.scrollWidth,
          horizontalOverflow:
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth + 1
        });
        const visibleText = () => ({
          intent: text('#mappingIntentSummary'),
          runtime: text('#mappingRuntimeSummary'),
          provider: text('#mappingRuntimeProvider'),
          details: text('#mappingRuntimeDetails > summary')
        });

        const beforeLocale = stableState();
        const chineseText = visibleText();
        const contextInitiallyLost = webgl.isContextLost();

        await switchLocalLocale('en-US');
        const englishText = visibleText();
        const afterEnglish = stableState();
        const contextAfterEnglish = canvas.getContext('webgl2');

        await switchLocalLocale('zh-CN');
        const finalChineseText = visibleText();
        const afterChinese = stableState();
        const contextAfterChinese = canvas.getContext('webgl2');

        return {
          ok: true,
          initialLocale,
          finalLocale: document.documentElement.lang,
          initialIntentIsChinese: containsHan(initialIntent),
          initialRuntimeIsChinese: containsHan(initialRuntime),
          collapsed,
          engineering,
          amount: {
            before: oldAmount,
            after: Number(amount.value),
            summaryBefore: intentBeforeAmount,
            summaryAfterImmediateInput: intentAfterImmediateInput,
            changedImmediately:
              intentBeforeAmount !== intentAfterImmediateInput
          },
          offlineAdvance,
          beforeLocale,
          afterEnglish,
          afterChinese,
          chineseText,
          englishText,
          finalChineseText,
          stateStableAcrossEnglish:
            JSON.stringify(beforeLocale) === JSON.stringify(afterEnglish),
          stateStableAcrossChinese:
            JSON.stringify(beforeLocale) === JSON.stringify(afterChinese),
          englishCopyChanged:
            JSON.stringify(chineseText) !== JSON.stringify(englishText),
          chineseCopyRestored:
            JSON.stringify(chineseText) === JSON.stringify(finalChineseText),
          canvasIdentityStable: required('#phase1Canvas') === canvas,
          webglContextStable:
            contextAfterEnglish === webgl && contextAfterChinese === webgl,
          webglContextInitiallyLost: contextInitiallyLost,
          webglContextFinallyLost: webgl.isContextLost()
        };
      })()
    `, true);

    if (!result?.ok) fail('Step 5 renderer returned no result.', result);
    if (
      result.initialLocale !== 'zh-CN' ||
      result.finalLocale !== 'zh-CN' ||
      !result.initialIntentIsChinese ||
      !result.initialRuntimeIsChinese
    ) {
      fail('Step 5 creator/runtime summaries are not Chinese by default.', result);
    }
    if (
      !result.collapsed.intentClosed ||
      !result.collapsed.runtimeClosed ||
      !result.collapsed.intentVisible ||
      !result.collapsed.runtimeVisible ||
      result.collapsed.intent.length < 20 ||
      result.collapsed.runtime.length < 20
    ) {
      fail('Collapsed engineering details hid the creator summaries.', result);
    }
    if (
      !result.engineering.source ||
      !result.engineering.target ||
      !result.engineering.rawIds.includes('source=') ||
      !result.engineering.rawIds.includes('target=') ||
      !/^[A-Z_]+\s*\/\s*[A-Z_]+$/.test(result.engineering.reasonCodes) ||
      !result.engineering.provider ||
      result.engineering.provider === '—' ||
      !/^#\d+/.test(result.engineering.clock) ||
      !result.engineering.clock.includes('ms') ||
      result.engineering.pipelineCount < 7 ||
      result.engineering.pipelineStages.some(stage => !stage)
    ) {
      fail('Expanded Step 5 engineering evidence is incomplete.', result);
    }
    if (
      !result.amount.changedImmediately ||
      result.amount.before === result.amount.after ||
      result.amount.summaryBefore === result.amount.summaryAfterImmediateInput
    ) {
      fail('Mapping intent did not refresh immediately after Amount input.', result);
    }
    if (
      result.offlineAdvance.clockBefore === result.offlineAdvance.clockAfter ||
      result.offlineAdvance.runtimeAfter.length < 20 ||
      !result.offlineAdvance.reasonCodesAfter.includes('/') ||
      result.offlineAdvance.pipelineCountAfter < 7
    ) {
      fail('Offline deterministic playback did not advance runtime evidence.', result);
    }
    if (
      !result.stateStableAcrossEnglish ||
      !result.stateStableAcrossChinese ||
      !result.englishCopyChanged ||
      !result.chineseCopyRestored ||
      !result.canvasIdentityStable ||
      !result.webglContextStable ||
      result.webglContextInitiallyLost ||
      result.webglContextFinallyLost ||
      result.beforeLocale.horizontalOverflow ||
      result.afterEnglish.horizontalOverflow ||
      result.afterChinese.horizontalOverflow ||
      result.beforeLocale.undoDisabled
    ) {
      fail('Locale switching changed Step 5 state or overflowed 820 px.', result);
    }
    if (rendererGone) fail('Electron renderer process exited.', rendererGone);
    if (consoleErrors.length > 0) {
      fail('Console errors were emitted during Step 5 smoke.', consoleErrors);
    }

    console.log(`[Electron Step 5 mapping diagnostics smoke] ${JSON.stringify({
      ok: true,
      locale: result.finalLocale,
      mapping: result.afterChinese.mapping,
      amount: result.afterChinese.mappingAmount,
      reasonCodes: result.engineering.reasonCodes,
      pipelineStages: result.engineering.pipelineStages,
      provider: result.engineering.provider,
      clockAdvanced:
        result.offlineAdvance.clockBefore !== result.offlineAdvance.clockAfter,
      stateStable: result.stateStableAcrossEnglish &&
        result.stateStableAcrossChinese,
      webglContextStable: result.webglContextStable,
      horizontalOverflow: result.afterChinese.horizontalOverflow,
      consoleErrorCount: consoleErrors.length
    })}`);
  } finally {
    window.destroy();
  }
}

app.whenReady()
  .then(run)
  .then(() => app.quit())
  .catch(error => {
    console.error(error);
    app.exit(1);
  });
