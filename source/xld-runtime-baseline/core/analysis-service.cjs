'use strict';

const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { spawn } = require('child_process');
const midiModule = require('./derived-assets.cjs');
const {setInterval, clearInterval} = require('node:timers');

const resultEngines = require('./result-engines.cjs');
const {bridgeSegments} = require('./sections.cjs');
const {AI_ENGINE_IDS, HARMONY_ENGINE_IDS, RESULT_ENGINE_IDS} = resultEngines;
const STEM_ENGINE_ID = 'demucs-6s';
const STEM_ENGINE_IDS = midiModule.SEPARATION_ENGINE_IDS;
// The listening score's own analyses, in analysis-score/: `score-layers` (beat grid, loudness, stem levels) and
// `score-vocals` (the lead vocal's notes and pitch contour). They are started and stored like result engines
// (`<id>.json` beside the others) but are not section or chord results, so they are deliberately not in
// RESULT_ENGINE_IDS: music-lab.json, the result lists and deletion never see them.
// `python` names the environment variable that holds the interpreter: the beat model lives in the MuScriptor
// add-on, the lead-vocal split runs where the RoFormer separation runs.
const SCORE_ENGINES = Object.freeze({
  'score-layers': {runner: 'runner.py', python: 'XLD_MUSCRIPTOR_PYTHON'},
  'score-vocals': {runner: 'vocals_runner.py', python: 'XLD_ROFORMER_PYTHON'}
});
const SCORE_ENGINE_IDS = Object.keys(SCORE_ENGINES);

function safeName(value, fallback = 'Unknown') {
  const cleaned = String(value || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/[. ]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned || fallback).slice(0, 96);
}

function firstExisting(candidates) {
  return candidates.find(candidate => candidate && fsSync.existsSync(candidate)) || null;
}

async function readJson(filePath, fallback = null) {
  try { return JSON.parse(await fs.readFile(filePath, 'utf8')); } catch (_) { return fallback; }
}

// One atomic JSON write for the whole service (audit 1.5): derived-assets' writeAtomic moves the old file aside
// first and puts it back if the swap fails, where this used to delete the target before a second rename could fail.
const writeJsonAtomic = (filePath, value) => midiModule.writeAtomic(filePath, value);

function parseEngineList(text) {
  try { return JSON.parse(text); } catch (_) {}
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch (_) {}
  }
  return [];
}

// The child's environment with TORCH_HOME set when there is one to set (an unset key must not become "undefined").
function torchEnv(torchHome) {
  const env = {...process.env};
  if (torchHome) env.TORCH_HOME = torchHome;
  return env;
}

function createService(options = {}) {
  // The runtime root (SongFormer, BTC weights) comes from the caller or XLD_RUNTIME_ROOT; there is no built-in default
  // (audit fix 2 / item 7: a missing configuration is reported as runtime-missing, never replaced by an old install).
  const configuredRoot = options.xldRoot || process.env.XLD_RUNTIME_ROOT || null;
  const xldRoot = configuredRoot ? path.resolve(configuredRoot) : null;
  let analysisRoot = path.resolve(options.analysisRoot || "D:\\Caches\\Xin's Local Deck\\Analysis");
  let activeTask = null;

  const runnerFor = engine => {
    if (SCORE_ENGINES[engine]) return path.join(__dirname, '..', 'analysis-score', SCORE_ENGINES[engine].runner);
    if (midiModule.ENGINE_IDS.includes(engine)) return path.join(__dirname, '..', 'analysis-midi', 'runner.py');
    if (STEM_ENGINE_IDS.includes(engine)) return path.join(__dirname, '..', 'analysis-separation', 'runner.py');
    if (AI_ENGINE_IDS.includes(engine)) return xldRoot ? path.join(xldRoot, 'analysis-ai', 'songformer_runner.py') : null;
    // Harmony runner moved into source (chords.1); BTC weights stay under xldRoot/analysis-harmony/btc/weights.
    if (HARMONY_ENGINE_IDS.includes(engine)) return path.join(__dirname, '..', 'analysis-harmony', 'harmony_runner.py');
    return null;
  };

  // Only the configured interpreter, and only if it is there: no fallback to an older environment.
  const configuredPython = key => firstExisting([process.env[key]]);
  const pythonFor = engine => {
    if (SCORE_ENGINES[engine]) return firstExisting([process.env[SCORE_ENGINES[engine].python]]);
    if(midiModule.profileFor(engine)?.backend === 'muscriptor') return firstExisting([process.env.XLD_MUSCRIPTOR_PYTHON]);
    if(engine === 'yourmt3-plus') return firstExisting([process.env.XLD_YOURMT3_PYTHON]);
    if(engine === 'bs-roformer-sw') return configuredPython('XLD_ROFORMER_PYTHON');
    if (midiModule.ENGINE_IDS.includes(engine)) return configuredPython(midiModule.profileFor(engine).backend !== 'basic-pitch' ? 'XLD_HIGHRES_PYTHON' : 'XLD_MIDI_PYTHON');
    // XLD_PYTHON (the old structure-analysis environment) has no engine any more and is not a fallback for anything.
    const ai = configuredPython('XLD_AI_PYTHON');
    if (STEM_ENGINE_IDS.includes(engine) || AI_ENGINE_IDS.includes(engine)) return ai;
    if (engine === 'chord-consonance') return firstExisting([process.env.XLD_CHORDS_PYTHON]);
    if (HARMONY_ENGINE_IDS.includes(engine)) return configuredPython('XLD_HARMONY_PYTHON') || ai;
    return null;
  };

  const analysisDirectory = track => track.bridgePath ? path.dirname(track.bridgePath) : midiModule.trackDirectory(track, analysisRoot);

  const writeTrackMetadata = (track, directory) => writeJsonAtomic(path.join(directory, 'track.json'), {
    schemaVersion: 1,
    trackId: track.id,
    number: track.number,
    title: track.title,
    artist: track.artist,
    album: track.album,
    source: track.filePath
  });

  const taskSnapshot = task => task ? {
    taskId: task.taskId,
    trackId: task.track.id,
    trackTitle: task.track.title,
    album: task.track.album,
    engine: task.engine,
    engineName: task.engineName,
    status: task.status,
    progress: task.progress,
    phase: task.phase,
    message: task.message,
    startedAt: task.startedAt,
    elapsedSeconds: Math.max(0, (Date.now() - task.startedAtMs) / 1000),
    durationSeconds: task.durationSeconds || null,
    estimatedSeconds: task.estimatedSeconds || null,
    remainingSeconds: task.estimatedSeconds ? Math.max(0, task.estimatedSeconds - (Date.now() - task.startedAtMs) / 1000) : null,
    cacheHit: Boolean(task.cacheHit),
    estimatedProgress: Boolean(task.estimatedSeconds && task.status === 'running' && task.progress < .93),
    cancellable: !task.committing && ['starting', 'running', 'cancelling'].includes(task.status)
  } : null;

  const emitTask = (task, onTask) => {
    try { onTask?.(taskSnapshot(task)); } catch (_) {}
  };

  const probe = (python, runner) => new Promise(resolve => {
    if (!python || !runner || !fsSync.existsSync(runner)) return resolve([]);
    const child = spawn(python, [runner, '--engines'], {
      windowsHide: true,
      env: torchEnv(process.env.TORCH_HOME || (xldRoot && path.join(xldRoot, 'analysis-ai', 'torch-home')))
    });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.on('error', () => resolve([]));
    child.on('close', () => resolve(parseEngineList(stdout)));
  });

  async function midiEngines() {
    const statuses = (await Promise.all(['basic-pitch','piano-highres','yourmt3-plus','muscriptor-medium'].map(engine => probe(pythonFor(engine), runnerFor(engine))))).flat();
    return midiModule.PROFILES.map(({id,name,stems,defaultFor,retiredFor=[]}) => ({id,name,stems:stems.filter(stem=>!retiredFor.includes(stem)),defaultFor,available:statuses.some(item=>item.id===id && item.available)})).filter(profile=>profile.stems.length);
  }

  async function separationEngines() {
    const statuses = await Promise.all(STEM_ENGINE_IDS.map(async engine => {
      const values = await probe(pythonFor(engine), runnerFor(engine));
      return values.find(item=>item.id===engine);
    }));
    return midiModule.SEPARATION_PROFILES.map(({id,name,default:preferred}, index)=>({id,name,default:preferred,available:Boolean(statuses[index]?.available)}));
  }

  async function detectEngines() {
    const [ai, harmony] = await Promise.all([
      probe(pythonFor('songformer'), runnerFor('songformer')),
      probe(pythonFor('chord-chordmini'), runnerFor('chord-chordmini'))
    ]);
    // Only registered engines: an older runner that still lists a removed engine does not bring it back.
    return [...ai, ...harmony].filter(engine => RESULT_ENGINE_IDS.includes(engine?.id));
  }

  async function buildManifest(track, directory) {
    const results = [];
    for (const engine of RESULT_ENGINE_IDS) {
      const result = await readJson(path.join(directory, `${engine}.json`), null);
      if (result?.engine && Array.isArray(result.segments)) results.push(result);
    }
    const annotations = await readJson(path.join(directory, 'manual-tags.json'), { tags: [] });
    const tags = Array.isArray(annotations?.tags) ? annotations.tags : [];
    const duration = Math.max(
      0,
      ...results.map(result => Number(result.duration) || Math.max(0, ...(result.segments || []).map(segment => Number(segment.end) || 0))),
      ...tags.map(tag => Number(tag.end) || 0)
    );
    const normalize = result => ({
      engine: result.engine,
      duration: Number(result.duration) || duration,
      analyzedRanges: Array.isArray(result.analyzedRanges) ? result.analyzedRanges : null,
      metrics: result.metrics || null,
      // start / end / label / confidence as always; section engines' segments also carry the tidied `name`.
      segments: bridgeSegments(result, Number(result.duration) || duration)
    });
    const manifest = {
      schemaVersion: 2,
      contract: 'xld.music-lab/2',
      producer: { name: "Xin's Local Deck · Analysis Core", version: '1' },
      generatedAt: new Date().toISOString(),
      timing: { unit: 'seconds', origin: 0, duration },
      track: {
        id: track.id,
        number: track.number,
        title: track.title,
        artist: track.artist,
        album: track.album,
        source: track.filePath
      },
      analyses: results.filter(result => !HARMONY_ENGINE_IDS.includes(result.engine?.id)).map(normalize),
      harmony: results.filter(result => HARMONY_ENGINE_IDS.includes(result.engine?.id)).map(normalize),
      manualTags: tags.filter(tag => tag.kind !== 'chord').map(tag => ({ ...tag }))
    };
    await writeJsonAtomic(path.join(directory, 'music-lab.json'), manifest);
    return manifest;
  }

  async function promoteResult(stagingPath, targetPath, validate = null) {
    const result = await readJson(stagingPath, null);
    if (validate) await validate(result);
    else if (!result?.engine || !Array.isArray(result.segments)) throw new Error('analysis-output-invalid');
    const backup = `${targetPath}.${crypto.randomUUID()}.previous`;
    let previous = false;
    try { await fs.rename(targetPath, backup); previous = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    try {
      await fs.rename(stagingPath, targetPath);
      if (previous) await fs.rm(backup, { force: true });
    } catch (error) {
      if (previous) { try { await fs.rename(backup, targetPath); } catch (_) {} }
      throw error;
    }
    return result;
  }


  const derivedAssets = midiModule.createDerivedAssets({analysisRoot: () => analysisRoot});
  const {readStems, validateStems} = derivedAssets;
  const scoreVocals = require('./score-vocals.cjs');

  async function removeStemRun(directory, runId) {
    if (!/^[a-f0-9-]{36}$/.test(runId || '')) return;
    const parent = path.resolve(directory, 'stems');
    const target = path.resolve(parent, runId);
    if (path.dirname(target) !== parent) throw new Error('invalid-stem-directory');
    await fs.rm(target, { recursive: true, force: true }).catch(() => {});
  }

  const midiAssets = derivedAssets.midi;
  const midiMerge = require('./midi-merge.cjs').createMidiMerge({analysisRoot: () => analysisRoot});
  const refinement = require('./refinement.cjs').createRefinement({assets:derivedAssets,python:engine=>pythonFor(require('./refinement.cjs').profileFor(engine)?.backend==='roformer'?'bs-roformer-sw':'piano-highres')});
  // Without a trash callback (headless, XML, tests) retention reports surplus runs instead of deleting them.
  const midiRetention = require('./midi-retention.cjs').createMidiRetention({assets: derivedAssets, getRoot: () => analysisRoot, trash: options.trash});

  async function runRefinement(track, engine, runOptions, onTask) {
    const task={taskId:crypto.randomUUID(),track,engine,engineName:require('./refinement.cjs').profileFor(engine).name,status:'starting',progress:0,phase:'refine',message:'准备 '+(runOptions.sourceStem||'other')+(runOptions.scope==='full'?' 整曲':' 片段'),startedAt:new Date().toISOString(),startedAtMs:Date.now(),child:null,cancelled:false,onTask};
    activeTask=task;emitTask(task,onTask);
    try {
      const result=await refinement.generate(track,{...runOptions,engine},{runId:task.taskId,onChild:child=>{task.child=child;if(task.cancelled)child.kill();},cancelled:()=>task.cancelled,
        beforeCommit:()=>{if(task.cancelled)throw Error('analysis-cancelled');task.committing=true;},
        onProgress:value=>{task.status='running';if(Number.isFinite(value.progress))task.progress=Math.min(.99,Math.max(task.progress,value.progress));task.message=value.message||task.message;task.phase=value.phase||task.phase;emitTask(task,onTask);}});
      task.status='complete';task.progress=1;task.message=result.scope==='full'?(result.cached?'已读取整曲细分':'整曲细分已生成'):(result.cached?'已读取细分预览':'细分预览已生成');
      return {ok:true,kind:'refinement',result,task:taskSnapshot(task)};
    }catch(error){task.status=task.cancelled?'cancelled':'failed';task.message=task.cancelled?'分析已取消':error.message;return {ok:false,error:task.cancelled?'analysis-cancelled':'analysis-failed',detail:task.message,task:taskSnapshot(task)};}
    finally{if(activeTask===task)activeTask=null;emitTask(task,onTask);}
  }

  async function runMerge(track, onTask) {
    const task = {taskId:crypto.randomUUID(),track,engine:'midi-merge',engineName:'MIDI 融合',
      status:'starting',progress:0,phase:'merge',message:'正在读取 MIDI',startedAt:new Date().toISOString(),startedAtMs:Date.now(),child:null,cancelled:false,onTask};
    activeTask = task;
    emitTask(task,onTask);
    try {
      const result = await midiMerge.generate(track,{
        onChild: child => {task.child=child;}, cancelled: () => task.cancelled,
        progress: (value,message) => {task.status='running';task.progress=value;task.message=message;if(value>=.9)task.committing=true;emitTask(task,onTask);}
      });
      if(task.cancelled)throw Error('analysis-cancelled');
      task.status='complete';task.progress=1;task.message='MIDI 融合完成';
      return {ok:true,kind:'midi-merge',result,cached:result.cached,task:taskSnapshot(task)};
    } catch(error) {
      task.status=task.cancelled?'cancelled':'failed';task.message=task.cancelled?'分析已取消':error.message;
      return {ok:false,error:task.cancelled?'analysis-cancelled':'analysis-failed',detail:task.message,task:taskSnapshot(task)};
    } finally {if(activeTask===task)activeTask=null;emitTask(task,onTask);}
  }

  // The vocal line a `vocals-rmvpe` run converts: score-vocals.json, current for the vocal stem by the one judgement
  // in core/score-vocals.cjs, together with the SHA-256 of the exact bytes judged (the runner refuses anything else).
  async function currentVocalLine(track) {
    const directory = analysisDirectory(track), file = path.join(directory, scoreVocals.ENGINE + '.json');
    const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
    const before = await fs.readFile(file).catch(() => null);
    const state = await scoreVocals.read(derivedAssets, track, directory);
    if (state.state === 'no-stem') throw new Error('midi-needs-stems');
    if (state.state !== 'current') throw new Error('vocals-line-not-current');
    const after = await fs.readFile(file);
    if (!before || digest(before) !== digest(after)) throw new Error('vocals-line-not-current');
    return {file, sha256: digest(after), sung: Boolean(state.result.lane), why: state.result.why || null};
  }

  // Every task takes the analysis root's cross-program lock first (core/analysis-lock.cjs) and gives it back however
  // it ends: XLD and XML each run one task at a time, and this makes it one task at a time between them too.
  const analysisLock = require('./analysis-lock.cjs').createAnalysisLock({program: options.program || 'XLD'});
  // A run is reserved synchronously (two IPC calls at once must not both start, and a cancel right after the call must
  // find it) while the lock is being taken; `starting` is that reservation.
  let starting = null;
  async function run(track, engine, runOptions = {}, onTask) {
    if (activeTask) return { ok: false, error: 'analysis-busy', task: taskSnapshot(activeTask) };
    if (starting) return { ok: false, error: 'analysis-busy' };
    const reservation = starting = {cancelled: false};
    let lock;
    try { lock = await analysisLock.acquire(analysisRoot, {task: engine, song: track?.title || track?.id || ''}); }
    finally { if (starting === reservation) starting = null; }
    if (reservation.cancelled) { if (lock?.ok) await lock.release().catch(() => {}); return { ok: false, error: 'analysis-cancelled' }; }
    if (!lock.ok) {
      // Held by this very process: a task here is starting or running - the in-process answer, as before the lock.
      if (lock.holder?.pid === process.pid) return { ok: false, error: 'analysis-busy', ...(activeTask ? {task: taskSnapshot(activeTask)} : {}) };
      return { ok: false, error: 'analysis-locked', holder: lock.holder, detail: require('./analysis-lock.cjs').holderMessage(lock.holder) };
    }
    try { return await runUnlocked(track, engine, runOptions, onTask); }
    finally { await lock.release().catch(() => {}); }
  }

  async function runUnlocked(track, engine, runOptions = {}, onTask) {
    if (activeTask) return { ok: false, error: 'analysis-busy', task: taskSnapshot(activeTask) };
    if (!track?.id || !track?.filePath || !fsSync.existsSync(track.filePath)) return { ok: false, error: 'track-missing' };
    if (engine === 'midi-merge') return runMerge(track,onTask);
    if (require('./refinement.cjs').profileFor(engine)) return runRefinement(track,engine,runOptions,onTask);
    // There is no model behind a hand-edited revision, so it is never something to start. It is kept out of
    // ENGINE_IDS precisely so it cannot be, and this says so in words rather than letting it fall through to
    // 'engine-unavailable', which reads like a missing runtime.
    if (engine === midiModule.MANUAL_ENGINE) return { ok: false, error: 'midi-manual-not-runnable' };
    const isStems = STEM_ENGINE_IDS.includes(engine);
    const isMidi = midiModule.ENGINE_IDS.includes(engine);
    const midiStem = runOptions.stem;
    // `vocals-rmvpe`: the vocals part made from the track's score-vocals result rather than by a model of its own.
    const fromVocalLine = isMidi && midiModule.profileFor(engine)?.backend === 'score-vocals';
    if (isMidi && !midiModule.STEMS.includes(midiStem)) return { ok: false, error: 'midi-stem-unsupported' };
    if (isMidi && (!midiModule.profileFor(engine).stems.includes(midiStem) || midiModule.profileFor(engine).retiredFor?.includes(midiStem))) return {ok:false,error:'midi-engine-unsupported'};
    if (!isStems && !isMidi && !RESULT_ENGINE_IDS.includes(engine) && !SCORE_ENGINE_IDS.includes(engine)) return { ok: false, error: 'engine-unavailable' };
    // Retired engines stop being startable. Everything else about them is unchanged: their stored results stay
    // readable, stay in music-lab.json and stay deletable, which is the difference between a flag and a removal.
    if (!isStems && !isMidi && resultEngines.isRetiredResultEngine(engine)) return { ok: false, error: 'engine-retired' };
    const python = pythonFor(engine);
    const runner = runnerFor(engine);
    if (!isMidi && !isStems && (!python || !fsSync.existsSync(runner))) return { ok: false, error: 'runtime-missing' };
    const task = {
      taskId: crypto.randomUUID(), track, engine, engineName: runOptions.engineName || (isStems ? '分轨' : isMidi ? `${midiStem} MIDI` : engine),
      status: 'starting', progress: 0, phase: 'starting', message: '正在启动分析器',
      startedAt: new Date().toISOString(), startedAtMs: Date.now(), child: null, cancelled: false, onTask
    };
    // Reserve before any filesystem await: two simultaneous IPC calls must not both start.
    activeTask = task;
    emitTask(task, onTask);
    const directory = isStems || isMidi ? derivedAssets.directory(track) : analysisDirectory(track);
    const logPath = path.join(analysisRoot, 'logs', 'analysis.jsonl');
    const output = isMidi ? midiAssets.runRecordPath(track, midiStem, task.taskId) : isStems ? derivedAssets.stemsManifestPath(track, engine) : path.join(directory, engine + '.json');
    const staging = path.join(directory, engine + '.next.' + task.taskId + '.json');
    let committed = false, midiFinish = null;
    const log = async (event, extra = {}) => {
      try {
        await fs.mkdir(path.dirname(logPath), { recursive: true });
        await fs.appendFile(logPath, JSON.stringify({ at: new Date().toISOString(), event, taskId: task.taskId,
          trackId: track.id, source: track.filePath, engine, options: runOptions, status: task.status,
          elapsedSeconds: (Date.now() - task.startedAtMs) / 1000, ...extra }) + '\n', 'utf8');
      } catch (error) { task.logWarning = error.message; }
    };
    let vocalLine = null;
    try {
      await log('start');
      // The vocals part is the stored vocal line written as MIDI. Refused unless that line is current for the vocal
      // stem (making it is the `score-vocals` run's job, started first by the 转谱 panel); a song with no singing
      // gets no run at all, and that is an answer, not a failure.
      if (fromVocalLine) {
        vocalLine = await currentVocalLine(track);
        if (!vocalLine.sung) {
          task.status = 'complete'; task.progress = 1; task.phase = 'complete'; task.message = '这首歌没有人声';
          return { ok: true, kind: 'midi', noSinging: true, why: vocalLine.why, result: null, task: taskSnapshot(task) };
        }
      }
      if ((isStems || isMidi) && !runOptions.force) {
        const cached = isMidi ? await midiAssets.read(track, midiStem, engine) : await readStems(track, engine);
        // A readable result from an earlier model version is not a cache hit for the current version, and a vocals
        // part converted from an earlier vocal line is not one for the line the track has now.
        if (cached.ok && !task.cancelled && (!isMidi || cached.matches) && (!fromVocalLine || cached.backend?.scoreVocals?.sha256 === vocalLine.sha256)) {
          task.committing = true;
          // A cache hit produces nothing new, so activating it is pure side effect — and if the version currently
          // in use is a hand-edited revision, that side effect silently replaces the user's own work with a model
          // run they did not ask to switch to. Report the hit honestly and leave the pointer where it is; changing
          // versions is what the version panel is for.
          //
          // Deliberately narrow (STOP-AND-ASK 3): this covers only "the active version is a revision". A genuine
          // model run that produces a new result still takes the pointer, because that is what generating means.
          const active = isMidi ? await midiAssets.read(track, midiStem) : null;
          const keepsRevision = Boolean(active?.ok && active.engine === midiModule.MANUAL_ENGINE && active.runId !== cached.runId);
          if (isMidi && !keepsRevision) await midiAssets.activate(track, cached);
          else if (!isMidi) await derivedAssets.activateStems(track, cached);
          task.status = 'complete'; task.progress = 1; task.phase = 'complete'; task.message = isMidi ? '已读取 MIDI' : '已读取分轨';
          return { ok: true, kind: isMidi ? 'midi' : 'stems', cached: true, result: cached, task: taskSnapshot(task),
            ...(isMidi ? {activated: !keepsRevision, keptActive: keepsRevision ? active.runId : null} : {}) };
        }
      }
      // A score result made from the stems the track has now is answered from disk: the album button can be
      // pressed again and only the gaps are filled. `force` runs it anyway.
      // score-vocals is held to the vocal stem's path, size and modification time and to its stored lead / backing
      // (core/score-vocals.cjs), the same question the one-click transcription and the timeline ask.
      if (engine === 'score-vocals' && !runOptions.force) {
        const state = await scoreVocals.read(derivedAssets, track, directory);
        if (state.state === 'current' && !task.cancelled) {
          task.status = 'complete'; task.progress = 1; task.phase = 'complete'; task.message = '已读取人声曲线';
          return { ok: true, kind: 'score', cached: true, result: state.result, task: taskSnapshot(task) };
        }
      } else if (SCORE_ENGINE_IDS.includes(engine) && !runOptions.force) {
        const kept = await readJson(output, null);
        const stems = await readStems(track).catch(() => null);
        // Also made by the current model (core/score-identity.cjs; a result without a recorded identity stays valid).
        if (kept?.kind === engine && (kept.source?.stemRunId ?? null) === (stems?.ok ? stems.runId : null) && require('./score-identity.cjs').isCurrent(kept, engine) && !task.cancelled) {
          task.status = 'complete'; task.progress = 1; task.phase = 'complete'; task.message = '已读取谱面层';
          return { ok: true, kind: 'score', cached: true, result: kept, task: taskSnapshot(task) };
        }
      }
      if (!python || !fsSync.existsSync(runner)) throw new Error('runtime-missing');
      // Every runner gets the same scratch working directory. None of the remaining engines keeps a feature cache
      // in the track folder (the per-track `features/` and `features-harmony/` caches belonged to removed engines).
      const workDirectory = path.join(analysisRoot, '.tmp');
      await fs.mkdir(workDirectory, { recursive: true });
      await fs.mkdir(directory, { recursive: true });
      await writeTrackMetadata(track, directory);
      const midiSource = isMidi ? await midiAssets.source(track, midiStem) : null;
      if (isMidi || isStems) await fs.mkdir(path.dirname(output), { recursive: true });
      const args = [runner, '--engine', engine, '--input', midiSource?.path || track.filePath, '--output', staging];
      if (isMidi) args.push('--track-id', track.id, '--stem', midiStem, '--source-run-id', midiSource.runId, '--run-id', task.taskId);
      if(isMidi && midiStem==='strings')args.push('--string-target',midiSource.target);
      if(isMidi && midiModule.profileFor(engine)?.options?.tempoAnalysis)args.push('--beat-source',track.filePath);
      if (fromVocalLine) args.push('--score-vocals', vocalLine.file, '--score-vocals-sha256', vocalLine.sha256);
      if (isStems) args.push('--track-id', track.id, '--run-id', task.taskId);
      if (engine === 'songformer') {
        if (runOptions.auto !== false) args.push('--auto');
        else if (Array.isArray(runOptions.range) && runOptions.range.length === 2) {
          args.push('--range', Number(runOptions.range[0]) + ':' + Number(runOptions.range[1]));
          try { await fs.copyFile(output, staging); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
      }
      if (HARMONY_ENGINE_IDS.includes(engine) && ['hpss', 'demucs'].includes(runOptions.separation)) args.push('--separation', runOptions.separation);
      if (task.cancelled) throw new Error('analysis-cancelled');
      let stdout = '', stderr = '';
      const consume = line => {
        try {
          const payload = JSON.parse(line);
          if (Number.isFinite(payload.progress)) task.progress = Math.max(task.progress, Math.max(0, Math.min(1, payload.progress)));
          if (payload.phase) task.phase = payload.phase;
          if (Number.isFinite(payload.durationSeconds) && payload.durationSeconds > 0) task.durationSeconds = payload.durationSeconds;
          if (typeof payload.cacheHit === 'boolean') task.cacheHit = payload.cacheHit;
          if (task.durationSeconds && !task.estimatedSeconds && !isStems && !isMidi) {
            const rates = {songformer:7};
            const featureRate = task.cacheHit ? 0 : HARMONY_ENGINE_IDS.includes(engine) ? 2.2 : 8;
            task.estimatedSeconds = Math.max(6, task.durationSeconds / 60 * ((rates[engine] || 5) + featureRate));
          }
          if (payload.message) task.message = payload.message;
          emitTask(task, onTask);
        } catch (_) {}
      };
      const code = await new Promise((resolve, reject) => {
        const child = spawn(python, args, { windowsHide: true, cwd: workDirectory,
          env: {...torchEnv(isStems
            ? (process.env.XLD_SEPARATION_TORCH_HOME || process.env.TORCH_HOME)
            : (process.env.TORCH_HOME || (xldRoot && path.join(xldRoot, 'analysis-ai', 'torch-home')))), PYTHONIOENCODING: 'utf-8'} });
        task.child = child;
        task.status = 'running'; task.phase = 'decode'; task.message = '正在读取音频';
        emitTask(task, onTask);
        task.estimateTimer = setInterval(() => {
          if (task.status !== 'running' || !task.estimatedSeconds) return;
          task.progress = Math.max(task.progress, Math.min(.90, .06 + .84 * (Date.now() - task.startedAtMs) / 1000 / task.estimatedSeconds));
          emitTask(task, onTask);
        }, 1000);
        child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
        child.stdout.on('data', chunk => { stdout += chunk; const lines = stdout.split(/\r?\n/); stdout = lines.pop() || ''; lines.forEach(consume); });
        child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-12000); });
        child.once('error', reject);
        child.once('close', resolve);
      });
      consume(stdout);
      if (task.cancelled) throw new Error('analysis-cancelled');
      if (code !== 0) throw new Error(stderr.trim().slice(-4000) || '分析进程退出码 ' + code);
      task.committing = true;
      task.phase = 'save'; task.message = '正在保存结果'; emitTask(task, onTask);
      const previous = isMidi ? await midiAssets.read(track, midiStem, engine) : isStems ? await readStems(track, engine) : null;
      const result = await promoteResult(staging, output, isStems ? value => validateStems(value, track, engine) : isMidi ? async value => {
        if (value?.runId !== task.taskId) throw new Error('midi-invalid');
        if (fromVocalLine && value?.backend?.scoreVocals?.sha256 !== vocalLine.sha256) throw new Error('vocals-line-not-current');
        return midiAssets.validate(value, track, midiStem, engine);
      } : engine === 'score-vocals' ? value => scoreVocals.validate(derivedAssets, track, directory, value) : null);
      committed = true;
      let response;
      if (isMidi) {
        await midiAssets.activate(track, result);
        response = { ok: true, kind: 'midi', result: await midiAssets.read(track, midiStem, engine) };
        // Same model version: replace the earlier run. A different version stays on disk as readable history.
        // A pinned run is exempt: this is a hard fs.rm, not a Recycle Bin move, and 保留 promises the opposite.
        // If the markers cannot be read, keep the run — never delete what we could not verify is unpinned.
        let keptPrevious = false;
        if (previous?.ok && previous.runId !== task.taskId && previous.identity === response.result.identity) {
          try { keptPrevious = (await midiAssets.listKept(track, midiStem)).has(previous.runId); } catch (_) { keptPrevious = true; }
          if (!keptPrevious) await midiAssets.removeRun(directory, midiStem, previous.runId);
        }
        // Bounded version history. Contained on purpose: a sweep that fails must not turn a successful run into a
        // failed task, so its only trace is response.retention.warning.
        let retention;
        try {
          retention = await midiRetention.sweep(track, midiStem, engine, {activeIdentity: response.result.identity,
            protect: [task.taskId, previous?.ok ? previous.runId : null].filter(Boolean)});
        } catch (error) { retention = {removed: [], trashed: [], skipped: [], warning: error.message}; }
        if (keptPrevious) retention.skipped.push({runId: previous.runId, reason: 'kept'});
        response.retention = retention;
        // The activated record, not the current profile: after a rollback or a pin those are different versions.
        midiFinish = {model: response.result.model ?? null, identity: response.result.identity ?? null, runId: response.result.runId ?? null,
          retained: {removed: retention.removed.length, trashed: retention.trashed.length, skipped: retention.skipped.length}};
      } else if (isStems) {
        await derivedAssets.activateStems(track, result);
        response = { ok: true, kind: 'stems', result: await readStems(track) };
        // The batch this one replaces (audit fix 1, item 5): to the Recycle Bin together with the MIDI versions that
        // only it fed, unless a hand-edited, pinned or active version or a refinement result still uses it - then it
        // stays and the answer says why. Without a bin (XML, tests) it is removed as before, under the same rule.
        if (previous?.ok && previous.runId !== task.taskId) {
          const batches = require('./stem-batches.cjs');
          const retired = await batches.createStemBatches({assets: derivedAssets}).retire(track, previous.runId, {current: task.taskId, recycled: Boolean(options.trash),
            dispose: options.trash ? folder => options.trash(folder) : folder => fs.rm(folder, {recursive: true, force: true})})
            .catch(error => ({ok: false, error: error.message}));
          response.previousStems = retired.ok ? {runId: previous.runId, recycled: Boolean(options.trash), midi: retired.midi}
            : {runId: previous.runId, kept: true, why: retired.error || batches.keptReason(retired)};
        }
      } else {
        let manifest = null, integrationWarning = null;
        try { manifest = options.buildManifest ? await options.buildManifest(track, directory) : await buildManifest(track, directory); }
        catch (error) { integrationWarning = error.message; }
        response = { ok: true, result, manifest, manifestPath: path.join(directory, 'music-lab.json'), integrationWarning };
      }
      task.status = 'complete'; task.phase = 'complete'; task.progress = 1;
      task.message = isMidi ? (result.noteCount ? 'MIDI 转谱完成' : '未识别到音符') : isStems ? '分轨完成' : '分析完成，时间线已热更新';
      return { ...response, task: taskSnapshot(task) };
    } catch (error) {
      task.status = task.cancelled ? 'cancelled' : 'failed';
      task.message = task.cancelled ? '分析已取消' : error.message;
      return { ok: false, error: task.cancelled ? 'analysis-cancelled' : 'analysis-failed', detail: task.message, task: taskSnapshot(task) };
    } finally {
      if (task.estimateTimer) clearInterval(task.estimateTimer);
      await fs.rm(staging, { force: true }).catch(() => {});
      if (isStems && !committed) await removeStemRun(directory, task.taskId);
      if (isMidi && !committed) await midiAssets.removeRun(directory, midiStem, task.taskId);
      await log('finish', { message: task.message, model: isStems ? midiModule.separationProfile(engine).model : isMidi ? midiModule.profileFor(engine).model : null, ...(midiFinish || {}) });
      if (activeTask === task) activeTask = null;
      emitTask(task, onTask);
    }
  }

  function cancel() {
    if (!activeTask && starting) { starting.cancelled = true; return { ok: true, task: null }; }
    if (!activeTask || activeTask.committing) return { ok: false, error: 'no-active-task' };
    activeTask.cancelled = true;
    activeTask.status = 'cancelling'; activeTask.message = '正在取消分析';
    try { activeTask.child?.kill(); } catch (_) {}
    emitTask(activeTask, activeTask.onTask);
    return { ok: true, task: taskSnapshot(activeTask) };
  }

  return Object.freeze({
    setAnalysisRoot(value) {
      if (typeof value === 'string' && path.isAbsolute(value)) analysisRoot = path.resolve(value);
      return analysisRoot;
    },
    getAnalysisRoot: () => analysisRoot,
    detectEngines,
    readStems,
    readMidi: midiAssets.read,
    listMidiRuns: midiAssets.listRuns,
    readMidiMerge: midiMerge.read,
    midiEngines,
    separationEngines,
    refinementEngines: refinement.available,
    readRefinement: refinement.read,
    // {state, due, result?, split?, source}: whether the vocal line is current for the track's vocal stem.
    readScoreVocals: track => scoreVocals.read(derivedAssets, track, analysisDirectory(track)),
    // {ok, sha256, sung} of the vocal line a vocals-rmvpe run would convert now, or {ok:false, error}.
    readVocalLine: track => currentVocalLine(track).then(({sha256, sung}) => ({ok: true, sha256, sung}), error => ({ok: false, error: error.message})),
    keepRefinement: refinement.keep,
    run,
    cancel,
    task: () => taskSnapshot(activeTask),
    constants: Object.freeze({ AI_ENGINE_IDS, HARMONY_ENGINE_IDS, RESULT_ENGINE_IDS, STEM_ENGINE_ID, STEM_ENGINE_IDS })
  });
}

module.exports = Object.freeze({ createService, safeName });
