// Measured recording density and score geometry share the same timeline.
(function (root) {
  'use strict';
  // The core's drum kit: the page's XinScoreView, or the module under node.
  const kitOf = () => (root.XinScoreView || (typeof require === 'function' ? require('./score-view.js') : null)).drumKit;

  const HEIGHT = 1080;
  const EMISSION_STEP = .21;
  const WISP_LIFE = 3.25;
  const WISP_WIDTH = 96;
  const WISP_HEIGHT = 48;
  const WISP_VARIANTS = 6;
  const FLOOR_DB = -58;
  const PEAK_DB = -11;
  // [smoke, stroke]. The copper and blue are deliberately coloured below the silver score.
  const PALETTE = {
    vocals: [[167, 99, 126], '#efc6d0'],
    strings: [[157, 96, 119], '#ead0d9'],
    winds: [[93, 136, 196], '#c4daf2'],
    guitar: [[174, 101, 92], '#eec9bf'],
    piano: [[108, 146, 177], '#d2e3ee'],
    bass: [[91, 115, 178], '#c0cee9'],
    drums: [[179, 118, 85], '#ead1bc'],
    other: [[107, 126, 159], '#c5d1df']
  };
  const amount = db => Math.pow(clamp((db - FLOOR_DB) / (PEAK_DB - FLOOR_DB), 0, 1), 1.65);
  // The fog bed (0.31.0): sampled every `step` pixels; at its thinnest `least` of the lane's half height where it sounds;
  // `ahead` of its light ahead of the needle.
  const FOG = Object.freeze({step: 16, least: .18, ahead: .6, scale: 4, hop: .05, lead: 4, blend: .5, fade: .08, layers: 6, layerAlpha: .3, edge: 48, edgeSteps: 8});
  const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = x => x * x * (3 - 2 * x);
  const colorOf = group => PALETTE[group] || PALETTE.other;
  const seedOf = text => Array.from(text).reduce((seed, char) =>
    Math.imul(seed ^ char.codePointAt(0), 16777619), 2166136261);
  const rgba = (rgb, alpha) => 'rgba(' + rgb.join(',') + ',' + alpha + ')';

  function hash(x, y, seed) {
    let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + seed;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }

  function noise(x, y, seed) {
    const i = Math.floor(x), j = Math.floor(y);
    const u = smooth(x - i), v = smooth(y - j);
    return mix(mix(hash(i, j, seed), hash(i + 1, j, seed), u),
      mix(hash(i, j + 1, seed), hash(i + 1, j + 1, seed), u), v);
  }

  function lowerBound(array, value) {
    let begin = 0, end = array.length;
    while (begin < end) {
      const middle = (begin + end) >>> 1;
      if (array[middle] < value) begin = middle + 1;
      else end = middle;
    }
    return begin;
  }

  function series(row, hop) {
    const db = Float64Array.from(row, value => Number.isFinite(value) ? value : -120);
    return {
      end: db.length * hop,
      dbAt(t) {
        if (t < 0 || t >= db.length * hop) return -120;
        const pos = clamp(t / hop - .5, 0, db.length - 1);
        const i = Math.floor(pos), k = Math.min(i + 1, db.length - 1);
        return mix(db[i], db[k], smooth(pos - i));
      }
    };
  }

  function levelsOf(model) {
    const groups = new Map(), textures = new Map();
    const levels = model.levels;
    if (Number.isFinite(levels?.hop) && levels.hop > 0) {
      for (const [name, row] of Object.entries(levels.groups || {})) {
        if (Array.isArray(row) && row.some(Number.isFinite)) groups.set(name, series(row, levels.hop));
      }
    }
    const seen = new Set();
    for (const [index, lane] of (model.lanes || []).entries()) {
      if (lane?.kind !== 'texture') continue;
      const id = lane.id || 'lane-' + index;
      if (seen.has(id)) continue;
      seen.add(id);
      const {db, hop} = lane.level || {};
      if (!Array.isArray(db) || !db.some(Number.isFinite) || !(hop > 0 && Number.isFinite(hop))) continue;
      const group = lane.group || 'other';
      if (!textures.has(group)) textures.set(group, []);
      textures.get(group).push({id, level: series(db, hop)});
    }
    return {groups, textures};
  }

  function create(target, model, clock, initial, layoutSource) {
    const makeCanvas = () => target.ownerDocument.createElement('canvas');
    const canvas = makeCanvas();
    const ctx = canvas.getContext('2d', {willReadFrequently: true});
    const hud = makeCanvas();
    const guide = hud.getContext('2d', {willReadFrequently: true});
    const wisps = new Map();
    let levels = levelsOf(model);
    let options = initial || {}, cover = null, lyrics = null;
    let width = 0, background = null, ends = new WeakMap(), members = null;

    function decorate(w) {
      const backdrop = makeCanvas();
      backdrop.width = w;
      backdrop.height = HEIGHT;
      const paint = backdrop.getContext('2d');
      paint.fillStyle = '#090c14';
      paint.fillRect(0, 0, w, HEIGHT);
      const cool = paint.createRadialGradient(w * .47, HEIGHT * .33, 0, w * .47, HEIGHT * .33, Math.max(w, HEIGHT) * .65);
      cool.addColorStop(0, 'rgba(41,56,81,.36)');
      cool.addColorStop(.6, 'rgba(25,35,54,.24)');
      cool.addColorStop(1, 'rgba(18,25,39,0)');
      paint.fillStyle = cool;
      paint.fillRect(0, 0, w, HEIGHT);
      const copper = paint.createRadialGradient(w * .69, HEIGHT * .78, 0, w * .69, HEIGHT * .78, Math.max(w, HEIGHT) * .38);
      copper.addColorStop(0, 'rgba(88,48,56,.085)');
      copper.addColorStop(1, 'rgba(63,36,44,0)');
      paint.fillStyle = copper;
      paint.fillRect(0, 0, w, HEIGHT);
      const count = Math.floor(w * HEIGHT / 69);
      for (let i = 0; i < count; i++) {
        paint.fillStyle = i % 3 === 0 ? 'rgba(168,182,204,.064)' : 'rgba(0,0,4,.18)';
        paint.fillRect(hash(i, 1, 4566) * w, hash(i, 2, 4566) * HEIGHT, 1, 1);
      }
      return backdrop;
    }

    // A few porous filaments are rasterized once per pigment and shape. Playback
    // only places these small sources using recording time, including after a seek.
    function wispSprite(group, variant) {
      const key = (Object.hasOwn(PALETTE, group) ? group : 'other') + '/' + variant;
      if (wisps.has(key)) return wisps.get(key);
      const sprite = makeCanvas();
      sprite.width = WISP_WIDTH;
      sprite.height = WISP_HEIGHT;
      const paint = sprite.getContext('2d');
      const raster = paint.createImageData(WISP_WIDTH, WISP_HEIGHT), pixels = raster.data;
      const [hue] = colorOf(group), seed = seedOf(key);
      const lean = (hash(1, 0, seed) - .38) * .62;
      const turn = hash(2, 0, seed) * 4;
      const wave = 1.5 + hash(3, 0, seed) * 3.5;
      const early = variant === 0;
      const threads = [
        {y: -.17, thickness: .067, offset: 0, gain: 1},
        {y: .1, thickness: .052, offset: 1.15, gain: .65},
        {y: .31, thickness: .10, offset: 2.2, gain: .41}
      ];
      for (let column = 0; column < WISP_WIDTH; column++) {
        const x = (column + .5) / WISP_WIDTH * 2 - 1;
        const envelope = (1 - x * x) ** (early ? .9 : 1.4);
        const freqs = threads.map(thread => {
          const curl = Math.sin(wave * x + turn + thread.offset);
          return thread.y + x * lean + curl * (.15 + .14 * (1 - x));
        });
        for (let row = 0; row < WISP_HEIGHT; row++) {
          const y = (row + .5) / WISP_HEIGHT * 2 - 1;
          const veil = noise(x * 3.9 + y * 1.95, y * 4.5, seed + 71);
          const holes = noise(x * 7.1 - y * 2.7, y * 9.3 + x * 2, seed + 399);
          const perforation = smooth(clamp((veil * .66 + holes * .34 - .25) / .66, 0, 1));
          let density = 0, rim = 0;
          for (const [i, thread] of threads.entries()) {
            const d = (y - freqs[i]) / (thread.thickness * (early ? 1.52 : 1));
            density += thread.gain * (Math.exp(-.5 * d * d) + .10 * Math.exp(-.11 * d * d));
            if (i === 0) rim = Math.exp(-.5 * ((d + .36) / .56) ** 2);
          }
          const edge = smooth(clamp((1 - Math.abs(y)) * 4.4, 0, 1));
          const offset = (row * WISP_WIDTH + column) * 4;
          const light = .83 + .39 * holes;
          const exposure = rim * (.32 + .2 * holes);
          pixels[offset] = mix(hue[0] * light, 194, exposure);
          pixels[offset + 1] = mix(hue[1] * light, 202, exposure);
          pixels[offset + 2] = mix(hue[2] * light, 227, exposure);
          pixels[offset + 3] = 235 * Math.min(1,
            (density * perforation + rim * (.32 + .32 * veil)) * envelope * edge);
        }
      }
      paint.putImageData(raster, 0, 0);
      wisps.set(key, sprite);
      return sprite;
    }


    function levelKey(group) {
      return group === 'violin' && !levels.groups.has('violin') ? 'strings' : group;
    }

    function recordingLayers(data, view) {
      const {geometry} = data;
      if (!members) {
        members = new Map();
        for (const lane of view.lanes()) {
          const key = levelKey(lane.group);
          members.set(key, (members.get(key) || 0) + lane.members.length);
        }
      }
      const hidden = new Set(options.hidden || []);
      const result = [];
      for (const box of geometry.lanes) {
        const {lane} = box, group = lane.group || lane.id;
        const key = levelKey(group), level = levels.groups.get(key);
        if (!level || box.height <= 0) continue;
        const visible = (lane.members || [lane.id]).filter(id => !hidden.has(id)).length;
        // The recorded stem is shared data. A split timbre lane takes its share of
        // the same field, and a hidden timbre never boosts its surviving siblings.
        const weight = clamp(visible / (members.get(key) || visible || 1), 0, 1);
        if (weight > 0) result.push({id: lane.id, group, key, level, weight, box});
      }
      if (geometry.texture) {
        for (const [group, items] of levels.textures) {
          if (hidden.has(group)) continue;
          const visible = items.filter(item => !hidden.has(item.id));
          if (!visible.length) continue;
          const key = 'texture/' + group + '/' + visible.map(item => item.id).join('\n');
          const stem = levels.groups.get(group);
          const level = stem || {
            end: Math.max(...visible.map(item => item.level.end)),
            dbAt: t => 10 * Math.log10(visible.reduce((total, item) =>
              total + 10 ** (item.level.dbAt(t) / 10), 0))
          };
          const weight = stem ? visible.length / items.length : 1;
          result.push({id: visible[0].id, group, key, level, weight, box: geometry.texture});
        }
      }
      return result;
    }

    function exposureLayers(layers, now, focus) {
      const stemPower = new Map();
      let total = 0;
      const samples = layers.map(layer => {
        const dim = focus && layer.group !== focus ? .12 : 1;
        const db = layer.level.dbAt(now), opacity = amount(db);
        const power = opacity > 0 ? 10 ** ((Math.min(0, db) + 20) / 10) * layer.weight * dim : 0;
        stemPower.set(layer.group, (stemPower.get(layer.group) || 0) + power);
        total += power;
        return {...layer, db, opacity, power, dim};
      });
      return samples.map(layer => {
        const share = total > 0 ? layer.power / total : 0;
        const stemShare = total > 0 ? stemPower.get(layer.group) / total : 0;
        // Absolute level gates the side light. The square root keeps a second
        // audible instrument legible while the largest recorded stem leads.
        const exposure = layer.opacity ** .68 * Math.sqrt(stemShare) * layer.dim;
        return {...layer, share, exposure};
      });
    }

    function paintRecording(layers, scene) {
      if (!layers.length) return [];
      const {floor, right, needle, pps, now, py, unit} = scene;
      const ceiling = Math.min(right, needle);
      if (ceiling <= floor) return [];
      const details = [];
      guide.save();
      guide.beginPath();
      guide.rect(floor, 0, ceiling - floor, HEIGHT);
      guide.clip();
      for (const layer of layers) {
        const {box, group, key, level, weight, db, opacity, dim, share, exposure} = layer;
        const half = (box.bottom - box.top) * unit / 2;
        const center = py((box.top + box.bottom) / 2);
        const seed = seedOf(key);
        const earliest = Math.max(0, now - WISP_LIFE);
        let count = 0, born = 0;
        // A jittered, song-time emission grid bounds work even during a dense,
        // sustained mix. The positive dB slope admits soft attacks to the grid.
        const oneWisp = (x, y, w, h, variant, alpha) => {
          if (alpha < .008 || x - w / 2 >= ceiling || x + w / 2 <= floor) return;
          guide.globalAlpha = alpha;
          guide.drawImage(wispSprite(group, variant), x - w / 2, y - h / 2, w, h);
          count++;
        };
        for (let i = Math.floor(earliest / EMISSION_STEP); i * EMISSION_STEP <= Math.min(now, level.end); i++) {
          const birth = (i + hash(i, 1, seed) * .84) * EMISSION_STEP;
          const age = now - birth;
          if (!(age > 0 && age < WISP_LIFE)) continue;
          const birthDb = level.dbAt(birth);
          const power = amount(birthDb);
          if (power < .045) continue;
          const rise = clamp((birthDb - level.dbAt(birth - .16)) / 19, 0, 1);
          if (hash(i, 2, seed) > .39 + .40 * power + .24 * rise) continue;
          const life = 1.65 + hash(i, 3, seed) * 1.60;
          if (age >= life) continue;
          const travel = age / life;
          const curl = Math.sin(age * 1.9 + hash(i, 4, seed) * 6.283);
          const bias = (hash(i, 5, seed) - .5) * .38;
          const lift = smooth(travel) * (.16 + .22 * hash(i, 6, seed));
          const x = needle - (age + .065 * smooth(travel)) * pps;
          const y = center + half * (bias * smooth(Math.min(1, age / .34)) - lift + .20 * curl * smooth(travel));
          const span = clamp(pps * (.27 + .43 * travel + .16 * power) * (.68 + hash(i, 7, seed) * .67), 17, 124);
          const loft = clamp(half * (.39 + .31 * travel) * (.74 + .31 * power), 6, 56);
          const edge = smooth(clamp((x - floor) / Math.max(18, span / 2), 0, 1));
          const fadeIn = smooth(Math.min(1, age / .13));
          const fadeOut = 1 - smooth(Math.max(0, (travel - .22) / .78));
          const alpha = weight * dim * (power ** .67) * fadeIn * fadeOut * edge * .88;
          const variant = 1 + Math.floor(hash(i, 8, seed) * (WISP_VARIANTS - 1));
          oneWisp(x, y, span, loft, variant, alpha);
          born++;
        }
        // Fresh sound shows inside the needle edge even where MIDI is absent
        // or the next song-time wisp has yet to be born.
        const inlet = clamp(pps * (.28 + .19 * opacity), 13, 61);
        oneWisp(needle - inlet * .34, center, inlet, clamp(half * .63, 6, 41), 0,
          weight * dim * opacity ** .76 * (.51 + .27 * exposure));
        details.push({id: layer.id, group, db, amount: opacity * weight * dim, share, exposure, weight,
          wisps: count, emitted: born});
      }
      guide.restore();
      return details;
    }


    // The fog bed (the core's mistFog): per lane with a measured stem, along the whole timeline, a soft band about its
    // middle whose thickness and light follow how loud the recording is there; ahead of the needle at FOG.ahead of the
    // light. Sampled every FOG.step pixels of song time, so a pause or a seek draws the same frame.
    let fogStrip = null;
    // A level's amount() on a fixed song-time grid, once per level; and colour strings by quantised light.
    const fogGrids = new WeakMap(), fogInks = new Map();
    function fogGrid(level) {
      let grid = fogGrids.get(level);
      if (!grid) {
        grid = new Float32Array(Math.max(1, Math.ceil((level.end || 0) / FOG.hop) + 2));
        for (let i = 0; i < grid.length; i++) grid[i] = amount(level.dbAt(i * FOG.hop));
        fogGrids.set(level, grid);
      }
      return grid;
    }
    const fogAt = (grid, t) => {
      if (!(t >= 0)) return 0;
      const at = t / FOG.hop, i = Math.floor(at);
      if (i + 1 >= grid.length) return 0;
      return grid[i] + (grid[i + 1] - grid[i]) * (at - i);
    };
    function fogInk(smoke, light) {
      const q = Math.round(light * 400), key = smoke.join() + '|' + q;
      let ink = fogInks.get(key);
      if (!ink) { ink = rgba(smoke, q / 400); fogInks.set(key, ink); }
      return ink;
    }
    function paintFogBed(layers, scene) {
      const strength = Number.isFinite(options.mistFog) ? options.mistFog : .16;
      if (!(strength > 0) || !layers.length) return 0;
      const {floor, right, needle, pps, now, py, unit} = scene;
      const lead = FOG.lead * pps, span = right + lead;
      const small = [Math.ceil(span / FOG.scale), Math.ceil(HEIGHT / FOG.scale)];
      const key = [width, floor, right, needle, pps, strength, ...layers.map(layer =>
        [layer.id, layer.box.top, layer.box.bottom, layer.weight, layer.dim].join(','))].join('|');
      // The strip starts on a fixed song-time grid (every half lead), so a moment always draws from the same strip,
      // however it was reached: playing, paused, seeking or exporting.
      const anchor = Math.floor(now / (FOG.lead / 2)) * (FOG.lead / 2);
      if (!fogStrip || fogStrip.key !== key || fogStrip.time !== anchor) {
        if (!fogStrip || fogStrip.canvas.width !== small[0] || fogStrip.canvas.height !== small[1]) {
          const canvas = target.ownerDocument.createElement('canvas');
          canvas.width = small[0]; canvas.height = small[1];
          fogStrip = {canvas};
        }
        Object.assign(fogStrip, {key, time: anchor, drawn: 0});
        const fog = fogStrip.canvas.getContext('2d');
        fog.setTransform(1, 0, 0, 1, 0, 0); fog.clearRect(0, 0, small[0], small[1]);
        fog.setTransform(1 / FOG.scale, 0, 0, 1 / FOG.scale, 0, 0);
        let thinnest = Infinity;
        for (const layer of layers) {
          const {box, group, level, weight, dim} = layer;
          const half = (box.bottom - box.top) * unit / 2, center = py((box.top + box.bottom) / 2);
          const xs = [], raw = [], grid = fogGrid(level);
          for (let x = floor; x <= span + FOG.step; x += FOG.step) {
            const at = Math.min(x, span);
            xs.push(at); raw.push(fogAt(grid, anchor + (at - needle) / pps) * weight * dim);
          }
          if (!raw.some(a => a > .01)) continue;
          // 0.31.1: smoothed along time (a triangle FOG.blend seconds wide each side), so the band swells and thins
          // without steps where the per-second level changes.
          const reach = Math.max(1, Math.round(FOG.blend * pps / FOG.step)), as = raw.map((_, i) => {
            let sum = 0, total = 0;
            for (let j = -reach; j <= reach; j++) {
              const k = i + j;
              if (k < 0 || k >= raw.length) continue;
              const w = reach + 1 - Math.abs(j);
              sum += raw[k] * w; total += w;
            }
            return sum / total;
          });
          const light = fog.createLinearGradient(floor, 0, span, 0), [smoke] = colorOf(group);
          for (let i = 0; i < xs.length; i += 2) {
            light.addColorStop(clamp((xs[i] - floor) / Math.max(1, span - floor), 0, 1), fogInk(smoke, strength * Math.min(1, .25 + .75 * as[i])));
          }
          // Thickness goes to nothing continuously as the level fades (no cliff where the stem falls silent).
          const thick = as.map(a => half * (FOG.least + (1 - FOG.least) * a) * smooth(clamp(a / FOG.fade, 0, 1)));
          const band = scale => {
            fog.beginPath();
            fog.moveTo(xs[0], center - thick[0] * scale);
            for (let i = 1; i < xs.length; i++) fog.lineTo(xs[i], center - thick[i] * scale);
            for (let i = xs.length - 1; i >= 0; i--) fog.lineTo(xs[i], center + thick[i] * scale);
            fog.closePath(); fog.fill();
          };
          // 0.31.1: FOG.layers thin bands nested from the edge in, each a little light, then blurred as a whole below:
          // dense in the middle, fading smoothly to the edge, no visible second slab.
          fog.fillStyle = light;
          fog.globalAlpha = FOG.layerAlpha;
          for (let j = 0; j < FOG.layers; j++) band(1 - j / FOG.layers);
          thinnest = Math.min(thinnest, half);
          fogStrip.drawn++;
        }
        fog.globalAlpha = 1;
        if (fogStrip.drawn) {
          // Soften the whole strip once per repaint (every FOG.lead / 2 seconds of song time, or on a layout change).
          if (!fogStrip.soft || fogStrip.soft.width !== small[0] || fogStrip.soft.height !== small[1]) {
            fogStrip.soft = target.ownerDocument.createElement('canvas');
            fogStrip.soft.width = small[0]; fogStrip.soft.height = small[1];
          }
          const soft = fogStrip.soft.getContext('2d');
          soft.setTransform(1, 0, 0, 1, 0, 0); soft.clearRect(0, 0, small[0], small[1]);
          soft.filter = 'blur(' + clamp(thinnest / FOG.scale / FOG.layers * 1.6, .8, 5).toFixed(2) + 'px)';
          soft.drawImage(fogStrip.canvas, 0, 0);
          soft.filter = 'none';
        }
      }
      if (!fogStrip.drawn) return 0;
      // Lay on the slice for now: what the strip held `shift` pixels to the right. Up to the needle at full light,
      // beyond it at FOG.ahead.
      const offset = (now - fogStrip.time) * pps, k = FOG.scale;
      const lay = (from, to, alpha) => {
        if (to <= from) return;
        ctx.globalAlpha = alpha;
        ctx.drawImage(fogStrip.soft || fogStrip.canvas, (from + offset) / k, 0, (to - from) / k, small[1], from, 0, to - from, small[1] * k);
      };
      ctx.imageSmoothingEnabled = true;
      // 0.31.1: both ends fade over FOG.edge pixels in FOG.edgeSteps slices, so the band has no vertical cut.
      const edge = Math.min(FOG.edge, (right - floor) / 3), lightAt = x => x < needle ? 1 : FOG.ahead;
      const cuts = [floor, floor + edge, needle, right - edge, right].sort((a, b) => a - b);
      for (let i = 0; i + 1 < cuts.length; i++) {
        const from = cuts[i], to = cuts[i + 1];
        if (to <= from) continue;
        const fading = from < floor + edge - .01 || to > right - edge + .01;
        if (!fading) { lay(from, to, lightAt(from)); continue; }
        const step = (to - from) / FOG.edgeSteps;
        for (let k = 0; k < FOG.edgeSteps; k++) {
          const a = from + k * step, mid = a + step / 2;
          const ramp = smooth(clamp(Math.min(mid - floor, right - mid) / edge, 0, 1));
          lay(a, a + step, lightAt(mid) * ramp);
        }
      }
      ctx.globalAlpha = 1;
      return fogStrip.drawn;
    }

    function cachedEnds(set) {
      if (ends.has(set)) return ends.get(set);
      let end = -Infinity;
      const latest = Float64Array.from(set.start, (start, i) => {
        end = Math.max(end, start + set.dur[i]);
        return end;
      });
      ends.set(set, latest);
      return latest;
    }

    function paintSkeleton(data, scene, focus, layers) {
      const {floor, right, needle, pps, now, py, reach} = scene;
      const start = now + (floor - needle) / pps, end = now + (right - needle) / pps;
      const xAt = time => needle + (time - now) * pps;
      const sounding = new Set();
      let notes = 0, held = 0, hits = 0, contour = 0;
      ctx.save();
      ctx.beginPath();
      ctx.rect(floor, 0, right - floor, HEIGHT);
      ctx.clip();
      for (const box of data.geometry.lanes) {
        const lane = box.lane, group = lane.group || lane.id;
        const dim = focus && group !== focus ? .18 : 1;
        const level = layers.find(item => item.box === box);
        const exposure = level ? level.exposure * level.weight : 0;
        const [, ink] = colorOf(group);
        ctx.save();
        ctx.beginPath();
        ctx.rect(floor, py(box.top), right - floor, py(box.bottom) - py(box.top));
        ctx.clip();
        ctx.strokeStyle = ink;
        ctx.fillStyle = ink;
        let silver = null;
        if (exposure > .008) {
          silver = ctx.createLinearGradient(needle - reach, 0, needle + reach * .25, 0);
          silver.addColorStop(0, 'rgba(221,233,244,0)');
          silver.addColorStop(.62, 'rgba(227,236,245,.86)');
          silver.addColorStop(.82, 'rgba(227,236,245,.61)');
          silver.addColorStop(1, 'rgba(221,233,244,0)');
        }
        if (lane.kind === 'drums') {
          const set = lane.hits, kit = kitOf();
          for (let i = lowerBound(set.time, start); i < set.count && set.time[i] <= end; i++) {
            const time = set.time[i], index = lane.rowIndex.get(set.row[i]);
            if (!Number.isFinite(index)) continue;
            const row = lane.rows[index].name;
            const y = py(box.top + box.height * kit.center(row)), x = xAt(time);
            const active = now >= time && now - time < .08;
            const size = py(box.top + kit.size(box.height, set.vel[i])) - py(box.top);
            const a = x < needle ? .64 : .47;
            ctx.globalAlpha = dim * (active ? .79 + .20 * exposure : a * (.65 + (set.vel[i] || 80) / 340));
            // The kit's mark (the core's drumKit), in the mist's own ink; a strike swells a little.
            ctx.beginPath();
            kit.mark(ctx, row, x, y, size * (active ? 1.25 : 1), set.kitGap ? set.kitGap[i] * pps / 2 : Infinity);
            ctx.fill();
            if (active) sounding.add(lane.id);
            hits++;
          }
        } else {
          const drawnContours = new Set();
          // A short note's round head (the core's shortHead / SHORT_NOTE), looked up once a lane.
          const core = root.XinScoreView || (typeof require === 'function' ? require('./score-view.js') : null);
          const headLimit = core && core.SHORT_NOTE ? core.SHORT_NOTE.seconds : 0;
          const headRadius = Number.isFinite(options.shortHead) ? options.shortHead : core && core.DEFAULTS ? core.DEFAULTS.shortHead || 0 : 0;
          const headSize = py(box.top + headRadius) - py(box.top);
          for (const part of data.parts(box)) {
            const set = part.set;
            const first = lowerBound(cachedEnds(set), start);
            for (let i = first; i < set.count && set.start[i] <= end; i++) {
              const t = set.start[i], stop = t + set.dur[i];
              if (stop < start) continue;
              const y = py(data.yAt(box, set.pitch[i]));
              const x0 = xAt(t), x1 = xAt(stop);
              const active = t <= now && now < stop;
              const isHeld = set.dur[i] >= .55;
              const soft = part.contour && options.showContour;
              const a = (soft ? .63 : 1) * (.66 + (set.vel[i] || 80) / 380);
              ctx.globalAlpha = dim * a * (active ? .89 : stop < now ? .67 : .48);
              ctx.lineWidth = active && isHeld ? 2.1 : isHeld ? 1.65 : 1.3;
              ctx.strokeStyle = ink;
              ctx.beginPath();
              ctx.moveTo(x0, y);
              ctx.lineTo(Math.max(x0 + 1.7, x1), y);
              // A short note's round head (the core's shortHead / SHORT_NOTE).
              if (headSize > 0 && set.dur[i] < headLimit) { ctx.moveTo(x0 + headSize, y); ctx.arc(x0, y, headSize, 0, Math.PI * 2); }
              // A tiny vertical tooth distinguishes a written attack from the held span.
              const tooth = isHeld ? 2.6 : 1.9;
              ctx.moveTo(x0, y - tooth);
              ctx.lineTo(x0, y + tooth);
              ctx.stroke();
              if (active) {
                sounding.add(lane.id);
                if (isHeld) held++;
                if (silver) {
                  ctx.strokeStyle = silver;
                  ctx.globalAlpha = exposure * (soft ? .62 : 1);
                  ctx.lineWidth = isHeld ? 3 : 2.25;
                  ctx.beginPath();
                  ctx.moveTo(Math.max(needle - reach, x0), y);
                  ctx.lineTo(Math.min(needle + reach * .25, x1), y);
                  ctx.stroke();
                }
                ctx.globalAlpha = dim * (soft ? .53 + .25 * exposure : .77 + .22 * exposure);
                ctx.fillStyle = '#eef4f7';
                ctx.fillRect(needle - 1.6, y - 1.55, 3.2, 3.1);
              }
              notes++;
            }
            const signal = part.contour;
            if (!options.showContour || !signal || drawnContours.has(signal)) continue;
            drawnContours.add(signal);
            const origin = signal.start || 0, hop = signal.hop;
            const firstPoint = Math.max(0, Math.floor((start - origin) / hop));
            const finalPoint = Math.min(signal.midi.length - 1, Math.ceil((end - origin) / hop));
            ctx.strokeStyle = '#eab9a7';
            ctx.lineWidth = 1.65;
            ctx.globalAlpha = .86 * dim;
            ctx.beginPath();
            let connected = false;
            for (let k = firstPoint; k <= finalPoint; k++) {
              const pitch = signal.midi[k], time = origin + k * hop;
              if (!Number.isFinite(pitch)) {
                connected = false;
                continue;
              }
              const x = xAt(time), y = py(data.contourYAt(box, pitch));
              if (connected) {
                ctx.lineTo(x, y);
                contour++;
              } else ctx.moveTo(x, y);
              connected = true;
              if (time <= now && time + hop > now) sounding.add(lane.id);
            }
            ctx.stroke();
          }
        }
        ctx.restore();
      }
      ctx.restore();
      return {notes, held, hits, contour, sounding};
    }

    function paintLegend(scene, geometry, measured) {
      if (!measured || width < 1180 || geometry.header < 24) return;
      const y = scene.py(options.presentationLayout ? geometry.header * .55 : geometry.header / 2 + 3);
      const x = width * .52 - 70;
      ctx.save();
      ctx.globalAlpha = .84;
      ctx.font = '400 15px "Segoe UI", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#aebdd0';
      ctx.fillRect(x, y, 18, 1.3);
      ctx.fillText('音符', x + 26, y);
      const dash = ctx.createRadialGradient(x + 88, y, 0, x + 88, y, 11);
      dash.addColorStop(0, 'rgba(192,117,137,.95)');
      dash.addColorStop(1, 'rgba(148,90,114,0)');
      ctx.fillStyle = dash;
      ctx.fillRect(x + 77, y - 8, 22, 16);
      ctx.fillStyle = '#aebdd0';
      ctx.fillText('分轨电平', x + 104, y);
      ctx.restore();
    }

    function draw(at, next) {
      if (next) options = next;
      const source = layoutSource();
      const asked = Number.isFinite(at) ? at : clock() + (options.offsetSeconds || 0);
      const data = source.view.materialFrame(asked - (options.offsetSeconds || 0), 'mist');
      const layout = source.view.layoutSnapshot();
      const {frame, geometry} = data, {unit, top} = source;
      const w = Math.max(1, Math.round(layout.width * unit));
      if (!background || w !== width) {
        width = w;
        canvas.width = hud.width = width;
        canvas.height = hud.height = HEIGHT;
        background = decorate(width);
      }
      const needle = layout.needle * unit, pps = layout.pixelsPerSecond * unit, now = frame.time;
      const py = y => top + y * unit;
      const floor = Math.max(0, Math.min(geometry.gutter * unit, needle - 8));
      const right = Math.max(floor + 1, width - Math.min(16, width * .04));
      const reach = clamp(pps * .45, 27, 70);
      const scene = {floor, right, needle, pps, now, py, unit, reach};
      const layers = recordingLayers(data, source.view);
      const focus = options.focusGroup &&
        (geometry.lanes.some(box => box.lane.group === options.focusGroup) || layers.some(layer => layer.group === options.focusGroup))
        ? options.focusGroup : null;
      const exposed = exposureLayers(layers, now, focus);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(background, 0, 0);
      const bed = paintFogBed(exposed, scene);
      guide.setTransform(1, 0, 0, 1, 0, 0);
      guide.clearRect(0, 0, width, HEIGHT);
      const fog = paintRecording(exposed, scene);
      if (fog.some(lane => lane.wisps > 0)) {
        ctx.drawImage(hud, 0, 0);
        guide.clearRect(0, 0, width, HEIGHT);
      }
      // In windowed mode the source is the output canvas, so take the guide copy before drawing.
      guide.drawImage(source.canvas, 0, top, layout.width * unit, layout.height * unit);
      guide.globalCompositeOperation = 'source-in';
      guide.fillStyle = '#98a9c1';
      guide.fillRect(0, 0, width, HEIGHT);
      guide.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = .85;
      ctx.drawImage(hud, 0, 0);
      ctx.globalAlpha = 1;
      data.paintLabels?.(ctx, unit, top);
      const skeleton = paintSkeleton(data, scene, focus, exposed);
      paintLegend(scene, geometry, layers.length > 0);
      const presentation = options.presentationLayout
        ? root.XinScorePresentation.drawFooter(ctx, model, options, lyrics, cover, now, width, HEIGHT, 'mist')
        : {section: '', lyric: ''};

      const output = target.getContext('2d');
      output.setTransform(1, 0, 0, 1, 0, 0);
      output.clearRect(0, 0, target.width, target.height);
      output.drawImage(canvas, 0, 0, target.width, target.height);
      const density = new Map();
      for (const lane of fog) density.set(lane.group, (density.get(lane.group) || 0) + lane.share);
      const leader = [...density].filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      return {
        ...frame, layout, focus, presentation, style: 'mist',
        notes: skeleton.notes, hits: skeleton.hits, contour: skeleton.contour,
        active: skeleton.sounding.size,
        window: [now - layout.needle / layout.pixelsPerSecond,
          now + (layout.width - layout.needle) / layout.pixelsPerSecond],
        mist: {held: skeleton.held, leader, bed, lanes: fog.map(lane =>
          ({...lane, sounding: skeleton.sounding.has(lane.id)}))}
      };
    }

    function reset() {
      ends = new WeakMap();
      members = null;
    }

    return {
      draw, ready: () => Promise.resolve(),
      setModel(next) {
        model = next;
        levels = levelsOf(next);
        lyrics = null;
        cover = null;
        reset();
      },
      setOptions(next) { options = next; },
      setCover(image) { cover = image; },
      setLyrics(value) { lyrics = value?.trackId === model.track.id ? value : null; },
      destroy() {
        reset();
        wisps.clear();
        background = null;
        canvas.width = hud.width = 1;
      }
    };
  }

  root.XinScoreMist = Object.freeze({create});
})(globalThis);
