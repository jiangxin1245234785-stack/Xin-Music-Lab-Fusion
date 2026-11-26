'use strict';
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const Weather = require('../score-terrain-weather.js');
const Core = require('../score-view.js');
const Presentation = require('../score-presentation.js');

const settings = {terrainWeather: 'rain'};
const model = (duration, rest = {}) => ({contract: 'xin.score-view/1',
  track: {id: 'weather-testing', duration}, audio: {src: 'test.wav'}, lanes: [], ...rest});

test('exterior weather is still ready when glass graphics or its bundle is unavailable', async () => {
  for (const bundleMissing of [false, true]) {
    let graphicsRequests = 0;
    const drawing = {globalAlpha: 1, save() {}, restore() {}, drawImage() {}, putImageData() {},
      createImageData: (width, height) => ({data: new Uint8ClampedArray(width * height * 4)}),
      createLinearGradient: () => ({addColorStop() {}}), fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}};
    const document = {
      currentScript: {src: 'file:///scoreview/score-terrain-rain.js'},
      createElement: () => ({getContext(type) {
        if (type === 'webgl2') graphicsRequests += 1;
        return type === '2d' ? drawing : null;
      }}),
      head: {append: script => queueMicrotask(() => script.onerror())},
    };
    const env = {setTimeout, console: {warn() {}}, Image: class {
      set src(_) {queueMicrotask(() => this.onload());}
    }};
    if (!bundleMissing) env.RaindropFX = class {};
    const load = vm.compileFunction(readFileSync(require.resolve('../score-terrain-rain.js'), 'utf8'),
      ['globalThis', 'document', 'Image', 'console']);
    load(env, document, env.Image, env.console);
    const rain = env.XinTerrainRain;
    const canvas = {};
    const loaded = rain.ready();
    const prepared = rain.prepare(canvas);
    assert.equal(rain.prepare({}), prepared, 'concurrent canvases share the complete preparation');
    assert.equal(rain.isReady(), false);
    assert.deepEqual(await Promise.all([loaded, prepared]), [true, true]);
    assert.equal(rain.isReady(), true);
    assert.equal(rain.drawGlass({canvas}, {w: 2, h: 1}, {}, {}, 0, {}), false);
    assert.equal(graphicsRequests, bundleMissing ? 0 : 1, 'frame draws do not retry unsupported graphics');
  }
});

test('B puts an early glass drop on each real rise, preserves wetness and seeks deterministically', () => {
  const duration = 100;
  const tune = model(duration, {
    energy: {hop: .1, db: Array.from({length: duration * 10}, (_, i) =>
      i >= 180 && i < 400 || i >= 590 && i < 800 ? -14 : -38)},
    sections: [[24, 36, 'Verse'], [32, 37, 'Chorus'], [67, 74, 'Chorus']]
  });
  const sample = t => Weather.sample(tune, t, settings);
  const {events, source} = sample(0);
  assert.equal(source, 'energy');
  assert.equal(events.length, 2, 'sustained chorus labels add no extra band');
  for (const band of events) {
    assert.equal(band.frontAtSec - band.firstDropAtSec, 1.5);
    assert.ok(sample(band.firstDropAtSec - .5).farRain > 0);
    const beforeDrop = sample(band.firstDropAtSec - .5).humidity;
    assert.ok(beforeDrop < .01);
    assert.equal(sample(band.firstDropAtSec + .8).intensity, 0);
    assert.ok(sample(band.firstDropAtSec + .8).humidity > beforeDrop);
    assert.ok(sample(band.firstDropAtSec + .8).stormDrive < .001, 'the first glass drop does not summon airborne weather');
    assert.ok(sample(band.frontAtSec + 5).intensity > .5);
    assert.equal(sample(band.backAtSec + 4).intensity, 0);
    assert.ok(sample(band.backAtSec + 4).humidity > 0);
  }
  const before = sample(27.43);
  sample(83.51);
  sample(0.03);
  assert.deepEqual(sample(27.43), before);
  assert.equal(Weather.sample(tune, 27.43, {}).rain, false);
  assert.equal(Weather.sample(tune, 27.43, {terrainWeather: 'auto'}).rain, false);
  assert.equal(Weather.sample(tune, 95, {...settings, plainEnd: 92}).level, 0);
  assert.equal(Weather.sample(tune, 1, {...settings, plainStart: 8}).level, 0);
});

test('without section labels, a gradual rise can bring light rain, with safe loudness fallbacks', () => {
  const gradual = Array.from({length: 60}, (_, i) => -48 + i * .35);
  const tune = model(60, {levels: {hop: 1, groups: {piano: gradual, bass: gradual.map(value => value - 6)}}});
  const gentle = Weather.sample(tune, 55, settings);
  assert.equal(gentle.source, 'sum-of-stem-power');
  assert.ok(gentle.events[0].strength < 1);
  assert.ok(gentle.intensity > .1);
  const notes = model(35, {lanes: [{notes: [[0, 10, 62, 48], [14, 16, 64, 106]]}]});
  assert.equal(Weather.sample(notes, 24, settings).source, 'note-power-proxy');
  const steady = model(60, {energy: {hop: 1, db: Array(60).fill(-37)}});
  const overcast = Weather.sample(steady, 27, settings);
  assert.equal(overcast.rain, true, 'the cloudy look is still selected');
  assert.equal(overcast.events.length, 0);
  assert.equal(overcast.intensity, 0);
  assert.equal(Weather.sample(model(60), 27, settings).source, 'unavailable');
});

test('presentation sends weather to terrain and waits for both materials and GPU preparation', async () => {
  const prior = {XinArt: globalThis.XinArt, XinScoreMood: globalThis.XinScoreMood, XinTerrainRain: globalThis.XinTerrainRain};
  const frames = [], canvasOperations = [];
  const drawing = {save() {}, setTransform() {}, restore() {}};
  const ownerDocument = {createElement: () => makeCanvas()};
  const makeCanvas = () => ({width: 1280, height: 720, getContext: () => drawing, ownerDocument});
  let load, prepare;
  try {
    globalThis.XinScoreMood = {normalize: style => style || 'starry'};
    globalThis.XinArt = {terrain: {ready: () => Promise.resolve(true), draw: (_ctx, frame) => { frames.push(frame); }}};
    globalThis.XinTerrainRain = {
      ready: () => new Promise(resolve => { load = resolve; }),
      prepare: canvas => new Promise(resolve => { canvasOperations.push(['prepare', canvas]); prepare = resolve; }),
      dispose: canvas => canvasOperations.push(['dispose', canvas])
    };
    assert.equal(Core.DEFAULTS.terrainWeather, 'clear');
    assert.equal(Core.DEFAULTS.terrainGlassDrops, true);
    const canvas = makeCanvas(), tune = model(60);
    const view = Presentation.create(canvas, tune, () => 0, {scoreStyle: 'terrain'});
    view.draw(15);
    assert.equal(frames.at(-1).terrainWeather, 'clear');
    await view.ready();
    assert.equal(load, undefined, 'clear never loads rain');
    view.setOptions({terrainWeather: 'rain', terrainGlassDrops: false, presentationLayout: true});
    let finished = false;
    const pending = view.ready().then(() => { finished = true; });
    await Promise.resolve();
    assert.equal(finished, false);
    load(true);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(canvasOperations, [['prepare', canvas]]);
    assert.equal(finished, false);
    prepare(true);
    await pending;
    assert.equal(finished, true);
    view.draw(30, true);
    assert.equal(frames.at(-1).terrainWeather, 'rain');
    assert.equal(frames.at(-1).terrainGlassDrops, false);
    const exportView = Presentation.create(makeCanvas(), tune, () => 0, view.options());
    exportView.draw(30, true);
    assert.deepEqual(frames.at(-1), frames.at(-2));
    view.setOptions({terrainWeather: 'fog', terrainGlassDrops: 'yes'});
    assert.equal(view.options().terrainWeather, 'rain');
    assert.equal(view.options().terrainGlassDrops, false);
    view.setOptions({terrainWeather: 'snow'});
    assert.equal(view.options().terrainWeather, 'snow');
    assert.deepEqual(canvasOperations.at(-1), ['dispose', canvas]);
    view.setOptions({terrainWeather: 'clear'});
  } finally {
    Object.assign(globalThis, prior);
  }
});

test('section snap aligns nearby fronts/drops, bridges breathe into drizzle, and deep drops stop crisply', () => {
  // Plateau 1: 20..50 (-12 dB), bridge dip: 50..76 (-17.5 dB, -5.5 dB breather),
  // final wall: 76..106 (-9.5 dB), deep drop: 106..125 (-36 dB).
  const db = Array.from({length: 1250}, (_, i) => {
    const t = i / 10;
    if (t >= 20 && t < 50) return -12;
    if (t >= 50 && t < 76) return -17.5;
    if (t >= 76 && t < 106) return -9.5;
    return -36;
  });
  const tune = model(125, {
    energy: {hop: .1, db},
    sections: [[0, 19.6, 'Intro'], [19.6, 50, 'Chorus 1'], [50, 76, 'Bridge'], [76, 106, 'Chorus 2'], [106.4, 125, 'Outro']]
  });
  const settings = {terrainWeather: 'rain'};
  const sample = t => Weather.sample(tune, t, settings);
  const {events} = sample(30);
  assert.equal(events.length, 1, 'bridge dip stays one continuous band instead of resetting first drop');
  assert.equal(events[0].frontAtSec, 19.6, 'front snaps within +/-2 s to chorus start');
  assert.equal(events[0].frontAtSec - events[0].firstDropAtSec, 1.5);
  assert.ok(Math.abs(events[0].backAtSec - 106.4) <= 1.5, 'deep drop ends near outro boundary');

  const chorus1 = sample(35);
  const bridge = sample(64);
  const finale = sample(92);
  const outro = sample(112);
  assert.ok(bridge.intensity > .1 && bridge.intensity < chorus1.intensity * .65, 'bridge breathes down to lighter drizzle');
  assert.equal(bridge.state, 'drizzle');
  assert.ok(finale.stormDrive > chorus1.stormDrive + .12, 'final wall preserves headroom above earlier chorus');
  assert.equal(outro.intensity, 0);
  assert.equal(outro.state, 'overcast');
});

test('a slow musical crescendo gives airborne weather time to pass through light and moderate precipitation', () => {
  const duration = 100;
  const song = model(duration, {energy: {hop: .1, db: Array.from({length: duration * 10}, (_, i) =>
    -38 + Math.max(0, Math.min(25, (i / 10 - 15) * .72)))}});
  const sample = t => Weather.sample(song, t, {terrainWeather: 'snow'});
  const band = sample(0).events[0];
  assert.equal(band.kind, 'crescendo');
  const front = band.frontAtSec;
  assert.equal(sample(band.firstDropAtSec).intensity, 0);
  assert.ok(sample(front).intensity > 0 && sample(front + 2).intensity < .2);
  assert.ok(sample(front + 6).intensity > .4 && sample(front + 6).intensity < .55);
  assert.ok(sample(front + 12).intensity > .75, 'a sustained crescendo still earns the original plateau');
  const ramp = Array.from({length: 14}, (_, i) => sample(front - 1 + i).intensity);
  assert.ok(ramp.every((value, i) => !i || value - ramp[i - 1] >= 0 && value - ramp[i - 1] < .12));
});

test('a narrow-dynamic stem entry triggers rain without requiring a sharp dB jump', () => {
  // Narrow-dynamic track (only ~3 dB total span) where 3 stems enter simultaneously at t = 24 s.
  const quiet = -44, active = -16;
  const arr = fn => Array.from({length: 70}, (_, i) => fn(i));
  const narrow = model(70, {
    energy: {hop: 1, db: arr(i => i >= 24 && i < 52 ? -15 : -18)},
    levels: {
      hop: 1,
      groups: {
        bass: arr(() => active),
        drums: arr(() => active),
        guitar: arr(i => i >= 24 && i < 52 ? active : quiet),
        vocals: arr(i => i >= 24 && i < 52 ? active : quiet),
        strings: arr(i => i >= 24 && i < 52 ? active : quiet),
        piano: arr(() => quiet),
      }
    }
  });
  const entry = Weather.sample(narrow, 36, {terrainWeather: 'rain'});
  assert.ok(entry.events.length >= 1, 'stem entry triggers rain on narrow-dynamic track');
  assert.equal(entry.events[0].kind, 'entry');
  assert.ok(entry.intensity > .3);
});

test('harmonic tension modulates atmosphere: minor/dissonant chords push stronger storm pressure than major triads', () => {
  const db = Array.from({length: 800}, (_, i) => (i >= 150 && i < 650 ? -12 : -36));
  const majorSong = model(80, {
    energy: {hop: .1, db},
    chords: [[0, 20, 'C', .9], [20, 40, 'F', .9], [40, 60, 'G', .9], [60, 80, 'C', .9]]
  });
  const darkSong = model(80, {
    energy: {hop: .1, db},
    chords: Array.from({length: 40}, (_, i) => [i * 2, i * 2 + 2, ['Cm7', 'F#dim7', 'G7b9', 'Bbm/F'][i % 4], .9])
  });
  const neutralSong = model(80, {energy: {hop: .1, db}});

  const settings = {terrainWeather: 'rain'};
  const bright = Weather.sample(majorSong, 45, settings);
  const neutral = Weather.sample(neutralSong, 45, settings);
  const dark = Weather.sample(darkSong, 45, settings);

  assert.equal(neutral.tension, .5);
  assert.ok(bright.tension < .3, 'major triads read low tension');
  assert.ok(dark.tension > .7, 'minor/diminished/fast harmonic motion read high tension');
  assert.ok(dark.stormDrive > neutral.stormDrive && neutral.stormDrive > bright.stormDrive,
    'storm pressure orders dark > neutral > bright at identical loudness');
});

test('sheet lightning: deterministic, rare (>=22s cooldown), gated by storm + tension + toggle, with dual-pulse decay', () => {
  const db = Array.from({length: 1200}, (_, i) => {
    const t = i * .1;
    if (t < 15) return -38;
    if (t < 105) return t > 40 && t < 85 ? -8 : -14;
    return -36;
  });
  const darkChords = Array.from({length: 60}, (_, i) => [i * 2, i * 2 + 2, ['Cm7', 'F#dim7', 'G7b9', 'Bbm/F'][i % 4], .9]);
  const brightChords = [[0, 60, 'C', .9], [60, 120, 'G', .9]];
  const drums = {
    kind: 'drums', rows: ['kick', 'snare', 'crash'],
    hits: [[44, 2, 118], [49, 2, 120], [56, 2, 115], [72, 2, 122], [80, 2, 118]]
  };
  const stormy = model(120, {energy: {hop: .1, db}, chords: darkChords, lanes: [drums]});
  const sunnyChords = model(120, {energy: {hop: .1, db}, chords: brightChords, lanes: [drums]});

  const s = Weather.sample(stormy, 44, {terrainWeather: 'rain'});
  assert.ok(s.flashes.length >= 1 && s.flashes.length <= 2, 'rare capped flashes: ' + s.flashes.length);
  for (let i = 1; i < s.flashes.length; i++) {
    assert.ok(s.flashes[i].time - s.flashes[i - 1].time >= 22, 'enforces >= 22 s cooldown');
  }
  const f0 = s.flashes[0];
  const peak = Weather.sample(stormy, f0.time + .022, {terrainWeather: 'rain'});
  const trough = Weather.sample(stormy, f0.time + .14, {terrainWeather: 'rain'});
  const restrike = Weather.sample(stormy, f0.time + .21, {terrainWeather: 'rain'});
  const after = Weather.sample(stormy, f0.time + .65, {terrainWeather: 'rain'});
  const muted = Weather.sample(stormy, f0.time + .022, {terrainWeather: 'rain', terrainLightning: false});
  const bright = Weather.sample(sunnyChords, f0.time + .022, {terrainWeather: 'rain'});

  assert.ok(peak.lightning.intensity > .55, 'strong primary strike: ' + peak.lightning.intensity);
  assert.ok(restrike.lightning.intensity > trough.lightning.intensity, 'dual-pulse cloud restrike');
  assert.equal(after.lightning.intensity, 0, 'decays cleanly to 0');
  assert.equal(muted.lightning.intensity, 0, 'respects terrainLightning: false toggle');
  assert.equal(bright.flashes.length, 0, 'low-tension bright major chords stay lightning-free');
});

test('snow mode reuses the musical weather timeline without rain lightning and maps blizzard states cleanly', () => {
  const db = Array.from({length: 1000}, (_, i) => (i >= 180 && i < 820 ? -9 : -36));
  const tune = model(100, {energy: {hop: .1, db}});
  const quiet = Weather.sample(tune, 5, {terrainWeather: 'snow'});
  const peak = Weather.sample(tune, 55, {terrainWeather: 'snow'});
  const rainPeak = Weather.sample(tune, 55, {terrainWeather: 'rain'});

  assert.equal(quiet.mode, 'snow');
  assert.equal(quiet.snow, true);
  assert.equal(quiet.rain, false);
  assert.equal(quiet.state, 'overcast');
  assert.equal(peak.snow, true);
  assert.equal(peak.rain, false);
  assert.equal(peak.flashes.length, 0, 'snowstorms never trigger rain sheet lightning');
  assert.equal(peak.lightning.intensity, 0);
  assert.equal(peak.intensity, rainPeak.intensity, 'shares exact musical intensity timeline');
  assert.equal(peak.humidity, rainPeak.humidity, 'shares exact 18s accumulation curve for frost');
  assert.ok(peak.state === 'snow' || peak.state === 'blizzard', 'maps snow state: ' + peak.state);
});

test('sandstorm mode reuses the musical weather timeline without rain lightning and maps desert states cleanly', () => {
  const db = Array.from({length: 1000}, (_, i) => (i >= 180 && i < 820 ? -9 : -36));
  const tune = model(100, {energy: {hop: .1, db}});
  const quiet = Weather.sample(tune, 5, {terrainWeather: 'sandstorm'});
  const peak = Weather.sample(tune, 55, {terrainWeather: 'sandstorm'});
  const rainPeak = Weather.sample(tune, 55, {terrainWeather: 'rain'});

  assert.equal(quiet.mode, 'sandstorm');
  assert.equal(quiet.sand, true);
  assert.equal(quiet.rain, false);
  assert.equal(quiet.snow, false);
  assert.equal(quiet.state, 'haze');
  assert.equal(peak.sand, true);
  assert.equal(peak.flashes.length, 0, 'sandstorms never trigger rain sheet lightning');
  assert.equal(peak.intensity, rainPeak.intensity, 'shares exact musical intensity timeline');
  assert.equal(peak.humidity, rainPeak.humidity, 'shares exact 18s accumulation curve for dust film');
  assert.ok(peak.state === 'duststorm' || peak.state === 'sandstorm', 'maps desert state: ' + peak.state);
});

test('rock, snow and grit acquire and shed their storm at different rates on the song clock', () => {
  const modelData = () => model(140, {energy: {hop: .1,
    db: Array.from({length: 1400}, (_, i) => i >= 200 && i < 750 ? -9 : -38)}});
  const song = modelData();
  const at = (mode, t, source = song) => Weather.sample(source, t, {terrainWeather: mode});
  assert.ok(at('rain', 34).surface > at('sandstorm', 34).surface);
  assert.ok(at('sandstorm', 34).surface > at('snow', 34).surface);
  assert.ok(at('snow', 100).surface > at('sandstorm', 100).surface);
  assert.ok(at('sandstorm', 100).surface > at('rain', 100).surface);
  for (const mode of ['rain', 'snow', 'sandstorm']) {
    const before = at(mode, 52.125), after = at(mode, 52.175);
    assert.ok(Math.abs((after.windTravel - before.windTravel) / .05 - (before.wind + after.wind) / 2) < 1e-6);
    assert.equal(at(mode, 0).windTravel, 0);
    assert.ok(at(mode, 100).wind < .02 && at(mode, 100).surface > .12);
    assert.equal(at(mode, 52.125, modelData()).windTravel, before.windTravel);
    assert.equal(at(mode, 52.125).surface, before.surface);
  }
  const clear = at('clear', 100);
  assert.deepEqual([clear.surface, clear.wind, clear.windTravel], [0, 0, 0]);
});
