(() => {
  'use strict';

  const SANS = '"Microsoft YaHei UI", "Noto Sans CJK SC", sans-serif';
  const SERIF = '"Songti SC", SimSun, "Noto Serif CJK SC", serif';
  const NUMERALS = '"Cascadia Mono", Consolas, monospace';
  const METALS = {
    vocals: ['人声', '#e2ada0'],
    strings: ['弦乐', '#d9bc8d'],
    winds: ['管乐', '#d0a073'],
    piano: ['键盘', '#f3d7ab'],
    guitar: ['吉他', '#ad6847'],
    other: ['其它', '#527782'],
    drums: ['鼓', '#365d69'],
    bass: ['贝斯', '#26404e']
  };
  const TONES = {
    meguri: {
      sky: ['#192432', '#303e4d', '#454f56'],
      glow: 'rgba(182, 144, 110, .14)',
      distant: ['#636a70', '#394e60', '#293d4e'],
      middle: ['#777b7a', '#445a63', '#273c48']
    },
    qili: {
      sky: ['#1c2834', '#344751', '#525b5b'],
      glow: 'rgba(224, 182, 117, .17)',
      distant: ['#707571', '#4d626b', '#344b56'],
      middle: ['#8b796c', '#57676a', '#354951']
    },
    dawn: {
      sky: ['#1b2734', '#33434f', '#4a5358'],
      glow: 'rgba(194, 156, 113, .15)',
      distant: ['#6b7074', '#435865', '#314755'],
      middle: ['#7d7c75', '#4d6066', '#314552']
    }
  };
  const cache = new WeakMap();
  const midiCache = new WeakMap();
  const VOICE_COLORS = ['rgba(255, 234, 192, .97)', 'rgba(177, 214, 218, .93)'];
  const LEAD_FAMILIES = ['vocals', 'strings', 'winds', 'piano', 'guitar', 'other', 'bass', 'drums'];
  const SUPPORT_FAMILIES = ['bass', 'strings', 'piano', 'winds', 'guitar', 'other', 'vocals'];
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const mix = (a, b, amount) => a + (b - a) * amount;
  const songPalettes = new Map([
    ['185c26ddfa52bc04f027409331b9b912b43458dd', 'meguri'],
    ['0774d037b17b21de6bbb5ad9e6ea166cd426431a', 'qili']
  ]);
  const songPalette = frame => songPalettes.get(frame.song.track?.id || frame.key) || 'dawn';

  function sortedQuantile(sorted, fraction) {
    return sorted[Math.floor(fraction * (sorted.length - 1))];
  }

  function accumulatedPower(values) {
    const sums = new Float64Array(values.length + 1);
    for (let i = 0; i < values.length; i += 1) {
      const db = values[i];
      sums[i + 1] = sums[i] + (Number.isFinite(db) && db > -80 ? 10 ** (db / 10) : 0);
    }
    return sums;
  }

  function averagedPower(sums, hop, time, radius) {
    const end = sums.length - 1;
    if (!end || time >= end * hop + radius) return 0;
    const left = clamp((time - radius) / hop, 0, end);
    const right = clamp((time + radius) / hop, 0, end);
    if (right <= left) return 0;
    const leftBin = Math.floor(left);
    const rightBin = Math.floor(right);
    const powerBefore = mix(sums[leftBin], sums[Math.min(leftBin + 1, end)], left - leftBin);
    const powerAfter = mix(sums[rightBin], sums[Math.min(rightBin + 1, end)], right - rightBin);
    return Math.max(0, (powerAfter - powerBefore) / (right - left));
  }

  function interpolate(points, time, key) {
    const at = clamp(time / points.duration, 0, 1) * (points.data.length - 1);
    const index = Math.floor(at);
    const next = Math.min(index + 1, points.data.length - 1);
    return mix(points.data[index][key], points.data[next][key], at - index);
  }

  function sumStemLevels(groups) {
    const stems = Object.values(groups).filter(Array.isArray);
    const count = Math.max(0, ...stems.map(values => values.length));
    return Array.from({ length: count }, (_, i) => {
      const power = stems.reduce((sum, values) =>
        sum + (Number.isFinite(values[i]) && values[i] > -80 ? 10 ** (values[i] / 10) : 0), 0);
      return power > 0 ? 10 * Math.log10(power) : -100;
    });
  }

  function midiActivity(song, duration, hop) {
    const count = Math.ceil(duration / hop);
    const changes = new Float64Array(count + 1);
    let available = false;
    for (const lane of Array.isArray(song.lanes) ? song.lanes : []) {
      if (!lane) continue;
      const percussive = lane.kind === 'drums';
      const events = percussive ? lane.hits : lane.notes;
      for (const event of Array.isArray(events) ? events : []) {
        if (!Array.isArray(event)) continue;
        const [start, length] = event;
        const end = start + (percussive ? hop : length);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end <= 0 || start >= duration) continue;
        changes[Math.max(0, Math.floor(start / hop))] += 1;
        changes[Math.min(count, Math.ceil(end / hop))] -= 1;
        available = true;
      }
    }
    if (!available) return null;
    const sums = new Float64Array(count + 1);
    let active = 0;
    for (let i = 0; i < count; i += 1) {
      active += changes[i];
      sums[i + 1] = sums[i] + Math.log1p(active);
    }
    return sums;
  }

  function sourceData(song, duration) {
    const cached = cache.get(song);
    if (cached?.duration === duration) return cached;
    const levels = song.levels?.groups || {};
    const levelsHop = song.levels?.hop > 0 ? song.levels.hop : 1;
    const hasMix = Array.isArray(song.energy?.db) && song.energy.hop > 0 &&
      song.energy.db.some(Number.isFinite);
    const energy = hasMix ? song.energy.db : sumStemLevels(levels);
    let energyHop = hasMix ? song.energy.hop : levelsHop;
    let energySums = accumulatedPower(energy);
    let basis = hasMix ? 'mix' : energy.length ? 'stems' : 'none';
    const measured = energy.filter(db => Number.isFinite(db) && db > -65).sort((a, b) => a - b);
    const floor = measured.length ? Math.max(-44, sortedQuantile(measured, 0.075) - 7) : -36;
    const ceiling = measured.length ? Math.max(floor + 9, sortedQuantile(measured, 0.98) + 1.4) : -8;
    let rise = power => clamp((10 * Math.log10(Math.max(1e-12, power)) - floor) / (ceiling - floor), 0, 1) ** 1.17;
    if (basis === 'none') {
      const hop = 0.1;
      const activity = midiActivity(song, duration, hop);
      if (activity) {
        basis = 'midi';
        energySums = activity;
        energyHop = hop;
        // Here height follows the amount of score activity. It carries no loudness estimate.
        rise = value => clamp(value * .27, 0, .72);
      }
    }

    // A repeatable minimum presence test keeps isolated separation bleed from
    // creating a labelled geological band across an instrumental arrangement.
    const beds = Object.entries(METALS).flatMap(([id, [label, color]]) => {
      const values = levels[id];
      if (!Array.isArray(values)) return [];
      const audibleFrames = values.filter(db => db > -50).length;
      if (audibleFrames * levelsHop < Math.min(duration * .55, Math.max(4, duration * .015))) return [];
      return [{ id, label, color, sums: accumulatedPower(values) }];
    });

    function sample(time) {
      const fast = rise(averagedPower(energySums, energyHop, time, .18));
      const close = rise(averagedPower(energySums, energyHop, time, .62));
      const broad = rise(averagedPower(energySums, energyHop, time, 1.65));
      const middle = rise(averagedPower(energySums, energyHop, time, 3.45));
      const far = rise(averagedPower(energySums, energyHop, time, 7.9));
      const powers = beds.map(bed => averagedPower(bed.sums, levelsHop, time, 1.33));
      const total = powers.reduce((sum, power) => sum + power, 0);
      const shares = powers.map(power => total > 1e-7 ? power / total : 0);
      return { rise: .56 * broad + .27 * close + .17 * fast, fast, middle, far, shares };
    }
    const count = Math.max(2, Math.min(3600, Math.ceil(duration * 3) + 1));
    const data = Array.from({ length: count }, (_, index) => sample(duration * index / (count - 1)));
    const result = { duration, basis, beds, data, sample, world: new Map(), layers: new Map() };
    cache.set(song, result);
    return result;
  }

  function layout(w, h) {
    const narrow = w < 640 || w / h < 1.1;
    const unit = clamp(Math.min(w / 1280, h / 720), 0.67, 2);
    const margin = narrow ? Math.max(16, w * .055) : w * .063;
    const miniBottom = h - Math.max(narrow ? 25 : 30, 28 * unit);
    const miniTop = miniBottom - Math.min(h * .092, (narrow ? 27 : 40) * unit);
    const materialFloor = miniTop - Math.min(h * .12, Math.max(38 * unit, h * .075));
    return {
      w, h, unit, narrow, left: margin, right: w - margin, heading: Math.max(17, h * .057),
      miniTop, miniBottom, materialFloor, floor: h * 1.017, rise: h * (narrow ? .71 : .735)
    };
  }


  const xAt = (l, ratio) => mix(l.left, l.right, ratio);
  const durationOf = frame => Number.isFinite(frame.duration) && frame.duration > 0
    ? frame.duration
    : frame.song?.track?.duration;

  function stamp(seconds) {
    const whole = Math.floor(seconds + 0.005);
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
  }

  function text(ctx, value, x, y, color, font, align = 'left') {
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;
    ctx.font = font;
    ctx.fillText(value, x, y);
  }

  function fitText(ctx, value, font, max) {
    if (max <= 0) return '';
    const words = Array.from(String(value || '').trim());
    ctx.font = font;
    if (ctx.measureText(words.join('')).width <= max) return words.join('');
    if (ctx.measureText('…').width > max) return '';
    let lo = 0;
    let hi = words.length;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >>> 1;
      if (ctx.measureText(words.slice(0, mid).join('') + '…').width <= max) lo = mid;
      else hi = mid;
    }
    return words.slice(0, lo).join('') + '…';
  }

  function wrapRows(ctx, value, font, width, count) {
    ctx.font = font;
    const tokens = String(value || '').trim().match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[^\s\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+|\s+/gu) || [];
    const words = [];
    for (const token of tokens) {
      const trailing = token.match(/^[，。、；：！？）】》」』…,.!?:;]+/u)?.[0];
      if (trailing && words.length && words.at(-1).trim()) {
        words[words.length - 1] += trailing;
        if (token.length > trailing.length) words.push(token.slice(trailing.length));
      } else words.push(token);
    }
    const rows = [];
    let row = '';
    for (const word of words) {
      if (!word.trim()) {
        if (row) row += ' ';
        continue;
      }
      if (ctx.measureText(row + word).width > width && row.trim()) {
        rows.push(row.trim());
        row = '';
      }
      if (ctx.measureText(word).width <= width) {
        row += word;
      } else for (const character of word) {
        if (row && ctx.measureText(row + character).width > width) {
          rows.push(row.trim());
          row = '';
        }
        row += character;
      }
    }
    if (row.trim()) rows.push(row.trim());
    if (rows.length <= count) return rows;
    return [...rows.slice(0, count - 1), fitText(ctx, rows[count - 1] + '…', font, width)];
  }

  function headingRows(ctx, value, preferred, minimum, width, fontAt, count) {
    let size = preferred, font = fontAt(size), rows = wrapRows(ctx, value, font, width, count);
    while (size > minimum && rows.at(-1)?.endsWith('…')) {
      size = Math.max(minimum, size * .91);
      font = fontAt(size);
      rows = wrapRows(ctx, value, font, width, count);
    }
    return { size, font, rows };
  }


  function rect(ctx, x, y, width, height, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width, height);
  }

  function gradient(ctx, x0, y0, x1, y1, stops) {
    const paint = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const [position, color] of stops) paint.addColorStop(position, color);
    return paint;
  }

  function line(ctx, fromX, fromY, toX, toY, color, width = 1) {
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function polygon(ctx, l, upper, lower) {
    ctx.beginPath();
    ctx.moveTo(l.left, upper[0]);
    for (let i = 1; i < upper.length; i += 1) ctx.lineTo(xAt(l, i / (upper.length - 1)), upper[i]);
    for (let i = lower.length - 1; i >= 0; i -= 1) {
      ctx.lineTo(xAt(l, i / (lower.length - 1)), lower[i]);
    }
    ctx.closePath();
  }

  function contour(ctx, l, heights, style, weight) {
    ctx.beginPath();
    ctx.moveTo(l.left, heights[0]);
    for (let i = 1; i < heights.length; i += 1) ctx.lineTo(xAt(l, i / (heights.length - 1)), heights[i]);
    ctx.strokeStyle = style;
    ctx.lineWidth = weight;
    ctx.stroke();
  }

  function tint(hex, amount) {
    const target = amount > 0 ? 255 : 0;
    const packed = Number.parseInt(hex.slice(1), 16);
    const channels = [packed >> 16, (packed >> 8) & 255, packed & 255];
    return `rgb(${channels.map(value => Math.round(mix(value, target, Math.abs(amount)))).join(',')})`;
  }

  function paper(ctx, l, density, seed, light, darkness) {
    const count = Math.round(l.w * l.h * density);
    let state = seed;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    ctx.fillStyle = light;
    for (let i = 0; i < count; i += 1) {
      const x = random() * l.w;
      const y = random() * l.h;
      const size = random();
      ctx.fillRect(x, y, 0.5 + size * l.unit, 0.35 + size * 0.58);
    }
    ctx.fillStyle = darkness;
    for (let i = 0; i < count; i += 1) {
      ctx.fillRect(random() * l.w, random() * l.h, 0.7 + random() * l.unit, 0.6);
    }
  }

  function movingWindow(l, duration, time) {
    const left = 0;
    const right = l.w;
    const span = l.narrow ? 18 : 24;
    const pxPerSecond = (right - left) / span;
    const start = time - span * .4;
    const end = start + span;
    return {
      left, right, top: Math.min(l.h * .24, l.miniTop * .63), bottom: l.miniTop,
      span, start, end, time, pxPerSecond, playheadX: xAt({ left, right }, .4), scrollX: time * pxPerSecond,
      visibleStart: Math.max(0, start), visibleEnd: Math.min(duration, end)
    };
  }

  const worldX = (view, time) => view.playheadX + (time - view.time) * view.pxPerSecond;
  const WORLD_STEP = 1 / 18;

  function worldSample(source, time) {
    const index = Math.round(time / WORLD_STEP);
    if (!source.world.has(index)) source.world.set(index, source.sample(index * WORLD_STEP));
    return source.world.get(index);
  }

  function formation(l, time, point, dataEnd) {
    const thickness = l.rise * point.rise;
    const knee = l.h * .50;
    // The same depth projection applies to each rock boundary and its MIDI seam.
    const project = y => {
      const deep = clamp((y - knee) / (l.floor - knee), 0, 1);
      return y - (l.floor - l.materialFloor) * deep * deep * (3 - 2 * deep);
    };
    let level = l.floor - thickness;
    const ridge = project(level);
    const bounds = [ridge];
    for (const share of point.shares) {
      level += thickness * share;
      bounds.push(project(level));
    }
    const opening = clamp(Math.min(time, dataEnd - time) / 1.1, 0, 1) ** .83;
    return {
      time, point, ridge, bounds,
      far: l.floor - l.rise * opening * (.46 + point.far * .51),
      middle: l.floor - l.rise * opening * (.26 + point.middle * .73)
    };
  }

  function worldProfile(source, l, view, dataEnd) {
    const from = Math.floor(view.visibleStart / WORLD_STEP);
    const to = Math.ceil(Math.min(view.visibleEnd, dataEnd) / WORLD_STEP);
    if (to <= from) return null;
    const points = [];
    for (let n = from; n <= to; n += 1) {
      const t = n * WORLD_STEP;
      points.push(formation(l, t, worldSample(source, t), dataEnd));
    }
    return { first: from, points, left: worldX(view, points[0].time), right: worldX(view, points.at(-1).time) };
  }

  function soilShape(ctx, profile, heights, l, colors, edge) {
    polygon(ctx, profile, heights, heights.map(() => l.floor));
    ctx.fillStyle = gradient(ctx, 0, l.h * .18, 0, l.floor, [
      [0, colors[0]], [.48, colors[1]], [1, colors[2]]
    ]);
    ctx.fill();
    contour(ctx, profile, heights, edge, Math.max(.7, .85 * l.unit));
    for (let i = 1; i <= 12; i += 1) {
      const fraction = i * .058;
      const strata = heights.map((y, index) => mix(y, l.floor, fraction) +
        Math.sin(profile.points[index].time * 1.13 + i * 1.61) * l.unit * (i % 3 + .8));
      contour(ctx, profile, strata, i % 3 === 0 ? 'rgba(231, 216, 184, .11)' : 'rgba(11, 24, 29, .26)',
        Math.max(.52, .63 * l.unit));
    }
  }

  function flecks(ctx, l, profile, view, upper, lower, bedIndex) {
    const firstPoint = profile.points[0].time;
    const lastPoint = profile.points.at(-1).time;
    const step = l.narrow ? .127 : .072;
    const first = Math.ceil(firstPoint / step);
    const last = Math.floor(lastPoint / step);
    for (const dark of [false, true]) {
      ctx.beginPath();
      for (let j = first; j <= last; j += 1) {
        const t = j * step;
        const at = (t - firstPoint) / WORLD_STEP;
        const a = Math.floor(at);
        const b = Math.min(a + 1, upper.length - 1);
        const top = mix(upper[a], upper[b], at - a);
        const bottom = mix(lower[a], lower[b], at - a);
        if (bottom - top < 5 * l.unit) continue;
        const x = worldX(view, t);
        const seed = (bedIndex + 1) * 397 + (dark ? 566 : 0);
        const count = clamp(Math.floor((bottom - top) / (25 * l.unit)), 1, 9);
        for (let i = 0; i < count; i += 1) {
          const num = (j * 199 + i * 127 + seed) % 617;
          const y = mix(top, bottom, (num + 2) / 621);
          const length = (1 + ((j * 37 + i * 61 + seed) % 53) / 10) * l.unit;
          ctx.moveTo(x, y);
          ctx.lineTo(x + length, y - length * .41);
        }
      }
      ctx.strokeStyle = dark ? 'rgba(10, 20, 23, .28)' : 'rgba(241, 223, 186, .24)';
      ctx.lineWidth = Math.max(.52, .66 * l.unit);
      ctx.stroke();
    }
  }

  function movingGrain(ctx, l, view, grain) {
    const size = grain.width;
    const phase = ((view.playheadX - view.scrollX) % size + size) % size;
    ctx.save();
    ctx.translate(phase, 0);
    rect(ctx, -phase, 0, l.w, l.h, ctx.createPattern(grain, 'repeat'));
    ctx.restore();
  }

  function deposits(ctx, l, source, view, profile, grain) {
    const { points } = profile;
    const ridge = points.map(point => point.ridge);
    const floor = ridge.map(() => l.floor);
    const lightRadii = [0, .15, .52, .77, 1];
    polygon(ctx, profile, ridge, floor);
    ctx.fillStyle = gradient(ctx, 0, l.h * .21, 0, l.floor, [
      [0, '#c2a181'], [.49, '#a57254'], [.79, '#725648'], [1, '#253743']
    ]);
    ctx.fill();

    if (!source.beds.length) {
      for (const fraction of [.09, .17, .29, .37, .5, .57, .72, .81, .91]) {
        const strata = points.map(({ ridge, time }) => mix(ridge, l.floor, fraction) +
          Math.sin(time * 1.12 + fraction * 12) * l.unit * fraction);
        contour(ctx, profile, strata, fraction < .4 ? 'rgba(246, 216, 177, .23)' : 'rgba(33, 35, 37, .35)',
          Math.max(.57, .74 * l.unit));
      }
    }

    for (const [i, bed] of source.beds.entries()) {
      const upper = points.map(point => point.bounds[i]);
      const lower = points.map(point => point.bounds[i + 1]);
      const deepest = i === source.beds.length - 1;
      // Continue the deepest pigment into the dark foot without extending the measured bed.
      polygon(ctx, profile, upper, deepest ? floor : lower);
      ctx.fillStyle = gradient(ctx, 0, l.h * .22, 0, l.floor,
        lightRadii.map((at, j) => [at, tint(bed.color, [.26, .11, -.08, -.16, deepest ? -.59 : -.31][j])]));
      ctx.fill();
      ctx.save();
      ctx.clip();
      for (const fraction of [.12, .23, .37, .49, .63, .78, .88]) {
        const strata = points.map((point, n) => mix(upper[n], lower[n], fraction) +
          Math.sin(point.time * 1.91 + i * 2.31 + fraction * 16) * l.unit * (.6 + fraction));
        contour(ctx, profile, strata, fraction < .25 || fraction === .78
          ? 'rgba(247, 225, 184, .23)' : 'rgba(10, 24, 35, .24)', Math.max(.57, .67 * l.unit));
      }
      flecks(ctx, l, profile, view, upper, lower, i);
      contour(ctx, profile, upper, 'rgba(242, 220, 180, .34)', Math.max(.75, .95 * l.unit));
      if (!deepest) contour(ctx, profile, lower, 'rgba(21, 35, 41, .59)', Math.max(.75, 1.09 * l.unit));
      ctx.restore();
    }

    ctx.save();
    polygon(ctx, profile, ridge, floor);
    ctx.clip();
    const toneStops = [];
    const startIndex = Math.round(points[0].time / WORLD_STEP);
    for (let i = (4 - startIndex % 4) % 4; i < points.length; i += 4) {
      const { point } = points[i];
      const at = i / (points.length - 1);
      const light = clamp((point.fast - point.middle) * 2.5, -1, 1);
      toneStops.push([at, light >= 0
        ? `rgba(255, 226, 172, ${light * .22})`
        : `rgba(12, 24, 31, ${-light * .39})`]);
    }
    rect(ctx, profile.left, 0, profile.right - profile.left, l.floor,
      gradient(ctx, profile.left, 0, profile.right, 0, toneStops));
    movingGrain(ctx, l, view, grain);
    ctx.restore();
    contour(ctx, profile, ridge, 'rgba(20, 28, 32, .77)', Math.max(1.6, 2.1 * l.unit));
    contour(ctx, profile, ridge, 'rgba(241, 214, 169, .83)', Math.max(.85, .93 * l.unit));
  }

  function makeCanvas(w, h) {
    const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas;
  }

  function grainTile(l) {
    const texture = makeCanvas(521, 503);
    paper(texture.getContext('2d'), { w: texture.width, h: texture.height, unit: l.unit },
      .14, 5903, 'rgba(255, 233, 194, .17)', 'rgba(8, 17, 25, .23)');
    return texture;
  }

  function backdrop(paint, l, tones) {
    rect(paint, 0, 0, l.w, l.h, gradient(paint, 0, 0, l.w * .25, l.h, [
      [0, tones.sky[0]], [.52, tones.sky[1]], [.84, tones.sky[2]], [1, tones.sky[0]]
    ]));
    const ambient = paint.createRadialGradient(l.w * .22, l.h * .46, 0,
      l.w * .22, l.h * .46, Math.max(l.w, l.h) * .66);
    ambient.addColorStop(0, tones.glow);
    ambient.addColorStop(1, 'rgba(200, 143, 90, 0)');
    rect(paint, 0, 0, l.w, l.h, ambient);
    paper(paint, l, .052, 92, 'rgba(234, 219, 176, .104)', 'rgba(0, 7, 13, .16)');
  }

  function heading(ctx, l, frame, time) {
    const { left, right, heading: y, w, h, narrow, unit } = l;
    const { title, artist } = frame.song.track || {};
    const showIdentity = frame.presentationLayout || !frame.albumLayout;
    const rawArtist = String(artist || '').trim();
    const artistName = /^(unknown artist|未知艺术家|—)$/i.test(rawArtist) ? '' : rawArtist;
    const active = frame.section ?? (frame.song.sections || []).find(([start, end]) => time >= start && time < end)?.[2];
    const section = typeof active === 'string' ? active : active?.label;
    const lyric = typeof frame.lyric === 'string' ? frame.lyric : frame.lyric?.text;
    const titleSize = narrow ? Math.min(w * .087, h * .069) : Math.min(w * .058, h * .089);
    const numberSize = Math.min(narrow ? 21 : 29 * unit, w * .075, h * .068);
    const clockBaseline = y + numberSize;
    const clockFont = `${numberSize}px ${NUMERALS}`;
    const clock = stamp(time);
    ctx.font = clockFont;
    const clockWidth = ctx.measureText(clock).width;
    if (showIdentity) {
      const cover = frame.cover;
      const cw = cover?.naturalWidth ?? cover?.width;
      const ch = cover?.naturalHeight ?? cover?.height;
      const sw = Math.min(cw, ch);
      const size = sw > 0 ? Math.min(titleSize * 1.3, h * .12) : 0;
      if (size > 0) ctx.drawImage(cover, (cw - sw) / 2, (ch - sw) / 2, sw, sw, left, y, size, size);
      const titleX = left + (size > 0 ? size + 12 * unit : 0);
      const sectionWidth = Math.max(clockWidth + 13 * unit, (right - left) * (narrow ? .21 : .24));
      const max = right - titleX - sectionWidth;
      const family = /[\u2e80-\uffef]/u.test(title || '') ? SERIF : 'Georgia, serif';
      const headline = headingRows(ctx, title, titleSize, titleSize * (narrow ? .64 : .72), max,
        size => `400 ${size}px ${family}`, 2);
      const titleY = y + headline.size * .98, leading = headline.size * 1.13;
      for (const [index, row] of headline.rows.entries())
        text(ctx, row, titleX, titleY + index * leading, '#f1e6cd', headline.font);
      const artistFont = `${narrow ? 11 : 14 * unit}px ${SANS}`;
      if (artistName) text(ctx, fitText(ctx, artistName, artistFont, max),
        titleX, titleY + Math.max(0, headline.rows.length - 1) * leading + 19 * unit, '#c7c1b4', artistFont);
      const sectionFont = `${narrow ? 10 : 13 * unit}px ${SANS}`;
      if (section) text(ctx, fitText(ctx, section, sectionFont, sectionWidth - 5 * unit), right,
        clockBaseline + 18 * unit, '#ccb393', sectionFont, 'right');
    }
    text(ctx, clock, right, clockBaseline, '#fff0d5', clockFont, 'right');
    if (frame.presentationLayout && lyric) {
      const baseline = l.miniTop - Math.max(16 * unit, h * .039);
      const preferred = Math.min(narrow ? 16 : 24 * unit, h * .061);
      const caption = headingRows(ctx, lyric, preferred, preferred * .82, right - left,
        size => `400 ${size}px ${SANS}`, 2);
      ctx.save();
      ctx.shadowColor = 'rgba(12, 20, 25, .96)';
      ctx.shadowBlur = 7 * unit;
      const first = baseline - (caption.rows.length - 1) * caption.size * 1.24;
      for (const [index, row] of caption.rows.entries())
        text(ctx, row, w / 2, first + index * caption.size * 1.24, '#f6e9d3', caption.font, 'center');
      ctx.restore();
    }
  }

  function journeyMap(ctx, l, overview, path, duration) {
    const { left, right, top, bottom, x, windowLeft, windowRight } = overview;
    const { h, w, unit, miniTop } = l;
    const veilTop = miniTop - Math.max(24, h * .061);
    rect(ctx, 0, veilTop, w, h - veilTop, gradient(ctx, 0, veilTop, 0, h, [
      [0, 'rgba(15, 23, 28, 0)'], [.50, 'rgba(15, 23, 28, .70)'], [1, 'rgba(11, 19, 25, .94)']
    ]));
    rect(ctx, left, top, right - left, bottom - top, 'rgba(9, 17, 23, .42)');
    polygon(ctx, overview, path, path.map(() => bottom));
    ctx.fillStyle = 'rgba(208, 180, 138, .30)';
    ctx.fill();
    contour(ctx, overview, path, 'rgba(226, 205, 169, .74)', Math.max(.68, .73 * unit));
    rect(ctx, windowLeft, top, windowRight - windowLeft, bottom - top,
      'rgba(239, 200, 147, .18)');
    for (const edge of [windowLeft, windowRight])
      line(ctx, edge, top, edge, bottom, 'rgba(236, 205, 158, .57)', Math.max(.70, .71 * unit));
    line(ctx, left, bottom, right, bottom, '#9e8c71', Math.max(.67, .73 * unit));
    line(ctx, x, top - 4 * unit, x, bottom + 2 * unit, '#ffe1aa', Math.max(1.22, 1.33 * unit));
    ctx.beginPath();ctx.moveTo(x - 3.5 * unit, top - 5 * unit);
    ctx.lineTo(x + 3.5 * unit, top - 5 * unit);ctx.lineTo(x, top - .6 * unit);ctx.closePath();
    ctx.fillStyle = '#f0cd94';ctx.fill();
    const font = `${l.narrow ? 9 : 10 * unit}px ${NUMERALS}`;
    text(ctx, '0:00', left, bottom + 14 * unit, '#bcb39e', font);
    text(ctx, stamp(duration), right, bottom + 14 * unit, '#bcb39e', font, 'right');
  }


  function midiVoices(song) {
    if (midiCache.has(song)) return midiCache.get(song);
    const lanes = Array.isArray(song.lanes) ? song.lanes : [];
    const playable = lanes.flatMap(lane => {
      const percussive = lane?.kind === 'drums';
      const events = percussive ? lane.hits : lane?.notes;
      if (!Array.isArray(events) || lane.kind === 'texture') return [];
      const { id } = lane;
      const family = percussive ? 'drums' : LEAD_FAMILIES.includes(lane.group) ? lane.group : 'other';
      const label = lane.label || METALS[family][0];
      const notes = [];
      let low = 127;
      let high = 0;
      let maxLength = 0;
      let totalLength = 0;
      for (let index = 0; index < events.length; index += 1) {
        if (!Array.isArray(events[index])) continue;
        const [start, value, midi, strength] = events[index];
        const length = percussive ? .09 : value;
        const pitch = percussive ? value : midi;
        const velocity = percussive ? midi : strength;
        const end = start + length;
        if (!Number.isFinite(start) || !Number.isFinite(end) || !(length > 0) ||
            start < 0 || !Number.isFinite(pitch) || pitch < 0 || pitch > 127) continue;
        notes.push({ id: `${id}:${index}`, lane: id, group: lane.group, label, start, end, length, pitch, velocity,
          percussive });
        low = Math.min(low, pitch);
        high = Math.max(high, pitch);
        maxLength = Math.max(maxLength, length);
        totalLength += length;
      }
      if (!notes.length) return [];
      notes.sort((a, b) => a.start - b.start);
      let previous = null;
      for (const note of notes) {
        note.repeated = previous?.pitch === note.pitch && note.start > previous.start;
        previous = note;
      }
      const padding = Math.max(2, (10 - (high - low)) * .5);
      return [{ id, label, family, notes, low: low - padding, high: high + padding, maxLength, totalLength }];
    });

    // Keep the choice stable for the whole song so a voice can fall silent in the close-up.
    const lead = playable.sort((a, b) => LEAD_FAMILIES.indexOf(a.family) - LEAD_FAMILIES.indexOf(b.family) ||
      a.notes[0].start - b.notes[0].start || b.totalLength - a.totalLength)[0];
    const accompaniment = lead?.family === 'vocals' ? ['strings', ...SUPPORT_FAMILIES.filter(family => family !== 'strings')]
      : SUPPORT_FAMILIES;
    const support = playable.filter(voice => voice.family !== lead?.family && accompaniment.includes(voice.family)).sort((a, b) =>
      accompaniment.indexOf(a.family) - accompaniment.indexOf(b.family) || b.totalLength - a.totalLength)[0];
    const voices = [lead, support].filter(Boolean).map((voice, index) => ({ ...voice, color: VOICE_COLORS[index] }));
    midiCache.set(song, voices);
    return voices;
  }

  function firstOnOrAfter(notes, time) {
    let left = 0;
    let right = notes.length;
    while (left < right) {
      const mid = (left + right) >>> 1;
      if (notes[mid].start < time) left = mid + 1;
      else right = mid;
    }
    return left;
  }

  function voiceDepth(profile, l, time, voice, pitch, fallback, bed) {
    const grid = time / WORLD_STEP;
    const offset = clamp(grid - profile.first, 0, profile.points.length - 1);
    const index = Math.floor(offset);
    const fraction = offset - index;
    const a = profile.points[index];
    const b = profile.points[Math.min(index + 1, profile.points.length - 1)];
    const edge = mix(a.ridge, b.ridge, fraction);
    const range = voice.high - voice.low;
    const register = clamp((pitch - voice.low) / range, 0, 1);
    if (bed < 0) return mix(edge, l.materialFloor, clamp(fallback + (.5 - register) * .12, .07, .83));
    const upper = mix(a.bounds[bed], b.bounds[bed], fraction);
    const lower = mix(a.bounds[bed + 1], b.bounds[bed + 1], fraction);
    // When a measured bed pinches out, keep its engraving on the seam.
    return mix(upper, lower, mix(.84, .16, register));
  }

  function localMidi(frame, source, l, view, profile, dataEnd) {
    const start = view.visibleStart;
    const end = Math.min(view.visibleEnd, dataEnd);
    const voices = midiVoices(frame.song);
    const notes = [];
    for (const [index, voice] of profile ? voices.entries() : []) {
      const bed = source.beds.findIndex(value => value.id === voice.family);
      const first = firstOnOrAfter(voice.notes, start - voice.maxLength);
      const after = firstOnOrAfter(voice.notes, end);
      for (let i = first; i < after; i += 1) {
        const note = voice.notes[i];
        if (note.end <= start) continue;
        const t0 = Math.max(note.start, start);
        const t1 = Math.min(note.end, end);
        if (t1 <= t0) continue;
        const sampleStep = WORLD_STEP * 3;
        const segments = [t0];
        for (let j = Math.floor(t0 / sampleStep) + 1; j * sampleStep < t1; j += 1) {
          segments.push(j * sampleStep);
        }
        segments.push(t1);
        const etching = segments.map(time => ({
          x: worldX(view, time),
          y: voiceDepth(profile, l, time, voice, note.pitch, index === 0 ? .11 : .70, bed)
        }));
        notes.push({ ...note, color: voice.color, y: etching[0].y, x0: worldX(view, note.start),
          x1: worldX(view, note.end), etching });
      }
    }
    return {
      voices: voices.map(({ id, label, color, family }) => ({ id, label, color, family })),
      notes
    };
  }

  function windowOf(frame) {
    if (!(frame && Number.isFinite(frame.w) && frame.w > 0 && Number.isFinite(frame.h) && frame.h > 0 &&
        frame.song && typeof frame.song === 'object')) return null;
    const duration = durationOf(frame);
    if (!Number.isFinite(duration) || duration <= 0) return null;
    const l = layout(frame.w, frame.h);
    const time = clamp(Number.isFinite(frame.time) ? frame.time : 0, 0, duration);
    const main = movingWindow(l, duration, time);
    const dataEnd = Math.min(duration, frame.song.track?.duration > 0 ? frame.song.track.duration : duration);
    const overview = {
      left: l.left, right: l.right, top: l.miniTop, bottom: l.miniBottom, x: xAt(l, time / duration),
      windowLeft: xAt(l, main.visibleStart / duration), windowRight: xAt(l, main.visibleEnd / duration)
    };
    return { layout: l, duration, dataEnd, time, main, overview };
  }

  function inspect(frame) {
    const scene = windowOf(frame);
    if (!scene) return null;
    const source = sourceData(frame.song, scene.dataEnd);
    const profile = worldProfile(source, scene.layout, scene.main, scene.dataEnd);
    const detail = { ...scene.main, ...localMidi(frame, source, scene.layout, scene.main, profile, scene.dataEnd) };
    return {
      ...scene, basis: source.basis, profile, main: detail, detail, notes: detail.notes,
      locating: frame.playing === false || frame.locating === true
    };
  }

  function engravedMidi(ctx, section, unit) {
    ctx.lineJoin = 'round';
    for (const note of section.notes) {
      const { etching, color } = note;
      ctx.beginPath();
      ctx.moveTo(etching[0].x, etching[0].y);
      for (const p of etching.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = 'rgba(22, 28, 30, .86)';
      ctx.lineWidth = Math.max(2.0, 2.13 * unit);
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(.92, 1.14 * unit);
      ctx.stroke();
      if (note.start >= section.visibleStart) {
        const { x, y } = etching[0];
        const length = (note.percussive ? 2 : note.repeated ? 1.75 : 2.65) * unit;
        line(ctx, x - length * .65, y + length, x, y, 'rgba(18, 26, 31, .67)', Math.max(.90, 1.18 * unit));
        line(ctx, x - length * .3, y - length * .52, x, y, color, Math.max(.65, .77 * unit));
      }
    }
  }

  function draw(ctx, frame) {
    const scene = inspect(frame);
    if (!scene) return null;
    const { layout: l, detail, overview, duration, dataEnd, time, profile } = scene;
    const source = sourceData(frame.song, dataEnd);
    const scale = clamp(ctx.getTransform?.().a || 1, 1, 2);
    const palette = songPalette(frame);
    const key = [palette, l.w, l.h, scale, duration].join('/');
    const tones = TONES[palette];
    let layer = source.layers.get(key);
    if (!layer) {
      const sky = makeCanvas(Math.ceil(l.w * scale), Math.ceil(l.h * scale));
      const paint = sky.getContext('2d');
      paint.scale(scale, scale);
      backdrop(paint, l, tones);
      const count = Math.max(2, Math.min(600, Math.ceil(l.right - l.left)));
      const map = Array.from({ length: count }, (_, index) => {
        const t = duration * index / (count - 1);
        return overview.bottom - (overview.bottom - overview.top) * .92 * (t <= dataEnd ? interpolate(source, t, 'rise') : 0);
      });
      layer = { sky, grain: grainTile(l), map };
      if (source.layers.size >= 2) source.layers.delete(source.layers.keys().next().value);
      source.layers.set(key, layer);
    }
    ctx.save();
    ctx.drawImage(layer.sky, 0, 0, l.w, l.h);

    const clipLeft = worldX(detail, detail.visibleStart);
    const clipRight = worldX(detail, Math.min(detail.visibleEnd, dataEnd));
    if (profile && clipRight > clipLeft) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(clipLeft, 0, clipRight - clipLeft, l.h);
      ctx.clip();
      const distant = profile.points.map(point => point.far);
      const middle = profile.points.map(point => point.middle);
      soilShape(ctx, profile, distant, l, tones.distant, 'rgba(210, 218, 207, .24)');
      soilShape(ctx, profile, middle, l, tones.middle, 'rgba(238, 212, 175, .33)');
      ctx.save();
      polygon(ctx, profile, distant.map((y, index) => Math.min(y, middle[index])), distant.map(() => l.floor));
      ctx.clip();
      ctx.globalAlpha = .36;
      movingGrain(ctx, l, detail, layer.grain);
      ctx.restore();
      deposits(ctx, l, source, detail, profile, layer.grain);
      engravedMidi(ctx, detail, l.unit);
      ctx.restore();
    }
    const x = detail.playheadX;
    const from = l.h * (l.narrow ? .255 : .235);
    const to = l.miniTop - 7 * l.unit;
    if (scene.locating && to > from) {
      ctx.save();
      ctx.shadowColor = 'rgba(24, 24, 23, .55)';
      ctx.shadowBlur = 3 * l.unit;
      line(ctx, x, from, x, to, gradient(ctx, 0, from, 0, to, [
        [0, 'rgba(244, 216, 170, .19)'], [.20, 'rgba(244, 216, 170, .82)'],
        [.83, 'rgba(244, 216, 170, .92)'], [1, 'rgba(244, 216, 170, .12)']
      ]), Math.max(.82, 1.04 * l.unit));
      ctx.restore();
    }
    journeyMap(ctx, l, overview, layer.map, duration);
    heading(ctx, l, frame, time);
    ctx.restore();
    return scene;
  }

  function timeAt(x, y, frame) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const scene = windowOf(frame);
    if (!scene) return null;
    const { main: detail, duration, overview, dataEnd, layout: l } = scene;
    if (x >= overview.left && x <= overview.right && y >= overview.top - 2 * l.unit &&
        y <= overview.bottom + 14 * l.unit) {
      return (x - overview.left) / (overview.right - overview.left) * duration;
    }
    if (x < detail.left || x > detail.right || y < detail.top || y >= detail.bottom) return null;
    const time = detail.time + (x - detail.playheadX) / detail.pxPerSecond;
    return time < -1e-9 || time > dataEnd + 1e-9 ? null : clamp(time, 0, dataEnd);
  }

  function noteAt(x, y, frame) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const scene = inspect(frame);
    if (!scene || x < scene.main.left || x > scene.main.right || y >= scene.main.bottom || y < 0) return null;
    const tolerance = 3.6 * scene.layout.unit;
    let closest = tolerance;
    let hit = null;
    for (const note of scene.notes) {
      const points = note.etching;
      if (x < points[0].x - tolerance || x > points.at(-1).x + tolerance) continue;
      for (let i = 1; i < points.length; i += 1) {
        const a = points[i - 1], b = points[i];
        const dx = b.x - a.x, dy = b.y - a.y;
        const projection = clamp(((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
        const distance = Math.hypot(x - a.x - projection * dx, y - a.y - projection * dy);
        if (distance < closest) {
          closest = distance;
          hit = note;
        }
      }
    }
    return hit;
  }

  const invalidate = song => {
    cache.delete(song);
    midiCache.delete(song);
  };
  globalThis.XinArt ??= {};
  globalThis.XinArt.terrain = Object.freeze({ draw, timeAt, noteAt, inspect, invalidate });
})();
