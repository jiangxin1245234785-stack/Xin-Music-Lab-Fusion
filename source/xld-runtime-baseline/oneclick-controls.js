// 一键分析 (overview tab): one button runs sections -> chords -> stems -> optional fine split -> every part's MIDI ->
// merge for the selected track, another runs the same for every track of the album (the album hero's
// batchAlbumButton is wired here too). The plan, presets and serial runner are oneclick-plan.js; the MIDI part is the
// 转谱 panel's own one-click batch (derived-controls.js runBatch), never a second copy of it. Strictly serial; the
// analysis service answers from disk where a current result exists, which is what 「已有」 reports.
(function(root){
  'use strict';
  function create({bridge, rt, derived, getTrack, getAlbum, getEngines, getSummary, isBusy, isCancelled, setBatch, onProgress, runAnalysis, onTask, localizeError = value => value, log, albumButton, storage = root.localStorage}) {
    const P = root.XldOneClickPlan, $ = id => document.getElementById(id);
    if (!P || !$('oneclickPanel')) return null;
    const t = (key, params) => rt('runtime.oneclick.' + key, params);
    let choice = P.load(storage), engines = null, enginesPromise = null;
    let view = {trackId: null, steps: [], finished: false, title: ''}, running = null, status = null, previewToken = 0, previewKey = '';
    let previewRoute = null, savingRoute = false;

    function loadEngines(force = false) {
      if (engines && !force) return Promise.resolve(engines);
      if (!enginesPromise) enginesPromise = Promise.all([
        Promise.resolve(bridge.separationEngines?.()).catch(() => []),
        Promise.resolve(bridge.refinementEngines?.()).catch(() => []),
        Promise.resolve(derived.midiEngines?.()).catch(() => [])
      ]).then(([separation, refinement, midi]) => { engines = {separation: separation || [], refinement: refinement || [], midi: midi || []}; return engines; })
        .finally(() => { enginesPromise = null; });
      return enginesPromise;
    }
    const modelName = id => (engines?.midi || []).find(model => model.id === id)?.name
      || (engines?.separation || []).find(model => model.id === id)?.name
      || (getEngines?.() || []).find(engine => engine.id === id)?.name || t('model.' + id);
    const installed = id => {
      const all = [...(engines?.midi || []), ...(engines?.separation || [])];
      const found = all.find(model => model.id === id);
      return !engines || !found || found.available;
    };

    // --- static skeleton: preset switch and the choice rows, built once and updated by render() -------------------
    const presetBox = $('oneclickPreset'), list = $('oneclickChoiceList');
    const presetButtons = ['efficiency', 'quality'].map(name => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'quiet-button'; button.dataset.preset = name;
      button.setAttribute('role', 'radio');
      button.addEventListener('click', () => { if (running) return; choice = P.applyPreset(name); P.save(storage, choice); schedulePreview(true); render(); });
      presetBox.append(button); return button;
    });
    const customTag = document.createElement('span'); customTag.className = 'oneclick-custom'; presetBox.append(customTag);
    const rows = {};
    const ROWS = [['separation', 'select'], ['otherRoute', 'route'], ['other', 'select'], ['refine', 'check'], ['piano', 'select'], ['bass', 'select'], ['guitar', 'select'], ['strings', 'select'], ['winds', 'select'], ['drums', 'select'], ['vocals', 'check']];
    for (const [key, kind] of ROWS) {
      const row = document.createElement('div'); row.className = 'oneclick-choice'; row.dataset.choice = key;
      const label = document.createElement('label'); const name = document.createElement('span'); name.className = 'oneclick-choice-name';
      let input = null;
      if (kind === 'route') {
        input = document.createElement('select');
        for (const route of P.OTHER_ROUTES) { const option = document.createElement('option'); option.value = route; input.append(option); }
        input.addEventListener('change', async () => {
          const track = getTrack();
          if (!track || savingRoute || isBusy()) return;
          const route = input.value;
          savingRoute = true; render();
          const response = await derived.selectOtherRoute(track, route);
          savingRoute = false;
          if (getTrack()?.id !== track.id) { render(); return; }
          if (response.ok) schedulePreview(true);
          else status = {done: t('routeSaveFailed')};
          render();
        });
        label.append(name, input);
      } else if (kind === 'select') {
        input = document.createElement('select');
        for (const value of P.OPTIONS[key]) { const option = document.createElement('option'); option.value = value; input.append(option); }
        input.addEventListener('change', () => { choice = P.choose(choice, key, input.value); P.save(storage, choice); schedulePreview(true); render(); });
        label.append(name, input);
      } else if (kind === 'check') {
        input = document.createElement('input'); input.type = 'checkbox';
        input.addEventListener('change', () => { choice = P.choose(choice, key, Boolean(input.checked)); P.save(storage, choice); schedulePreview(true); render(); });
        label.append(input, name);
      } else {
        const value = document.createElement('span'); value.className = 'oneclick-fixed'; label.append(name, value); row.fixedValue = value;
      }
      const advice = document.createElement('small'); advice.className = 'oneclick-advice';
      row.append(label, advice); list.append(row);
      rows[key] = {row, name, input, advice, kind};
    }

    const STATE_CLASS = {existing: 'ready', done: 'ready', upgraded:'ready', failed: 'failed', unavailable: 'unavailable', running: 'running', skipped: 'skipped', pending: '', rerun:'rerun',upgrade:'upgrade'};
    function stepName(step) {
      if (step.kind === 'mood') return t('step.mood');
      if (step.kind === 'midi') return step.stem + ' · ' + modelName(step.engine);
      if (step.kind === 'merge') return t('step.merge');
      if (step.kind === 'refine') return t(step.id === 'refine-winds' ? 'step.refineWinds' : 'step.refine');
      return t('step.' + step.id) + ' · ' + modelName(step.engine);
    }
    function reasonText(reason) {
      if (!reason) return '';
      if (reason.code === 'failed') return localizeError(reason.text || '');
      return t('reason.' + reason.code, reason);
    }
    function renderSteps() {
      const box = $('oneclickSteps'); box.replaceChildren();
      const counts = $('oneclickCounts');
      counts.hidden = Boolean(running) || !view.preview || !view.steps.length;
      if (!counts.hidden) {
        const run = view.steps.filter(step => ['pending','rerun'].includes(step.state)).length;
        const upgrade = view.steps.filter(step=>step.state==='upgrade').length;
        counts.textContent = t(upgrade?'countsWithUpgrade':'counts',{run,upgrade,skip:view.steps.length-run-upgrade});
      }
      for (const step of view.steps) {
        const item = document.createElement('li'); item.className = 'oneclick-step ' + (STATE_CLASS[step.state] || ''); item.dataset.step = step.id; item.dataset.state = step.state;
        const name = document.createElement('span'); name.className = 'oneclick-step-name'; name.textContent = stepName(step);
        const state = document.createElement('span'); state.className = 'oneclick-step-state'; state.textContent = t('state.' + step.state);
        if (step.kind === 'mood') {
          const group = document.createElement('span'); group.className = 'oneclick-mood-actions';
          const button = document.createElement('button'); button.type = 'button'; button.className = 'quiet-button';
          button.id = 'oneclickMoodOnly'; button.textContent = t('moodOnly');
          button.title = t('moodOnlyHint');
          button.disabled = Boolean(running || savingRoute || isBusy() || view.trackId !== getTrack()?.id);
          button.addEventListener('click',runMoodOnly);
          group.append(state,button); item.append(name,group);
        } else item.append(name,state);
        const why = [reasonText(step.reason),step.batchVocals ? t('batchVocals') : ''].filter(Boolean).join(' · ');
        if (why) { const note = document.createElement('small'); note.className = 'oneclick-step-note'; note.textContent = why; item.append(note); }
        box.append(item);
      }
      box.hidden = !view.steps.length;
    }
    function render() {
      $('oneclickTitle').textContent = t('title');
      $('oneclickHint').textContent = t('hint');
      presetBox.setAttribute('aria-label', t('presetLabel'));
      for (const button of presetButtons) {
        button.textContent = t('preset.' + button.dataset.preset);
        button.setAttribute('aria-checked', String(choice.preset === button.dataset.preset));
        button.classList.toggle('selected', choice.preset === button.dataset.preset);
        button.disabled = Boolean(running);
      }
      customTag.textContent = choice.preset === 'custom' ? t('preset.custom') : '';
      customTag.hidden = choice.preset !== 'custom';
      $('oneclickChoicesSummary').textContent = t('choices') + ' · ' + summaryLine();
      const M = P.MEASURED;
      const track = getTrack(), album = getAlbum();
      const splitting = previewRoute === 'split';
      for (const [key, {name, input, advice, kind, row}] of Object.entries(rows)) {
        name.textContent = t('choice.' + key);
        row.hidden = (key === 'refine' || key === 'strings' || key === 'winds') ? !splitting : key === 'other' && splitting;
        if (kind === 'route') {
          for (const option of input.options) option.textContent = t('route.' + option.value);
          input.value = previewRoute || 'direct';
          input.disabled = Boolean(isBusy() || savingRoute || !track || view.trackId !== track.id || view.checking || view.previewError || view.otherRouteError);
        } else if (kind === 'select') {
          for (const option of input.options) option.textContent = modelName(option.value) + (installed(option.value) ? '' : ' · ' + t('notInstalled'));
          input.value = choice.choices[key];
          input.disabled = Boolean(running) || ((key === 'strings' || key === 'winds') && !choice.choices.refine);
        } else if (kind === 'check') { input.checked = Boolean(choice.choices[key]); input.disabled = Boolean(running); }
        advice.textContent = t('advice.' + key, {
          roformer: M.roformer.secPerMin, roformerRuns: M.roformer.runs, roformerMb: M.roformer.mbPerMin, demucs: M.demucs.secPerMin, demucsRuns: M.demucs.runs,
          refine: M.refine.secPerMin, refineRuns: M.refine.runs, refineMb: M.refine.mbPerMin,
          medium: M.guitarMedium.secPerMin, mediumRuns: M.guitarMedium.runs, large: M.guitarLarge.secPerMin, largeRuns: M.guitarLarge.runs,
          stringsLarge: M.stringsLarge.secPerMin, stringsRuns: M.stringsLarge.runs,
          drums: M.drums.secPerMin, drumsRuns: M.drums.runs, drumSep: M.drumSep.secPerMin, drumSepRuns: M.drumSep.runs,
          vocals: M.vocals.secPerMin, vocalsRuns: M.vocals.runs});
      }
      const busy = Boolean(isBusy() || savingRoute);
      $('oneclickTrack').textContent = running === 'track' ? t('running') : t('runTrack');
      $('oneclickAlbum').textContent = running === 'album' && status?.index ? t('albumProgress', status) : t('runAlbum');
      $('oneclickTrack').disabled = busy || !track;
      $('oneclickAlbum').disabled = busy || !album?.tracks?.length;
      if (albumButton && running === 'album' && status?.index) albumButton.textContent = t('albumProgress', status);
      renderSteps();
      $('oneclickStatus').textContent = statusLine(track);
    }
    function summaryLine() {
      const c = choice.choices;
      return [modelName(c.separation), t('route.' + (previewRoute || 'direct')), modelName(c.guitar), modelName(c.drums), c.vocals ? t('vocalsOn') : t('vocalsOff')].join(' · ');
    }
    function statusLine(track) {
      if (running === 'album' && status) return t('albumWorking', status);
      if (running === 'mood') return t('moodOnlyWorking',{title:view.title});
      if (running) return view.title ? t('trackWorking', {title: view.title}) : '';
      if (status?.done) return status.done;
      if (view.checking) return t('checking');
      if (view.previewError) return t('checkFailed', {error: view.previewError});
      if (view.otherRouteError) return t('routeReadFailed', {error: view.otherRouteError});
      if (!track) return t('chooseTrack');
      return view.steps.some(step => step.state === 'unavailable') ? t('someUnavailable') : t('ready');
    }

    // The plan for the selected track, shown before anything runs, with unavailable steps already marked.
    async function planFor(track, settings, knownDerived) {
      await loadEngines();
      const [derivedNow, summary] = await Promise.all([
        knownDerived || Promise.resolve(bridge.readDerived(track.id)).catch(error => ({otherRouteError: String(error)})),
        Promise.resolve(bridge.getAnalysisSummary?.()).catch(() => null)]);
      const otherRouteError = derivedNow?.otherRouteError || (!Object.hasOwn(derivedNow || {}, 'otherRoute') ? 'read-failed' : null);
      if (otherRouteError) return {otherRoute: null, otherRouteError, steps: []};
      const has = engine => P.hasAnalysis(summary,track.id,engine);
      return {otherRoute: P.otherRouteFor(derivedNow), storedOtherRoute: derivedNow.otherRoute, summary,
        steps: P.plan(settings, {analysis: getEngines?.() || [], ...engines, derived: derivedNow, has})};
    }
    function refinementDevice() {
      try {return storage?.getItem('xld.refinement.device') || 'auto';} catch (_) {return 'auto';}
    }
    const keyFor = track => JSON.stringify([track?.id || null,choice.choices,refinementDevice(),getEngines?.(),getSummary?.()?.[track?.id]]);
    const standaloneMood = () => ({id:'mood',kind:'mood',engine:'mood-curve',state:'unchecked',reason:null});
    function schedulePreview(force = false, knownDerived) {
      const track = getTrack();
      if (running) return;
      const key = keyFor(track);
      if (!force && key === previewKey) return;
      previewKey = key; status = null;
      const token = ++previewToken;
      if (!track) { previewRoute = null; view = {trackId: null, steps: [], finished: false, title: ''}; render(); return; }
      if (track.id !== view.trackId) previewRoute = null;
      view = {trackId:track.id, steps:[], checking:true, title:track.title};
      render();
      const current = () => token === previewToken && !running && getTrack()?.id === track.id;
      const settings = choice.choices;
      planFor(track,settings,knownDerived).then(async plan => {
        if (!current()) return;
        const {otherRoute, steps, otherRouteError, summary} = plan;
        // The MIDI batch discovers its parts after activating the selected stems. That change
        // may restore a strings or winds source which was invisible when the plan was built.
        if (otherRoute==='split' && steps.find(step=>step.kind==='stems')?.state!=='unavailable') {
          for (const stem of ['strings','winds']) {
            if (!steps.some(step=>step.stem===stem) && engines.midi.some(model=>model.id===settings[stem])) {
              const index = steps.findIndex(step=>step.stem==='vocals' || step.kind==='merge');
              steps.splice(index,0,{id:'midi:'+stem,stem,engine:settings[stem],kind:'midi',state:'pending',onlyIfSource:true});
            }
          }
        }
        const checks = otherRouteError ? {} : await bridge.planOneClickCache(track.id,steps,{otherRoute,device:refinementDevice()});
        if (!current()) return;
        for (const step of steps) {
          if (step.kind === 'analysis' && P.hasAnalysis(summary,track.id,step.engine)) step.state = 'existing';
          else if (step.id === 'chords' && step.state === 'pending' &&
            ['chord-chordmini','chord-btc'].some(engine => engine !== step.engine && P.hasAnalysis(summary,track.id,engine))) {
            step.state = 'rerun'; step.reason = {code:'model-changed'};
          } else if (checks[step.id]) Object.assign(step,checks[step.id]);
        }
        previewRoute = otherRoute;
        view = {trackId:track.id, steps:otherRouteError?[standaloneMood()]:steps.filter(step=>!step.omitted),
          otherRouteError,preview:!otherRouteError,finished:false,title:track.title}; render();
      }).catch(error => {
        if (current()) {view = {trackId:track.id,steps:[standaloneMood()],previewError:String(error.message || error),title:track.title}; render();}
      });
    }

    function ops(track, otherRoute, storedOtherRoute) {
      const say = (engine, engineName) => onTask?.({trackId: track.id, trackTitle: track.title, engine, engineName, status: 'starting', progress: 0});
      return {
        has: async engine => P.hasAnalysis(await Promise.resolve(bridge.getAnalysisSummary?.()).catch(() => null),track.id,engine),
        analysis: step => runAnalysis(step.engine, {track, auto: step.auto}),
        mood: step => runAnalysis(step.engine, {track}),
        stems: async step => {
          say(step.engine, modelName(step.engine));
          let response; try { response = await bridge.runDerived(track.id, 'stems', null, false, step.engine); } catch (error) { response = {ok: false, error: 'request-failed', detail: String(error)}; }
          onTask?.(response?.task || null);
          await derived.refresh?.();
          return response;
        },
        // The fine split the 细分 panel would start with its defaults (Mega 53, whole song, other -> strings), then the
        // 转谱 panel's strings source set to its result, which is how that panel learns a strings part exists.
        refine: async step => {
          // W1: the winds, dug out of what the strings step left, then adopted (or "this song has no winds").
          if (step?.id === 'refine-winds') {
            const device = refinementDevice();
            say('mega-53', t('step.refineWinds'));
            let response; try { response = await bridge.runRefinement({trackId: track.id, engine: 'mega-53', target: 'wind', sourceStem: 'strings-residual', scope: 'full', device, start: 0, duration: 30}); }
            catch (error) { response = {ok: false, error: 'request-failed', detail: String(error)}; }
            onTask?.(response?.task || null);
            if (!response?.ok) return response;
            const adopted = await Promise.resolve(bridge.adoptWinds?.(track.id, response.result?.runId, response.result?.cacheKey)).catch(error => ({ok: false, error: String(error)}));
            if (!adopted?.ok) return adopted || {ok: false, error: 'request-failed'};
            await derived.refresh?.();
            return {ok: true, cached: Boolean(response.result?.cached), none: Boolean(adopted.none)};
          }
          const before = await Promise.resolve(bridge.readDerived(track.id)).catch(() => null);
          if (before?.strings?.active) return {ok: true, cached: true};
          const device = refinementDevice();
          say('mega-53', t('step.refine'));
          let response; try { response = await bridge.runRefinement({trackId: track.id, engine: 'mega-53', target: 'strings', sourceStem: 'other', scope: 'full', device, start: 0, duration: 30}); }
          catch (error) { response = {ok: false, error: 'request-failed', detail: String(error)}; }
          onTask?.(response?.task || null);
          if (!response?.ok) return response;
          const after = await Promise.resolve(bridge.readDerived(track.id)).catch(() => null);
          const pick = (after?.strings?.choices || []).find(item => item.runId === response.result?.runId) || (after?.strings?.choices || [])[0];
          if (!pick) return {ok: false, error: 'oneclick-no-strings-source'};
          const selected = await Promise.resolve(bridge.selectStringsSource(track.id, {runId: pick.runId, cacheKey: pick.cacheKey})).catch(error => ({ok: false, error: String(error)}));
          if (!selected?.ok) return selected || {ok: false, error: 'request-failed'};
          await derived.refresh?.();
          return {ok: true, cached: Boolean(response.result?.cached)};
        },
        midi: async ({exclude, onStep, onResult}) => {
          const autoDirect = !storedOtherRoute && otherRoute === 'direct';
          if (autoDirect) {
            const saved = await derived.selectOtherRoute(track, 'direct', true);
            if (!saved.ok) return saved;
          }
          await derived.setModels(P.midiPicks(choice.choices));
          return derived.runBatch(track, {exclude, expectedOtherRoute: autoDirect ? 'direct' : storedOtherRoute, onStep: (index, total, step) => onStep(step), onResult});
        }
      };
    }

    async function runOne(track) {
      const {otherRoute, storedOtherRoute, steps, otherRouteError} = await planFor(track,choice.choices);
      // A missing model does not prevent a verified CPU-only upgrade. Keep every other
      // existing batch exclusion intact and recheck the actual inputs when the step runs.
      if (steps.some(step=>step.kind==='midi' && step.reason?.code==='engine-missing')) {
        const checks = await bridge.planOneClickCache(track.id,steps,{otherRoute,device:refinementDevice()});
        for (const step of steps) if (checks[step.id]?.state==='upgrade') {step.state='pending';step.reason=null;}
      }
      if (getTrack()?.id === track.id) previewRoute = otherRoute;
      view = {trackId: track.id, steps, otherRouteError, finished: Boolean(otherRouteError), title: track.title}; render();
      if (otherRouteError) return {ok: false, otherRouteError, steps};
      const outcome = await P.run({steps, ops: ops(track, otherRoute, storedOtherRoute), cancelled: () => Boolean(isCancelled()), onUpdate: () => render()});
      view.finished = true; render();
      return outcome;
    }
    const counts = steps => ({existing: steps.filter(s => s.state === 'existing').length, done: steps.filter(s => s.state === 'done').length, upgraded: steps.filter(s => s.state === 'upgraded').length,
      failed: steps.filter(s => s.state === 'failed').length, unavailable: steps.filter(s => s.state === 'unavailable').length});

    async function runTrack() {
      const track = getTrack();
      if (!track || running || savingRoute || isBusy()) return null;
      ++previewToken; running = 'track'; status = null; setBatch(true); render();
      let outcome;
      try {
        await loadEngines();
        onProgress?.({index: 1, total: 1});
        outcome = await runOne(track);
      } catch (error) { outcome = {ok: false, error: String(error), steps: view.steps}; }
      finally {
        running = null;
        const c = counts(view.steps);
        status = {done: outcome?.otherRouteError ? t('routeReadFailed', {error: outcome.otherRouteError}) : outcome?.cancelled ? t('trackCancelled', c) : outcome?.ok ? t('trackDone', c) : t('trackFailed', c)};
        if (c.upgraded) status.done += ' ' + t('upgradedCount',c);
        log?.(t('logTrack', {title: track.title, result: status.done}));
        previewKey = keyFor(track); setBatch(false); schedulePreview(); render();
      }
      return outcome;
    }

    async function runMoodOnly() {
      const track = getTrack();
      if (!track || track.id !== view.trackId || running || savingRoute || isBusy()) return null;
      ++previewToken; running='mood'; status=null;
      setBatch(true); onProgress?.({index:1,total:1});
      const step = view.steps.find(item=>item.kind==='mood');
      if (step) {step.state='running';step.reason=null;}
      render();
      let outcome;
      try { outcome=await runAnalysis('mood-curve',{track}); }
      catch (error) {outcome={ok:false,error:String(error)};}
      finally {
        running=null; previewKey=keyFor(getTrack()); setBatch(false);
        schedulePreview(true);
        if (track.id===getTrack()?.id) {
          const result = outcome?.ok ? (outcome.cached?'moodOnlyReused':'moodOnlyDone') : outcome?.error==='analysis-cancelled'?'moodOnlyCancelled':'moodOnlyFailed';
          status={done:t(result,{error:localizeError(outcome?.detail || outcome?.error || 'request-failed')})};
          render();
        }
      }
      return outcome;
    }

    // Every track of the album, one after another. A failing song does not stop the next; cancel stops the album.
    async function runAlbum() {
      const album = getAlbum();
      if (!album?.tracks?.length || running || savingRoute || isBusy()) return null;
      ++previewToken; running = 'album'; setBatch(true);
      const total = album.tracks.length, tally = {complete: 0, failed: 0, left: 0, total};
      let cancelled = false;
      status = {index: 0, total, title: ''}; render();
      log?.(t('logAlbumStart', {album: album.title || '', total}));
      try {
        await loadEngines();
        for (let index = 0; index < total; index++) {
          if (isCancelled()) { cancelled = true; break; }
          const track = album.tracks[index];
          status = {index: index + 1, total, title: track.title};
          onProgress?.({index: index + 1, total});
          render();
          let outcome;
          try { outcome = await runOne(track); } catch (error) { outcome = {ok: false, error: String(error)}; }
          if (outcome?.cancelled) { cancelled = true; break; }
          if (outcome?.ok) tally.complete += 1;
          else { tally.failed += 1; const bad = (view.steps || []).find(step => step.state === 'failed'); log?.(t('logTrackFailed', {title: track.title, step: bad ? stepName(bad) : '', why: outcome?.otherRouteError ? t('routeReadFailed', {error: outcome.otherRouteError}) : bad ? reasonText(bad.reason) : ''})); }
        }
      } finally {
        tally.left = total - tally.complete - tally.failed;
        running = null;
        const report = {done: t(cancelled ? 'albumCancelled' : 'albumDone', tally)};
        log?.(report.done);
        const restoreSelection = view.trackId !== getTrack()?.id;
        previewKey = keyFor(getTrack()); setBatch(false);
        if (restoreSelection) schedulePreview(true);
        status = report; render();
        if (albumButton) albumButton.textContent = rt('runtime.album.batchDefault');
      }
      return {...tally, cancelled};
    }

    $('oneclickTrack').addEventListener('click', runTrack);
    $('oneclickAlbum').addEventListener('click', runAlbum);
    $('oneclickChoices').addEventListener('toggle', render);
    $('refinementDevice')?.addEventListener('change', () => schedulePreview());
    new MutationObserver(render).observe(document.documentElement, {attributes: true, attributeFilter: ['lang']});
    loadEngines().then(() => { schedulePreview(true); render(); }).catch(() => {});
    render();
    // sync(): called by the app whenever busy state or the selected track may have changed.
    return {runTrack, runAlbum, render, refresh: (track,data) => schedulePreview(true,track?.id === getTrack()?.id ? data : null), sync: () => { schedulePreview(false); render(); }, snapshot: () => ({choice, view, running})};
  }
  root.XldOneClick = {create};
})(globalThis);
