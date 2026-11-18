'use strict';
// One analysed track as a host has it -> the score-view model `xin.score-view/1`.
//
// Stage two's adapter (plan B1). It takes what XML already holds for a track: the bridge
// manifest (`xld.music-lab/2`: sections and chords, possibly empty) and, per stem, the notes
// XLD wrote next to the MIDI file (`notes.json`: `{start, end, pitch, velocity}` in seconds).
// Every layer may be missing; a track with nothing but one transcribed stem still makes a
// model, and a track with no notes at all makes none (`ok: false`).
//
// The beat grid, the loudness and the stem levels come from `score-layers.json`, and the lead
// vocal's notes with their pitch contour from `score-vocals.json`; XLD's `score-layers` and
// `score-vocals` analyses write them beside the track's other results. A track that has not
// had an analysis simply lacks what it gives.
//
// The listening captions are made here from the model itself, by the same rules as stage one.
//
// What stage one's Python builder does and this does not: split a stem into its timbre
// tracks, recompute flat velocities from the stem audio.
const fs = require('node:fs');
const path = require('node:path');
const {consensus} = require('../tools/chord_consensus.cjs');
const {captions,mergeManual} = require('./captions.cjs');
// Loaded with a guard: a host shipped without it (an older packing list) still gets a model, without roles.
let rolesOf = null, rolesMissing = null;
try { ({rolesOf} = require('./roles.cjs')); } catch (error) { rolesMissing = String(error && error.code || error && error.message || error); }
const {segment} = require('../../xld-runtime-baseline/core/midi-read.cjs');
const PROGRAM_NAMES={0:'钢琴',24:'木吉他',25:'木吉他',26:'爵士吉他',27:'电吉他',28:'闷音吉他',29:'过载吉他',30:'失真吉他',32:'原声贝斯',33:'电贝斯',34:'拨片贝斯',40:'小提琴',41:'中提琴',42:'大提琴',43:'低音提琴',48:'弦乐合奏',
  // Winds (work/winds-20261115/SPEC.md W2): General MIDI brass, reeds and pipes.
  56:'小号',57:'长号',58:'大号',59:'弱音小号',60:'圆号',61:'铜管组',62:'合成铜管',63:'合成铜管',64:'高音萨克斯',65:'中音萨克斯',66:'次中音萨克斯',67:'上低音萨克斯',
  68:'双簧管',69:'英国管',70:'巴松',71:'单簧管',72:'短笛',73:'长笛',74:'竖笛',75:'排箫',76:'吹瓶',77:'尺八',78:'口哨',79:'陶笛'};
// An instrument by the name MuScriptor's tokenizer gives it (its vocabulary, muscriptor/tokenizer/mt3.py), for a part
// that carries a name and no program this table knows.
const INSTRUMENT_NAMES={trumpet:'小号',trombone:'长号',tuba:'大号',french_horn:'圆号',brass_section:'铜管组',soprano_and_alto_sax:'高 / 中音萨克斯',
  tenor_sax:'次中音萨克斯',baritone_sax:'上低音萨克斯',oboe:'双簧管',english_horn:'英国管',bassoon:'巴松',clarinet:'单簧管',flutes:'长笛',flute:'长笛',
  violin:'小提琴',viola:'中提琴',cello:'大提琴',contrabass:'低音提琴',string_ensemble:'弦乐合奏',orchestral_harp:'竖琴'};
// A part's name on screen: its MuScriptor name's (W3: MuScriptor's "flutes" carry program 72, piccolo), else its
// program's, else the stem's label with the raw name after it.
const partLabel=(part,label)=>INSTRUMENT_NAMES[String(part.name||'').trim().toLowerCase().replace(/[\s-]+/g,'_')]||PROGRAM_NAMES[part.program]||
  (part.name?`${label}·${part.name}`:label);

const CONTRACT = 'xin.score-view/1';
// Top to bottom on screen, as gate one settled it.
const STEMS = [
  ['vocals', '人声', 'melody'], ['guitar', '吉他', 'pitched'], ['piano', '钢琴', 'pitched'],
  ['strings', '弦乐', 'pitched'], ['winds', '管乐', 'pitched'], ['bass', '贝斯', 'pitched'], ['drums', '鼓', 'drums']
];
// General MIDI percussion -> the seven rows of the drum lane (the same table memesynth uses).
const DRUM_ROWS = ['kick', 'snare', 'hihat', 'openhat', 'tom', 'crash', 'ride'];
const DRUM_CLASS = {
  35: 'kick', 36: 'kick', 37: 'snare', 38: 'snare', 39: 'snare', 40: 'snare', 42: 'hihat', 44: 'hihat', 46: 'openhat',
  41: 'tom', 43: 'tom', 45: 'tom', 47: 'tom', 48: 'tom', 50: 'tom', 49: 'crash', 52: 'crash', 55: 'crash', 57: 'crash',
  51: 'ride', 53: 'ride', 59: 'ride'
};
const STRUCTURE_PRIORITY = ['songformer', 'msaf', 'msaf-cnmf', 'msaf-sf', 'msaf-foote'];
// Section names come from XLD's one module, the same one XLD's own screens and its bridge manifest use.
const {tidySections} = require('../../xld-runtime-baseline/core/sections.cjs');

const finite = value => typeof value === 'number' && Number.isFinite(value);
const round = value => Math.round(value * 1000) / 1000;

// An engine's segments as `[start, end, name, engine, first raw label, raw labels]` (see MODEL.md).
// The names are always made from the raw segments, so a bridge manifest written before segments
// carried a `name` gets the same names as a new one. `lang` is 'zh' (default) or 'en'.
function nameSections(segments, engine, duration, lang) {
  return tidySections(segments, {engine, duration, lang});
}

function sectionsOf(manifest, duration, health, lang) {
  const results = (Array.isArray(manifest && manifest.analyses) ? manifest.analyses : [])
    .filter(result => result && result.engine && Array.isArray(result.segments) && result.segments.length);
  const rank = result => { const at = STRUCTURE_PRIORITY.indexOf(result.engine.id); return at < 0 ? STRUCTURE_PRIORITY.length : at; };
  for (const result of results.sort((a, b) => rank(a) - rank(b))) {
    const sections = nameSections(result.segments, String(result.engine.id), duration, lang);
    if (sections.length) {
      health.sections = {ok: true, engine: result.engine.id, segments: sections.length};
      return sections;
    }
  }
  health.sections = {ok: false, why: '没有段落分析的结果'};
  return null;
}

function chordsOf(manifest, duration, health) {
  const results = (Array.isArray(manifest && manifest.harmony) ? manifest.harmony : [])
    .filter(result => result && result.engine && Array.isArray(result.segments) && result.segments.length);
  if (!results.length) { health.chords = {ok: false, why: '没有和弦分析的结果'}; return null; }
  try {
    const voted = consensus(results, duration);
    if (!voted.chords.length) { health.chords = {ok: false, why: '和弦引擎没有给出任何和弦'}; return null; }
    health.chords = {ok: true, engines: voted.engines, segments: voted.chords.length, unparsed: voted.unparsed};
    return voted;
  } catch (error) {
    health.chords = {ok: false, why: String(error && error.message || error)};
    return null;
  }
}

function notesOf(raw) {
  const notes = [];
  for (const note of Array.isArray(raw) ? raw : []) {
    const start = Number(note && note.start), end = Number(note && note.end), pitch = Number(note && note.pitch);
    if (!finite(start) || !finite(end) || !finite(pitch) || start < 0 || end <= start || pitch < 0 || pitch > 127) continue;
    const velocity = finite(Number(note.velocity)) ? Math.max(1, Math.min(127, Math.round(Number(note.velocity)))) : 100;
    notes.push([round(start), round(end - start), Math.round(pitch), velocity]);
  }
  return notes.sort((a, b) => a[0] - b[0] || a[2] - b[2]);
}

function lanesOf(stems, health) {
  const lanes = [];
  health.lanes = {};
  for (const [stem, label, kind] of STEMS) {
    const entry = stems && stems[stem];
    const notes = notesOf(entry && entry.notes);
    if (!notes.length) { health.lanes[stem] = {ok: false, why: entry && entry.error ? String(entry.error) : '没有转写'}; continue; }
    const meta = {engine: entry.engine || null, runId: entry.runId || null,velocity:new Set(notes.map(n=>n[3])).size<=1?'flat':'recorded'};
    if (kind === 'drums') {
      const hits = [];
      let unknown = 0;
      for (const [start, , pitch, velocity] of notes) {
        const row = DRUM_ROWS.indexOf(DRUM_CLASS[pitch]);
        if (row < 0) unknown++;
        else hits.push([start, row, velocity]);
      }
      if (!hits.length) { health.lanes[stem] = {ok: false, why: '鼓的音高都不在已知的类别里'}; continue; }
      lanes.push({id: stem, label, kind, group: stem, groupLabel: label, rows: DRUM_ROWS.slice(), hits, meta});
      health.lanes[stem] = {ok: true, engine: meta.engine, notes: hits.length, unknownPitches: unknown};
    } else {
      const parts=Array.isArray(entry.instruments)&&entry.instruments.reduce((n,p)=>n+(p.notes||[]).length,0)===(entry.notes||[]).length?entry.instruments.filter(p=>p.notes.length):[];
      if(parts.length>1)for(const part of parts){
        lanes.push({id:stem+'/'+part.index,label:partLabel(part,label),kind,group:stem,groupLabel:label,notes:notesOf(part.notes),meta:{...meta,instrumentIndex:part.index,program:part.program,instrumentName:part.name}});
      }else {
        const part=parts[0];
        const timbre=part ? {...meta,instrumentIndex:part.index,program:part.program,instrumentName:part.name} : meta;
        lanes.push({id: stem, label, kind, group: stem, groupLabel: label, notes, meta:timbre});
      }
      health.lanes[stem] = {ok: true, engine: meta.engine, notes: notes.length,instruments:parts.length||1,velocity:meta.velocity,instrumentError:entry.instrumentError||null};
    }
  }
  return lanes;
}

// `line`: the body of score-vocals.json, or nothing. The lead-vocal line it carries (notes cut
// from a guarded pitch contour of the separated lead) takes the place of a vocal lane made
// from the stem's MIDI: it is the cleaner source, and it is the one the contour belongs to.
// A result readVocalLine found out of date ({kind: STALE_KIND, state}) is not drawn: the host offers to run
// the analysis again (vocalsRun false), and health.contour says why.
const STALE_KIND = 'score-vocals-stale';
const STALE_WHY = {
  stale: '人声曲线过期了：人声分轨换过了，要重新跑',
  'split-missing': '人声曲线过期了：主唱 / 和声文件不在了或对不上，要重新跑',
  'no-stem': '这首歌现在没有有效的分轨，旧的人声曲线不画'
};
function vocalLineInto(lanes, line, health) {
  if (line && line.kind === STALE_KIND) {
    // Without a valid stem there is nothing to run the analysis on: no offer then.
    health.vocalsRun = line.state === 'no-stem';
    health.contour = {ok: false, stale: line.state, why: STALE_WHY[line.state] || `人声曲线不是当前的（${line.state}）`};
    return;
  }
  health.vocalsRun = Boolean(line);
  const lane = line && line.lane;
  const notes = lane && Array.isArray(lane.notes)
    ? lane.notes.filter(note => Array.isArray(note) && note.length >= 3 && note.slice(0, 3).every(finite) && note[1] > 0) : [];
  if (!notes.length) {
    health.contour = {ok: false, why: line ? (line.why || '没有跟到人声') : '还没有跑过「人声曲线」分析'};
    return;
  }
  const made = {id: 'vocals', label: '人声', kind: 'melody', group: 'vocals', groupLabel: '人声',
                notes: notes.map(note => [note[0], note[1], note[2], finite(note[3]) ? note[3] : 100]),
                meta: {engine: 'score-vocals', runId: null}};
  const contour = lane.contour;
  if (contour && finite(contour.hop) && contour.hop > 0 && Array.isArray(contour.midi) && contour.midi.some(finite)) {
    made.contour = {hop: contour.hop, start: finite(contour.start) ? contour.start : 0, midi: contour.midi.map(value => (finite(value) ? value : null))};
    health.contour = {ok: true, frames: made.contour.midi.length};
  } else health.contour = {ok: false, why: '结果里没有音高曲线'};
  const at = lanes.findIndex(item => item.id === 'vocals');
  if (at >= 0) lanes[at] = made;
  else lanes.unshift(made);
  health.lanes.vocals = {ok: true, engine: 'score-vocals', notes: made.notes.length};
}

// `layers`: the body of score-layers.json, or nothing. Each layer is taken only if it has the
// shape the core draws; the reason a layer is missing is kept for the host to show.
function layersInto(model, layers, health) {
  const numbers = list => Array.isArray(list) && list.every(finite);
  // Whether the analysis has been run at all: a host offers to run it only when it has not.
  health.layersRun = Boolean(layers);
  const none = name => (layers && layers.missing && layers.missing[name]) || (layers ? '这一层没有算出来' : '还没有跑过「谱面层」分析');
  const bars = layers && layers.bars;
  if (bars && numbers(bars.beats) && bars.beats.length && numbers(bars.downbeats)) {
    const steady = bars.steady === true && bars.downbeats.length > 0;
    model.bars = {beatsPerBar: steady && finite(bars.beatsPerBar) ? bars.beatsPerBar : null, bpm: finite(bars.bpm) ? bars.bpm : null,
                  beats: bars.beats.slice(), downbeats: steady ? bars.downbeats.slice() : [], steady};
    health.bars = {ok: steady, beats: bars.beats.length, bars: model.bars.downbeats.length, bpm: model.bars.bpm,
                   why: steady ? null : `网格不稳定，不画小节线：${bars.why || '没有说明'}`};
  } else health.bars = {ok: false, why: none('bars')};
  const energy = layers && layers.energy;
  if (energy && finite(energy.hop) && energy.hop > 0 && numbers(energy.db) && energy.db.length) {
    model.energy = {hop: energy.hop, db: energy.db.slice()};
    health.energy = {ok: true, frames: energy.db.length};
  } else health.energy = {ok: false, why: none('energy')};
  const levels = layers && layers.levels;
  const groups = levels && levels.groups && typeof levels.groups === 'object'
    ? Object.fromEntries(Object.entries(levels.groups).filter(([, row]) => numbers(row) && row.length)) : {};
  if (levels && finite(levels.hop) && levels.hop > 0 && Object.keys(groups).length) {
    model.levels = {hop: levels.hop, groups};
    health.levels = {ok: true, groups: Object.keys(groups)};
    // Left minus right, dB per frame (score-layers version 2): the whole song and each stereo stem. Older results
    // have none; the radar's PAN meter then stays level.
    const pan = levels.pan;
    if (pan && typeof pan === 'object' && finite(pan.hop) && pan.hop > 0) {
      const panGroups = pan.groups && typeof pan.groups === 'object'
        ? Object.fromEntries(Object.entries(pan.groups).filter(([, row]) => numbers(row) && row.length)) : {};
      const mix = numbers(pan.mix) && pan.mix.length ? pan.mix : null;
      if (mix || Object.keys(panGroups).length) model.levels.pan = {hop: pan.hop, groups: panGroups, mix};
    }
    health.levels.pan = Boolean(model.levels.pan);
  } else health.levels = {ok: false, why: none('levels')};
}

// The separator's 'other' stem (what is left once the named stems are taken out: pads, effects,
// noise) as one lane of kind 'texture': a name and its loudness on the levels layer's frames. No
// notes are made up for it. Only 'other': a named stem is never folded in, notes or not (the sung
// lead without a vocal line is still the lead, not "other"; SPEC-FIX.md §1). Without a levels layer,
// or without 'other' in it, there is none.
const TEXTURE_LABEL = {zh: '其它', en: 'Other'};
// Under this the stem is silence to the score view's band (score-view.js TEXTURE.floor; texture.test.cjs holds them equal).
// An 'other' that never rises above it would only be an empty strip with an icon: no lane then (SPEC-FIX.md §8.3).
const TEXTURE_FLOOR = -50;
function textureInto(model, lang, health) {
  if (!model.levels) { health.texture = {ok: false, why: '没有分轨响度层'}; return; }
  const row = model.levels.groups.other;
  if (!Array.isArray(row) || !row.length) { health.texture = {ok: false, why: '响度层里没有「其它」分轨'}; return; }
  if (!row.some(value => value > TEXTURE_FLOOR)) { health.texture = {ok: false, why: `「其它」分轨整首都在 ${TEXTURE_FLOOR} dB 以下`}; return; }
  const label = TEXTURE_LABEL[lang === 'en' ? 'en' : 'zh'];
  model.lanes.push({id: 'texture', label, kind: 'texture', group: 'other', groupLabel: label, members: ['other'], level: {hop: model.levels.hop, db: row.slice()}});
  health.texture = {ok: true, members: ['other'], frames: row.length};
}

// Lead or accompaniment inside each instrument lane (adapter/roles.cjs, work/score-roles-20261114).
// A judged lane gets `roles` (1 = lead, 0 = comp, one per note) and `leadLines` ([[start, end], ...]);
// vocals, bass, drums and the texture lane get neither. A failure leaves every lane without them.
function rolesInto(model, health) {
  if (!rolesOf) { health.roles = {ok: false, why: '主 / 伴判断的模块没有装上：' + rolesMissing}; return; }
  try {
    const judged = rolesOf(model).lanes;
    let lanes = 0, lead = 0, notes = 0;
    for (const lane of model.lanes) {
      const r = judged[lane.id];
      if (!r || lane.kind !== 'pitched' || r.roles.length !== lane.notes.length) continue;
      lane.roles = r.roles.map(role => (role === 'lead' ? 1 : 0));
      lane.leadLines = r.lines.map(([a, b]) => [a, b]);
      lanes++; notes += lane.roles.length; lead += lane.roles.reduce((s, x) => s + x, 0);
    }
    health.roles = lanes ? {ok: true, lanes, notes, lead} : {ok: false, why: '没有要判断主 / 伴的轨'};
  } catch (error) {
    for (const lane of model.lanes) { delete lane.roles; delete lane.leadLines; }
    health.roles = {ok: false, why: String(error && error.message || error)};
  }
}

// `input`: {layers: <score-layers.json or null>, vocalLine: <score-vocals.json or null>, track: {id, title, artist, album}, duration, audioUrl, coverUrl, manifest,
//           stems: {<stem>: {notes: [...], engine, runId} | {error}}, lang: 'zh' (default) | 'en' for the section names and marks,
//           captionStyle: 'mark' (default since 2026-11-14, adapter/cues.cjs) | 'sentence' (the rule sentences)}
function modelFrom(input) {
  const health = {};
  const lanes = lanesOf(input.stems, health);
  vocalLineInto(lanes, input.vocalLine, health);
  if (!lanes.length) return {ok: false, error: 'score-no-notes', health};
  const manifest = input.manifest || {};
  const track = {...(manifest.track || {}), ...(input.track || {})};
  const lastNote = Math.max(0, ...lanes.map(lane => lane.kind === 'drums'
    ? lane.hits[lane.hits.length - 1][0] : Math.max(...lane.notes.map(note => note[0] + note[1]))));
  const stated = [input.duration, manifest.timing && manifest.timing.duration].map(Number).find(value => finite(value) && value > 0);
  const duration = round(Math.max(stated || 0, lastNote));
  const model = {
    contract: CONTRACT,
    track: {id: String(track.id || ''), title: String(track.title || ''), artist: String(track.artist || ''),
            album: String(track.album || ''), duration, ...(finite(Number(track.number)) && Number(track.number) > 0 ? {number: Number(track.number)} : {}),
            // The song's outside facts for the radar's track sheet, as the host gives them: [{name, value}] in order.
            ...(Array.isArray(track.facts) ? {facts: track.facts.filter(f => f && typeof f.name === 'string' && f.name.trim() && (typeof f.value === 'string' || finite(f.value)) && String(f.value).trim())
              .slice(0, 40).map(f => ({name: f.name.trim().slice(0, 32), value: String(f.value).trim().slice(0, 300)}))} : {})},
    audio: {src: String(input.audioUrl || ''), offset: 0},
    lanes
  };
  const voted = chordsOf(manifest, duration, health);
  if (voted) { model.chords = voted.chords; model.chordTones = voted.tones; }
  const sections = sectionsOf(manifest, duration, health, input.lang);
  if (sections) model.sections = sections;
  if (input.coverUrl) { model.cover = {src: String(input.coverUrl)}; health.cover = {ok: true}; }
  else health.cover = {ok: false, why: '专辑文件夹里没有封面图片'};
  layersInto(model, input.layers, health);
  textureInto(model, input.lang, health);
  rolesInto(model, health);
  // Captions say what the notes and sections do, so they come last, from the finished model.
  try {
    // The marks are the look chosen at gate10; 'sentence' still gives the old lines (captions.cjs keeps them as its own default).
    const lines = mergeManual(captions(model, [], {captionStyle: input.captionStyle === 'sentence' ? 'sentence' : 'mark', lang: input.lang}),input.manualCaptions);
    if (lines.length) model.captions = lines;
    health.captions = lines.length ? {ok: true, lines: lines.length} : {ok: false, why: '这首歌里没有规则会说的变化'};
  } catch (error) {
    health.captions = {ok: false, why: String(error && error.message || error)};
  }
  return {ok: true, model, health};
}

// Reads each stem's notes through the host's own "active MIDI of this stem" lookup, so the
// score shows exactly the transcription XLD and XML consider current.
//   readMidi(stem) -> the record XML's `fusion:midi-read` returns ({ok, directory, notesFile, engine, runId} | {ok: false, error})
async function readStems(readMidi) {
  const stems = {};
  for (const [stem] of STEMS) {
    try {
      const record = await readMidi(stem);
      if (!record || !record.ok) { stems[stem] = {error: record && record.error || 'midi-missing'}; continue; }
      const file = path.join(record.directory, path.basename(String(record.notesFile || 'notes.json')));
      const body = JSON.parse(await fs.promises.readFile(file, 'utf8'));
      stems[stem] = {notes: body.notes, engine: record.engine, runId: record.runId};
      if(record.file){
        try{
          const midi=await fs.promises.readFile(path.join(record.directory,path.basename(record.file)));
          const parsed=segment(midi,body.notes.length);
          if(parsed.ok)stems[stem].instruments=parsed.instruments.map(p=>({...p,notes:body.notes.slice(...parsed.offsets[p.index])}));
          else stems[stem].instrumentError=parsed.error;
        }catch(error){stems[stem].instrumentError=error.code||error.message;}
      }
    } catch (error) {
      stems[stem] = {error: String(error && error.code || error && error.message || error)};
    }
  }
  return stems;
}

// One of the score's own results from a track's analysis folder, or null (missing, unreadable, another kind).
async function readResult(directory, kind) {
  if (!directory) return null;
  try {
    const body = JSON.parse(await fs.promises.readFile(path.join(directory, `${kind}.json`), 'utf8'));
    return body && body.kind === kind ? body : null;
  } catch (error) { return null; }
}
const readLayers = directory => readResult(directory, 'score-layers');

// XLD decides whether a vocal line is current (core/score-vocals.cjs read(): the vocal stem it was made from is
// the stem the track has now, the stems themselves still fit the original file, the lead / backing files are
// there and fit). Its own module is used, not a copy. The track it needs is made from the folder: stems.json
// names the track id and the original file; the folder itself is where the results are.
function loadXld() {
  try {
    return {scoreVocals: require('../../xld-runtime-baseline/core/score-vocals.cjs'),
            createDerivedAssets: require('../../xld-runtime-baseline/core/derived-assets.cjs').createDerivedAssets};
  } catch (error) { return null; }
}
// The body of score-vocals.json when it is current; {kind: STALE_KIND, state} when XLD says it is not; null
// when there is none. Without XLD's modules (should not happen: they ship beside this) the body is taken as it is.
async function readVocalLine(directory, xld = loadXld()) {
  const body = await readResult(directory, 'score-vocals');
  if (!body || !xld) return body;
  let stems = null;
  try { stems = JSON.parse(await fs.promises.readFile(path.join(directory, 'stems.json'), 'utf8')); } catch (error) { stems = null; }
  const track = stems && stems.trackId && stems.source && typeof stems.source.path === 'string'
    ? {id: stems.trackId, filePath: stems.source.path, bridgePath: path.join(directory, 'music-lab.json')} : null;
  if (!track) return {kind: STALE_KIND, state: 'no-stem'};
  try {
    const assets = xld.createDerivedAssets({analysisRoot: path.dirname(path.dirname(directory))});
    const state = await xld.scoreVocals.read(assets, track, directory);
    if (state.state === 'current') return state.result;
    return {kind: STALE_KIND, state: state.state === 'missing' ? 'stale' : state.state, why: state.why || null};
  } catch (error) {
    return {kind: STALE_KIND, state: 'unreadable', why: String(error && error.message || error)};
  }
}

module.exports = {partLabel, TEXTURE_FLOOR, STALE_KIND, modelFrom, textureInto, rolesInto, readStems, readLayers, readVocalLine, LAYERS_ENGINE: 'score-layers', VOCALS_ENGINE: 'score-vocals', nameSections, CONTRACT, STEMS: STEMS.map(row => row[0]), DRUM_ROWS};
