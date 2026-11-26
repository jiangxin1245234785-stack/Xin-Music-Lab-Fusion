'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const {readFileSync} = require('node:fs');
const {runInNewContext} = require('node:vm');
const {mockCanvas} = require('./helpers.cjs');
const terrain = require('../score-terrain.js');
const Weather = require('../score-terrain-weather.js');
require('../score-terrain-rain.js');

const rain = globalThis.XinTerrainRain;
const win = {x: 34, y: 28, w: 800, h: 400, r: 18};
const weather = {intensity: .5, stormDrive: .7, humidity: .5, surface: .8, wind: .6, windTravel: 5.4};
const time = 280;
const dt = 1 / 60;

function weatherCanvas(width, height) {
  const {canvas, calls} = mockCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.canvas = canvas;
  for (const name of ['createLinearGradient', 'createRadialGradient']) {
    const create = ctx[name];
    ctx[name] = (...args) => {
      calls.push({name, args});
      const gradient = create(...args);
      Object.defineProperty(gradient, 'addColorStop', {enumerable: false});
      return gradient;
    };
  }
  return {ctx, calls};
}

function record(draw) {
  const {ctx, calls} = weatherCanvas(win.w, win.h);
  draw(ctx);
  return calls;
}

function airborne(t, wind = .78) {
  return {...weather, intensity: .85, surface: 0, wind, windTravel: wind * t};
}

function opacity(style) {
  if (style?.stops) return Math.max(...style.stops.map(([, color]) => opacity(color)));
  if (style === 'transparent') return 0;
  return Number(/^rgba\([\d., ]+,\s*([\d.e+-]+)\)$/.exec(style)?.[1] ?? 1);
}

function segments(calls, lineKind) {
  let path = [], start;
  const painted = [];
  for (const call of calls) {
    const {name, args} = call;
    if (name === 'beginPath') {
      path = [];
      start = null;
    } else if (name === 'moveTo') {
      start = args;
    } else if (name === lineKind && start) {
      const [x, y] = args.slice(-2), dx = x - start[0], dy = y - start[1];
      path.push({x, y, dx, dy, length: Math.hypot(dx, dy)});
      start = null;
    } else if (name === 'stroke') {
      const alpha = call.alpha * opacity(call.strokeStyle);
      for (const segment of path) {
        painted.push({...segment, alpha, width: call.lineWidth, color: call.strokeStyle});
      }
    }
  }
  return painted;
}

function flecks(calls, shape) {
  let path = [];
  const painted = [];
  for (const call of calls) {
    if (call.name === 'beginPath') path = [];
    else if (call.name === shape) {
      const [x, y, radius, minorRadius] = call.args;
      path.push({x, y, radius, minorRadius: shape === 'arc' ? radius : minorRadius});
    } else if (call.name === 'fill') {
      const alpha = call.alpha * opacity(call.fillStyle);
      for (const mark of path) painted.push({...mark, alpha});
    }
  }
  return painted;
}

function inPane({x, y}, top = 0, bottom = 1) {
  return x >= win.x && x < win.x + win.w && y >= win.y + top * win.h && y < win.y + bottom * win.h;
}

const airRain = calls => segments(calls, 'lineTo');
const airSnow = calls => flecks(calls, 'arc');
const airSand = calls => flecks(calls, 'ellipse');
const flakeArea = ({radius, minorRadius}) => Math.PI * radius * minorRadius;

function nearby(before, after, maxDistance, similar = () => true) {
  // A particle crossing the wrap or clip changes the number of calls, so pair
  // only mutual neighbors. A streak's length helps disambiguate nearby rain.
  const closest = (point, candidates) => {
    let match, best = maxDistance;
    for (const candidate of candidates) {
      if (!similar(point, candidate)) continue;
      const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y,
        2 * ((candidate.length ?? 0) - (point.length ?? 0)));
      if (distance >= best) continue;
      match = candidate;
      best = distance;
    }
    return match;
  };
  return before.flatMap(a => {
    const b = closest(a, after);
    return b && closest(b, before) === a ? [[a, b]] : [];
  });
}

function median(values) {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
}

const angleFromVertical = (dx, dy) => Math.atan2(-dx, dy) * 180 / Math.PI;

test('rain film follows the lower gasket and actual transom, and the glass switch removes it', () => {
  const draw = (on, surface, lip = .23) => record(ctx =>
    rain.drawGlass(ctx, win, win, {}, 8, {...weather, surface}, on, lip));
  const painted = draw(true, .8);
  const edges = calls => calls.filter(({name}) => name === 'createLinearGradient').map(({args}) => args[3]);
  assert.ok(edges(painted).includes(win.y + win.h * .23));
  assert.ok(edges(painted).includes(win.y + win.h));
  assert.ok(edges(draw(true, .8, .31)).includes(win.y + win.h * .31));
  assert.ok(painted.some(({name}) => name === 'quadraticCurveTo'));
  assert.deepEqual(draw(false, .8), []);
  assert.deepEqual(draw(true, 0), []);
  assert.deepEqual(draw(true, .8), painted);
});

test('airborne rain moves down-left along its strokes and leans farther in stronger wind', () => {
  const slant = wind => {
    const draw = t => segments(record(ctx => rain.drawAirRain(ctx, win, t, airborne(t, wind))), 'lineTo');
    const pairs = nearby(draw(time), draw(time + dt), 25, (a, b) => a.color === b.color && a.width === b.width);
    assert.ok(pairs.length > 12, 'adjacent frames contain matchable rain streaks');
    const aligned = pairs.filter(([a, b]) => {
      const dx = b.x - a.x, dy = b.y - a.y;
      return dx < 0 && dy > 0 && Math.abs(angleFromVertical(dx, dy) - angleFromVertical(b.dx, b.dy)) < 6;
    });
    assert.ok(aligned.length >= .8 * pairs.length, 'streaks follow the motion observed between frames');
    return median(aligned.map(([, b]) => angleFromVertical(b.dx, b.dy)));
  };
  const calm = slant(.2), gust = slant(.78);
  assert.ok(calm >= 10 && calm <= 25, `calm rain slants ${calm}° from vertical`);
  assert.ok(gust >= 25 && gust <= 45, `storm rain slants ${gust}° from vertical`);
});

test('a cloudburst scatters throughout the pane and shares one moving field with the foreground rain', () => {
  let rasterWrites = 0;
  const document = {createElement() {
    const canvas = {};
    const context = {
      createImageData: (width, height) => ({data: new Uint8ClampedArray(4 * width * height)}),
      putImageData: image => { canvas.pixels = image.data; rasterWrites++; },
    };
    canvas.getContext = () => context;
    return canvas;
  }};
  const scope = {document};
  const renderer = require.resolve('../score-terrain-rain.js');
  runInNewContext(readFileSync(renderer, 'utf8'), scope, {filename: renderer});
  const {drawRainFront, drawAirRain} = scope.XinTerrainRain;
  const peakWeather = t => ({...airborne(t), intensity: 1, stormDrive: 1});
  const sample = t => {
    let field;
    const calls = record(ctx => { field = drawRainFront(ctx, win, t, peakWeather(t), .95); });
    const paint = calls.find(call => call.name === 'drawImage');
    assert.ok(paint && field?.canvas, 'peak rain has a scattering pass');
    const {width, height, pixels} = field.canvas;
    const alphas = [];
    for (let y = Math.floor(.12 * height); y < .80 * height; y++) {
      const row = Array.from({length: width}, (_, x) => pixels[4 * (y * width + x) + 3] / 255 * paint.alpha);
      assert.ok(row.filter(alpha => alpha > .27).length >= .90 * width,
        `rain reaches across the pane at row ${y}`);
      assert.ok(row.filter((alpha, i) => i === 0 || Math.abs(alpha - row[i - 1]) < .12).length >= .90 * width,
        `most neighboring samples blend through the rain field at row ${y}`);
      alphas.push(...row);
    }
    return {field, alphas, alpha: paint.alpha};
  };
  const first = sample(time);
  const writesBefore = rasterWrites;
  const near = record(ctx => drawAirRain(ctx, win, time, peakWeather(time), .95, first.field));
  assert.equal(rasterWrites, writesBefore, 'the foreground uses the already painted scattering map');
  const nearPaint = near.find(call => call.name === 'drawImage');
  assert.equal(nearPaint.args[0], first.field.canvas);
  assert.ok(nearPaint.alpha < .20 * first.alpha, 'rain behind the poles scatters more than rain in front of them');

  const next = sample(time + 1 / 60);
  const later = sample(time + 1.1);
  const delta = other => first.alphas.reduce((sum, alpha, i) => sum + Math.abs(alpha - other.alphas[i]), 0) / first.alphas.length;
  assert.ok(delta(next) < .025 && delta(later) > .03, 'the field moves through the pane without flickering between frames');
  assert.deepEqual(sample(time).alphas, first.alphas, 'seeks restore the same scattering');
  const moderate = record(ctx => drawRainFront(ctx, win, time, {...airborne(time), intensity: .62, stormDrive: .62}, .95));
  assert.ok(moderate.every(call => call.name !== 'drawImage'), 'the volume does not fog moderate rain');
});

test('the terrain glass switch hides drops and leaves the same airborne rain', t => {
  const originalWeather = globalThis.XinTerrainWeather;
  t.after(() => {
    globalThis.XinTerrainWeather = originalWeather;
    globalThis.XinTerrainRain = rain;
  });
  globalThis.XinTerrainWeather = {sample: (_song, t) => ({...airborne(t), rain: true, surface: .8})};
  const song = {track: {id: 'weather-glass-test', duration: 360}, lanes: [
    {group: 'bass', notes: [[1, 358, 42, 96]]}
  ]};
  const draw = enabled => {
    const {ctx, calls} = weatherCanvas(1123, 783);
    ctx.arcTo = () => {};
    ctx.getTransform = () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0});
    const passes = [];
    const capture = name => (context, ...args) => {
      const start = calls.length;
      const result = rain[name](context, ...args);
      passes.push({name, drawing: calls.slice(start)});
      return result;
    };
    globalThis.XinTerrainRain = {...rain, isReady: () => true,
      drawAirRain: capture('drawAirRain'), drawGlass: capture('drawGlass')};
    terrain.draw(ctx, {song, w: 1123, h: 783, time, terrainWeather: 'rain', terrainGlassDrops: enabled});
    assert.deepEqual(passes.map(({name}) => name), ['drawAirRain', 'drawGlass']);
    return passes.map(({drawing}) => drawing);
  };
  const [air, glass] = draw(true);
  const [airWithoutGlass, hiddenGlass] = draw(false);
  assert.ok(air.some(({name}) => name === 'lineTo'));
  assert.ok(glass.some(({name}) => name === 'quadraticCurveTo'));
  assert.deepEqual(hiddenGlass, []);
  assert.deepEqual(airWithoutGlass, air);
});

test('snow and sand fallback add pane deposits as surface grows and move airborne material with integrated wind', () => {
  for (const render of [rain.drawBlizzard, rain.drawSandstorm]) {
    const draw = (surface, windTravel = weather.windTravel) => record(ctx =>
      render(ctx, win, 8, {...weather, surface, windTravel}, 2, .24));
    const accumulated = draw(.8);
    assert.deepEqual(accumulated, draw(.8));
    assert.deepEqual(accumulated.find(({name}) => name === 'roundRect').args, [34, 28, 800, 400, 18]);
    const edges = calls => calls.filter(({name}) => name === 'createLinearGradient')
      .map(({args}) => args[3]).filter(bottom => [win.y + win.h * .24, win.y + win.h].includes(bottom));
    assert.deepEqual(edges(accumulated), [win.y + win.h * .24, win.y + win.h]);
    assert.deepEqual(edges(draw(0)), []);
    assert.notDeepEqual(draw(0), draw(0, 9.5));
  }
});

test('coarse sand stays by the track bed and short leftward hops rise and fall', () => {
  const draw = (t, ground) => segments(record(ctx =>
    rain.drawSandstorm(ctx, win, t, airborne(t), 2, .24, ground)), 'quadraticCurveTo');
  const low = draw(time, .85), high = draw(time, .65);
  assert.ok(low.length > 5 && high.length > 5, 'a storm paints coarse grains');
  assert.ok(median(low.map(({y}) => y)) - median(high.map(({y}) => y)) > .10 * win.h,
    'the grains follow the height of the track bed');
  assert.ok(low.every(({y}) => y >= win.y + .80 * win.h), 'the coarse grains remain near the lower track bed');
  const angle = median(low.map(({dx, dy}) => angleFromVertical(dx, Math.abs(dy))));
  assert.ok(angle >= 80 && angle <= 90, `the storm sweeps at ${angle}° from vertical`);
  assert.ok(low.some(({dy}) => dy < -.1) && low.some(({dy}) => dy > .1), 'grains occupy both halves of their hops');

  const next = draw(time + dt, .85);
  // Sand is emitted in grain order. Exclude the handful that wrap at the sides.
  assert.equal(next.length, low.length);
  const motion = low.map(({x}, i) => next[i].x - x).filter(dx => Math.abs(dx) < .5 * win.w);
  assert.ok(motion.length > .8 * low.length && motion.every(dx => dx < 0), 'grains continue left across frames');
});

function snowflakes(calls) {
  const flakes = [];
  let start, curves;
  for (const {name, args, fillStyle} of calls) {
    if (name === 'beginPath') {
      start = null;
      curves = 0;
    } else if (name === 'moveTo') {
      start = args;
    } else if (name === 'quadraticCurveTo') {
      curves++;
    } else if (name === 'fill' && start && curves >= 3 && fillStyle.circles) {
      const [, , , x, y, radius] = fillStyle.circles;
      flakes.push({x, y, radius, angle: Math.atan2(start[1] - y, start[0] - x)});
    }
  }
  return flakes;
}

test('near snowflakes turn at independent rates and reproduce the same frame after seeking', () => {
  const draw = t => record(ctx => rain.drawBlizzard(ctx, win, t, airborne(t), 2, .24, .85));
  const storm = draw(time);
  const pairs = nearby(snowflakes(storm), snowflakes(draw(time + dt)), 20);
  assert.ok(pairs.length > 4, 'the near pane shows identifiable flakes in adjacent frames');
  assert.ok(pairs.filter(([a, b]) => b.x < a.x && b.y > a.y).length >= .75 * pairs.length,
    'the near flakes travel with the wind and fall');
  const angle = median(pairs.map(([a, b]) => angleFromVertical(b.x - a.x, b.y - a.y)));
  assert.ok(angle >= 45 && angle <= 65, `near flakes travel at ${angle}° from vertical in strong wind`);
  const turns = pairs.map(([a, b]) => {
    const delta = b.angle - a.angle;
    return Math.atan2(Math.sin(delta), Math.cos(delta));
  }).sort((a, b) => a - b);
  assert.ok(turns.at(-2) - turns[1] > .025, 'near flakes turn at different rates');
  draw(time + 49.5);
  draw(time - 31.75);
  assert.deepEqual(draw(time), storm);
});

const strengths = [0, .2, .4, .6, .8, 1];
const scenarios = [
  {mode: 'rain', render: rain.drawAirRain, select: airRain, area: mark => mark.length * mark.width, threshold: .035},
  {mode: 'snow', render: rain.drawBlizzard, select: airSnow, area: flakeArea, threshold: .09},
  {mode: 'sandstorm', render: rain.drawSandstorm, select: airSand, area: flakeArea, threshold: .16},
];

function intensityFrame(scenario, intensity, t = time) {
  // Keep wind and optical deposits independent of the weather calibration.
  const sky = {...airborne(t), intensity, stormDrive: intensity};
  return record(ctx => scenario.render(ctx, win, t, sky, 2, .24, .85));
}

function measure(scenario, intensity, bottom = 1) {
  const {select, area, threshold} = scenario;
  // Multiple phases keep wrapping and a passing gust from dominating the comparison.
  const marks = [time - 1.55, time, time + 1.43].flatMap(t =>
    select(intensityFrame(scenario, intensity, t)).filter(mark => inPane(mark, 0, bottom)));
  return {
    count: marks.filter(mark => mark.alpha >= threshold).length,
    weightedArea: marks.reduce((sum, mark) => sum + area(mark) * mark.alpha, 0)
  };
}

for (const scenario of scenarios) {
  test(`${scenario.mode} progresses from sparse to dense airborne weather`, () => {
    const samples = strengths.map(intensity => measure(scenario, intensity));
    const [clear, weak, , , strong, extreme] = samples;
    const report = JSON.stringify(samples);
    assert.equal(clear.count, 0, report);
    assert.ok(weak.count > 0 && extreme.count > 4 * weak.count, report);
    assert.ok(new Set(samples.slice(1).map(({count}) => count)).size >= 4, report);
    assert.ok(samples.every(({weightedArea}, i) => i === 0 || weightedArea > 1.06 * samples[i - 1].weightedArea), report);
    assert.ok(extreme.count > 1.05 * strong.count, report);

    const nearbyAreas = [.58, .6, .62].map(intensity => measure(scenario, intensity).weightedArea);
    const [before, during, after] = nearbyAreas;
    assert.ok(before < during && during < after && after < 1.45 * before,
      `nearby intensities make small changes within the same phase of weather: ${nearbyAreas.map(Math.round)}`);
  });
}

// At the same phases and intensity, .24 filled about 128 weighted px² with
// rain and 1003 px² with snow above this calibration pane's transom.
for (const [scenario, minimum] of [[scenarios[0], 200], [scenarios[1], 1500]]) {
  test(`heavy ${scenario.mode} substantially covers the upper transom pane`, () => {
    const weak = measure(scenario, .2, .24);
    const storm = measure(scenario, 1, .24);
    assert.ok(storm.count > 3 * weak.count && storm.weightedArea > minimum,
      `visible marks and coverage above the transom: ${JSON.stringify({weak, storm})}`);
  });
}

test('a sandstorm lofts moving grains into the middle of the window in clusters', () => {
  const scenario = scenarios[2];
  const lofted = (intensity, t) => airSand(intensityFrame(scenario, intensity, t))
    .filter(mark => inPane(mark, .25, .73) && mark.alpha >= .16);
  const strong = lofted(1, time);
  const weak = lofted(.2, time);
  const upper = strong.filter(mark => inPane(mark, .25, .5));
  assert.ok(strong.length >= 25 && upper.length >= 6 && strong.length > 3 * weak.length,
    `the storm puts ${strong.length} visible grains in the body of the pane, ${upper.length} above halfway, versus ${weak.length} in light weather`);
  const counts = Array.from({length: 16}, (_, i) => strong.filter(({x, y}) =>
    Math.floor((x - win.x) / win.w * 8) === i % 8 &&
    Number(y >= win.y + .5 * win.h) === Math.floor(i / 8)).length);
  assert.ok(Math.max(...counts) >= 2.5 * (strong.length / counts.length), `sand concentrates in gusts across the pane: ${counts}`);

  const next = lofted(1, time + dt);
  const pairs = nearby(strong, next, 25, (a, b) => Math.abs(a.radius - b.radius) < .12);
  assert.ok(pairs.length > .5 * strong.length, 'adjacent frames contain matchable lofted grains');
  assert.ok(pairs.filter(([a, b]) => b.x < a.x).length >= .85 * pairs.length,
    'airborne grains continue to the left with the wind');
});

test('weather tracks the sampled musical front and redraws exactly after seeking', () => {
  const duration = 360;
  const song = {
    track: {id: 'weather-intensity-calibration', duration},
    energy: {hop: .1, db: Array.from({length: duration * 10}, (_, i) => i >= 2760 && i < 3040 ? -9 : -39)},
  };
  for (const {mode, render, select} of scenarios) {
    const options = {terrainWeather: mode};
    const first = Weather.sample(song, 0, options);
    const front = first.events[0].frontAtSec;
    const ramp = [0, 1, 2, 4, 6].map(offset => Weather.sample(song, front + offset, options).intensity);
    assert.ok(ramp[0] === 0 && ramp[2] < .30 && ramp[3] > .55 && ramp.at(-1) > .85 &&
      ramp.every((value, i) => !i || value > ramp[i - 1]),
      `${mode} musical intensity follows the front: ${ramp}`);
    const draw = t => record(ctx => render(ctx, win, t, Weather.sample(song, t, options), 2, .24, .85));
    const frame = draw(front + 4);
    assert.ok(select(frame).some(mark => inPane(mark) && mark.alpha > .06), mode);
    draw(front + 5.275);
    draw(front - 3.25);
    assert.deepEqual(draw(front + 4), frame, mode);
  }
});
