(function(root) {
  'use strict';
  const tabs = ['overview', 'section', 'harmony', 'stems', 'midi'];
  const sections = ['msaf', 'msaf-sf', 'msaf-foote', 'msaf-cnmf', 'songformer'];
  const harmonies = ['chord-cqt', 'chord-cens', 'chord-hybrid', 'chord-btc'];

  // Partial long-song runs must remain visibly partial even when a result exists.
  function isPartial(result, duration) {
    if (!Array.isArray(result?.analyzedRanges)) return false;
    const total = Number(result.duration || duration);
    if (!(total > 0)) return true;
    const ranges = result.analyzedRanges.map(range => [Number(range[0]), Number(range[1])])
      .filter(([a,b]) => Number.isFinite(a) && Number.isFinite(b) && b > a).sort((a,b) => a[0]-b[0]);
    let end = 0;
    for (const [a,b] of ranges) { if (a > end + 1.25) return true; end = Math.max(end,b); }
    return end < total - 1.25;
  }

  function create({getState, getDerived, audio, rt, setActiveLab, setDerivedView, selectAlbum, refresh}) {
    const $ = id => document.getElementById(id);
    const copy = (key,params) => rt('runtime.workspace.'+key,params);
    const content = $('workspaceContent');
    let active = 'overview', level = 'albums', refreshing = false, refreshErrorTrack = null;
    const scrollPositions = {};
    const cards = new Map();
    for (const key of tabs.slice(1)) {
      const card = document.createElement('button');
      card.type = 'button'; card.className = 'workspace-result'; card.dataset.workspaceGo = key;
      const top = document.createElement('span'); top.className = 'workspace-result-top';
      const title = document.createElement('strong'), status = document.createElement('span');
      top.append(title,status);
      const detail = document.createElement('span'); detail.className = 'workspace-result-detail';
      const action = document.createElement('span'); action.className = 'workspace-result-action';
      card.append(top,detail,action); $('workspaceResults').append(card);
      cards.set(key,{card,title,status,detail,action});
    }
    function show(next) {
      if (!tabs.includes(next)) return;
      scrollPositions[active] = content.scrollTop;
      active = next;
      $('workspaceOverview').hidden = active !== 'overview';
      $('workspaceLab').hidden = !['section','harmony'].includes(active);
      $('workspaceDerived').hidden = !['stems','midi'].includes(active);
      document.querySelector('.derived-wav-block').hidden = active !== 'stems';
      document.querySelector('.derived-midi-block').hidden = active !== 'midi';
      if (['section','harmony'].includes(active)) {
        if (getState().activeLab !== active) setActiveLab(active);
      }
      else if (['stems','midi'].includes(active)) setDerivedView(active);
      for (const button of document.querySelectorAll('[data-workspace-tab]')) {
        const selected = button.dataset.workspaceTab === active;
        button.classList.toggle('active',selected);
        button.setAttribute('aria-selected',String(selected)); button.tabIndex = selected ? 0 : -1;
      }
      content.setAttribute('aria-labelledby','workspace-tab-'+active);
      content.dataset.view = active;
      content.scrollTop = scrollPositions[active] || 0;
      render();
    }
    function showLibrary(next) {
      level = next === 'tracks' ? 'tracks' : 'albums';
      document.querySelector('.library-panel').hidden = level !== 'albums';
      document.querySelector('.album-stage').hidden = level !== 'tracks';
      for (const button of document.querySelectorAll('[data-library-level]')) {
        button.setAttribute('aria-pressed',String(button.dataset.libraryLevel === level));
      }
    }
    function labSummary(state, ids) {
      const results = ids.map(id=>state.analysisResults.get(id)).filter(Boolean);
      const partial = results.filter(result=>isPartial(result,state.selectedTrack?.duration)).length;
      return {
        ready:results.length>0,
        status: state.analysisLoading ? copy('loading') : results.length ? copy('resultsCount',{count:results.length}) : copy('notAnalyzed'),
        detail: results.length ? results.map(result=>typeof result.engine==='object'?result.engine.name || result.engine.id:result.engine).join(' · ')
          + (partial ? ' · '+copy('partialCount',{count:partial}):'') : copy('labEmpty'),
        partial
      };
    }
    function render() {
      const state = getState(), selected = state.selectedTrack;
      const snapshot = getDerived(), derived = snapshot.trackId === selected?.id ? snapshot.result : null;
      for (const element of document.querySelectorAll('[data-workspace-copy]')) element.textContent = copy(element.dataset.workspaceCopy);
      document.querySelector('.workspace-tabs').setAttribute('aria-label',copy('workbench'));
      document.querySelector('.workspace-library-nav').setAttribute('aria-label',copy('library'));
      $('workspaceRefresh').disabled = !selected || refreshing;
      if (refreshing) $('workspaceRefresh').textContent = copy('loading');
      $('workspaceLocate').disabled = !selected;
      $('workspaceModelSummary').textContent = copy('model',{name:state.engines.find(engine=>engine.id===state.selectedEngine)?.name || '—'});
      $('workspaceOverviewHint').textContent = selected ? copy('overviewHint',{count:state.annotations.length}) : copy('choose');
      if (selected && refreshErrorTrack === selected.id) $('workspaceOverviewHint').textContent = copy('readFailed');
      const album = state.library?.albums?.find(album=>album.tracks.some(track=>track.id===selected?.id));
      const cover = $('workspaceCover');
      if (cover.getAttribute('src') !== album?.coverUrl) {
        if (album?.coverUrl) cover.src = album.coverUrl; else cover.removeAttribute('src');
      }
      cover.hidden = !album?.coverUrl;
      $('workspaceCoverFallback').hidden = Boolean(album?.coverUrl);
      const summaries = {section:labSummary(state,sections),harmony:labSummary(state,harmonies)};
      const midi = [...new Set([...Object.keys(derived?.midi || {}),...Object.keys(derived?.variants || {})])].filter(stem => derived?.midi?.[stem]?.ok || Object.values(derived?.variants?.[stem] || {}).some(item=>item?.ok));
      summaries.stems = {
        ready: Boolean(derived?.ok),
        status: !derived ? copy('loading') : derived.ok ? copy('wavCount',{count:derived.stems.length}) : copy(derived.error==='stems-stale'?'stale':derived.error==='read-failed'?'readFailed':'notGenerated'),
        detail: derived?.ok ? `${derived.engine === 'bs-roformer-sw' ? 'BS-RoFormer SW' : derived.engine === 'demucs-6s' ? 'Demucs 6s' : derived.engine} · ${derived.stems.map(item=>item.name).join(' / ')}` : copy('stemsHint')
      };
      summaries.midi = {
        ready: midi.length>0,
        status: !derived ? copy('loading') : midi.length ? copy('midiCount',{count:midi.length}) : copy('notGenerated'),
        detail: midi.length ? midi.join(' / ')+' · '+copy('midiHint') : copy('midiEmpty')
      };
      for (const [key,elements] of cards) {
        const summary = summaries[key];
        elements.title.textContent = copy(key);
        elements.status.textContent = selected ? summary.status : copy('noTrack');
        elements.detail.textContent = summary.detail;
        elements.action.textContent = copy(summary.ready ? 'viewResult':'enter')+' →';
        elements.card.dataset.ready = String(Boolean(selected && summary.ready));
        elements.card.disabled = !selected;
        const task = state.activeTask;
        const ids = key==='section'?sections:key==='harmony'?harmonies:key==='stems'?['demucs-6s','bs-roformer-sw']:['muscriptor-medium','muscriptor-large','strings-muscriptor-medium','strings-muscriptor-large','drums-muscriptor-medium','drums-muscriptor-large','yourmt3-plus','drums-adtof','basic-pitch','guitar-gaps','piano-highres','bass-highres'];
        if (task && selected && task.trackId===selected.id && ids.includes(task.engine)) elements.status.textContent = copy('running')+' '+Math.round((task.progress||0)*100)+'%';
      }
      $('workspaceMidiEmpty').hidden = Boolean(derived?.ok || derived?.strings?.active);
      $('derivedHeading').textContent = copy(active === 'midi' ? 'midiTitle':'stemsTitle');
      $('workspacePlaybackState').textContent = copy(state.currentTrack ? audio.paused ? 'paused':'playing' : 'player');
    }
    for (const button of document.querySelectorAll('[data-workspace-tab]')) {
      button.addEventListener('click',()=>show(button.dataset.workspaceTab));
      button.addEventListener('keydown',event=>{
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        event.preventDefault();
        const i=tabs.indexOf(active);
        const next=event.key==='Home'?tabs[0]:event.key==='End'?tabs.at(-1):tabs[(i+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length];
        show(next); $('workspace-tab-'+next).focus();
      });
    }
    for (const button of document.querySelectorAll('[data-workspace-go]')) button.addEventListener('click',()=>{show(button.dataset.workspaceGo); $('workspace-tab-'+active).focus();});
    for (const button of document.querySelectorAll('[data-library-level]')) button.addEventListener('click',()=>showLibrary(button.dataset.libraryLevel));
    $('workspaceLocate').addEventListener('click',()=>{
      const state=getState(), album=state.library?.albums?.find(album=>album.tracks.some(track=>track.id===state.selectedTrack?.id));
      if (album) {selectAlbum(album);showLibrary('tracks');document.querySelector('.track-row.selected')?.scrollIntoView({block:'nearest'});}
    });
    $('workspaceRefresh').addEventListener('click',async()=>{
      if (refreshing || !getState().selectedTrack) return;
      const trackId = getState().selectedTrack.id;
      refreshing=true;refreshErrorTrack=null;render();
      try {await refresh();} catch (_) {refreshErrorTrack=trackId;}
      finally {refreshing=false;render();}
    });
    $('workspaceDismissTask').addEventListener('click',()=>{
      if (!getState().activeTask && !getState().batchRunning) $('taskCard').classList.add('hidden');
    });
    audio.addEventListener('play',render); audio.addEventListener('pause',render);
    document.addEventListener('keydown',event=>{if(event.key==='Escape')document.querySelector('.workspace-settings').open=false;});
    showLibrary('albums'); render();
    return {show,showLibrary,render};
  }
  const api = {create,isPartial};
  if (typeof module==='object' && module.exports) module.exports=api;
  root.XldWorkspaceControls=api;
})(globalThis);
