// Bar estimates are song annotations. Only the host's cleaned beats drive the radar clock.
(function (root) {
  'use strict';
  const plainCache = new WeakMap(), counterCache = new WeakMap();

  function lastAtOrBefore(times, time) {
    let lo = 0, hi = times.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (times[mid] <= time) lo = mid + 1;
      else hi = mid;
    }
    return lo - 1;
  }

  function ordered(times) {
    return Array.isArray(times) && times.length > 0 &&
      times.every((t, i) => Number.isFinite(t) && t >= 0 && (!i || t > times[i-1]));
  }

  // The plain score retains the six-consecutive-measure rule for its printed lines.
  function prepare(bars) {
    if (!bars || bars.steady || !Array.isArray(bars.localRuns)) return null;
    if (plainCache.has(bars)) return plainCache.get(bars);
    const marks = [];
    let end = -Infinity;
    for (const run of bars.localRuns) {
      const times = run?.beats, count = run?.perBar;
      if (!Number.isInteger(count) || count < 2 || count > 8 || !ordered(times) ||
          times.length < 1 + 6 * count || (times.length-1) % count || times[0] < end) continue;
      for (let i = 0; i < times.length-1; i += count) marks.push(times[i]);
      end = times[times.length-1];
    }
    const grid = marks.length ? {marks} : null;
    plainCache.set(bars,grid);
    return grid;
  }

  function counter(bars) {
    if (!bars || bars.steady || !Array.isArray(bars.candidateMeasures)) return null;
    if (counterCache.has(bars)) return counterCache.get(bars);
    const measures = bars.candidateMeasures;
    const valid = measures.length && measures.every((beats, i) => ordered(beats) &&
      (!i || beats[0] > measures[i-1][measures[i-1].length-1]));
    const result = valid ? {measures, starts: measures.map(beats => beats[0]),
      wideBeat: measures.some(beats => beats.length >= 10)} : null;
    counterCache.set(bars,result);
    return result;
  }

  function positionAt(grid, time) {
    if (!grid || !Number.isFinite(time)) return null;
    const index = lastAtOrBefore(grid.starts,time);
    if (index < 0) return null;
    const beats = grid.measures[index];
    return {bar:index+1, beat:lastAtOrBefore(beats,time)+1, onset:beats[0]};
  }

  function radar(env) {
    if (!env.model?.localBarTrial || env.model.bars?.steady) return env;
    const grid = counter(env.model.bars);
    const position = positionAt(grid,env.now);
    return {...env, localPosition:position, wideBeat:grid?.wideBeat === true,
      barLight:position ? Math.max(0,1-(env.now-position.onset)/.3)**2 : 0};
  }

  const api = Object.freeze({prepare,counter,positionAt,radar});
  root.XinLocalBarTrial = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
