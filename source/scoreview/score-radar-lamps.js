// Jewel indicators for the radar's seven channel strips.
(function (root) {
  'use strict';

  // Keep the member stems in step with CATS in score-radar.js.
  const MEMBERS = new Map([
    ['vocals', ['vocals']], ['guitar', ['guitar']], ['piano', ['piano', 'keys', 'synth']],
    ['strings', ['strings', 'violin']], ['winds', ['winds', 'brass', 'woodwinds']],
    ['bass', ['bass']], ['drums', ['drums']]
  ]);
  const DEFAULTS = Object.freeze({
    rule: 'own', gateDb: -45, yellowQuantile: .65, redQuantile: .8,
    yellowBelowPeakDb: 6, redBelowPeakDb: 3
  });
  // The layer encoder clamps zero power to 1e-10 before writing the rounded BS.1770 level.
  const ENCODED_ZERO = -100.7;
  const FLOOR = -120;
  const STEP = .005;
  const ATTACK = .05;
  const RELEASE = .25;
  const RESPONSE_KNEE = .04;
  const LOG_RANGE = Math.log1p(1 / RESPONSE_KNEE);
  const WARMING = Math.exp(-LOG_RANGE * STEP / ATTACK);
  const COOLING = Math.exp(-LOG_RANGE * STEP / RELEASE);
  const envelopes = new WeakMap();
  const DARK = Object.freeze({green: 0, yellow: 0, red: 0});

  const PALETTE = Object.freeze({
    green: Object.freeze({glass: '#4fc27a', litRim: '#286845', dark: '#214c33', darkRim: '#12261d', hot: '#fff1be', halo: '85,195,120'}),
    yellow: Object.freeze({glass: '#ffb347', litRim: '#a45824', dark: '#65401f', darkRim: '#362318', hot: '#fff2c0', halo: '255,164,59'}),
    red: Object.freeze({glass: '#e2472f', litRim: '#87271d', dark: '#632923', darkRim: '#371917', hot: '#ffe5b4', halo: '234,65,35'})
  });

  const finite = Number.isFinite;
  const clamp = n => Math.max(0, Math.min(1, n));
  const ease = n => {
    const x = clamp(n);
    return x * x * (3 - 2 * x);
  };
  const option = (value, fallback) => finite(value) ? value : fallback;
  const validLevels = levels => levels?.groups && finite(levels.hop) && levels.hop > 0;
  const levelAtIndex = (row, i) => finite(row[i]) ? row[i] : FLOOR;

  function quantile(sorted, q) {
    const at = (sorted.length - 1) * q;
    const i = Math.floor(at);
    return sorted[i] + (sorted[Math.ceil(at)] - sorted[i]) * (at - i);
  }

  // Each window is one K-weighted mono power level, in dB on the layer's BS.1770-derived scale.
  // Thresholds use those original windows, counting the loudest member of each visible strip once.
  function thresholds(levels, options = {}) {
    const rule = options.rule === 'song' ? 'song' : DEFAULTS.rule;
    // Match the meter's zero by default. An explicit null uses every valid sounding window.
    const gateDb = options.gateDb === null ? null : Math.max(FLOOR, option(options.gateDb, DEFAULTS.gateDb));
    const yellowQ = clamp(option(options.yellowQuantile, DEFAULTS.yellowQuantile));
    const redQ = Math.max(yellowQ, clamp(option(options.redQuantile, DEFAULTS.redQuantile)));
    const yellowBelow = Math.max(0, option(options.yellowBelowPeakDb, DEFAULTS.yellowBelowPeakDb));
    const redBelow = Math.max(0, Math.min(yellowBelow, option(options.redBelowPeakDb, DEFAULTS.redBelowPeakDb)));
    const channels = {};
    const audibleChannels = [];
    const hasLevels = validLevels(levels);
    let peakDb = null;
    for (const [id, members] of MEMBERS) {
      channels[id] = {yellow: null, red: null};
      if (!hasLevels) continue;
      const rows = members.map(member => levels.groups[member]).filter(Array.isArray);
      const count = rows.reduce((length, row) => Math.max(length, row.length), 0);
      const audible = [];
      let channelPeak = -Infinity;
      for (let i = 0; i < count; i++) {
        let db = FLOOR;
        for (const row of rows) db = Math.max(db, levelAtIndex(row, i));
        if (db <= (gateDb ?? ENCODED_ZERO)) continue;
        channelPeak = Math.max(channelPeak, db);
        if (rule === 'own') audible.push(db);
      }
      if (channelPeak === -Infinity) continue;
      peakDb = peakDb === null ? channelPeak : Math.max(peakDb, channelPeak);
      audibleChannels.push(id);
      if (rule === 'own') {
        audible.sort((a, b) => a - b);
        channels[id] = {yellow: quantile(audible, yellowQ), red: quantile(audible, redQ)};
      }
    }
    if (rule === 'song' && peakDb !== null) {
      const yellow = Math.max(gateDb ?? -Infinity, peakDb - yellowBelow);
      const red = Math.max(gateDb ?? -Infinity, peakDb - redBelow);
      for (const id of audibleChannels) {
        channels[id] = {yellow, red};
      }
    }
    return {rule, gateDb, peakDb, channels};
  }

  // Sample each member at window centres. The last window holds to its end, then fades.
  function lampTargets(rows, hop, seconds, gate, limits) {
    const at = Math.max(0, seconds / hop - .5);
    const i = Math.floor(at);
    const fraction = ease(at - i);
    let green = 0, yellow = 0, red = 0;
    for (const row of rows) {
      const last = row.length - 1;
      if (last < 0) continue;
      const left = levelAtIndex(row, Math.min(i, last));
      const right = i < last ? levelAtIndex(row, i + 1) : FLOOR;
      const blend = i < last ? fraction : ease((seconds - row.length * hop) / ATTACK);
      let db, active;
      if (gate !== null) {
        db = i < last ? left * (1 - blend) + right * blend : FLOOR + (left - FLOOR) * (1 - blend);
        active = ease(db - gate);
        yellow = Math.max(yellow, Math.min(active, ease(db - limits.yellow + .5)));
        red = Math.max(red, Math.min(active, ease(db - limits.red + .5)));
      } else {
        const hasLeft = left > ENCODED_ZERO;
        const hasRight = right > ENCODED_ZERO;
        if (!hasLeft && !hasRight) continue;
        // Fade presence at a silence boundary while holding the valid endpoint's level.
        db = hasLeft && hasRight ? left + (right - left) * blend : hasLeft ? left : right;
        active = hasLeft && hasRight ? 1 : hasLeft ? 1 - blend : blend;
        yellow = Math.max(yellow, active * ease(db - limits.yellow + .5));
        red = Math.max(red, active * ease(db - limits.red + .5));
      }
      green = Math.max(green, active);
    }
    return [green, yellow, red];
  }

  // An exponential approach clipped at the target gives a faster rise than fall, with
  // an exact end to the glow. A full-scale step takes 50 ms to rise or 250 ms to fall.
  function respond(value, target) {
    const gap = target - value;
    return gap > 0
      ? target - Math.max(0, (gap + RESPONSE_KNEE) * WARMING - RESPONSE_KNEE)
      : target + Math.max(0, (RESPONSE_KNEE - gap) * COOLING - RESPONSE_KNEE);
  }

  function compileEnvelope(levels, members, gate, limits) {
    const rows = members.map(member => levels.groups[member]).filter(Array.isArray);
    const windows = rows.reduce((length, row) => Math.max(length, row.length), 0);
    const end = Math.ceil((windows * levels.hop + ATTACK + RELEASE) / STEP) + 1;
    const values = new Float32Array(end * 3);
    let green = 0, yellow = 0, red = 0;
    for (let i = 1; i < end; i++) {
      const [active, amber, crimson] = lampTargets(rows, levels.hop, i * STEP, gate, limits);
      green = respond(green, active);
      yellow = respond(yellow, amber);
      red = respond(red, crimson);
      values[i * 3] = green;
      values[i * 3 + 1] = yellow;
      values[i * 3 + 2] = red;
    }
    return values;
  }

  // Cache the song-time envelope, never the previously rendered lamp. A seek, a pause,
  // and export all read the same interpolated result from the same clock.
  function glow(levels, cutoffs, channelId, seconds, options = {}) {
    if (options.enabled === false || !finite(seconds) || seconds <= 0 || !validLevels(levels)) return DARK;
    const limits = cutoffs?.channels?.[channelId];
    const members = MEMBERS.get(channelId);
    if (!members || (cutoffs?.gateDb !== null && !finite(cutoffs?.gateDb)) ||
        !finite(limits?.yellow) || !finite(limits.red)) return DARK;
    let byLevels = envelopes.get(cutoffs);
    if (!byLevels) envelopes.set(cutoffs, byLevels = new WeakMap());
    let byChannel = byLevels.get(levels);
    if (!byChannel) byLevels.set(levels, byChannel = new Map());
    let values = byChannel.get(channelId);
    if (!values) byChannel.set(channelId, values = compileEnvelope(levels, members, cutoffs.gateDb, limits));

    const at = seconds / STEP;
    const index = Math.floor(at) * 3;
    if (index + 5 >= values.length) return DARK;
    const fraction = at - Math.floor(at);
    return {
      green: values[index] + (values[index + 3] - values[index]) * fraction,
      yellow: values[index + 1] + (values[index + 4] - values[index + 1]) * fraction,
      red: values[index + 2] + (values[index + 5] - values[index + 2]) * fraction
    };
  }

  function disc(ctx, x, y, radius, paint) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = paint;
    ctx.fill();
  }

  function drawLamp(ctx, x, y, size, color, brightness, options = {}) {
    const tint = Object.prototype.hasOwnProperty.call(PALETTE, color) && PALETTE[color];
    if (!tint || !finite(size) || size <= 0) return;
    const value = options.enabled === false ? 0 : clamp(option(brightness, 0));
    const rim = size / 2;
    const glass = rim * .78;
    ctx.save();

    // Warm spill catches the paint just beyond the metal seat.
    if (value > 0) {
      const halo = ctx.createRadialGradient(x, y, glass * .7, x, y, rim * 1.86);
      halo.addColorStop(0, `rgba(${tint.halo},${.40 * value})`);
      halo.addColorStop(.46, `rgba(${tint.halo},${.18 * value})`);
      halo.addColorStop(1, `rgba(${tint.halo},0)`);
      disc(ctx, x, y, rim * 1.86, halo);
    }

    // A thin worn metal bevel lit from the upper left, around a recessed glass seat.
    disc(ctx, x + rim * .1, y + rim * .14, rim, 'rgba(13,10,8,.72)');
    const bezel = ctx.createLinearGradient(x - rim * .65, y - rim * .7, x + rim * .65, y + rim * .7);
    bezel.addColorStop(0, '#c5b497');
    bezel.addColorStop(.28, '#786b54');
    bezel.addColorStop(.56, '#40392f');
    bezel.addColorStop(.82, '#28241e');
    bezel.addColorStop(1, '#746550');
    disc(ctx, x, y, rim, bezel);
    disc(ctx, x, y, rim * .86, '#241a14');

    const dark = ctx.createRadialGradient(x - glass * .24, y - glass * .3, 0, x, y, glass);
    dark.addColorStop(0, tint.dark);
    dark.addColorStop(.62, tint.dark);
    dark.addColorStop(1, tint.darkRim);
    disc(ctx, x, y, glass, dark);

    if (value > 0) {
      ctx.save();
      ctx.globalAlpha *= value;
      const lit = ctx.createRadialGradient(x - glass * .17, y - glass * .2, 0, x, y, glass);
      lit.addColorStop(0, tint.hot);
      lit.addColorStop(.20, tint.hot);
      lit.addColorStop(.46, tint.glass);
      lit.addColorStop(.83, tint.glass);
      lit.addColorStop(1, tint.litRim);
      disc(ctx, x, y, glass, lit);
      ctx.restore();
    }

    // Cut faces retain a glint even when the bulb behind the jewel is dark.
    ctx.beginPath();
    ctx.moveTo(x - glass * .87, y - glass * .17);
    ctx.lineTo(x - glass * .55, y - glass * .65);
    ctx.lineTo(x + glass * .08, y - glass * .89);
    ctx.lineTo(x + glass * .61, y - glass * .64);
    ctx.lineTo(x - glass * .18, y - glass * .24);
    ctx.closePath();
    ctx.fillStyle = `rgba(255,234,194,${.29 - .12 * value})`;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x + glass * .79, y + glass * .32);
    ctx.lineTo(x + glass * .44, y + glass * .73);
    ctx.lineTo(x - glass * .21, y + glass * .85);
    ctx.lineTo(x + glass * .18, y + glass * .27);
    ctx.closePath();
    ctx.fillStyle = 'rgba(23,13,8,.20)';
    ctx.fill();
    ctx.restore();
  }

  function draw(ctx, x, y, size, values = DARK, options = {}) {
    const spacing = option(options.spacing, size * 1.22);
    drawLamp(ctx, x, y - spacing, size, 'red', values.red, options);
    drawLamp(ctx, x, y, size, 'yellow', values.yellow, options);
    drawLamp(ctx, x, y + spacing, size, 'green', values.green, options);
  }

  const api = Object.freeze({thresholds, glow, draw, drawLamp, defaults: DEFAULTS, palette: PALETTE});
  root.XinScoreRadarLamps = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
