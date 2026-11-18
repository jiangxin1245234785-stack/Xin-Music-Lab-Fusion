(function (root) {
  'use strict';
  const storageKey = 'xin-score-transient-timing-v1';
  const presets = Object.freeze({natural:[.70,1], crisp:[.55,.80], relaxed:[.90,1.25]});

  function attach(onChange) {
    const byId = id => root.document.getElementById(id);
    const panel = byId('scoreTransientPanel');
    if (!panel) return null;
    const plucks=byId('scoreQuickPlucks'), drums=byId('scoreQuickDrums'), preset=byId('scoreDecayPreset');
    const custom=byId('scoreDecayCustom'), seconds=byId('scoreDecaySeconds'), factor=byId('scoreDrumScale');
    const secondsOut=byId('scoreDecaySecondsOut'), factorOut=byId('scoreDrumScaleOut');
    let stored;
    try { stored=JSON.parse(root.localStorage.getItem(storageKey)); } catch (_) {}
    const limit = (n,lo,hi,otherwise) => Number.isFinite(n) && n>0 ? Math.min(hi,Math.max(lo,n)) : otherwise;
    const state = {
      plucks:stored?.plucks!==false, drums:stored?.drums!==false,
      preset:stored?.preset==='custom' || Object.hasOwn(presets,stored?.preset) ? stored.preset : 'natural',
      seconds:limit(stored?.seconds,.25,3,.70), factor:limit(stored?.factor,.5,4,1)
    };
    function values() {
      const pair=presets[state.preset] || [state.seconds,state.factor];
      return {pluckReleaseSeconds:state.plucks ? pair[0] : 0, drumDecayScale:state.drums ? pair[1] : 0};
    }
    function refresh() {
      plucks.checked=state.plucks; drums.checked=state.drums; preset.value=state.preset;
      preset.disabled=!state.plucks && !state.drums;
      custom.hidden=state.preset!=='custom';
      seconds.disabled=!state.plucks; factor.disabled=!state.drums;
      seconds.value=String(state.seconds); factor.value=String(state.factor);
      secondsOut.textContent=state.seconds.toFixed(2)+' s'; factorOut.textContent=state.factor.toFixed(2)+'×';
    }
    function commit() {
      refresh();
      try { root.localStorage.setItem(storageKey,JSON.stringify(state)); } catch (_) {}
      onChange(values());
    }
    plucks.addEventListener('change',()=>{ state.plucks=plucks.checked; commit(); });
    drums.addEventListener('change',()=>{ state.drums=drums.checked; commit(); });
    preset.addEventListener('change',()=>{ state.preset=preset.value; commit(); });
    seconds.addEventListener('input',()=>{ state.seconds=Number(seconds.value); commit(); });
    factor.addEventListener('input',()=>{ state.factor=Number(factor.value); commit(); });
    refresh();
    return {values, setActive(active) {panel.hidden=!active;}};
  }
  root.XinScoreTransientControls = {attach};
})(globalThis);
