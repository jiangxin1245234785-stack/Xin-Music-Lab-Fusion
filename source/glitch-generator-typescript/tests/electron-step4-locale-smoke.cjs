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
      // A non-persistent partition guarantees zh-CN is tested as the real
      // default instead of inheriting a developer machine's localStorage.
      partition: `step4-locale-smoke-${process.pid}`
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
        const text = selector =>
          document.querySelector(selector)?.textContent?.trim() ?? '';
        const required = selector => {
          const element = document.querySelector(selector);
          if (!element) throw new Error('Missing Step 4 element: ' + selector);
          return element;
        };
        const nextSurfaceTurn = async () => {
          await wait(40);
          await new Promise(resolve => requestAnimationFrame(() => resolve()));
          await wait(20);
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

        // Exercise a non-default page plus a real Undo-producing FX change.
        required('[data-page-button="map"]').click();
        required('#fxRackToggle').click();
        await nextSurfaceTurn();

        const stableState = () => ({
          activePage: required('[data-page-button][data-active="true"]')
            .dataset.pageButton,
          pageVisibility: Array.from(document.querySelectorAll('[data-page]'))
            .map(page => [page.dataset.page, page.hidden]),
          preset: required('#presetSelect').value,
          presetName: required('#presetName').value,
          sessionSeed: required('#sessionSeed').value,
          mapping: required('#mappingSelect').value,
          mappingOptionCount: required('#mappingSelect').options.length,
          undoDisabled: required('#undoButton').disabled,
          redoDisabled: required('#redoButton').disabled,
          fxEnabled: required('#fxRackToggle').dataset.enabled,
          fxPressed: required('#fxRackToggle').getAttribute('aria-pressed'),
          sourceState: required('#sourceStatus').dataset.state,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          canvasConnected: canvas.isConnected,
          viewportWidth: document.documentElement.clientWidth,
          documentWidth: document.documentElement.scrollWidth,
          horizontalOverflow:
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth + 1
        });

        const titles = () => ({
          perform: text('[data-page="perform"] .safety-panel h2'),
          map: text('[data-page="map"] .mapping-head h2'),
          visual: text('[data-page="visual"] .section-heading h2'),
          shader: text('[data-page="shader"] .shader-page-heading h2'),
          advanced: text('[data-page="advanced"] #recoveryPanel h2')
        });
        const nav = () => Object.fromEntries(
          Array.from(document.querySelectorAll('[data-page-button]')).map(
            button => [button.dataset.pageButton, button.textContent.trim()]
          )
        );
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

        const chineseExpected = {
          perform: '柔性保护 + 物理硬上限',
          map: '连续映射卡（MappingCard）',
          visual: '基础值 / 映射后 / 最终值',
          shader: '编译候选代码 → 仅在有效时应用',
          advanced: '自动保存 + 崩溃恢复'
        };
        const englishExpected = {
          perform: 'Soft Protection + Physical Cap',
          map: 'Continuous MappingCard',
          visual: 'Base / Mapped / Final',
          shader: 'Compile Candidate → Apply Only When Valid',
          advanced: 'Autosave + Crash Recovery'
        };
        const chineseNavExpected = {
          perform: '实时预览',
          map: '映射关系',
          visual: '画面参数',
          shader: '画面算法',
          advanced: '系统与诊断'
        };

        const initialLocale = document.documentElement.lang;
        const initialTitles = titles();
        const initialNav = nav();
        const before = stableState();
        const contextInitiallyLost = webgl.isContextLost();

        await switchLocalLocale('en-US');
        const englishTitles = titles();
        const afterEnglish = stableState();
        const contextAfterEnglish = canvas.getContext('webgl2');

        await switchLocalLocale('zh-CN');
        const finalTitles = titles();
        const finalNav = nav();
        const afterChinese = stableState();
        const contextAfterChinese = canvas.getContext('webgl2');

        return {
          ok: true,
          initialLocale,
          finalLocale: document.documentElement.lang,
          chineseExpected,
          englishExpected,
          chineseNavExpected,
          initialTitles,
          englishTitles,
          finalTitles,
          initialNav,
          finalNav,
          before,
          afterEnglish,
          afterChinese,
          stableAcrossEnglish:
            JSON.stringify(before) === JSON.stringify(afterEnglish),
          stableAcrossChinese:
            JSON.stringify(before) === JSON.stringify(afterChinese),
          canvasIdentityStable:
            required('#phase1Canvas') === canvas,
          webglContextStable:
            contextAfterEnglish === webgl && contextAfterChinese === webgl,
          webglContextInitiallyLost: contextInitiallyLost,
          webglContextFinallyLost: webgl.isContextLost(),
          undoWasExercised: before.undoDisabled === false,
          sourceWasOffline: before.sourceState === 'offline'
        };
      })()
    `, true);

    if (!result?.ok) fail('Step 4 renderer returned no result.', result);
    if (result.initialLocale !== 'zh-CN' || result.finalLocale !== 'zh-CN') {
      fail('Chinese is not the real default/final locale.', result);
    }
    if (
      JSON.stringify(result.initialTitles) !==
        JSON.stringify(result.chineseExpected) ||
      JSON.stringify(result.finalTitles) !==
        JSON.stringify(result.chineseExpected)
    ) {
      fail('One or more five-page Chinese titles are missing.', result);
    }
    if (
      JSON.stringify(result.englishTitles) !==
      JSON.stringify(result.englishExpected)
    ) {
      fail('The five-page English surface was not restored.', result);
    }
    if (
      JSON.stringify(result.initialNav) !==
        JSON.stringify(result.chineseNavExpected) ||
      JSON.stringify(result.finalNav) !==
        JSON.stringify(result.chineseNavExpected)
    ) {
      fail('The five page-tab labels are not fully Chinese.', result);
    }
    if (
      !result.stableAcrossEnglish ||
      !result.stableAcrossChinese ||
      !result.canvasIdentityStable ||
      !result.webglContextStable ||
      result.webglContextInitiallyLost ||
      result.webglContextFinallyLost ||
      !result.undoWasExercised ||
      !result.sourceWasOffline ||
      result.before.horizontalOverflow ||
      result.afterEnglish.horizontalOverflow ||
      result.afterChinese.horizontalOverflow
    ) {
      fail('Locale switching changed Demo state or the WebGL surface.', result);
    }
    if (rendererGone) fail('Electron renderer process exited.', rendererGone);
    if (consoleErrors.length > 0) {
      fail('Console errors were emitted during Step 4 smoke.', consoleErrors);
    }

    console.log(`[Electron Step 4 locale smoke] ${JSON.stringify({
      ok: true,
      pages: result.finalTitles,
      activePage: result.afterChinese.activePage,
      preset: result.afterChinese.preset,
      sessionSeed: result.afterChinese.sessionSeed,
      mapping: result.afterChinese.mapping,
      fxEnabled: result.afterChinese.fxEnabled,
      undoEnabled: !result.afterChinese.undoDisabled,
      sourceState: result.afterChinese.sourceState,
      canvas: [
        result.afterChinese.canvasWidth,
        result.afterChinese.canvasHeight
      ],
      webglContextStable: result.webglContextStable,
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
