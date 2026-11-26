'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {layout, cabinFaces, curtainShapes, transomOf} = require('../score-terrain.js')._internal;
const SIZES = [
  [1440, 900], [1123, 778], [1440, 778], [1707, 1067], [2560, 1600], [3441, 1440],
  [1920, 1080], [3840, 2160], [1000, 778], [1123, 702],
];
// Pixel counts from the approved terrain.29 cabin with the high backing raster at 226 s.
// The geometry test catches aperture regressions; the browser probe also includes artwork alpha.
const TERRAIN_29_VISIBLE = new Map([
  ['1440x900', 811007], ['1123x778', 568360], ['1440x778', 713063],
  ['1707x1067', 1141561], ['2560x1600', 2565759], ['3441x1440', 3242948],
  ['1920x1080', 1314181], ['3840x2160', 5266453],
]);

const right = box => box.x + box.w;
const bottom = box => box.y + box.h;

test('the recessed glass preserves horizontal event registration and frames both projected rail heads', () => {
  for (const [w, h] of SIZES) {
    const {win, projection, s, sy, u, cabin: {glass, opening, shelf}} = layout(w, h);
    assert.deepEqual(win, {x: 64 * u, y: 136 * u, w: w - 2 * (64 * u), h: h - 136 * u - 68 * u, r: 40 * u});
    assert.equal(s, win.h / 696);
    assert.equal(projection.x, win.x);
    assert.equal(projection.w, win.w);
    assert.equal(sy, projection.h / 696);
    assert.ok(sy / s >= .91 && sy <= s, `${w}x${h}: exterior vertical scale ${sy / s}`);
    assert.ok(Math.abs(bottom(glass) - (h - 108 * u)) < 1e-8);
    assert.ok(Math.abs(bottom(projection) - (h - 104.5 * u)) < 1e-8);
    for (const outer of [win, opening]) {
      assert.ok(glass.x > outer.x && right(glass) < right(outer), `${w}x${h}: horizontal reveal`);
      assert.ok(glass.y > outer.y && bottom(glass) < bottom(outer), `${w}x${h}: vertical reveal`);
    }
    assert.ok(bottom(glass) <= shelf.back && shelf.back < shelf.front && shelf.front < h);
    for (const rail of [814.3, 824.5]) {
      const y = projection.y + (rail - 136) * sy;
      assert.ok(y >= glass.y && y + 2.1 * sy < bottom(glass), `${w}x${h}: rail head at ${rail} is outside the glass`);
    }
  }
});

test('the four painted reveal faces have clear widths and a readable split between sunlight and shade', () => {
  for (const [w, h] of SIZES) {
    const L = layout(w, h);
    const faces = cabinFaces(L);
    assert.deepEqual(faces.map(face => face.side), ['top', 'right', 'bottom', 'left']);
    const {opening, glass} = L.cabin;
    assert.ok(opening.r > glass.r && glass.r > 0);
    const row = glass.y + .62 * glass.h;
    const {sides} = curtainShapes(L);
    assert.ok(sides[0].xi(row) <= opening.x && sides[1].xi(row) >= right(opening),
      `${w}x${h}: the jambs need a clear run at the tiebacks`);
    for (const face of faces) {
      const sunlit = face.side === 'right' || face.side === 'bottom';
      const [min, max] = sunlit ? [14, 20] : [8, 12];
      const width = face.width / L.u;
      assert.ok(width >= min && width <= max, `${w}x${h}: ${face.side} exposes ${width} px at the reference scale`);
      const [r, g, b] = face.color.match(/[0-9a-f]{2}/gi).map(value => Number.parseInt(value, 16));
      assert.ok(sunlit ? r > g && g > b : r < b, `${w}x${h}: ${face.side} has the wrong material tint`);
      assert.ok(sunlit ? face.bounce >= .8 && (r + g + b) / 3 > 100
        : face.bounce <= .25 && (r + g + b) / 3 < 85, `${w}x${h}: ${face.side} has the wrong light level`);
    }
  }
});

test('curtains and transom occupy at most 12% of the glass and leave both event columns clear', () => {
  for (const [w, h] of SIZES) {
    const L = layout(w, h);
    const {glass, shelf} = L.cabin;
    const {sides} = curtainShapes(L);
    const bar = transomOf(L);
    let coveredArea = 0;
    const steps = Math.ceil(glass.h);
    const dy = glass.h / steps;
    for (let row = 0; row < steps; row++) {
      const y = glass.y + (row + .5) * dy;
      const corner = Math.max(glass.y + glass.r - y, y - (bottom(glass) - glass.r), 0);
      const inset = glass.r - Math.sqrt(glass.r ** 2 - corner ** 2);
      const a = glass.x + inset, b = right(glass) - inset;
      const leftCurtain = sides[0].xi(y), rightCurtain = sides[1].xi(y);
      for (const x of [.37 * w, L.entryX]) {
        assert.ok(leftCurtain < x && rightCurtain > x, `${w}x${h}: curtain crosses x=${x} at y=${y}`);
      }
      coveredArea += y >= bar.y && y < bar.y + bar.t
        ? (b - a) * dy
        : (Math.max(0, leftCurtain - a) + Math.max(0, b - rightCurtain)) * dy;
    }
    const clearGlassArea = glass.w * glass.h - (4 - Math.PI) * glass.r ** 2;
    assert.ok(coveredArea / clearGlassArea <= .12, `${w}x${h}: curtains and transom cover ${coveredArea / clearGlassArea}`);
    const label = `${w}x${h}`;
    const priorArea = TERRAIN_29_VISIBLE.get(label);
    if (priorArea) {
      const allowedLoss = label === '1440x900' ? .075 : .085;
      assert.ok(clearGlassArea - coveredArea >= priorArea * (1 - allowedLoss), `${label}: recessed view exceeds the area loss budget`);
    }
    for (const side of sides) assert.ok(side.bot >= shelf.back && side.bot <= shelf.front);
  }
});

test('the transom stays entirely above the highest allowed mountain ridge', () => {
  for (const [w, h] of SIZES) {
    const L = layout(w, h), bar = transomOf(L);
    const barBottom = 136 + (bar.y + bar.t + bar.shadow - L.projection.y) / L.sy;
    assert.ok(barBottom <= 206 + 1e-9, `${w}x${h}: bar reaches sketch y=${barBottom}`);
    assert.ok(bar.y >= L.cabin.glass.y + 18 * L.u - 1e-8, 'the upper glass pane stays visible');
  }
});

test('the folded antenna and handle clear the glass by 10 px and the rubber feet clear the shelf edge by 4 px', () => {
  for (const [w, h] of SIZES) {
    const {sill, sillDeck, cabin: {glass, shelf, vfdBounds}} = layout(w, h);
    assert.ok(vfdBounds.top - bottom(glass) >= 10, `${w}x${h}: handle clearance`);
    assert.ok(sillDeck.y >= shelf.back && shelf.front-vfdBounds.bottom >= 4, `${w}x${h}: feet clearance`);
    assert.ok(sill.x > sillDeck.x && sill.y > sillDeck.y && right(sill) < right(sillDeck) && bottom(sill) < bottom(sillDeck));
  }
});

test('the radio fits twelve full-width characters while preserving terrain.31 lyric height at all eight target sizes', () => {
  const led = require('../score-terrain-led.js');
  for (const [w, h] of SIZES) {
    const {u, sill, sillDeck, cabin: {deckUnit}} = layout(w, h);
    assert.equal(deckUnit / u, 1, `${w}x${h}: hardware and text scale`);
    assert.equal(sillDeck.w, 596 * u);
    assert.equal(sillDeck.h, 69 * u);
    assert.equal(sill.w, 460 * u);
    assert.equal(sill.h, 42 * u);
    const sample='窗外青山白云轻轻掠过铁轨';
    const normal=led.lyricPlan(sample,.5,sill.w,sill.h);
    assert.equal(normal.cols,156);
    assert.equal(normal.pitch,normal.p0);
    assert.equal(normal.scroll,false);
    for(const text of [sample,sample.repeat(2),'A song carried on the evening train']){
      const before=led.lyricPlan(text,.5,446*u,42*u);
      const after=led.lyricPlan(text,.5,sill.w,sill.h);
      assert.ok(after.pitch>=before.pitch-1e-9);
    }
  }
});

test('both drapes gather at the tieback and flare above and below it', () => {
  for (const [w, h] of SIZES) {
    const {sides} = curtainShapes(layout(w, h));
    for (const side of sides) {
      const widthAt = y => Math.abs(side.xi(y) - side.xo(y));
      assert.ok(widthAt(side.tie) <= .55 * Math.min(widthAt(side.top), widthAt(side.bot)),
        `${w}x${h}: panel ${side.s} must gather at the waist`);
    }
  }
});
