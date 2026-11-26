'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.XinMoodCurve = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const unit = x => Number.isFinite(x) && x >= 0 && x <= 1;
  function lengthOf(record) {
    if (record?.kind !== 'mood-curve' || record.schemaVersion !== 1 || record.step !== .5 ||
        !Number.isFinite(record.duration) || record.duration <= 0) return 0;
    return Math.ceil(record.duration / record.step) + 1;
  }
  function valid(record) {
    const n = lengthOf(record);
    if (!n || !Number.isInteger(record.engineVersion) || !record.formulaVersion || !record.scaleVersion ||
        !['half','mix'].includes(record.loudnessMode) || !Array.isArray(record.belowFlatnessGate) ||
        !record.belowFlatnessGate.every((i,j,a) => Number.isInteger(i) && i>=0 && i<n &&
          (!j || i>a[j-1]) && record.components?.logFlatness?.[i]===null)) return false;
    const series = (xs,check) => Array.isArray(xs) && xs.length === n && xs.every(x => x === null || check(x));
    return [record.fast,record.slow,record.shape?.fast,record.shape?.slow].every(xs => series(xs,unit)) &&
      ['lufs','band28Dbfs','logFlatness'].every(key => series(record.components?.[key],Number.isFinite));
  }
  function at(record, seconds) {
    const n = lengthOf(record);
    if (!n || !Number.isFinite(seconds) || seconds < 0 || seconds > record.duration) return {fast:null,slow:null};
    const i = seconds === record.duration ? n-1 : Math.floor(seconds / record.step);
    const j = Math.min(i+1,n-1), start = Math.min(i*record.step,record.duration);
    const ratio = seconds === start ? 0 : (seconds-start)/(Math.min(j*record.step,record.duration)-start);
    function interpolate(xs) {
      if (!Array.isArray(xs) || xs.length !== n || !unit(xs[i])) return null;
      if (!ratio) return xs[i];
      return unit(xs[j]) ? xs[i]+ratio*(xs[j]-xs[i]) : null;
    }
    return {fast:interpolate(record.fast),slow:interpolate(record.slow)};
  }
  return Object.freeze({valid,at});
});
