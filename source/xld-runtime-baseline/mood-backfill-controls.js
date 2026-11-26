(function(root) {
  'use strict';
  function create({bridge, rt, getAlbum, isBusy, onBatch, onFinished, localizeError}) {
    const byId = id => document.getElementById('moodBackfill' + id);
    const album = byId('Album'), library = byId('Library'), stop = byId('Stop');
    const t = (key, params) => rt('runtime.backfill.' + key, params);
    let status = null, pending = false, ownsBatch = false, startError = '';
    function render() {
      byId('Title').textContent = t('title');
      byId('Hint').textContent = t('hint');
      album.textContent = getAlbum()?.title ? t('albumTarget', {album: getAlbum().title}) : t('album');
      library.textContent = t('library');
      stop.textContent = t('stop');
      const busy = pending || status?.running || isBusy();
      album.disabled = Boolean(busy || !getAlbum()?.tracks?.length);
      library.disabled = Boolean(busy);
      stop.hidden = !status?.running;
      stop.disabled = Boolean(status?.stopping);
      const lines = [];
      if (startError) lines.push(localizeError(startError));
      if (status) {
        const stage = status.running
          ? status.stopping ? 'stopping' : status.index ? 'working' : 'scanning'
          : status.cancelled ? 'cancelled' : status.error ? 'interrupted' : 'done';
        const target = status.album ? t('albumTarget', {album: status.album}) : t(status.scope);
        lines.push(target + ' · ' + t(stage, status));
        if (status.index || !status.running) lines.push(t('counts', status));
        if (status.error) lines.push(localizeError(status.error));
        if (status.holder) lines.push([status.holder.program, status.holder.song, status.holder.task].filter(Boolean).join(' · '));
      }
      byId('Status').textContent = lines.join(' · ');
      const issues = byId('Issues');
      issues.hidden = !status?.issues?.length;
      if (!issues.hidden) {
        byId('IssuesTitle').textContent = t('issues', {count: status.issues.length});
        const list = byId('IssueList');
        const language = t('title');
        if (list.dataset.revision !== String(status.revision) || list.langKey !== language) {
          list.dataset.revision = String(status.revision);
          list.langKey = language;
          list.replaceChildren(...status.issues.map(issue => {
            const row = document.createElement('li');
            row.textContent = issue.title + ' · ' + localizeError(issue.error);
            return row;
          }));
        }
      }
    }
    function accept(next) {
      if (!next || next.revision <= (status?.revision || 0)) return;
      const wasRunning = ownsBatch;
      const previousIndex = status?.index;
      status = next;
      if (status.running) {
        pending = false;
        ownsBatch = true;
        if (!wasRunning || previousIndex !== status.index) onBatch(true, status.index, status.total);
      } else if (wasRunning) {
        ownsBatch = false;
        onBatch(false, 0, 0);
        onFinished();
      }
      render();
    }
    async function start(scope) {
      if (pending || status?.running || isBusy()) return;
      const albumId = getAlbum()?.id;
      if (scope === 'album' && !albumId) return;
      pending = true;
      startError = '';
      render();
      try {
        const response = await bridge.runMoodBackfill(scope, albumId);
        if (response.status) accept(response.status);
        else if (!response.ok) startError = response.error;
      } catch (error) { startError = error.message; }
      finally { pending = false; render(); }
    }
    async function cancel() {
      try { await bridge.stopMoodBackfill(); }
      catch (error) { startError = error.message; render(); }
    }
    album.addEventListener('click', () => start('album'));
    library.addEventListener('click', () => start('library'));
    stop.addEventListener('click', cancel);
    bridge.onMoodBackfill?.(accept);
    bridge.getMoodBackfill?.().then(accept).catch(error => { startError = error.message; render(); });
    render();
    return {render, cancel, running: () => ownsBatch};
  }
  root.XldMoodBackfill = {create};
})(globalThis);
