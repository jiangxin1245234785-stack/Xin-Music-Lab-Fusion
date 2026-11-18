// The regular and compact album views share the player's live controls. Bookmarks
// return each node to the original shell when the score scene is left.
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const stage = document.querySelector('.stage');
  const setting = byId('scoreAlbumLayout');
  if (!stage || !setting) return;

  const sidebar = byId('scoreSidebar');
  const compact = byId('scoreCompactTransport');
  const compactLyrics = byId('scoreCompactLyrics');
  const dock = byId('scoreSceneDock');
  const art = byId('scoreSidebarArt');
  const record = byId('scoreSidebarRecord');
  const controls = byId('scoreTransportControls');
  const cover = byId('fusionCover');
  const title = byId('fusionTrack'), artist = byId('fusionArtist'), album = byId('fusionAlbum');
  const credits = byId('scoreSidebarCredits');
  const seek = byId('fusionSeek'), audio = byId('fusionAudio');
  const show = byId('scoreSidebarShow');
  const hide = byId('scoreSidebarHide');
  const key = 'xin-score-album-layout';
  const collapsedKey = 'xin-score-album-collapsed';
  function read(name, fallback) {
    try {
      const value = localStorage.getItem(name);
      return value === null ? fallback : value === 'on';
    } catch (_) { return fallback; }
  }
  function save(name, value) {
    try { localStorage.setItem(name, value ? 'on' : 'off'); } catch (_) { /* use this window's preference */ }
  }
  setting.checked = read(key, true);
  let collapsed = read(collapsedKey, false);
  let current = '', hidden = false;
  const previousAttributes = new Map();
  const artistFallbacks = new Set(['', '—', 'unknown artist', '未知艺术家']);
  const albumFallbacks = new Set(['', '—', 'no track loaded', 'local library', '本地曲库']);
  function updateMetadata() {
    if (current !== 'compact' && current !== 'expanded') {
      for (const [element, original] of previousAttributes) {
        element.hidden = original.hidden;
        if (original.title === null) element.removeAttribute('title');
        else element.title = original.title;
      }
      previousAttributes.clear();
      return;
    }
    for (const element of [title, artist, album]) {
      if (!previousAttributes.has(element)) previousAttributes.set(element, {hidden:element.hidden, title:element.getAttribute('title')});
      element.title = element.textContent.trim();
    }
    artist.hidden = artistFallbacks.has(artist.title.toLowerCase());
    album.hidden = albumFallbacks.has(album.title.toLowerCase());
    const labels = [artist, album].filter(el => !el.hidden).map(el => el.title);
    credits.hidden = !labels.length;
    credits.title = labels.join(' · ');
  }
  // The media element already publishes progress even when the score is paused or sought.
  function updateProgress(event) {
    if (current !== 'compact' && current !== 'expanded') return;
    const input = event?.type === 'input' || seek.matches(':active');
    const duration = input ? Number(seek.max) : audio.duration;
    const time = input ? Number(seek.value) : audio.currentTime;
    const reset = event?.type === 'emptied' || event?.type === 'loadstart';
    const fraction = !reset && Number.isFinite(duration) && duration > 0 ? Math.max(0, Math.min(1, time / duration)) : 0;
    seek.style.setProperty('--score-progress', Number((fraction * 100).toFixed(3)) + '%');
  }

  const slots = [
    [cover, art],
    [byId('fusionTrack'), byId('scoreSidebarTitle')],
    [byId('fusionArtist'), byId('scoreSidebarCredits')],
    [byId('fusionAlbum'), byId('scoreSidebarCredits')],
    [byId('fusionTime'), byId('scoreProgress')],
    [byId('fusionSeek'), byId('scoreProgress')],
    [byId('fusionDuration'), byId('scoreProgress')],
    [document.querySelector('.xl-transport__keys'), byId('scoreTransportKeys')],
    [document.querySelector('.xl-listen'), byId('scoreTransportTools')],
    [byId('immersiveButton'), byId('scoreTransportTools')],
    [document.querySelector('.visual-catalog'), dock]
  ].map(([node, to]) => {
    const origin = document.createComment('album view');
    node.before(origin);
    return {node, to, origin};
  });

  function apply() {
    const active = setting.checked && stage.dataset.effect === 'score';
    const next = active ? (collapsed ? 'compact' : 'expanded') : 'off';
    const uiHidden = stage.classList.contains('ui-hidden') || stage.classList.contains('is-immersive');
    if (next === current && uiHidden === hidden) return;
    const changed = next !== current;
    if (changed) {
      const wasActive = current === 'expanded' || current === 'compact';
      if (active !== wasActive) {
        for (const {node, to, origin} of slots) {
          if (active) to.append(node);
          else origin.after(node);
        }
      }
      if (next === 'compact') {
        compact.append(record, controls);
      } else {
        byId('scoreSidebarLyrics').before(record);
        sidebar.append(controls);
      }
      stage.classList.toggle('score-layout-active', active);
      stage.classList.toggle('score-layout-collapsed', next === 'compact');
      for (const button of [show, hide]) button.setAttribute('aria-expanded', String(next === 'expanded'));
    }
    current = next;
    hidden = uiHidden;
    if (changed) {
      updateMetadata();
      if (active) updateProgress();
      else seek.style.removeProperty('--score-progress');
    }
    sidebar.hidden = next !== 'expanded' || uiHidden;
    compact.hidden = next !== 'compact' || uiHidden;
    dock.hidden = !active || uiHidden;
    compactLyrics.hidden = !active || (next !== 'compact' && !uiHidden);
    stage.dispatchEvent(new Event('scorelayoutchange'));
  }
  function fold(value) {
    collapsed = value;
    save(collapsedKey, value);
    apply();
    (value ? show : hide).focus({preventScroll:true});
  }
  show.addEventListener('click', () => fold(false));
  hide.addEventListener('click', () => fold(true));
  setting.addEventListener('change', () => { save(key, setting.checked); apply(); });
  stage.addEventListener('scorevisibilitychange', apply);
  const stageObserver = new MutationObserver(apply);
  stageObserver.observe(stage, {attributes:true, attributeFilter:['data-effect', 'class']});

  // A missing or broken jacket leaves the artist and album visible without an empty frame.
  function updateArt() {
    art.hidden = !cover.getAttribute('src') || !cover.complete || !cover.naturalWidth;
  }
  const coverObserver = new MutationObserver(updateArt);
  coverObserver.observe(cover, {attributes:true, attributeFilter:['src']});
  cover.addEventListener('load', updateArt);
  cover.addEventListener('error', updateArt);
  updateArt();
  const metadataObserver = new MutationObserver(updateMetadata);
  for (const element of [title, artist, album]) metadataObserver.observe(element, {childList:true,characterData:true,subtree:true});
  for (const event of ['timeupdate','seeking','seeked','loadedmetadata','durationchange','emptied','loadstart']) audio.addEventListener(event, updateProgress);
  seek.addEventListener('input', updateProgress);
  const expansionObserver = new MutationObserver(mutations => {
    for (const {target} of mutations) {
      const proxy = nav.get(target);
      if (proxy) proxy.setAttribute('aria-expanded', target.getAttribute('aria-expanded') || 'false');
    }
  });
  const nav = new Map([
    [byId('xlHome'), byId('scoreSidebarHome')],
    [byId('fusionButton'), byId('scoreSidebarLibrary')]
  ]);
  for (const [original, proxy] of nav) {
    proxy.setAttribute('aria-expanded', original.getAttribute('aria-expanded') || 'false');
    proxy.addEventListener('click', () => original.click());
    expansionObserver.observe(original, {attributes:true, attributeFilter:['aria-expanded']});
  }
  apply();
  window.addEventListener('beforeunload', () => {
    stageObserver.disconnect();
    coverObserver.disconnect();
    metadataObserver.disconnect();
    expansionObserver.disconnect();
  }, {once:true});
})();
