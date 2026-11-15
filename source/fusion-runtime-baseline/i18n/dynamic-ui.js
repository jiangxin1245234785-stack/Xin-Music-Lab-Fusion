(function initMusicLabDynamicUi(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.XinMusicLabDynamicUi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createDynamicUiModule(root) {
  'use strict';

  const runtimeBindings = new Map();

  const TEXT_BINDINGS = Object.freeze([
    ['#fusionReveal', 'fusion.locateFile'],
    ['#fusionLoad', 'fusion.importJson'],
    ['#fusionOpenXldLab', 'fusion.advancedLab'],
    ['#fusionResultsRefresh', 'fusion.resultsRefresh'],
    ['#fusionAnalysisOptions summary', 'fusion.analysisOptions'],
    ['#fusionAnalysisRun', 'fusion.startAnalysis'],
    ['#fusionAnalysisCancel', 'fusion.cancel'],
    ['#fusionLocateTrack', 'fusion.locateTrack'],
    ['#fusionRefresh', 'fusion.refresh'],
    ['#fusionLibraryAnalyzed + span', 'fusion.analyzedOnly'],
    ['#conductorPanel .calibration-head h2', 'conductor.title'],
    ['[data-conductor-position="left"]', 'position.left'],
    ['[data-conductor-position="center"]', 'position.center'],
    ['[data-conductor-position="right"]', 'position.right'],
    ['#conductorReset', 'common.restoreDefault'],
    ['#glitchPanel > .calibration-head h2', 'glitch.title'],
    ['#glitchPanel .glitch-mapping-note > span', 'glitch.mappingNote'],
    ['#glitchPanel .panel-section-label', 'glitch.weightPresets'],
    ['[data-glitch-preset="balanced"]', 'glitch.preset.balanced'],
    ['[data-glitch-preset="orchestral"]', 'glitch.preset.orchestral'],
    ['[data-glitch-preset="impact"]', 'glitch.preset.impact'],
    ['[data-glitch-preset="acid"]', 'glitch.preset.acid'],
    ['[data-glitch-preset="weg"]', 'glitch.preset.weg'],
    ['[data-glitch-preset="restrained"]', 'glitch.preset.restrained'],
    ['#glitchPresetSave', 'glitch.saveCurrent'],
    ['#glitchReset', 'common.restoreDefault'],
    ['#palettePanel .calibration-head h2', 'palette.title'],
    ['[data-palette-preset="synthwave"]', 'palette.synthwave'],
    ['[data-palette-preset="toxic"]', 'palette.toxic'],
    ['[data-palette-preset="ultraviolet"]', 'palette.ultraviolet'],
    ['[data-palette-preset="solar"]', 'palette.solar'],
  ]);

  const ATTRIBUTE_BINDINGS = Object.freeze([
    ['#fusionPanel', 'aria-label', 'fusion.panelAria'],
    ['#fusionClose', 'aria-label', 'fusion.closeAria'],
    ['#fusionReveal', 'title', 'fusion.locateFileTitle'],
    ['#fusionLoad', 'title', 'fusion.importJsonTitle'],
    ['#fusionLocateTrack', 'title', 'fusion.locateTrackTitle'],
    ['#fusionAnalysisCard', 'aria-label', 'fusion.analysisAria'],
    ['#fusionOpenXldLab', 'title', 'fusion.advancedLabTitle'],
    ['#fusionAnalysisEngine', 'aria-label', 'fusion.analysisEngineAria'],
    ['#fusionPrevious', 'aria-label', 'media.previous'],
    ['#fusionPlay', 'aria-label', 'media.playPause'],
    ['#fusionNext', 'aria-label', 'media.next'],
    ['#fusionSeek', 'aria-label', 'fusion.seekAria'],
    ['#fusionLibrarySearch', 'placeholder', 'fusion.searchPlaceholder'],
    ['#fusionLibrarySearch', 'aria-label', 'fusion.searchAria'],
    ['#fusionLibraryAnalyzed', 'title', 'fusion.analyzedOnlyTitle'],
    ['#fusionLibraryList', 'aria-label', 'fusion.trackListAria'],
    ['#conductorPanel', 'aria-label', 'conductor.panelAria'],
    ['#conductorClose', 'aria-label', 'conductor.closeAria'],
    ['#glitchPanel', 'aria-label', 'glitch.panelAria'],
    ['#glitchClose', 'aria-label', 'glitch.closeAria'],
    ['#glitchCurveCanvas', 'aria-label', 'glitch.curveAria'],
    ['#glitchPresetName', 'placeholder', 'glitch.presetNamePlaceholder'],
    ['#palettePanel', 'aria-label', 'palette.panelAria'],
    ['#paletteClose', 'aria-label', 'palette.closeAria'],
  ]);

  const CONTROL_LABEL_BINDINGS = Object.freeze([
    ['#fusionSectionEngine', 'fusion.sectionEngine'],
    ['#fusionChordEngine', 'fusion.chordEngine'],
    ['#fusionAutoColor', 'fusion.autoColorInput'],
    ['[data-conductor-key="speed"]', 'conductor.speed'],
    ['[data-conductor-key="gesture"]', 'conductor.gesture'],
    ['[data-conductor-key="size"]', 'conductor.size'],
    ['[data-conductor-key="facing"]', 'conductor.facing'],
    ['[data-conductor-key="labels"]', 'conductor.labels'],
    ['[data-conductor-key="x"]', 'conductor.x'],
    ['[data-conductor-key="y"]', 'conductor.y'],
    ['[data-conductor-key="orchestra"]', 'conductor.orchestra'],
    ['[data-glitch-key="ensembleWeight"]', 'glitch.ensembleWeight'],
    ['[data-glitch-key="drumWeight"]', 'glitch.drumWeight'],
    ['[data-glitch-key="abrasionWeight"]', 'glitch.abrasionWeight'],
    ['[data-glitch-key="sectionDrive"]', 'glitch.sectionDrive'],
    ['[data-glitch-key="fxStrength"]', 'glitch.fxStrength'],
    ['[data-glitch-key="rhythmLock"]', 'glitch.rhythmLock'],
    ['[data-glitch-key="drumLow"]', 'glitch.drumLow'],
    ['[data-glitch-key="drumMid"]', 'glitch.drumMid'],
    ['[data-glitch-key="drumHigh"]', 'glitch.drumHigh'],
    ['[data-glitch-key="abrasionDissonance"]', 'glitch.dissonance'],
    ['[data-glitch-key="abrasionRoughness"]', 'glitch.roughness'],
    ['[data-glitch-key="abrasionTransient"]', 'glitch.transient'],
    ['[data-glitch-key="abrasionSweep"]', 'glitch.sweep'],
    ['[data-glitch-key="baseLayer"]', 'glitch.baseLayer'],
    ['[data-glitch-key="noiseLayer"]', 'glitch.noiseLayer'],
    ['[data-glitch-key="burstLayer"]', 'glitch.burstLayer'],
    ['[data-glitch-key="tensionBuild"]', 'glitch.tensionBuild'],
    ['[data-glitch-key="eventSpacing"]', 'glitch.eventSpacing'],
    ['[data-glitch-key="rhythmSubdivision"]', 'glitch.rhythmSubdivision'],
    ['[data-color-fx-key="cycle"]', 'palette.colorCycle'],
    ['[data-color-fx-key="breath"]', 'palette.breath'],
    ['[data-color-fx-key="strobe"]', 'palette.strobe'],
  ]);

  function bridge(target) {
    return (target || root)?.xinMusicLabLocale || null;
  }

  function t(key, params, fallback = '') {
    const localeBridge = bridge(root);
    if (!localeBridge) return fallback || `[${key}]`;
    return localeBridge.t(key, params);
  }

  function setLeadingText(element, value) {
    if (!element) return;
    const textNode = Array.from(element.childNodes || []).find(node => node.nodeType === 3);
    if (textNode) textNode.nodeValue = `${value} `;
    else element.prepend(element.ownerDocument.createTextNode(`${value} `));
  }

  function applyPanelChrome(target) {
    const host = target || root;
    const document = host?.document;
    if (!document || !bridge(host)) return 0;
    let count = 0;
    for (const [selector, key] of TEXT_BINDINGS) {
      for (const element of document.querySelectorAll(selector)) {
        element.textContent = bridge(host).t(key);
        count += 1;
      }
    }
    for (const [selector, attribute, key] of ATTRIBUTE_BINDINGS) {
      for (const element of document.querySelectorAll(selector)) {
        element.setAttribute(attribute, bridge(host).t(key));
        count += 1;
      }
    }
    for (const [selector, key] of CONTROL_LABEL_BINDINGS) {
      for (const control of document.querySelectorAll(selector)) {
        const label = control.closest('label');
        const labelText = label?.querySelector(':scope > span') || label;
        setLeadingText(labelText, bridge(host).t(key));
        count += 1;
      }
    }
    return count;
  }

  function renderRuntimeBinding(element, binding) {
    if (!element?.isConnected) return false;
    const value = t(binding.key, binding.params, binding.fallback);
    if (binding.attribute === 'textContent') element.textContent = value;
    else element.setAttribute(binding.attribute, value);
    return true;
  }

  function bind(element, attribute, key, params, fallback) {
    if (!element) return fallback || '';
    const binding = Object.freeze({ attribute, key, params: Object.freeze({ ...(params || {}) }), fallback });
    runtimeBindings.set(element, binding);
    renderRuntimeBinding(element, binding);
    return element[attribute] || element.getAttribute?.(attribute) || '';
  }

  function bindText(element, key, params, fallback) {
    return bind(element, 'textContent', key, params, fallback);
  }

  function bindAttribute(element, attribute, key, params, fallback) {
    return bind(element, attribute, key, params, fallback);
  }

  function unbind(element) {
    return runtimeBindings.delete(element);
  }

  function refreshRuntimeBindings() {
    let count = 0;
    for (const [element, binding] of [...runtimeBindings]) {
      if (!element?.isConnected) runtimeBindings.delete(element);
      else if (renderRuntimeBinding(element, binding)) count += 1;
    }
    return count;
  }

  function mountDynamicUi(target) {
    const host = target || root;
    if (!host?.document || !bridge(host)) return null;
    if (host.__xinMusicLabDynamicUi) return host.__xinMusicLabDynamicUi;
    const render = () => ({ chrome: applyPanelChrome(host), runtime: refreshRuntimeBindings() });
    const unsubscribe = bridge(host).subscribe(render);
    const mounted = Object.freeze({ render, destroy: unsubscribe });
    Object.defineProperty(host, '__xinMusicLabDynamicUi', { value: mounted, enumerable: false });
    return mounted;
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    return bridge(root)?.subscribe(listener) || (() => {});
  }

  function mountWhenReady() {
    if (!root?.document) return;
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', () => mountDynamicUi(root), { once: true });
    } else mountDynamicUi(root);
  }

  mountWhenReady();
  return Object.freeze({
    TEXT_BINDINGS, ATTRIBUTE_BINDINGS, CONTROL_LABEL_BINDINGS,
    t, bindText, bindAttribute, unbind, subscribe, applyPanelChrome, refreshRuntimeBindings,
    mountDynamicUi
  });
});
