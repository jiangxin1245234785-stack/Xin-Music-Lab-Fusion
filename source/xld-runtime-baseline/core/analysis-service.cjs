'use strict';

const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { spawn } = require('child_process');
const midiModule = require('./derived-assets.cjs');
const {setInterval, clearInterval} = require('node:timers');

const MSAF_ENGINE_IDS = ['msaf', 'msaf-sf', 'msaf-foote', 'msaf-cnmf'];
const AI_ENGINE_IDS = ['songformer'];
const HARMONY_ENGINE_IDS = ['chord-cqt', 'chord-cens', 'chord-hybrid', 'chord-btc', 'chord-chordmini', 'chord-consonance'];
const STEM_ENGINE_ID = 'demucs-6s';
const STEM_ENGINE_IDS = midiModule.SEPARATION_ENGINE_IDS;
const RESULT_ENGINE_IDS = [...MSAF_ENGINE_IDS, ...AI_ENGINE_IDS, ...HARMONY_ENGINE_IDS];

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

async function writeJsonAtomic(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(temporary, filePath).catch(async error => {
    if (error.code !== 'EEXIST' && error.code !== 'EPERM') throw error;
    await fs.rm(filePath, { force: true });
    await fs.rename(temporary, filePath);
  });
}

function parseEngineList(text) {
  try { return JSON.parse(text); } catch (_) {}
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch (_) {}
  }
  return [];
}

function createService(options = {}) {
  const xldRoot = path.resolve(options.xldRoot || process.env.XLD_RUNTIME_ROOT || 'D:\\Program Files\\xin-local-deck-beta');
  const stableXldRoot = path.resolve(options.stableXldRoot || process.env.XLD_STABLE_RUNTIME_ROOT || 'D:\\Program Files\\xin-local-deck');
  let analysisRoot = path.resolve(options.analysisRoot || "D:\\Caches\\Xin's Local Deck\\Analysis");
  let activeTask = null;

  const runnerFor = engine => {
    if (midiModule.ENGINE_IDS.includes(engine)) return path.join(__dirname, '..', 'analysis-midi', 'runner.py');
    if (STEM_ENGINE_IDS.includes(engine)) return path.join(__dirname, '..', 'analysis-separation', 'runner.py');
    if (AI_ENGINE_IDS.includes(engine)) return path.join(xldRoot, 'analysis-ai', 'songformer_runner.py');
    // Harmony runner moved into source (chords.1); BTC weights stay under xldRoot/analysis-harmony/btc/weights.
    if (HARMONY_ENGINE_IDS.includes(engine)) return path.join(__dirname, '..', 'analysis-harmony', 'harmony_runner.py');
    return path.join(xldRoot, 'analysis', 'runner.py');
  };

  // Explicit configuration is authoritative, including an uninstalled path.
  const configuredPython = (key, fallback = []) => firstExisting(process.env[key] ? [process.env[key]] : fallback);
  const pythonFor = engine => {
    if(midiModule.profileFor(engine)?.backend === 'muscriptor') return firstExisting([process.env.XLD_MUSCRIPTOR_PYTHON]);
    if(engine === 'yourmt3-plus') return firstExisting([process.env.XLD_YOURMT3_PYTHON]);
    if(engine === 'bs-roformer-sw') return configuredPython('XLD_ROFORMER_PYTHON', ['D:/Caches/codex/runtimes/xld-roformer/Scripts/python.exe']);
    if (midiModule.ENGINE_IDS.includes(engine)) return midiModule.profileFor(engine).backend !== 'basic-pitch'
      ? configuredPython('XLD_HIGHRES_PYTHON', ['D:\\Caches\\codex\\runtimes\\xld-midi-highres\\Scripts\\python.exe'])
      : configuredPython('XLD_MIDI_PYTHON', ['D:\\Caches\\codex\\runtimes\\xld-midi\\Scripts\\python.exe']);
    const msaf = configuredPython('XLD_PYTHON', [
      path.join(stableXldRoot, 'analysis', '.venv', 'Scripts', 'python.exe'),
      path.join(xldRoot, 'analysis', '.venv', 'Scripts', 'python.exe')
    ]);
    const ai = configuredPython('XLD_AI_PYTHON', [
      path.join(xldRoot, 'analysis-ai', '.venv', 'Scripts', 'python.exe')
    ]);
    if (STEM_ENGINE_IDS.includes(engine) || AI_ENGINE_IDS.includes(engine)) return ai;
    if (engine === 'chord-consonance') return firstExisting([process.env.XLD_CHORDS_PYTHON]);
    if (HARMONY_ENGINE_IDS.includes(engine)) return process.env.XLD_HARMONY_PYTHON || ai || msaf;
    return msaf;
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
    if (!python || !fsSync.existsSync(runner)) return resolve([]);
    const child = spawn(python, [runner, '--engines'], {
      windowsHide: true,
      env: { ...process.env, TORCH_HOME: process.env.TORCH_HOME || path.join(xldRoot, 'analysis-ai', 'torch-home') }
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
    const [msaf, ai, harmony] = await Promise.all([
      probe(pythonFor('msaf'), runnerFor('msaf')),
      probe(pythonFor('songformer'), runnerFor('songformer')),
      probe(pythonFor('chord-cqt'), runnerFor('chord-cqt'))
    ]);
    return [...msaf, ...ai, ...harmony];
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
      segments: result.segments.map(segment => ({
        start: Number(segment.start) || 0,
        end: Number(segment.end) || 0,
        label: String(segment.label ?? '?'),
        confidence: Number.isFinite(Number(segment.confidence)) ? Number(segment.confidence) : null
      }))
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
      manualTags: tags.map(tag => ({ ...tag }))
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

  async function run(track, engine, runOptions = {}, onTask) {
    if (activeTask) return { ok: false, error: 'analysis-busy', task: taskSnapshot(activeTask) };
    if (!track?.id || !track?.filePath || !fsSync.existsSync(track.filePath)) return { ok: false, error: 'track-missing' };
    if (engine === 'midi-merge') return runMerge(track,onTask);
    if (require('./refinement.cjs').profileFor(engine)) return runRefinement(track,engine,runOptions,onTask);
    const isStems = STEM_ENGINE_IDS.includes(engine);
    const isMidi = midiModule.ENGINE_IDS.includes(engine);
    const midiStem = runOptions.stem;
    if (isMidi && !midiModule.STEMS.includes(midiStem)) return { ok: false, error: 'midi-stem-unsupported' };
    if (isMidi && (!midiModule.profileFor(engine).stems.includes(midiStem) || midiModule.profileFor(engine).retiredFor?.includes(midiStem))) return {ok:false,error:'midi-engine-unsupported'};
    if (!isStems && !isMidi && !RESULT_ENGINE_IDS.includes(engine)) return { ok: false, error: 'engine-unavailable' };
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
    let committed = false;
    const log = async (event, extra = {}) => {
      try {
        await fs.mkdir(path.dirname(logPath), { recursive: true });
        await fs.appendFile(logPath, JSON.stringify({ at: new Date().toISOString(), event, taskId: task.taskId,
          trackId: track.id, source: track.filePath, engine, options: runOptions, status: task.status,
          elapsedSeconds: (Date.now() - task.startedAtMs) / 1000, ...extra }) + '\n', 'utf8');
      } catch (error) { task.logWarning = error.message; }
    };
    try {
      await log('start');
      if ((isStems || isMidi) && !runOptions.force) {
        const cached = isMidi ? await midiAssets.read(track, midiStem, engine) : await readStems(track, engine);
        // A readable result from an earlier model version is not a cache hit for the current version.
        if (cached.ok && !task.cancelled && (!isMidi || cached.matches)) {
          task.committing = true;
          if(isMidi) await midiAssets.activate(track, cached);
          else await derivedAssets.activateStems(track, cached);
          task.status = 'complete'; task.progress = 1; task.phase = 'complete'; task.message = isMidi ? '已读取 MIDI' : '已读取分轨';
          return { ok: true, kind: isMidi ? 'midi' : 'stems', cached: true, result: cached, task: taskSnapshot(task) };
        }
      }
      if (!python || !fsSync.existsSync(runner)) throw new Error('runtime-missing');
      const featureDirectory = engine.startsWith('msaf') ? path.join(directory, 'features')
        : HARMONY_ENGINE_IDS.includes(engine) ? path.join(directory, 'features-harmony') : path.join(analysisRoot, '.tmp');
      await fs.mkdir(featureDirectory, { recursive: true });
      await fs.mkdir(directory, { recursive: true });
      await writeTrackMetadata(track, directory);
      const midiSource = isMidi ? await midiAssets.source(track, midiStem) : null;
      if (isMidi || isStems) await fs.mkdir(path.dirname(output), { recursive: true });
      const args = [runner, '--engine', engine, '--input', midiSource?.path || track.filePath, '--output', staging];
      if (isMidi) args.push('--track-id', track.id, '--stem', midiStem, '--source-run-id', midiSource.runId, '--run-id', task.taskId);
      if(isMidi && midiStem==='strings')args.push('--string-target',midiSource.target);
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
            const rates = {msaf:6, 'msaf-sf':.7, 'msaf-foote':.7, 'msaf-cnmf':1.3, songformer:7, 'chord-cqt':2.2, 'chord-cens':.35, 'chord-hybrid':.45};
            const featureRate = task.cacheHit ? 0 : HARMONY_ENGINE_IDS.includes(engine) ? 2.2 : 8;
            task.estimatedSeconds = Math.max(6, task.durationSeconds / 60 * ((rates[engine] || 5) + featureRate));
          }
          if (payload.message) task.message = payload.message;
          emitTask(task, onTask);
        } catch (_) {}
      };
      const code = await new Promise((resolve, reject) => {
        const child = spawn(python, args, { windowsHide: true, cwd: featureDirectory,
          env: { ...process.env, PYTHONIOENCODING: 'utf-8', TORCH_HOME: isStems
            ? (process.env.XLD_SEPARATION_TORCH_HOME || 'D:\\Caches\\codex\\models\\xld')
            : (process.env.TORCH_HOME || path.join(xldRoot, 'analysis-ai', 'torch-home')) } });
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
        return midiAssets.validate(value, track, midiStem, engine);
      } : null);
      committed = true;
      let response;
      if (isMidi) {
        await midiAssets.activate(track, result);
        response = { ok: true, kind: 'midi', result: await midiAssets.read(track, midiStem, engine) };
        // Same model version: replace the earlier run. A different version stays on disk as readable history.
        if (previous?.ok && previous.runId !== task.taskId && previous.identity === response.result.identity) await midiAssets.removeRun(directory, midiStem, previous.runId);
      } else if (isStems) {
        await derivedAssets.activateStems(track, result);
        response = { ok: true, kind: 'stems', result: await readStems(track) };
        if (previous?.runId !== task.taskId) await removeStemRun(directory, previous?.runId);
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
      await log('finish', { message: task.message, model: isStems ? midiModule.separationProfile(engine).model : isMidi ? midiModule.profileFor(engine).model : null });
      if (activeTask === task) activeTask = null;
      emitTask(task, onTask);
    }
  }

  function cancel() {
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
    keepRefinement: refinement.keep,
    run,
    cancel,
    task: () => taskSnapshot(activeTask),
    constants: Object.freeze({ MSAF_ENGINE_IDS, AI_ENGINE_IDS, HARMONY_ENGINE_IDS, RESULT_ENGINE_IDS, STEM_ENGINE_ID, STEM_ENGINE_IDS })
  });
}

module.exports = Object.freeze({ createService, safeName });
