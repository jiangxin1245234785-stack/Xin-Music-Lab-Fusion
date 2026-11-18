(function (root) {
  'use strict';
  const key = 'xin-score-direction-v1';
  const presets = Object.freeze({subtle: 4, natural: 6, lively: 8});

  function attach(onChange) {
    const byId = id => root.document.getElementById(id);
    const panel = byId('scoreDirectionPanel');
    if (!panel) return null;
    const enabled = byId('scoreDirectionOn'), bass = byId('scoreDirectionBass');
    const choice = byId('scoreDirectionPreset'), custom = byId('scoreDirectionCustom');
    const degrees = byId('scoreDirectionDegrees'), output = byId('scoreDirectionOut');
    let saved, imported = false;
    try {
      saved = JSON.parse(root.localStorage.getItem(key));
      if (!saved) {
        saved = JSON.parse(root.localStorage.getItem('xin-score-direction-beta-v1'));
        imported = Boolean(saved);
      }
    } catch (_) {}
    const manual = Number.isFinite(saved?.degrees) ? saved.degrees * (imported ? 2 : 1) : 6;
    const state = {
      enabled: saved?.enabled === true, bass: saved?.bass !== false,
      preset: saved?.preset === 'custom' || Object.hasOwn(presets, saved?.preset) ? saved.preset : 'natural',
      degrees: Math.min(12, Math.max(0, manual))
    };
    function save() {
      try { root.localStorage.setItem(key, JSON.stringify(state)); } catch (_) {}
    }
    function values() {
      return {meteorDirectionDegrees: state.enabled ? (presets[state.preset] ?? state.degrees) : 0,
        meteorBassDirection: state.bass};
    }
    function refresh() {
      enabled.checked = state.enabled; bass.checked = state.bass; choice.value = state.preset;
      choice.disabled = bass.disabled = degrees.disabled = !state.enabled;
      custom.hidden = state.preset !== 'custom';
      degrees.value = String(state.degrees); output.textContent = '±' + state.degrees + '°';
    }
    function commit() { refresh(); save(); onChange(values()); }
    enabled.addEventListener('change', () => { state.enabled = enabled.checked; commit(); });
    bass.addEventListener('change', () => { state.bass = bass.checked; commit(); });
    choice.addEventListener('change', () => { state.preset = choice.value; commit(); });
    degrees.addEventListener('input', () => { state.degrees = Number(degrees.value); commit(); });
    if (imported) save();
    refresh();
    return {values, setActive(active) { panel.hidden = !active; }};
  }
  root.XinScoreDirectionControls = {attach};
})(globalThis);
