(function(root) {
  'use strict';
  // Every stored section and chord result in the library, worst first, so a batch of bad segmentations can be
  // looked through and thrown away in one pass instead of one track at a time.
  //
  // The row has to carry the thing being judged, not a path and a date: a storage row cannot tell a noisy
  // segmentation from a clean one. So each row draws the segmentation itself and states the number that actually
  // separates them — segments shorter than two seconds. Measured over the real library: MSAF has a median of 3 of
  // those and goes up to 12, SongFormer has a median of 0 and never exceeds 2, and every result with three or more
  // is MSAF. Sorting by it puts what you came to delete at the top.
  function create({bridge, rt, getBusy, onChanged, localizeError = value => value}) {
    const dialog = document.getElementById('resultSweepDialog');
    const open = document.getElementById('resultSweepButton');
    const close = document.getElementById('resultSweepClose');
    const filter = document.getElementById('resultSweepFilter');
    const refresh = document.getElementById('resultSweepRefresh');
    const rowsHost = document.getElementById('resultSweepRows');
    const status = document.getElementById('resultSweepStatus');
    const summary = document.getElementById('resultSweepSummary');
    const selectedLabel = document.getElementById('resultSweepSelected');
    const clear = document.getElementById('resultSweepClear');
    if (!dialog || !open) return null;

    let rows = [], warnings = [], loading = false, message = null, pending = false;
    // Opens on sections: that is what the list was built to clean up, and a chord result's short spans are not a
    // defect, so mixing both kinds by default would bury the thing being looked for.
    let want = 'section';
    const chosen = new Set();
    // Track ids are hex and engine ids never contain a slash, so this needs no escaping at all — an earlier
    // attempt at a separator put a literal NUL byte into the source three times running.
    const key = row => row.trackId + '/' + row.engine;
    const text = (id, params) => rt('runtime.sweep.' + id, params);
    const seconds = value => (value == null ? '—' : (value < 10 ? value.toFixed(2) : Math.round(value)) + 's');

    function visible() {
      return rows.filter(row => want === 'all' ? true : want === 'section' || want === 'harmony' ? row.kind === want : row.engine === want);
    }

    // The segmentation drawn to scale, so the eye catches a cluster of slivers before the numbers are read.
    function bar(row) {
      const host = document.createElement('div');
      host.className = 'sweep-bar';
      if (!row.duration || !Array.isArray(row.spans) || !row.spans.length) return host;
      const total = row.duration;
      for (const [index, span] of (row.spans || []).entries()) {
        const piece = document.createElement('span');
        const length = Math.max(0, span[1] - span[0]);
        piece.style.width = (100 * length / total) + '%';
        piece.className = 'sweep-piece' + (length < (row.fragmentSeconds || 2) ? ' fragment' : '');
        piece.title = seconds(length);
        host.append(piece);
        void index;
      }
      return host;
    }

    function render() {
      const busy = Boolean(getBusy?.()) || pending;
      document.getElementById('resultSweepTitle').textContent = text('title');
      open.textContent = text('open');
      open.disabled = busy;
      refresh.textContent = text('refresh');
      close.textContent = text('close');
      clear.textContent = text('clear');
      // Options come from what is actually stored, so the engine the owner came to clear is one click away.
      want = filter.value || want;
      const options = [['all', text('filter.all')], ['section', text('filter.section')], ['harmony', text('filter.harmony')],
        ...[...new Set(rows.map(row => row.engine))].sort().map(engine => [engine, engine])];
      if (options.map(([value]) => value).join() !== [...filter.options].map(option => option.value).join()) {
        filter.replaceChildren();
        for (const [value, label] of options) filter.add(new Option(label, value));
      }
      filter.value = options.some(([value]) => value === want) ? want : 'all';
      want = filter.value;
      filter.disabled = busy;
      const list = visible();
      summary.textContent = loading ? text('loading')
        : text('summary', {count: list.length, total: rows.length, fragments: list.filter(row => (row.fragments || 0) > 0).length});
      status.textContent = message || (warnings.length ? text('warnings', {count: warnings.length}) : '');
      rowsHost.replaceChildren();
      for (const row of list) {
        const node = document.createElement('div');
        node.className = 'sweep-row' + (chosen.has(key(row)) ? ' chosen' : '');
        node.dataset.trackId = row.trackId;
        node.dataset.engine = row.engine;
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = chosen.has(key(row));
        box.disabled = busy;
        box.addEventListener('change', () => {
          if (box.checked) chosen.add(key(row)); else chosen.delete(key(row));
          render();
        });
        const copy = document.createElement('div');
        copy.className = 'sweep-copy';
        const title = document.createElement('strong');
        title.textContent = row.title;
        const meta = document.createElement('span');
        meta.className = 'sweep-meta';
        meta.textContent = row.state !== 'complete' ? text('state.' + row.state)
          : row.unreadable ? text('unreadable')
            : text('meta', {engine: row.engine, segments: row.segments ?? 0, fragments: row.fragments ?? 0, shortest: seconds(row.shortest)});
        const engine = document.createElement('span');
        engine.className = 'model-engine-name';
        engine.textContent = row.engine;
        copy.append(title, engine, meta);
        if (row.state === 'complete' && !row.unreadable) copy.append(bar(row));
        node.append(box, copy);
        rowsHost.append(node);
      }
      if (!list.length && !loading) rowsHost.append(Object.assign(document.createElement('p'), {className: 'derived-hint', textContent: text('none')}));
      selectedLabel.textContent = text('selected', {count: chosen.size});
      clear.disabled = busy || !chosen.size;
    }

    async function load() {
      loading = true; message = null; render();
      let response;
      try { response = await bridge.sweepResults(null); } catch (error) { response = {ok: false, error: String(error)}; }
      loading = false;
      if (response?.ok) {
        rows = response.rows || [];
        warnings = response.warnings || [];
        // Drop selections for rows that are no longer there rather than deleting something that moved.
        const present = new Set(rows.map(key));
        for (const value of [...chosen]) if (!present.has(value)) chosen.delete(value);
      } else {
        rows = []; warnings = [];
        message = text('failed', {error: localizeError(response?.error || 'request-failed')});
      }
      render();
    }

    async function remove() {
      if (pending || !chosen.size) return;
      const list = visible().filter(row => chosen.has(key(row)));
      if (!list.length) return;
      // The confirmation names the scale and says what is NOT being touched, because at sixty files the thing a
      // person needs to know is the size of the blast and that it is reversible.
      if (!confirm(text('confirm', {count: list.length, tracks: new Set(list.map(row => row.trackId)).size}))) return;
      pending = true; message = null; render();
      let response;
      try { response = await bridge.deleteResults(list.map(row => ({trackId: row.trackId, engine: row.engine}))); }
      catch (error) { response = {ok: false, error: String(error)}; }
      pending = false;
      if (response?.error && !response.deleted) message = text('failed', {error: localizeError(response.error)});
      else message = response?.ok ? text('done', {count: response.deleted.length})
        : text('partial', {count: response?.deleted?.length || 0, failed: response?.failed?.length || 0});
      chosen.clear();
      await load();
      if (response?.deleted?.length) onChanged?.();
    }

    open.addEventListener('click', async () => { dialog.showModal(); render(); await load(); });
    close.addEventListener('click', () => dialog.close());
    refresh.addEventListener('click', () => load());
    filter.addEventListener('change', () => render());
    clear.addEventListener('click', () => remove());
    render();
    return {render, load, snapshot: () => ({rows: rows.length, chosen: chosen.size, warnings: warnings.length})};
  }
  root.XldResultSweepControls = {create};
})(globalThis);
