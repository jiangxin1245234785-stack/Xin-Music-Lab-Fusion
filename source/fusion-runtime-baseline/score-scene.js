// The "score" scene: the listening score (source/scoreview) mounted in this app.
//
// This file is the whole scene. It owns one canvas above the other visuals, asks the main
// process for the current track's score model, and lets the shared render core draw it
// against this app's own audio element. app.js only knows the scene's name; fusion.js only
// tells it which track is loaded. Nothing here touches the other scenes' state.
//
// Touching the score (plan B2): a lane = listen to that stem alone, through this app's own
// stem selector, again = back to the whole song; a section = jump to its start; a section
// double-clicked (or shift-clicked) = repeat it until it is touched again.
//
// Outside the scene (any other effect selected) it does nothing per frame.
(function (root) {
  'use strict';
  const EFFECT = 'score';
  const LATENCY_KEY = 'xin-score-latency-ms';
  // Chromium reports the media time ahead of the sound; 70 ms is what was settled by ear on
  // the development laptop (score view gate one). It belongs to the device, so it is kept
  // per device and can be changed with `setLatency`.
  const DEFAULT_LATENCY_MS = 70;

  // The effects setting as kept on this device. Before 2026-11-14 it was a level (off / light / strong);
  // a kept level is read as the set it stands for (light = clear, off = plain, strong = rich), so nobody's
  // choice is lost. Anything else is the default. tests/score-export-wiring.cjs holds this.
  const EFFECTS_KEY = 'xin-score-effects', PRESETS = Object.freeze(['clear', 'keys', 'ink', 'stage', 'strong', 'off']);
  // 'off' and 'strong' were levels and are preset names too, so only 'light' needs a word (and it names the default).
  const OLD_LEVELS = Object.freeze({light: 'clear'});
  // Whether the effects follow the song's rise and fall (the core's `fxDynamics`): on unless turned off here.
  const FOLLOW_KEY = 'xin-score-fx-dynamics';
  const storedFollow = kept => (kept === 'off' ? 'off' : 'song');
  // 按乐器画音符 (SPEC-B4): the user's pick from gate15, struck / plucked notes with a head and string notes as a
  // spindle (the core's shapes, the spindle set). On unless turned off on this device. Off, nothing about shapes
  // goes into the scene's options, so it draws as before; turning it off on a shown score hands the core the off
  // value. String links, pitch weight and the cover adaptations stay off (the core's defaults). The two option
  // names appear in this file only in the two literals below: source/scoreview/tests/host-guard.test.cjs holds that.
  const SHAPES_KEY = 'xin-score-shapes';
  const storedShapes = kept => kept !== 'off';
  const shapeOptions = on => (on ? {showShapes: true, shapeSet: 'spindle'} : {});
  function storedPreset(kept) {
    if (PRESETS.includes(kept)) return kept;
    return Object.prototype.hasOwnProperty.call(OLD_LEVELS, kept) ? OLD_LEVELS[kept] : 'clear';
  }

  // Which models a lane's notes come from, for the lane tooltip, in the order they first appear. `lanes`
  // is model.lanes, `under` what the core's hit() gave, `merged` whether "merge instrument parts" is on.
  // Merged: every distinct engine name among the model lanes of the group (one drawn lane holds parts that
  // may come from different models). Not merged: the lane's own model only (by its id; the group is used
  // only when the drawn lane has no model lane of its own id).
  function laneModels(lanes, under, merged = true) {
    if (!under || under.texture || !Array.isArray(lanes)) return [];
    const own = lanes.some(lane => lane.id === under.id);
    const names = [];
    for (const lane of lanes) {
      const belongs = merged || !own ? (lane.id === under.id || (under.group && lane.group === under.group)) : lane.id === under.id;
      if (!belongs) continue;
      const name = lane.meta && (lane.meta.engineName || lane.meta.engine);
      if (name && !names.includes(name)) names.push(name);
    }
    return names;
  }

  function create(config) {
    const {bridge, audio, stage, canvas} = config || {};
    const core = root.XinScoreView, clocks = root.XinMediaClock;
    if (!bridge || typeof bridge.scoreModel !== 'function' || !audio || !stage || !canvas || !core || !clocks) return null;
    const i18n = root.XinMusicLabDynamicUi;
    const say = (key, fallback) => (i18n && typeof i18n.t === 'function' && i18n.t(key, {}, fallback)) || fallback;
    const latency = () => {
      const kept = Number(root.localStorage && root.localStorage.getItem(LATENCY_KEY));
      return Number.isFinite(kept) && root.localStorage.getItem(LATENCY_KEY) !== null ? kept : DEFAULT_LATENCY_MS;
    };

    let view = null, clock = clocks.create(audio, {offset: 0}), shownModel = null;
    let trackId = '', sequence = 0, frame = 0, health = null;
    const stemSelect = root.document.getElementById('fusionStemSelect');
    // loop: {start, end, index} of the section being repeated; solo: the stem the view is showing as alone.
    let loop = null, solo = null, hint = null, held = false, shownLang = '';
    const interfaceLang = () => String(root.document.documentElement && root.document.documentElement.lang || '');
    // 'idle' (no track) | 'loading' | 'ready' | 'empty' (no transcribed notes) | 'failed'
    let status = 'idle';
    let reading={mergeTimbres:true,simplify:true};
    try{const saved=JSON.parse(root.localStorage.getItem('xin-score-reading')||'null');for(const k of Object.keys(reading))if(typeof saved?.[k]==='boolean')reading[k]=saved[k];}catch(_){}
    for(const [id,key]of [['scoreMergeTimbres','mergeTimbres'],['scoreSimplify','simplify']]){
      const input=root.document.getElementById(id);if(!input)continue;input.checked=reading[key];
      input.addEventListener('change',()=>{reading[key]=input.checked;root.localStorage.setItem('xin-score-reading',JSON.stringify(reading));view?.setOptions(reading);});
    }
    // Which named set of effects the score draws with (the core's `fxPreset`), kept per device.
    let fxPreset = 'clear';
    try { fxPreset = storedPreset(root.localStorage.getItem(EFFECTS_KEY)); } catch (_) {}
    const effectsSelect = root.document.getElementById('scoreEffects');
    if (effectsSelect) {
      effectsSelect.value = fxPreset;
      effectsSelect.addEventListener('change', () => {
        if (!PRESETS.includes(effectsSelect.value)) return;
        fxPreset = effectsSelect.value;
        try { root.localStorage.setItem(EFFECTS_KEY, fxPreset); } catch (_) {}
        view?.setOptions({fxPreset});
      });
    }
    let fxDynamics = 'song';
    try { fxDynamics = storedFollow(root.localStorage.getItem(FOLLOW_KEY)); } catch (_) {}
    const followInput = root.document.getElementById('scoreFxFollow');
    if (followInput) {
      followInput.checked = fxDynamics === 'song';
      followInput.addEventListener('change', () => {
        fxDynamics = followInput.checked ? 'song' : 'off';
        try { root.localStorage.setItem(FOLLOW_KEY, fxDynamics); } catch (_) {}
        view?.setOptions({fxDynamics});
      });
    }

    let shapes = true;
    try { shapes = storedShapes(root.localStorage.getItem(SHAPES_KEY)); } catch (_) {}
    const shapesInput = root.document.getElementById('scoreShapes');
    if (shapesInput) {
      shapesInput.checked = shapes;
      shapesInput.addEventListener('change', () => {
        shapes = shapesInput.checked;
        try { root.localStorage.setItem(SHAPES_KEY, shapes ? 'on' : 'off'); } catch (_) {}
        view?.setOptions(shapes ? shapeOptions(true) : {showShapes: false});
      });
    }

    const active = () => stage.dataset.effect === EFFECT;

    // The score layers (bar lines, loudness, stem levels) are prepared in the background when a song
    // without current ones is shown (score-prepare.js): XML asks, XLD's analysis service runs and saves.
    // One plain line on the score says what is happening; a failure there is a click to try again.
    const AUTO_KEY = 'xin-score-auto-layers';
    let autoLayers = true;
    try { autoLayers = root.localStorage.getItem(AUTO_KEY) !== 'off'; } catch (_) {}
    const Prepare = root.XinScorePrepare || null;
    const prepare = Prepare && typeof bridge.runAnalysis === 'function'
      ? Prepare.create({run: (id, engine) => bridge.runAnalysis(id, engine), mayStart: () => active(),
                        cancelRunning: () => { try { if (typeof bridge.cancelAnalysis === 'function') bridge.cancelAnalysis(); } catch (_) {} }})
      : null;
    let prepPlan = 'none', preparedAt = 0, noStemsUntil = 0, lineBox = null;
    // Called when the score's song is loaded and when the user switches to the score. A preparation is
    // started only while the score is on screen (Prepare.starts): a song accepted in another scene, the
    // next song playing on, the last song restored at start-up start nothing until the score is shown.
    function consider() {
      prepPlan = Prepare ? Prepare.plan(health, autoLayers && Boolean(prepare)) : 'unknown';
      if (!active()) return;
      const layers = health && health.layers;
      if (Prepare && Prepare.starts({active: active(), ready: status === 'ready', plan: prepPlan})) prepare.auto(trackId, layers ? layers.stemRunId : null);
      if (prepPlan === 'no-stems' || prepPlan === 'stems-unreadable') noStemsUntil = root.performance.now() + 8000;
    }
    const autoInput = root.document.getElementById('scoreAutoLayers');
    if (autoInput) {
      autoInput.checked = autoLayers;
      autoInput.addEventListener('change', () => {
        autoLayers = autoInput.checked;
        try { root.localStorage.setItem(AUTO_KEY, autoLayers ? 'on' : 'off'); } catch (_) {}
        if (trackId && status === 'ready') consider();
      });
    }
    if (prepare) prepare.subscribe(event => {
      // A result is put on screen only for the song that is shown now (Prepare.reloads).
      if (!Prepare.reloads(event, trackId)) return;
      preparedAt = root.performance.now();
      load(trackId);
    });
    function prepText() {
      if (!trackId || status !== 'ready') return null;
      const phase = prepare ? prepare.phase(trackId) : 'idle';
      if (phase === 'queued' || phase === 'running') return {text: say('score.prepRunning', '正在准备小节线和响度…')};
      if (phase === 'retrying' || phase === 'held') return {text: say('score.prepRetrying', '这次没准备成，过一会儿再试一次…')};
      if (phase === 'failed') return {text: say('score.prepFailed', '没准备成，点这里再试'), retry: true};
      if (phase === 'done' && root.performance.now() - preparedAt < 3000) return {text: say('score.prepDone', '准备好了')};
      if (prepPlan === 'no-stems' && root.performance.now() < noStemsUntil) {
        return {text: say('score.prepNoStems', '这首歌还没在 XLD 里分析过；分析之后，这里会有小节线和响度。')};
      }
      if (prepPlan === 'stems-unreadable' && root.performance.now() < noStemsUntil) {
        return {text: say('score.prepStemsUnreadable', '这首歌的分轨读不出来，这次没法准备小节线和响度；可以在 XLD 里看看分轨。')};
      }
      return null;
    }

    // The score keeps clear of this app's own chrome: it sits between the lowest of the top
    // bars and the scene catalogue. With the interface hidden (H) it has the whole window.
    let measured = 0;
    function fit() {
      if (measured-- > 0) return;
      measured = 20;
      const tall = stage.clientHeight;
      let top = 0, bottom = tall;
      if (!stage.classList.contains('ui-hidden')) {
        for (const name of ['.xl-top']) {
          const box = stage.querySelector(name) && stage.querySelector(name).getBoundingClientRect();
          if (box && box.height && box.bottom < tall * 0.5) top = Math.max(top, box.bottom + 10);
        }
        const catalog = stage.querySelector('.visual-catalog');
        const box = catalog && catalog.getBoundingClientRect();
        if (box && box.height && box.top > tall * 0.5) bottom = Math.min(bottom, box.top - 10);
      }
      if (bottom - top < 160) { top = 0; bottom = tall; }
      const place = `${Math.round(top)}px`, size = `${Math.round(bottom - top)}px`;
      if (canvas.style.top !== place) canvas.style.top = place;
      if (canvas.style.height !== size) canvas.style.height = size;
    }

    function notice(text) {
      const ratio = Math.min(2.5, Math.max(1, root.devicePixelRatio || 1));
      const width = canvas.clientWidth, height = canvas.clientHeight;
      if (canvas.width !== Math.round(width * ratio)) canvas.width = Math.round(width * ratio);
      if (canvas.height !== Math.round(height * ratio)) canvas.height = Math.round(height * ratio);
      const context = canvas.getContext('2d');
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.fillStyle = '#0d1016';
      context.fillRect(0, 0, width, height);
      context.fillStyle = 'rgba(232,236,245,.72)';
      context.font = '500 16px system-ui, "Segoe UI", "Microsoft YaHei", sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(text, width / 2, height / 2);
    }

    // The status of the score layers: one light line at the top of the score. Returns its box when it
    // can be clicked (a failure: try again).
    function statusLine(text, retry) {
      const ratio = canvas.width / (canvas.clientWidth || 1);
      const context = canvas.getContext('2d');
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.font = '500 12px system-ui, "Segoe UI", "Microsoft YaHei", sans-serif';
      // Below the band where the app's own toast appears (the scene name on switching), so neither covers the other.
      const wide = context.measureText(text).width + 24, left = (canvas.clientWidth - wide) / 2, top = 40;
      context.fillStyle = 'rgba(13,16,22,.62)';
      context.fillRect(left, top, wide, 24);
      context.fillStyle = retry ? 'rgba(242,190,96,.95)' : 'rgba(232,236,245,.72)';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(text, canvas.clientWidth / 2, top + 12.5);
      return retry ? {left, top, right: left + wide, bottom: top + 24} : null;
    }

    // A line of help over the score for a few seconds.
    function whisper(text, top = 10) {
      const ratio = canvas.width / (canvas.clientWidth || 1);
      const context = canvas.getContext('2d');
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.font = '500 13px system-ui, "Segoe UI", "Microsoft YaHei", sans-serif';
      const wide = context.measureText(text).width + 28, left = (canvas.clientWidth - wide) / 2;
      context.fillStyle = 'rgba(13,16,22,.82)';
      context.fillRect(left, top, wide, 28);
      context.fillStyle = 'rgba(232,236,245,.92)';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(text, canvas.clientWidth / 2, top + 14.5);
    }
    const tell = (key, fallback, seconds) => { hint = {text: say(key, fallback), until: root.performance.now() + seconds * 1000}; };
    const setLoop = next => { loop = next; if (view) view.setOptions({loop: loop ? [loop.start, loop.end] : null}); };

    function touch(event, repeat) {
      if (!active() || status !== 'ready' || !view) return;
      const box = canvas.getBoundingClientRect();
      const x = event.clientX - box.left, y = event.clientY - box.top;
      // The failed-preparation line is a button: try once more for this song.
      if (!repeat && lineBox && prepare && x >= lineBox.left && x <= lineBox.right && y >= lineBox.top && y <= lineBox.bottom) {
        prepare.request(trackId);
        return;
      }
      const under = view.hit(x, y);
      if (!under) return;
      if (under.kind === 'lane') {
        if (repeat) return;
        // A click on a lane's icon also says its name for a moment (the listening page's way).
        if (inNameColumn(event.clientX - box.left)) showName(laneName(under), event.clientX - box.left, event.clientY - box.top, 1800);
        const offered = stemSelect && Array.from(stemSelect.options).some(option => option.value === under.group);
        if (!offered) return tell('score.noStem', '这条轨没有单独的分轨音频可以切过去。', 2.5);
        stemSelect.value = stemSelect.value === under.group ? 'original' : under.group;
        stemSelect.dispatchEvent(new root.Event('change', {bubbles: true}));
      } else if (under.kind === 'section' && (repeat || event.shiftKey)) {
        if (loop && loop.index === under.index && !repeat) return setLoop(null);
        setLoop({start: under.time, end: under.end, index: under.index});
        if (audio.currentTime < under.time || audio.currentTime >= under.end) audio.currentTime = under.time;
      } else {
        if (loop && (under.kind !== 'section' || under.index !== loop.index)) setLoop(null);
        audio.currentTime = under.time;
      }
    }

    function paint() {
      frame = 0;
      offer();
      if (!active()) return;
      fit();
      if (status === 'ready' && view) {
        const alone = stemSelect && stemSelect.value && stemSelect.value !== 'original' ? stemSelect.value : null;
        if (alone !== solo) { solo = alone; view.setOptions({focusGroup: solo}); }
        if (loop && !audio.paused && (audio.currentTime >= loop.end - 0.02 || audio.currentTime < loop.start - 0.5)) audio.currentTime = loop.start;
        // While a video is being exported the score is not drawn (the export needs the GPU); the
        // last frame stays, the sound goes on.
        if (!held) { view.resize(); view.draw(); }
        // The help line and the status line are never shown together: the status waits until the help
        // has gone (6 s at most), so the top of the score holds one line besides the app's own toast.
        const hinting = Boolean(hint && root.performance.now() < hint.until);
        const prep = held || hinting ? null : prepText();
        lineBox = prep ? statusLine(prep.text, prep.retry) : null;
        if (hinting) whisper(hint.text, 10);
      }
      else if (status === 'loading') notice(say('score.loading', '正在读这首歌的谱面…'));
      else if (status === 'empty') notice(say('score.noNotes', '这首歌还没有转写出来的音符。在 XLD 里跑过转写之后，这里就有谱面。'));
      else if (status === 'failed') notice(say('score.failed', '这首歌的谱面读不出来。'));
      else notice(say('score.idle', '选一首歌，这里显示它的谱面。'));
      frame = root.requestAnimationFrame(paint);
    }
    // Switching to the score is when a song already loaded gets its preparation looked at (consider()).
    let wasActive = false;
    const wake = () => {
      measured = 0;
      const now = active();
      if (!now) { if (!docked) more.hidden = true; if (!syncDocked) sync.hidden = true; }
      if (now && !frame) frame = root.requestAnimationFrame(paint);
      if (now && !wasActive && trackId && status === 'ready') consider();
      wasActive = now;
    };

    function showCover(model, ticket) {
      if (!view) return;
      view.setCover(null);
      const source = model.cover && model.cover.src;
      if (!source) return;
      const image = new root.Image();
      image.onload = () => { if (ticket === sequence && view) view.setCover(image); };
      image.src = source;
    }

    // Called by fusion.js whenever a track is accepted or its results are refreshed.
    async function load(id) {
      const ticket = ++sequence;
      const trackChanged = String(id || '') !== trackId;
      trackId = String(id || '');
      root.dispatchEvent(new root.CustomEvent('xin-score-track',{detail:{trackId}}));
      if (trackChanged) setLoop(null);
      if (!trackId) { status = 'idle'; health = null; return false; }
      if (status !== 'ready') status = 'loading';
      wake();
      let result = null;
      shownLang = interfaceLang();
      try { result = await bridge.scoreModel(trackId,root.XinScoreDynamicsControls?.enabled()===true,shownLang); } catch (error) { result = {ok: false, error: String(error && error.message || error)}; }
      if (ticket !== sequence) return false;
      health = result && result.health || null;
      root.dispatchEvent(new root.CustomEvent('xin-score-ready',{detail:{trackId,dynamics:health?.dynamics||null}}));
      if (!result || !result.ok) {
        status = result && result.error === 'score-no-notes' ? 'empty' : 'failed';
        return false;
      }
      // The stems without notes as a low band at the foot (work/score-dynamics-20261114/SPEC-REST.md): always on here.
      const options = {...reading,fxPreset,fxDynamics,showTexture: true,...shapeOptions(shapes),offsetSeconds: -latency() / 1000};
      if (view) { view.setModel(result.model); view.setOptions(options); }
      else view = core.create(canvas, result.model, () => clock.now(), options);
      shownModel = result.model;
      showCover(result.model, ticket);
      status = 'ready';
      // Waiting automatic preparations for songs left behind are dropped; a running one finishes.
      if (trackChanged && prepare) prepare.forgetWaiting(trackId);
      consider();
      offer();
      if (trackChanged) tell('score.help', '点一条轨：只听它，再点回到原曲 · 点段落：跳过去 · 双击段落：循环', 6);
      return true;
    }

    function reset() {
      sequence++;
      trackId = '';
      root.dispatchEvent(new root.CustomEvent('xin-score-track',{detail:{trackId}}));
      status = 'idle';
      health = null;
      setLoop(null);
    }

    const dynamicsChanged=()=>{if(trackId)load(trackId);};
    // The marks, section names and lane names are made in the language of the interface. When that
    // changes, the model is asked for again at once: no reload, no change of song.
    const languageChanged = () => { if (trackId && interfaceLang() !== shownLang) load(trackId); };
    const unsubscribeLanguage = i18n && typeof i18n.subscribe === 'function' ? i18n.subscribe(() => root.setTimeout(languageChanged, 0)) : null;
    root.addEventListener('xin-score-dynamics-change',dynamicsChanged);

    function setLatency(milliseconds) {
      const value = Math.max(-500, Math.min(500, Number(milliseconds) || 0));
      root.localStorage.setItem(LATENCY_KEY, String(value));
      if (view) view.setOptions({offsetSeconds: -value / 1000});
      return value;
    }

    // The lanes are labelled by icons; a pointer resting on one, or a click, shows the lane's name
    // (the core's hit(x, y)). Nothing is written on the score permanently.
    const nameTip = root.document.createElement('div');
    nameTip.className = 'score-lane-name';
    nameTip.hidden = true;
    stage.appendChild(nameTip);
    const inNameColumn = x => x <= (canvas.clientWidth < 520 ? 58 : 84);
    // The icon stands for a stem; its name in the interface's language (the model's own label otherwise).
    // A second line says which model the lane's notes come from, in the name XLD shows for it
    // (lane.meta.engineName, set by the main process; the engine id when XLD has no name for it).
    const laneModel = under => {
      if (!shownModel || under.texture) return null;
      const names = laneModels(shownModel.lanes, under, reading.mergeTimbres !== false);
      return names.length ? say('score.laneModel', '音符来自：{model}').replace('{model}', names.join(' · ')) : null;
    };
    const laneName = under => {
      const name = say(`score.lane.${under.group}`, under.label), model = laneModel(under);
      return model ? `${name}\n${model}` : name;
    };
    let nameTimer = 0;
    // The name in the first line; the model, lighter, in the second (style.css .score-lane-name small).
    function showName(text, x, y, holdMs) {
      root.clearTimeout(nameTimer);
      nameTimer = 0;
      if (nameTip.dataset.text !== text) {
        const [first, second] = String(text).split('\n');
        if (!second) nameTip.textContent = first;
        else {
          const head = root.document.createElement('span'), more = root.document.createElement('small');
          head.textContent = first;
          more.textContent = second;
          nameTip.textContent = '';
          nameTip.append(head, more);
        }
        nameTip.dataset.text = text;
      }
      nameTip.style.left = `${Math.round(canvas.offsetLeft + x + 14)}px`;
      nameTip.style.top = `${Math.round(canvas.offsetTop + y - 12)}px`;
      nameTip.hidden = false;
      if (holdMs) nameTimer = root.setTimeout(() => { nameTip.hidden = true; nameTimer = 0; }, holdMs);
    }
    canvas.addEventListener('pointermove', event => {
      if (event.pointerType === 'touch' || !active() || status !== 'ready' || !view) return;
      const box = canvas.getBoundingClientRect(), x = event.clientX - box.left, y = event.clientY - box.top;
      const under = inNameColumn(x) ? view.hit(x, y) : null;
      if (under && under.kind === 'lane') showName(laneName(under), x, y, 0);
      else if (!nameTimer) nameTip.hidden = true;
    });
    canvas.addEventListener('pointerleave', () => { if (!nameTimer) nameTip.hidden = true; });
    canvas.addEventListener('click', event => touch(event, false));
    canvas.addEventListener('dblclick', event => touch(event, true));
    // The layers only an analysis can give (bar lines, loudness). When the track lacks them a
    // small button offers to run that analysis through the app's own analysis service.
    const more = root.document.createElement('button');
    more.type = 'button';
    more.className = 'score-layers-run';
    more.hidden = true;
    // In the shell the button belongs with the song's analysis, at the foot of the library drawer,
    // where it does not sit on the score. Without the shell it floats over the stage as before.
    const foot = root.document.querySelector('.xl-drawer__foot');
    const docked = Boolean(foot);
    if (docked) more.classList.add('is-docked');
    (foot || stage).appendChild(more);
    let making = false, syncDocked = false;
    // Which of the two analyses this track has not had: the layers first, then the vocal line.
    // With automatic preparation on, the layers are the queue's business and the button only offers the
    // vocal line (unchanged, it stays the user's call). Off, it offers both, as before.
    const layersOwed = () => (health.layers ? health.layers.owed === 'layers' : health.layersRun === false);
    const owed = () => (health ? [!(autoLayers && prepare) && layersOwed() && 'score-layers', health.vocalsRun === false && 'score-vocals'].filter(Boolean) : []);
    // The button's score-layers run goes through the same queue, so one song never runs twice at once.
    const prepareOnce = id => new Promise(resolve => {
      const off = prepare.subscribe(event => { if (event.type === 'done' && event.trackId === id) { off(); resolve(event.result || {ok: event.ok}); } });
      prepare.request(id);
    });
    const lacking = () => owed().length > 0;
    function offer() {
      const show = (docked || active()) && status === 'ready' && lacking() && typeof bridge.runAnalysis === 'function'
        && !stage.classList.contains('ui-hidden');
      if (more.hidden === show) more.hidden = !show;
      const text = making === 'score-vocals' ? say('score.vocalsRunning', '正在跟主唱的音高…')
        : making ? say('score.layersRunning', '正在算小节线和响度…')
        : owed()[0] === 'score-vocals' ? say('score.vocalsRun', '补上人声曲线') : say('score.layersRun', '补上小节线、响度和人声曲线');
      if (more.textContent !== text) more.textContent = text;
      more.disabled = Boolean(making) || Boolean(prepare && prepare.running());
      if (show && !docked) more.style.top = `${canvas.offsetTop + 52}px`;
      const tuning = syncDocked || (active() && status === 'ready' && !stage.classList.contains('ui-hidden'));
      if (sync.hidden === tuning) sync.hidden = !tuning;
      if (tuning) { paintSync(); if (!syncDocked) sync.style.top = `${canvas.offsetTop + (show ? 88 : 52)}px`; }
    }
    more.addEventListener('click', async () => {
      if (making || !trackId) return;
      const id = trackId;
      let result = null;
      // One after the other: the analysis service runs one task at a time. A failure stops the rest.
      for (const engine of owed()) {
        making = engine;
        try { result = engine === 'score-layers' && prepare ? await prepareOnce(id) : await bridge.runAnalysis(id, engine); }
        catch (error) { result = {ok: false, detail: String(error && error.message || error)}; }
        if (!result || !result.ok) break;
        if (id === trackId) await load(id);
      }
      making = false;
      if (result && result.ok) { /* shown by the reload above */ }
      else tell(result && result.error === 'analysis-busy' ? 'score.layersBusy' : 'score.layersFailed',
                result && result.error === 'analysis-busy' ? '有别的分析正在跑，等它结束再试。' : `没有算出来：${String(result && (result.detail || result.error) || '').split('\n').pop().slice(0, 60)}`, 6);
    });
    // Picture against sound: how many milliseconds the score is held back. It belongs to the
    // device (and to its speakers or headphones), so it is set by ear here and remembered.
    const sync = root.document.createElement('div');
    sync.className = 'score-sync';
    sync.hidden = true;
    const earlier = root.document.createElement('button'), later = root.document.createElement('button'), shown = root.document.createElement('span');
    earlier.type = later.type = 'button';
    earlier.textContent = '\u2212';
    later.textContent = '+';
    sync.append(earlier, shown, later);
    // In the shell it is a row of the settings drawer's 谱面阅读 group, above 导出视频 (B5: it sat in 画面效果, the
    // second group, among the FX layer's controls); otherwise it floats over the stage.
    const group = root.document.querySelector('#xlSettings [data-i18n="score.options"]')?.closest('.xl-group') || null;
    syncDocked = Boolean(group);
    if (syncDocked) {
      const row = root.document.createElement('div'), label = root.document.createElement('span');
      row.className = 'xl-row';
      label.className = 'xl-row__label';
      label.textContent = say('score.syncLabel', '谱面对齐');
      sync.classList.add('is-docked');
      row.append(label, sync);
      group.insertBefore(row, group.querySelector(':scope > .score-export'));
    } else stage.appendChild(sync);
    const paintSync = () => {
      const text = say('score.sync', '画面晚 {ms} ms').replace('{ms}', String(latency()));
      if (shown.textContent !== text) shown.textContent = text;
      const hint = say('score.syncHint', '音符过线比声音早，就加；比声音晚，就减。');
      if (sync.title !== hint) sync.title = hint;
    };
    earlier.addEventListener('click', () => { setLatency(latency() - 10); paintSync(); });
    later.addEventListener('click', () => { setLatency(latency() + 10); paintSync(); });
    const watcher = new root.MutationObserver(wake);
    watcher.observe(stage, {attributes: true, attributeFilter: ['data-effect', 'data-fusion-source', 'class']});
    root.addEventListener('resize', () => { measured = 0; });
    wake();

    return Object.freeze({
      load, reset, setLatency, makeLayers: () => more.click(), hold: flag => { held = Boolean(flag); },
      // The background queue, shared with the library drawer's "prepare the score" batch.
      prepare,
      laneTip: under => laneName(under),
      // The render core's handle while a score is shown (score-lyrics.js reads its clock and lane positions), else null.
      viewHandle: () => (view && status === 'ready' ? view : null),
      status: () => ({status, trackId, active: active(), held, latencyMs: latency(), health, reading:{...reading},effects:fxPreset,fxPreset,fxDynamics,shapes,tracks:view?view.lanes():[], making, offering: !more.hidden, solo, loop: loop ? {...loop} : null,
                      prep: {auto: autoLayers, plan: prepPlan, phase: prepare && trackId ? prepare.phase(trackId) : 'idle',
                             error: prepare && trackId ? prepare.error(trackId) : null, attempts: prepare && trackId ? prepare.attempts(trackId) : 0,
                             // What is drawn now: no status line while the help line is up (L6).
                             help: Boolean(hint && root.performance.now() < hint.until),
                             line: hint && root.performance.now() < hint.until ? null : (prepText() || {}).text || null},
                      layers: view && status === 'ready' ? view.layers() : null,
                      frame: view && status === 'ready' ? view.lastFrame() : null}),
      destroy: () => { if (unsubscribeLanguage) unsubscribeLanguage(); root.removeEventListener('xin-score-dynamics-change',dynamicsChanged);watcher.disconnect(); if (frame) root.cancelAnimationFrame(frame); frame = 0; clock.destroy(); }
    });
  }

  root.XinScoreScene = Object.freeze({create, EFFECT, storedPreset, storedFollow, storedShapes, shapeOptions, PRESETS, laneModels});
})(globalThis);
