'use strict';
// 车窗地貌 batch 6: the window - a slim transom high in the sky and tied-back curtains (「C 框配 B 帘」).
const assert = require('node:assert/strict');
const test = require('node:test');
const terrain = require('../score-terrain.js');
const {layout, curtainShapes, transomOf} = terrain._internal;
const SIZES = [[1440, 778], [1123, 778], [1707, 1067], [1440, 900], [2560, 1600], [1000, 778], [1123, 702]];

test('curtains and transom cover at most 12 % of the glass, and the curtains stay well clear of the "now" line at 37 %', () => {
  for (const [w, h] of SIZES) {
    const L = layout(w, h), {win} = L, C = curtainShapes(L), bar = transomOf(L);
    let n = 0, hit = 0, reach = 0;
    for (let y = win.y; y <= win.y + win.h; y += 2) {
      const xl = C.sides[0].xi(y), xr = C.sides[1].xi(y);
      reach = Math.max(reach, xl - win.x, win.x + win.w - xr);
      for (let x = win.x; x <= win.x + win.w; x += 2) { n++; if (x <= xl || x >= xr || (y >= bar.y && y <= bar.y + bar.t)) hit++; }
    }
    assert.ok(hit / n <= .12, `${w}x${h}: ${(hit / n * 100).toFixed(2)} %`);
    assert.ok(reach < win.w * .37 * .5, `${w}x${h}: curtains reach ${reach} px of ${win.w}`);
  }
});

test('the transom sits in the sky above anything a range can reach (every range behind the nearest is held below TOPMOST 206)', () => {
  for (const [w, h] of SIZES) {
    const L = layout(w, h), bar = transomOf(L), toSketch = y => 136 + (y - L.win.y) / L.s;
    assert.ok(toSketch(bar.y + bar.t + bar.shadow) <= 206 + 1e-9, `${w}x${h}: bar ends at ${toSketch(bar.y + bar.t + bar.shadow)}`);
    const c = (bar.y + bar.t / 2 - L.win.y) / L.win.h;
    assert.ok(c > .07 && c < .11, 'about a tenth of the way down: ' + c);
  }
});
