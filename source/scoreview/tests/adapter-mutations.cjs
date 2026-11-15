'use strict';
// Change only disposable module text. The preload gives that text the real module's
// filename so its relative dependencies resolve normally; repository files are never edited.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..');
const mutations=[];
const track=(name,find,put)=>mutations.push({file:'adapter/track-model.cjs',name,find,put});
const caption=(name,find,put)=>mutations.push({file:'adapter/captions.cjs',name,find,put});
track('model-contract','contract: CONTRACT,',"contract: 'wrong',");
track('note-duration','round(end - start)','round(end)');
track('note-velocity-fallback',': 100;\n    notes.push',': 1;\n    notes.push');
track('velocity-upper-bound','Math.min(127, Math.round(Number(note.velocity)))','Math.min(999, Math.round(Number(note.velocity)))');
track('negative-note-time',' || start < 0','');
track('note-time-order','a[0] - b[0] || a[2] - b[2]','b[0] - a[0] || a[2] - b[2]');
track('drum-pitch-class',"36: 'kick'","36: 'snare'");
track('strings-lane',"['strings', '弦乐', 'pitched'],",'');
track('instrument-identities',"id:stem+'/'+part.index","id:stem");
track('instrument-coverage',"entry.instruments.reduce((n,p)=>n+(p.notes||[]).length,0)===(entry.notes||[]).length",'true');
track('duration-fallback','Math.max(stated || 0, lastNote)','(stated || 0)');
track('original-audio-offset','offset: 0','offset: 2');
track('section-engine-priority',"['songformer', 'msaf', 'msaf-cnmf', 'msaf-sf', 'msaf-foote']","['msaf', 'songformer', 'msaf-cnmf', 'msaf-sf', 'msaf-foote']");
// Section names live in XLD's core/sections.cjs since phase two of work/xld-sections-20261113; the adapter calls it.
const sections=(name,find,put)=>mutations.push({file:'../xld-runtime-baseline/core/sections.cjs',name,find,put});
sections('section-duration-clipping','Math.min(limit, Number(segment.end))','Number(segment.end)');
sections('repeated-section-number',"name = `${name} ${seen.get(name)}`;",'name = name;');
sections('section-hole-fill','if (rows[i].start - rows[i - 1].end > EPSILON && !rows[i - 1].silent) rows[i - 1].end = rows[i].start;','');
sections('section-mid-intro',"row.key = i > last ? 'outro' : 'interlude';",'row.key = row.key;');
sections('section-early-outro',"row.key = i < first ? 'intro' : 'interlude';",'row.key = row.key;');
sections('section-inst-before-core',"else if (row.key === 'interlude' && i < first) row.key = 'intro';",'');
sections('section-instrumental-core',"if (!core.length) core = sounding.filter(row => row.key === 'interlude');",'');
sections('section-short-threshold','row.end - row.start >= TABLE.shortSeconds','row.end - row.start >= 0');
sections('section-short-same-name-first','if (prev && prev.key === row.key) into = prev;\n      else if (next && next.key === row.key) into = next;\n      else if','if');
sections('section-same-neighbours','if (touching(last, row) && last.key === row.key) absorb(last, row);','if (false) absorb(last, row);');
sections('section-silence-gap','return merged.filter(row => !row.silent);','return merged;');
sections('section-english',"return String(lang || 'zh').toLowerCase().startsWith('en') ? 'en' : 'zh';","return 'zh';");
sections('section-colour-first-raw','raws[0], raws]','raws[raws.length - 1], raws]');
sections('section-bridge-name','names[i] ? {...segment, name: names[i]} : segment','segment');
// 2026-11-14 (SPEC B6): XLD colours a section by its tidied name; the adapter's default is the marks.
sections('section-colour-by-name',"return kind ? COLOUR_LABEL[kind] : String(name == null ? '' : name).trim().replace(/\\s+\\d+$/, '');","return kind;");
sections('section-colour-number-kept',"return kind ? COLOUR_LABEL[kind] : String(name == null ? '' : name).trim().replace(/\\s+\\d+$/, '');","return kind ? COLOUR_LABEL[kind] : String(name == null ? '' : name).trim();");
sections('section-colour-not-written',"labels: row[5], colour: colourLabel(row[2])}","labels: row[5], colour: row[4]}");
sections('section-colour-interlude-key',"interlude: 'inst'","interlude: 'interlude'");
track('caption-default-mark',"captionStyle: input.captionStyle === 'sentence' ? 'sentence' : 'mark'","captionStyle: input.captionStyle");
track('unstable-bars','bars.steady === true && bars.downbeats.length > 0','bars.downbeats.length > 0');
track('empty-downbeats','bars.steady === true && bars.downbeats.length > 0','bars.steady === true');
track('energy-hop-guard','energy.hop > 0','energy.hop >= 0');
track('level-numeric-guard','numbers(row) && row.length','Array.isArray(row) && row.length');
track('vocal-line-precedence','if (at >= 0) lanes[at] = made;','if (at >= 0) lanes.push(made);');
track('vocal-contour-hop','contour.hop > 0','contour.hop >= 0');
track('invalid-contour-frames','(finite(value) ? value : null)','value');
track('vocal-source-label',"meta: {engine: 'score-vocals', runId: null}","meta: {engine: 'wrong', runId: null}");
track('result-kind-guard','body && body.kind === kind ? body : null','body ? body : null');
track('read-stem-isolation',"record && record.error || 'midi-missing'","'wrong-error'");
track('read-stem-note-count','segment(midi,body.notes.length)','segment(midi,0)');
caption('caption-spacing','const SPACING = 8.0','const SPACING = 1.0');
caption('caption-duration','const SHOWN = 6.0','const SHOWN = 60.0');
caption('caption-short-gaps','const BRIDGE = 4;','const BRIDGE = 0;');
caption('caption-entrance-gap','const ABSENT = 8;','const ABSENT = 1;');
caption('caption-section-source',"source === 'songformer' || source === 'manual'",'true');
caption('caption-hidden-groups','for (const group of hidden) playing.delete(group);','');
caption('caption-return-name',"'人声回来了' : '人声进来了'","'人声进来了' : '人声回来了'");
caption('caption-rule-provenance',"'rule'];","'manual'];");
caption('manual-overlap','r[0]<m[1]&&m[0]<r[1]','r[0]<=m[1]&&m[0]<=r[1]');
caption('manual-retention',"[...(rule||[]).filter(r=>!lines.some(m=>r[0]<m[1]&&m[0]<r[1])),...lines]","[...(rule||[]),...lines]");
caption('manual-text',"[n.start,n.end,n.text,'manual']","[n.start,n.end,'','manual']");
caption('caption-style-switch',"options && options.captionStyle === 'mark'","options");
// The "object · event" marks (work/score-cues-20261113): each event, each factor, the count, the preview split, the words.
const cue=(name,find,put)=>mutations.push({file:'adapter/cues.cjs',name,find,put});
cue('cue-factor-change','event.score = event.change * event.foreground','event.score = event.foreground');
cue('cue-factor-foreground','* event.foreground * event.novelty','* event.novelty');
cue('cue-factor-novelty','event.novelty = Math.pow(NOVELTY, times);','event.novelty = 1;');
cue('cue-factor-weight','* event.novelty * event.weight *','* event.novelty *');
cue('cue-section-bonus','(event.onSection ? SECTION_BONUS : 1)','1');
cue('cue-section-source',"(row[3] === 'songformer' || row[3] === 'manual')",'true');
cue('cue-floor','if (event.score < FLOOR)','if (false)');
cue('cue-cap','if (kept.length >= cap)','if (false)');
cue('cue-one-on-screen','const hit = kept.find(k => from < k.to + GAP && k.from < to + GAP);','const hit = null;');
cue('cue-quiet-start','e.at >= QUIET && ','');
cue('cue-quiet-tail','e.at < end - TAIL','e.at < duration');
cue('cue-preview-set',"['first', 'back', 'swell', 'lead', 'peak']","['first', 'back', 'swell', 'lead', 'peak', 'only']");
cue('cue-preview-time','const PREVIEW = 2.0;','const PREVIEW = 0;');
cue('cue-hidden','hidden.includes(group) || ','');
cue('cue-min-onsets','if (stretch.onsets < MIN_ONSETS) continue;','');
cue('cue-share-min','return found.filter(event => event.share === null || event.share >= SHARE_MIN);','return found;');
cue('cue-level-floor','if (level[part.group] < top - LEVEL_FLOOR || level[part.group] < PART_FLOOR) continue;','if (level[part.group] < PART_FLOOR) continue;');
cue('cue-only-count','before.length >= 3','before.length >= 1');
cue('cue-only-once',"const same = found.find(e => e.kind === 'only' && e.object === now[0] && Math.abs(e.at - event.at) <= ONLY_BEFORE);",'const same = null;');
cue('cue-first-word',"const word = i === 0 ? 'first' : 'back';","const word = 'back';");
cue('cue-back-word',"const word = i === 0 ? 'first' : 'back';","const word = i === 0 ? 'first' : 'enter';");
cue('cue-surge-db','const SURGE_DB = 5;','const SURGE_DB = 50;');
cue('cue-drop-db','const DROP_DB = 7;','const DROP_DB = 70;');
cue('cue-swell-db','const SWELL_DB = 6;','const SWELL_DB = 60;');
cue('cue-rest-span','to - from <= REST_SPAN[1] && ','');
cue('cue-loudness-silence','if (silentIn(mix, t - 2, t + 2.1)) continue;','');
cue('cue-peak-hold','const hold = Math.max(2, Math.round(PEAK_HOLD / hop));','const hold = 1;');
cue('cue-lead-entry','!entries.some(n => n.object === e.object && Math.abs(n.at - e.at) <= LEAD_ENTRY)','true');
cue('cue-lead-hold','const LEAD_HOLD = 8;','const LEAD_HOLD = 80;');
cue('cue-word-zh',"zh: {leave: '退出'","zh: {leave: '退出了'");
cue('cue-word-en',"en: {leave: 'Out'","en: {leave: '退出'");
cue('cue-text-dot',"return `${event.object === 'all' ? words.all : nameOf(event.object)}${words.dot}${words[event.kind]}`;","return `${event.object === 'all' ? words.all : nameOf(event.object)}${words[event.kind]}`;");
cue('cue-row-shape',"round2(event.to), textOf(event, words, nameOf), 'rule', {","round2(event.to), textOf(event, words, nameOf), {");
// 2026-11-14 acceptance: a floor for "first", a swell that climbs and is said once, the numbers pinned.
cue('cue-part-floor-gone',"if (level[part.group] < top - LEVEL_FLOOR || level[part.group] < PART_FLOOR) continue;","if (level[part.group] < top - LEVEL_FLOOR) continue;");
cue('cue-part-floor-too-high',"const PART_FLOOR = -70;","const PART_FLOOR = -50;");
cue('cue-swell-step-gone',"&& from[1] > mix.usual - REST_DB && step <= SWELL_STEP * (to[1] - from[1])) {","&& from[1] > mix.usual - REST_DB) {");
cue('cue-swell-step-loose',"const SWELL_STEP = 0.6;","const SWELL_STEP = 0.9;");
cue('cue-swell-surge-twice',"if (event.kind === 'surge' && swells.some(swell => event.at >= swell.at - 1 && event.at <= swell.until + 1)) peaks.splice(i, 1);","");
cue('cue-cap-3',"const PER_MINUTE = 2.5;","const PER_MINUTE = 3;");
cue('cue-cap-ceil',"const cap = Math.max(1, Math.round(duration / 60 * PER_MINUTE));","const cap = Math.max(1, Math.ceil(duration / 60 * PER_MINUTE));");
cue('cue-gap-0',"const GAP = 1.0;","const GAP = 0;");
cue('cue-floor-045',"const FLOOR = 0.5;","const FLOOR = 0.45;");
cue('cue-hold-3',"const HOLD = 2.5;","const HOLD = 3;");
cue('cue-no-layers','event.change = mix ? 0.6 + Math.min(1.4, Math.max(0, jump) / 6) : UNKNOWN_CHANGE;','event.change = mix ? 0.6 + Math.min(1.4, Math.max(0, jump) / 6) : 0.6;');

// The texture lane (work/score-dynamics-20261114/SPEC-REST.md): texture.test.cjs.
track('texture-without-levels',"if (!model.levels) { health.texture = {ok: false, why: '没有分轨响度层'}; return; }","if (!model.levels) { model.lanes.push({id: 'texture', label: '其它', kind: 'texture', group: 'other', level: {hop: 1, db: [-120]}}); return; }");
track('texture-without-other',"const row = model.levels.groups.other;","const row = model.levels.groups.other || Object.values(model.levels.groups)[0];");
track('texture-folds-in-other-stems',"level: {hop: model.levels.hop, db: row.slice()}}","level: {hop: model.levels.hop, db: row.map((v, k) => 10 * Math.log10(Object.values(model.levels.groups).reduce((sum, r) => sum + Math.pow(10, r[k] / 10), 0)))}}");
track('texture-makes-notes',"kind: 'texture', group: 'other', groupLabel: label, members: ['other'],","kind: 'texture', group: 'other', groupLabel: label, notes: [[0, 1, 60, 1]], members: ['other'],");
track('texture-silent-other',"  if (!row.some(value => value > TEXTURE_FLOOR)) {","  if (false) {");
track('texture-not-added','  textureInto(model, input.lang, health);\n','');
track('texture-english',"const TEXTURE_LABEL = {zh: '其它', en: 'Other'};","const TEXTURE_LABEL = {zh: '其它', en: '其它'};");

// Stage two of the lead / accompaniment layer and the vocal line's currency (work/score-roles-20261114/SPEC-2.md §1, §6).
track("roles-not-written","      lane.roles = r.roles.map(role => (role === 'lead' ? 1 : 0));","      lane.roles = r.roles.map(() => 0);");
track("roles-lines-missing","      lane.leadLines = r.lines.map(([a, b]) => [a, b]);","      lane.leadLines = [];");
track("roles-failure-kept","    for (const lane of model.lanes) { delete lane.roles; delete lane.leadLines; }","");
track("roles-failure-throws","    health.roles = {ok: false, why: String(error && error.message || error)};\n  }\n}","    throw error;\n  }\n}");
track("roles-on-texture","if (!r || lane.kind !== 'pitched' || r.roles.length !== lane.notes.length) continue;","if (!r || r.roles.length !== (lane.notes || []).length) continue;");
track("vocals-stale-drawn","  if (line && line.kind === STALE_KIND) {","  if (false) {");
track("vocals-stale-no-offer","    health.vocalsRun = line.state === 'no-stem';","    health.vocalsRun = true;");
track("vocals-no-stem-offered","    health.vocalsRun = line.state === 'no-stem';","    health.vocalsRun = false;");
track("vocals-not-checked","    if (state.state === 'current') return state.result;","    return state.result || body;");
track("vocals-no-stems-json","  if (!track) return {kind: STALE_KIND, state: 'no-stem'};","  if (!track) return body;");
track("vocals-why-missing","    health.contour = {ok: false, stale: line.state, why: STALE_WHY[line.state] || `人声曲线不是当前的（${line.state}）`};","    health.contour = {ok: false};");

// After acceptance (accept/ACCEPTANCE.md H): XLD's judgement throwing must not let the old line be drawn.
track("vocals-throw-drawn","    return {kind: STALE_KIND, state: 'unreadable', why: String(error && error.message || error)};","    return body;");

const reportFile=process.argv[2]&&path.resolve(process.argv[2]);
if(reportFile&&fs.existsSync(reportFile))throw Error('report already exists');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'score-adapter-mutations-'));
const report={ok:false,date:new Date().toISOString(),baseline:null,controls:[],mutations:[]};
// XLD's own test of the section rules runs with them, so a mutation in core/sections.cjs is caught by its rule cases.
const tests=['track-model.test.cjs','timbres.test.cjs','captions-port.test.cjs','manual-captions.test.cjs','cues.test.cjs','texture.test.cjs','model-roles.test.cjs','show-roles.test.cjs'].map(n=>path.join(__dirname,n)).concat(path.join(ROOT,'..','xld-runtime-baseline','tests','sections.cjs'));
function run(args,env={}){return spawnSync(process.execPath,args,{env:{...process.env,...env},encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024});}
function suite(env={}){const r=run(['--test','--test-reporter=tap',...tests],env);return{status:r.status,signal:r.signal,error:r.error?.message||null,failed:Number(r.stdout?.match(/^# fail (\d+)$/m)?.[1]||0),passed:Number(r.stdout?.match(/^# pass (\d+)$/m)?.[1]||0),failedTests:[...(r.stdout||'').matchAll(/^not ok \d+ - (.+)$/gm)].map(m=>m[1]),stdout:r.stdout,stderr:r.stderr};}
function save(){if(reportFile){fs.mkdirSync(path.dirname(reportFile),{recursive:true});fs.writeFileSync(reportFile,JSON.stringify(report,null,2));}}
try{
 report.baseline=suite();if(report.baseline.status!==0)throw Error('unmodified suite failed');
 const preload=path.join(scratch,'preload.cjs');fs.writeFileSync(preload,`const Module=require('node:module'),fs=require('node:fs'),path=require('node:path');const target=process.env.SCORE_ADAPTER_TARGET,copy=process.env.SCORE_ADAPTER_COPY;const m=new Module(target);m.filename=target;m.paths=Module._nodeModulePaths(path.dirname(target));require.cache[target]=m;m._compile(fs.readFileSync(copy,'utf8'),target);m.loaded=true;`);
 for(const file of new Set(mutations.map(m=>m.file))){const copy=path.join(scratch,path.basename(file));fs.copyFileSync(path.join(ROOT,file),copy);const env={SCORE_ADAPTER_TARGET:path.join(ROOT,file),SCORE_ADAPTER_COPY:copy,NODE_OPTIONS:((process.env.NODE_OPTIONS||'')+' --require '+JSON.stringify(preload)).trim()};const r=suite(env);report.controls.push({file,status:r.status,passed:r.passed});if(r.status!==0)throw Error('unchanged preload control failed: '+file);}
 for(const [i,m]of mutations.entries()){
  const original=fs.readFileSync(path.join(ROOT,m.file),'utf8').replaceAll('\r\n','\n');const row={name:m.name,file:m.file,caught:false};
  if(original.split(m.find).length!==2){row.error='anchor must occur exactly once';}
  else{const copy=path.join(scratch,i+'.cjs');fs.writeFileSync(copy,original.replace(m.find,m.put));const syntax=run(['--check',copy]);if(syntax.status!==0)row.error='invalid mutation syntax';else{const env={SCORE_ADAPTER_TARGET:path.join(ROOT,m.file),SCORE_ADAPTER_COPY:copy,NODE_OPTIONS:((process.env.NODE_OPTIONS||'')+' --require '+JSON.stringify(preload)).trim()};const load=run(['-e',`require(${JSON.stringify(path.join(ROOT,m.file))})`],env);if(load.status!==0)row.error='mutation cannot load';else{const r=suite(env);row.caught=r.status!==0&&!r.signal&&!r.error&&r.failed>0&&r.failedTests.some(t=>!t.endsWith('.test.cjs'));row.failed=r.failed;row.failedTests=r.failedTests;if(!row.caught){row.stdout=r.stdout;row.stderr=r.stderr;row.error=r.error;}}}}
  report.mutations.push(row);save();console.log((row.caught?'CAUGHT ':'MISSED ')+m.name+(row.error?' '+row.error:''));
 }
 report.ok=report.mutations.every(m=>m.caught);report.total=mutations.length;report.caught=report.mutations.filter(m=>m.caught).length;save();console.log(JSON.stringify({ok:report.ok,total:report.total,caught:report.caught,report:reportFile}));process.exitCode=report.ok?0:1;
}catch(e){report.error=e.stack;save();console.error(e.stack);process.exitCode=1;}finally{if(path.dirname(scratch)!==os.tmpdir()||!path.basename(scratch).startsWith('score-adapter-mutations-'))throw Error('unsafe scratch path');fs.rmSync(scratch,{recursive:true,force:true});}
