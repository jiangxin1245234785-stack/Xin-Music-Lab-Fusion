'use strict';
// Lyrics timing (B7, 2026-11-15). Measured first (work/xml-round-20261115/REPORT-B7.md): 七里香's LRCLIB lyrics are
// 2.1 s early from first line to last (timed against another release); two English songs within 0.15 s. So: one
// whole-song offset estimated from the vocal line's phrase starts (only when clear), stored per song with the user's
// 0.1 s nudges, applied by the page as one subtraction per frame.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const core = require(path.join(root, 'lyrics-core.js'));
const {createLyrics} = require(path.join(root, 'desktop', 'lyrics.cjs'));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const done = [];

// A song: phrases every ~3.3 s (some lines longer), lyrics on most of them, the singing `late` seconds after each line.
function song(late, {lines = 30, noise = 0} = {}) {
  const notes = [], lrc = [];
  let t = 12;
  for (let i = 0; i < lines; i++) {
    const sing = t + late + (noise ? ((i * 37) % 7 - 3) * noise : 0);
    for (let k = 0; k < 6; k++) notes.push([+(sing + k * 0.35).toFixed(3), 0.3, 60 + k, 90]);
    const m = Math.floor(t / 60), s = (t - m * 60).toFixed(2).padStart(5, '0');
    lrc.push(`[${String(m).padStart(2, '0')}:${s}]line ${i}`);
    t += 3 + (i % 3) * 0.6;
  }
  return {notes, lrc: lrc.join('\n')};
}

// --- the estimate -----------------------------------------------------------------------------------------------------
(() => {
  // Phrase starts from the vocal line's notes ([start, duration, pitch, velocity]) and from {start, end}.
  assert.deepEqual(core.phraseStarts([[1, 0.2, 60, 90], [1.25, 0.2, 61, 90], [2, 0.3, 62, 90]]), [1, 2], 'a note right after another is not a phrase start');
  assert.deepEqual(core.phraseStarts([{start: 5, end: 5.2}, {start: 3, end: 3.1}]), [3, 5]);
  assert.deepEqual(core.phraseStarts([]), []);
  for (const late of [2.1, -1.5, 3.4, 0.9]) {
    const s = song(late, {noise: 0.04});
    const e = core.estimateOffset(core.parseLrc(s.lrc).lines, core.phraseStarts(s.notes));
    assert.ok(e.sure && Math.abs(e.shift - late) <= 0.2, `${late} s found: ${JSON.stringify(e)}`);
  }
  const aligned = song(0.1);
  const a = core.estimateOffset(core.parseLrc(aligned.lrc).lines, core.phraseStarts(aligned.notes));
  assert.ok(a.sure && a.shift === 0 && a.why === 'aligned', 'already in time (under 0.3 s): nothing is moved');
  // Not clear: too few lines, no vocal line, singing unrelated to the lyrics.
  const few = song(2, {lines: 4});
  assert.equal(core.estimateOffset(core.parseLrc(few.lrc).lines, core.phraseStarts(few.notes)).sure, false, 'too few lines');
  assert.equal(core.estimateOffset(core.parseLrc(aligned.lrc).lines, []).why, 'too-few-phrases');
  const random = []; let x = 7;
  for (let i = 0; i < 200; i++) { x = (x * 9301 + 49297) % 233280; random.push([(x / 233280) * 140, 0.3, 60, 90]); }
  const scattered = core.estimateOffset(core.parseLrc(song(0).lrc).lines, core.phraseStarts(random));
  assert.ok(!scattered.sure || scattered.shift === 0, 'singing unrelated to the lines gives no confident offset: ' + JSON.stringify(scattered));
  // Two sung phrases per line, 2.4 s apart (七里香's shape): two peaks. The intro decides - no line comes after the
  // singing has started - and without the notes to look at it stays unsure rather than guess.
  {
    const notes = [], lrc = [];
    let t = 27;
    for (let i = 0; i < 30; i++) {
      for (const at of [t + 2.2, t + 4.6]) for (let k = 0; k < 4; k++) notes.push([+(at + k * 0.4).toFixed(3), 0.35, 60 + k, 90]);
      const m = Math.floor(t / 60), s = (t - m * 60).toFixed(2).padStart(5, '0');
      lrc.push(`[${String(m).padStart(2, '0')}:${s}]line ${i}`);
      t += 6.8 + (i % 2) * 0.4;
    }
    const lines = core.parseLrc(lrc.join('\n')).lines, starts = core.phraseStarts(notes);
    const withIntro = core.estimateOffset(lines, starts, {notes});
    assert.ok(withIntro.sure && Math.abs(withIntro.shift - 2.2) <= 0.2, 'the first phrase of each line, not the second: ' + JSON.stringify(withIntro));
    assert.ok(withIntro.ruledOut.some(s => Math.abs(s - 4.6) <= 0.3), 'the second-phrase peak was ruled out by the intro');
    const blind = core.estimateOffset(lines, starts);
    assert.ok(!blind.sure || Math.abs(blind.shift - 2.2) <= 0.2, 'without the notes it never picks the second phrase');
  }
  done.push('估计：从人声线的乐句开头估一个整首偏移（−1.5 ~ +3.4 秒都找得到，误差 ≤ 0.2 秒）；本来就准的不动；行太少、没人声线、对不上时不给；一行两句时按前奏判断是第一句');
})();

// --- stored per song: the estimate once per lyrics text and vocal line, the nudges always ---------------------------
async function store() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'xml-lyrics-b7-'));
  try {
    const lyrics = createLyrics({root: path.join(base, 'cache'), fetch: async () => { throw Error('no network in tests'); }});
    const s = song(2.1);
    let o = await lyrics.offsetFor('t1', s.lrc, null);
    assert.deepEqual(o, {auto: 0, sure: false, why: 'no-vocal-line', manual: 0}, 'without a vocal line nothing is moved');
    o = await lyrics.offsetFor('t1', s.lrc, {id: 'v1', notes: s.notes});
    assert.ok(o.sure && Math.abs(o.auto - 2.1) <= 0.2, 'estimated once the vocal line is there');
    const file = fs.readdirSync(path.join(base, 'cache', 'offsets'));
    assert.equal(file.length, 1);
    const stored = JSON.parse(fs.readFileSync(path.join(base, 'cache', 'offsets', file[0]), 'utf8'));
    assert.equal(stored.trackId, 't1'); assert.equal(stored.auto.vocal, 'v1');
    // Not estimated again for the same lyrics and vocal line (the stored one is used even if it were different).
    stored.auto.shift = 9; fs.writeFileSync(path.join(base, 'cache', 'offsets', file[0]), JSON.stringify(stored));
    assert.equal((await lyrics.offsetFor('t1', s.lrc, {id: 'v1', notes: s.notes})).auto, 9, 'kept, not redone');
    assert.ok(Math.abs((await lyrics.offsetFor('t1', s.lrc, {id: 'v2', notes: s.notes})).auto - 2.1) <= 0.2, 'a new vocal line: estimated again');
    // Nudges: 0.1 s steps, kept per song, kept across a new estimate, bounded.
    let n = await lyrics.nudge('t1', -0.1); n = await lyrics.nudge('t1', -0.1);
    assert.equal(n.manual, -0.2);
    assert.equal((await lyrics.offsetFor('t1', s.lrc + '\n[03:00.00]more', {id: 'v2', notes: s.notes})).manual, -0.2, 'nudges stay when the lyrics change');
    assert.equal((await lyrics.offsetFor('t2', s.lrc, null)).manual, 0, 'per song');
    for (let i = 0; i < 150; i++) n = await lyrics.nudge('t1', 0.1);
    assert.equal(n.manual, 10, 'bounded at ±10 s');
    done.push('按歌记住：估计值对同一份歌词和同一条人声线只算一次；人声线换了重算；0.1 秒的手调另存、换歌词也保留、每首歌分开、上限 ±10 秒');
  } finally { fs.rmSync(base, {recursive: true, force: true}); }
}

// --- the page: one subtraction, the line says how far it was moved, the nudges ask the main process -----------------
async function page() {
  const el = tag => ({tag, className: '', textContent: '', title: '', type: '', hidden: false, style: {}, dataset: {}, children: [], attrs: {}, offsetHeight: 40,
    classList: {add() {}, remove() {}}, setAttribute(k, v) { this.attrs[k] = v; }, append(...c) { this.children.push(...c); }, remove() {},
    listeners: {}, addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }});
  const box = {};
  const doc = {createElement: el, getElementById: () => null};
  const canvas = {clientWidth: 1000, clientHeight: 600, offsetLeft: 0, offsetTop: 100, parentNode: {insertBefore(node) { box.el = node; }}};
  let clock = 21, status = {active: true, status: 'ready', trackId: 'a', health: {contour: {ok: false}}};
  const view = {options: () => ({playhead: 0.3}), timeAt: () => clock, lanes: () => [{group: 'vocals', visible: true, shown: true}],
    hit: (x, y) => (y >= 200 ? {kind: 'lane', group: 'vocals'} : null)};
  const asked = [], nudged = [];
  let offset = {auto: 0, sure: false, why: 'no-vocal-line', manual: 0};
  const bridge = {
    lyrics: id => { asked.push(id); return Promise.resolve({ok: true, source: 'lrclib', lrc: '[00:10.00]one\n[00:20.00]two\n[00:40.00]three', offset}); },
    lyricsNudge: (id, delta) => { nudged.push([id, delta]); offset = {...offset, manual: Math.round((offset.manual + delta) * 10) / 10}; return Promise.resolve({ok: true, offset}); }
  };
  const sandbox = {globalThis: {}, Promise};
  vm.runInNewContext(read('score-lyrics.js'), sandbox);
  const say = (k, f, p) => (p ? Object.entries(p).reduce((s, [a, b]) => s.split(`{${a}}`).join(b), f) : f);
  const ctl = sandbox.globalThis.XinScoreLyrics.create({bridge, stage: {}, canvas, scene: {status: () => status, viewHandle: () => view}, audio: {duration: 60}, core, doc,
    storage: {getItem: () => null, setItem() {}}, raf: () => 0, now: () => 1e9, say});
  const flush = () => new Promise(r => setImmediate(r));
  ctl.render(); await flush(); ctl.render();
  const [head, , current] = box.el.children;
  const [from, earlier, later] = head.children;
  assert.equal(current.textContent, 'two', 'no offset: as before');
  assert.equal(from.textContent, '歌词来自 LRCLIB');
  assert.equal(earlier.type, 'button'); assert.equal(earlier.textContent, '早 0.1 秒'); assert.equal(later.textContent, '晚 0.1 秒');
  // The vocal line comes (A prepares it): asked once more, and the estimate is used.
  offset = {auto: 2.1, sure: true, why: null, manual: 0};
  status = {...status, health: {contour: {ok: true}}};
  ctl.render(); await flush(); ctl.render();
  assert.deepEqual(asked, ['a', 'a'], 'asked again once the vocal line is there');
  ctl.render(); ctl.render(); await flush();
  assert.equal(asked.length, 2, 'and only once');
  assert.equal(current.textContent, 'one', 'at 21 s with the lyrics 2.1 s early, the line sung is still the one that started at 10 s');
  assert.equal(from.textContent, '歌词来自 LRCLIB · 已对齐 +2.1 秒');
  clock = 22.2; ctl.render();
  assert.equal(current.textContent, 'two', 'it changes at 20 + 2.1 s');
  // Nudge: earlier by 0.1 s twice.
  later.listeners.click[0]({stopPropagation() {}}); await flush();
  earlier.listeners.click[0]({stopPropagation() {}}); await flush();
  earlier.listeners.click[0]({stopPropagation() {}}); await flush();
  assert.deepEqual(nudged, [['a', 0.1], ['a', -0.1], ['a', -0.1]]);
  ctl.render();
  assert.equal(from.textContent, '歌词来自 LRCLIB · 已对齐 +2.1 秒 · 手调 −0.1 秒');
  assert.equal(ctl.status().offset.manual, -0.1);
  // Per frame: nothing but a subtraction (no estimate, no request) - the page holds no estimator call.
  assert.doesNotMatch(read('score-lyrics.js'), /estimateOffset|phraseStarts/, 'the estimate is made in the main process, never per frame');
  done.push('页面：只做一次减法；人声线出来后再问一次（只一次）拿估计；来源那行写「已对齐 +2.1 秒」「手调 −0.1 秒」；两个按钮各调 0.1 秒');
}

// --- wiring -----------------------------------------------------------------------------------------------------------
(() => {
  const main = read('desktop/main.cjs'), preload = read('desktop/preload.cjs'), css = read('style.css');
  const {MESSAGE_CATALOGS} = require(path.join(root, 'i18n', 'catalogs.js'));
  assert.match(preload, /lyricsNudge: \(trackId, delta\) => ipcRenderer\.invoke\('fusion:lyrics-nudge', \{ trackId, delta \}\),/);
  assert.match(main, /ipcMain\.handle\('fusion:lyrics-nudge'/);
  assert.match(main, /if\(!\(delta===0\.1\|\|delta===-0\.1\)\)return \{ok:false,reason:'bad-step'\}/, 'only 0.1 s steps are taken from the page');
  assert.match(main, /lyrics\.offsetFor\(track\.id,answer\.lrc,vocal\)/);
  assert.match(main, /'score-vocals\.json'/, 'the estimate reads the vocal line');
  for (const key of ['score.lyricsAligned', 'score.lyricsManual', 'score.lyricsEarlier', 'score.lyricsLater', 'score.lyricsEarlierTip', 'score.lyricsLaterTip'])
    assert.ok(MESSAGE_CATALOGS['zh-CN'][key] && MESSAGE_CATALOGS['en-US'][key], key);
  assert.match(css, /\.score-lyrics__nudge \{ pointer-events: auto;/, 'only the buttons take the pointer');
  done.push('接线：主进程只收 ±0.1 秒；估计读人声线；中英文案齐；只有两个按钮接鼠标');
})();

process.on('exit', () => { if (done.length !== 4 && !process.exitCode) { console.error(`only ${done.length} of 4 groups ran`); process.exitCode = 1; } });
store().then(page).then(() => {
  for (const line of done) console.log('ok  ' + line);
  console.log(`lyrics-b7: ${done.length} groups passed`);
}).catch(error => { console.error(error); process.exitCode = 1; });
