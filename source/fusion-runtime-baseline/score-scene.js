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
  function storedPreset(kept) {
    if (PRESETS.includes(kept)) return kept;
    return Object.prototype.hasOwnProperty.call(OLD_LEVELS, kept) ? OLD_LEVELS[kept] : 'clear';
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

    let view = null, clock = clocks.create(audio, {offset: 0});
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

    const active = () => stage.dataset.effect === EFFECT;

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

    // A line of help over the score for a few seconds.
    function whisper(text) {
      const ratio = canvas.width / (canvas.clientWidth || 1);
      const context = canvas.getContext('2d');
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.font = '500 13px system-ui, "Segoe UI", "Microsoft YaHei", sans-serif';
      const wide = context.measureText(text).width + 28, left = (canvas.clientWidth - wide) / 2, top = 10;
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
      const under = view.hit(event.clientX - box.left, event.clientY - box.top);
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
        if (hint && root.performance.now() < hint.until) whisper(hint.text);
      }
      else if (status === 'loading') notice(say('score.loading', '正在读这首歌的谱面…'));
      else if (status === 'empty') notice(say('score.noNotes', '这首歌还没有转写出来的音符。在 XLD 里跑过转写之后，这里就有谱面。'));
      else if (status === 'failed') notice(say('score.failed', '这首歌的谱面读不出来。'));
      else notice(say('score.idle', '选一首歌，这里显示它的谱面。'));
      frame = root.requestAnimationFrame(paint);
    }
    const wake = () => { measured = 0; if (!active()) { if (!docked) more.hidden = true; if (!syncDocked) sync.hidden = true; } if (active() && !frame) frame = root.requestAnimationFrame(paint); };

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
      const options = {...reading,fxPreset,fxDynamics,showTexture: true,offsetSeconds: -latency() / 1000};
      if (view) { view.setModel(result.model); view.setOptions(options); }
      else view = core.create(canvas, result.model, () => clock.now(), options);
      showCover(result.model, ticket);
      status = 'ready';
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
    const laneName = under => say(`score.lane.${under.group}`, under.label);
    let nameTimer = 0;
    function showName(text, x, y, holdMs) {
      root.clearTimeout(nameTimer);
      nameTimer = 0;
      if (nameTip.textContent !== text) nameTip.textContent = text;
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
    const owed = () => (health ? [health.layersRun === false && 'score-layers', health.vocalsRun === false && 'score-vocals'].filter(Boolean) : []);
    const lacking = () => owed().length > 0;
    function offer() {
      const show = (docked || active()) && status === 'ready' && lacking() && typeof bridge.runAnalysis === 'function'
        && !stage.classList.contains('ui-hidden');
      if (more.hidden === show) more.hidden = !show;
      const text = making === 'score-vocals' ? say('score.vocalsRunning', '正在跟主唱的音高…')
        : making ? say('score.layersRunning', '正在算小节线和响度…')
        : owed()[0] === 'score-vocals' ? say('score.vocalsRun', '补上人声曲线') : say('score.layersRun', '补上小节线、响度和人声曲线');
      if (more.textContent !== text) more.textContent = text;
      more.disabled = Boolean(making);
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
        try { result = await bridge.runAnalysis(id, engine); } catch (error) { result = {ok: false, detail: String(error && error.message || error)}; }
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
    // In the shell it is a row of the settings drawer; otherwise it floats over the stage.
    const group = root.document.querySelector('#xlSettings .xl-group + .xl-group');
    syncDocked = Boolean(group);
    if (syncDocked) {
      const row = root.document.createElement('div'), label = root.document.createElement('span');
      row.className = 'xl-row';
      label.className = 'xl-row__label';
      label.textContent = say('score.syncLabel', '谱面对齐');
      sync.classList.add('is-docked');
      row.append(label, sync);
      group.appendChild(row);
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
      status: () => ({status, trackId, active: active(), held, latencyMs: latency(), health, reading:{...reading},effects:fxPreset,fxPreset,fxDynamics,tracks:view?view.lanes():[], making, offering: !more.hidden, solo, loop: loop ? {...loop} : null,
                      layers: view && status === 'ready' ? view.layers() : null,
                      frame: view && status === 'ready' ? view.lastFrame() : null}),
      destroy: () => { if (unsubscribeLanguage) unsubscribeLanguage(); root.removeEventListener('xin-score-dynamics-change',dynamicsChanged);watcher.disconnect(); if (frame) root.cancelAnimationFrame(frame); frame = 0; clock.destroy(); }
    });
  }

  root.XinScoreScene = Object.freeze({create, EFFECT, storedPreset, storedFollow, PRESETS});
})(globalThis);
