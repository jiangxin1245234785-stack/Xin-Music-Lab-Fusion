// The radar look's layout check (work/score-depth-20261118/SPEC-WEATHER.md 基础校对): over what one frame drew with
// XinScoreRadar.audit(true) (texts, frames, screws, rings, panels, in design pixels), it lists every text that leaves
// its panel, overlaps another text, sits on a screw or straddles a frame or a ring's edge, and every ring that cuts
// into another. Deliberate overlaps are in ALLOWED with the reason. Used by tests/radar-echo-post.test.cjs (with an
// estimated text width) and by the real-font audit in work/score-depth-20261118/weather (Electron).
(function (root) {
  'use strict';
  const EPS = .5;   // a box may touch another by half a pixel
  // [text pattern, what it may overlap (pattern of the other text, or 'frame' / 'ring' / 'screw'), why]
  // Text on the moving tape (recorded clipped to the paper window) is set in fixed cells and left out of the overlap
  // check between two such texts. Nothing else is allowed so far.
  const ALLOWED = [
    [/^ALTIMETER·FT$/, /^REGISTER$/, 'salvaged dial: the new name on tape over the lower part of the old engraving'],
    [/^ATTITUDE IND\.$/, /^PAN L \/ R$/, 'salvaged dial: the new name on tape over the lower part of the old engraving'],
    [/^(OUTER = VOX|INNER = BASS)$/, /^ring$/, 'the operators\' sticker on the cover plate is wider than the plate and laps over its edge']
  ];
  const allowed = (a, b) => ALLOWED.some(([x, y]) => (x.test(a) && y.test(b)) || (x.test(b) && y.test(a)));
  const inter = (a, b) => a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS;
  const inside = (a, b, pad = 0) => a.x >= b.x + pad - EPS && a.y >= b.y + pad - EPS && a.x + a.w <= b.x + b.w - pad + EPS && a.y + a.h <= b.y + b.h - pad + EPS;
  const near = (box, c) => {   // a box and a circle meet
    const dx = Math.max(box.x - c.cx, 0, c.cx - box.x - box.w), dy = Math.max(box.y - c.cy, 0, c.cy - box.y - box.h);
    return dx * dx + dy * dy < (c.r - EPS) ** 2;
  };
  const corners = b => [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]];
  const name = t => JSON.stringify(t.text);
  function check(records, {panelPad = 2, screwGap = 3, frameGap = 2, ringGap = 4} = {}) {
    const texts = records.filter(r => r.type === 'text' && r.text.trim()), panels = records.filter(r => r.type === 'panel');
    const frames = records.filter(r => r.type === 'frame'), screws = records.filter(r => r.type === 'screw'), rings = records.filter(r => r.type === 'ring');
    const tapes = records.filter(r => r.type === 'tape'), keeps = records.filter(r => r.type === 'keep'), marks = records.filter(r => r.type === 'mark');
    const problems = [];
    const add = (kind, what, detail) => problems.push({kind, what, detail});
    for (const t of texts) {
      const home = panels.find(pa => t.x + t.w / 2 >= pa.x && t.x + t.w / 2 <= pa.x + pa.w && t.y + t.h / 2 >= pa.y && t.y + t.h / 2 <= pa.y + pa.h);
      if (!home) add('outside', name(t), 'not on any panel');
      else if (!inside(t, home, panelPad)) add('edge', name(t), `leaves its panel (or is within ${panelPad} px of its edge)`);
      for (const s of screws) if (near(t, {...s, r: s.r + screwGap})) add('screw', name(t), `on or within ${screwGap} px of the screw at ${s.cx.toFixed(0)},${s.cy.toFixed(0)}`);
      for (const f of frames) {
        if (allowed(t.text, 'frame')) continue;
        if (inter(t, f) && !inside(t, f) && !inside(f, t)) add('frame', name(t), `straddles the frame ${[f.x, f.y, f.w, f.h].map(v => v.toFixed(0)).join(',')}`);
        else if (inside(t, f) && !inside(t, f, frameGap) && !t.clipped) add('tight', name(t), `within ${frameGap} px of the frame ${[f.x, f.y, f.w, f.h].map(v => v.toFixed(0)).join(',')}`);
      }
      for (const c of rings) {
        const ins = corners(t).map(([x, y]) => Math.hypot(x - c.cx, y - c.cy) < c.r);
        if (ins.some(Boolean) && !ins.every(Boolean) && near(t, c) && !allowed(t.text, 'ring')) add('ring', name(t), `straddles the ring r ${c.r.toFixed(0)} at ${c.cx.toFixed(0)},${c.cy.toFixed(0)}`);
        else if (c.r >= 40 && !ins.some(Boolean) && near(t, {...c, r: c.r + ringGap}) && !allowed(t.text, 'ring')) add('tight', name(t), `within ${ringGap} px of the dial r ${c.r.toFixed(0)} at ${c.cx.toFixed(0)},${c.cy.toFixed(0)}`);
      }
    }
    for (const tape of tapes) for (const k of keeps) if (inter(tape, k)) add('cover', 'tape × ' + k.what, '');
    // A moving mark (the recorder pen) never runs through a text; a frame never covers part of a screw (its own
    // screws sit wholly inside it).
    for (const m of marks) for (const t of texts) if (inter(m, t)) add('mark', m.what + ' × ' + name(t), '');
    for (const f of frames) for (const sc of screws) {
      const box = {x: sc.cx - sc.r, y: sc.cy - sc.r, w: 2 * sc.r, h: 2 * sc.r};
      if (inter(f, box) && !inside(box, f)) add('screw', `frame ${[f.x, f.y, f.w, f.h].map(v => v.toFixed(0)).join(',')}`, `covers part of the screw at ${sc.cx.toFixed(0)},${sc.cy.toFixed(0)}`);
    }
    for (const tape of tapes) for (const c of rings) if (c.r >= 40 && !c.plate && near(tape, c) && !corners(tape).every(([x, y]) => Math.hypot(x - c.cx, y - c.cy) < c.r)) add('cover', 'tape × dial r ' + c.r.toFixed(0), `at ${c.cx.toFixed(0)},${c.cy.toFixed(0)}`);
    for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i], b = texts[j];
      if (a.clipped && b.clipped) continue;
      if (inter(a, b) && !allowed(a.text, b.text)) add('overlap', name(a) + ' × ' + name(b), '');
    }
    for (let i = 0; i < rings.length; i++) for (let j = i + 1; j < rings.length; j++) {
      const a = rings[i], b = rings[j], d = Math.hypot(a.cx - b.cx, a.cy - b.cy);
      if (d < 1) continue;   // the same centre: rings of one dial
      if (d < a.r + b.r - EPS && d > Math.abs(a.r - b.r) + EPS) add('rings', `r ${a.r.toFixed(0)} at ${a.cx.toFixed(0)},${a.cy.toFixed(0)} × r ${b.r.toFixed(0)} at ${b.cx.toFixed(0)},${b.cy.toFixed(0)}`, `cut by ${(a.r + b.r - d).toFixed(1)} px`);
    }
    for (const q of lampColumns(records).problems) add('column', q.what, q.detail);
    // One problem once: the same text on the same thing.
    const seen = new Set();
    return problems.filter(q => { const k = q.kind + q.what + q.detail; if (seen.has(k)) return false; seen.add(k); return true; });
  }
  // Labels beside lamps (radar.5 feedback: "CYM，HAT，TOM这些字体也对齐一下"). A label belongs to a lamp when its
  // middle is within the lamp's radius of the lamp's centre line and its near edge is within 40 px of the lamp. Lamps
  // with one x (within 1 px) make a column; the labels on one side of it share one anchor and are aligned on the side
  // facing the lamps. `offRow` lists each label's distance from its lamp's centre line (a warning with real fonts).
  function lampColumns(records) {
    const lamps = records.filter(r => r.type === 'lamp');
    const texts = records.filter(r => r.type === 'text' && r.text.trim() && !r.clipped && Number.isFinite(r.ax));
    const groups = new Map(), offRow = [];
    for (const t of texts) {
      const mid = t.y + t.h / 2;
      for (const l of lamps) {
        if (Math.abs(mid - l.cy) > l.r) continue;
        const before = t.x + t.w <= l.cx - l.r + EPS && l.cx - l.r - (t.x + t.w) <= 40;
        const after = t.x >= l.cx + l.r - EPS && t.x - (l.cx + l.r) <= 40;
        if (!before && !after) continue;
        const key = (before ? 'before ' : 'after ') + Math.round(l.cx);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(t);
        offRow.push({text: t.text, d: +(mid - l.cy).toFixed(2)});
        break;
      }
    }
    const problems = [];
    for (const [key, list] of groups) {
      if (list.length < 2) continue;
      const side = key.startsWith('before') ? 'right' : 'left';
      const names = list.map(t => JSON.stringify(t.text)).join(' ');
      if (list.some(t => t.align !== side)) problems.push({what: names, detail: `labels ${key.split(' ')[0]} the lamps at x ${key.split(' ')[1]} are not all ${side}-aligned (the side facing the lamps)`});
      else if (Math.max(...list.map(t => t.ax)) - Math.min(...list.map(t => t.ax)) > .6) problems.push({what: names, detail: `labels beside the lamps at x ${key.split(' ')[1]} do not share one edge`});
    }
    return {problems, offRow};
  }
  // Near misses (warnings, not failures): on one panel, texts set to the same side (left / right / centre) whose
  // anchors are 0.6–3 px apart, and texts in what reads as one row whose middles are 0.6–3 px apart: meant to line up
  // but not quite. Moving tape text and rotated tape labels are left out.
  function alignment(records) {
    const panels = records.filter(r => r.type === 'panel');
    const texts = records.filter(r => r.type === 'text' && r.text.trim() && !r.clipped && Number.isFinite(r.ax));
    const out = [];
    for (const pa of panels) {
      const mine = texts.filter(t => t.ax >= pa.x && t.ax <= pa.x + pa.w && t.ay >= pa.y && t.ay <= pa.y + pa.h);
      for (let i = 0; i < mine.length; i++) for (let j = i + 1; j < mine.length; j++) {
        const a = mine[i], b = mine[j];
        const dx = Math.abs(a.ax - b.ax), dy = Math.abs(a.ay - b.ay);
        if (a.align === b.align && dx >= .6 && dx <= 3) out.push({panel: [pa.x, pa.y].join(','), label: a.align, a: a.text, b: b.text, d: +dx.toFixed(1)});
        if (dy >= .6 && dy <= 3) out.push({panel: [pa.x, pa.y].join(','), label: 'row', a: a.text, b: b.text, d: +dy.toFixed(1)});
      }
    }
    // A label beside a lamp whose capitals sit more than 1 px off the lamp's centre line (meaningful with real fonts).
    for (const o of lampColumns(records).offRow) if (Math.abs(o.d) > 1) out.push({panel: 'lamp row', label: 'off row', a: o.text, b: 'lamp', d: o.d});
    return out;
  }
  const api = {check, alignment, lampColumns, ALLOWED};
  if (typeof module === 'object' && module.exports) module.exports = api; else root.XinRadarLayout = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
