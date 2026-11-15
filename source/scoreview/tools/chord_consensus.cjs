'use strict';
// Chord timeline for the score-view model, voted by XML's own provider adapter.
//
//   node chord_consensus.cjs --duration <seconds> [--out chords.json] <engine result .json> ...
//
// Each input is one harmony engine's result as XLD writes it (`chord-<engine>.json`:
// `{engine: {id}, segments: [{start, end, label, confidence}]}`). The voting itself is not
// reimplemented here: the results are wrapped in an `xld.music-lab/2` manifest and handed
// to `fusion-runtime-baseline/xld-timeline-provider-adapter.js`, the same code XML uses to
// decide "the chord right now", and that decision is read back once inside every stretch
// between two segment edges. Neighbouring stretches that agree are joined.
//
// A stretch where no engine names a chord (all say `N`) stays out of the timeline, so the
// model has a gap there and the view shows no chord.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const adapterModule = require(path.join(__dirname, '..', '..', 'fusion-runtime-baseline', 'xld-timeline-provider-adapter.js'));

// XLD's chord label parser lives inside its timeline script, which expects a browser
// `window`. It is loaded the way XLD's own `tests/chord-labels.cjs` loads it: into an
// empty sandbox, read-only, and only `chordTones` is taken out.
const sandbox = {window: {}};
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '..', '..', 'xld-runtime-baseline', 'timeline-controls.js'), 'utf8'), sandbox);
const {chordTones} = sandbox.window.XldTimelineControls;

function consensus(results, durationSeconds) {
  const harmony = results.map(result => ({
    engine: {id: String(result.engine?.id || result.engine || '')},
    segments: result.segments.map(segment => ({
      start: Number(segment.start), end: Number(segment.end), label: String(segment.label),
      confidence: segment.confidence == null ? null : Math.max(0, Math.min(1, Number(segment.confidence)))
    })).filter(segment => segment.end > segment.start && segment.label)
  }));
  const manifest = {
    schemaVersion: 2, contract: 'xld.music-lab/2',
    track: {id: 'score-view', source: 'score-view'},
    timing: {unit: 'seconds', origin: 0, duration: durationSeconds},
    analyses: [], harmony, manualTags: []
  };
  const adapter = adapterModule.create();
  const loaded = adapter.load(manifest, {durationMs: durationSeconds * 1000});
  if (!loaded.ok || loaded.durationState !== 'accepted') {
    throw new Error(`适配器没有接受和弦清单：${loaded.error || loaded.durationState} ${loaded.path || ''}`);
  }
  const confidenceOf = new Map(harmony.map(engine => [engine.engine.id, engine.segments]));
  const edges = [...new Set(harmony.flatMap(engine => engine.segments.flatMap(s => [s.start, s.end])))]
    .filter(t => t >= 0 && t <= durationSeconds).sort((a, b) => a - b);
  const chords = [];
  for (let i = 0; i + 1 < edges.length; i++) {
    const start = edges[i], end = edges[i + 1];
    if (end - start < 1e-6) continue;
    const cursor = adapter.cursorAt((start + end) / 2 * 1000, {harmonyEngineId: 'consensus'});
    if (!cursor.available || !cursor.harmony) continue;
    // The token names every engine that voted for the winning root and which of its
    // segments it voted with; the confidence shown is the strongest of those engines' own.
    let confidence = null;
    for (const member of cursor.harmony.token.replace(/^consensus:/, '').split('+')) {
      const cut = member.lastIndexOf(':');
      const segments = confidenceOf.get(member.slice(0, cut));
      const own = segments?.[Number(member.slice(cut + 1))]?.confidence;
      if (own != null && (confidence == null || own > confidence)) confidence = own;
    }
    const last = chords[chords.length - 1];
    if (last && last.label === cursor.harmony.label && Math.abs(last.end - start) < 1e-6) {
      const before = last.end - last.start, now = end - start;
      if (last.confidence != null && confidence != null) {
        last.confidence = (last.confidence * before + confidence * now) / (before + now);
      }
      last.end = end;
    } else {
      chords.push({start, end, label: cursor.harmony.label, confidence});
    }
  }
  // Which pitch classes each label names, root first, by XLD's own label parser. A label
  // it refuses gets no entry, and the view then shows the name without its tones.
  const tones = {}, unparsed = [];
  for (const label of new Set(chords.map(chord => chord.label))) {
    const named = chordTones(label);
    if (named) tones[label] = [...named];
    else unparsed.push(label);
  }
  return {
    chords: chords.map(c => [
      Math.round(c.start * 1000) / 1000, Math.round(c.end * 1000) / 1000, c.label,
      c.confidence == null ? null : Math.round(c.confidence * 1000) / 1000
    ]),
    tones, unparsed,
    engines: harmony.map(engine => engine.engine.id),
    adapterVersion: adapterModule.constants.ADAPTER_VERSION
  };
}

function main(argv) {
  const files = [];
  let duration = null, out = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--duration') duration = Number(argv[++i]);
    else if (argv[i] === '--out') out = argv[++i];
    else files.push(argv[i]);
  }
  if (!Number.isFinite(duration) || duration <= 0 || !files.length) {
    console.error('用法：node chord_consensus.cjs --duration <秒> [--out 文件] <引擎结果.json> ...');
    return 2;
  }
  const results = files.map(file => JSON.parse(fs.readFileSync(file, 'utf8')));
  const result = consensus(results, duration);
  const text = JSON.stringify(result);
  if (out) fs.writeFileSync(out, text, 'utf8');
  else process.stdout.write(text);
  return 0;
}

module.exports = {consensus};
if (require.main === module) process.exitCode = main(process.argv.slice(2));
