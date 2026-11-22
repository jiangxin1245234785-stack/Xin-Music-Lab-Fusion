// "Export video": the score of the current song as an MP4 to give to someone (source/scoreview/export).
// Each resolution, each with a rough size; then the system's save dialog; then one progress line with a
// cancel, and at the end where the file went with a button to open its folder. While it runs the
// score scene stops drawing (the export needs the GPU); the music keeps playing.
(function (root) {
  'use strict';
  const doc = root.document, bridge = root.XinsMusicLabFusion;
  const open = doc.getElementById('scoreExportOpen');
  if (!open || !bridge?.scoreExport) return;
  const choices = doc.getElementById('scoreExportChoices'), status = doc.getElementById('scoreExportStatus');
  const meter = doc.getElementById('scoreExportProgress'), cancel = doc.getElementById('scoreExportCancel');
  const reveal = doc.getElementById('scoreExportReveal'), audio = doc.getElementById('fusionAudio');
  const sizes = {'2160p': doc.getElementById('scoreExport2160Size'), '1080p': doc.getElementById('scoreExport1080Size'), '720p': doc.getElementById('scoreExport720Size')};
  const buttons = Array.from(choices.querySelectorAll('button[data-tier]'));
  const bitrate = doc.getElementById('scoreExportBitrate'), custom = doc.getElementById('scoreExportCustomBitrate');
  const customRow = doc.getElementById('scoreExportCustomRow'), bitrateError = doc.getElementById('scoreExportBitrateError');
  const i18n = root.XinMusicLabDynamicUi, say = (key, fallback, params = {}) => i18n?.t(key, params, fallback) || fallback;
  const tierRates = {'2160p': {video: 32000000, audio: 192000}, '1080p': {video: 1650000, audio: 128000}, '720p': {video: 200000, audio: 96000}};
  const modes = ['auto', '1', '2', '4', '8', '16', '32', 'custom'];
  const rateKey = 'xin-score-export-bitrate', customKey = 'xin-score-export-custom-mbps';
  let working = false, cancelling = false, step = null, saved = null, failure = null;

  function customRate(text) {
    const value = String(text ?? '').trim();
    if (!/^(?:\d+(?:\.\d{0,3})?|\.\d{1,3})$/.test(value)) return null;
    const bps = Math.round(Number(value) * 1000000);
    return bps >= 50000 && bps <= 32000000 ? bps : null;
  }
  function selectedRate() {
    const mode = bitrate?.value || 'auto';
    if (mode === 'auto') return undefined;
    if (mode === 'custom') return customRate(custom.value);
    return modes.includes(mode) ? Number(mode) * 1000000 : null;
  }
  if (bitrate && custom) {
    try {
      const mode = root.localStorage.getItem(rateKey), value = root.localStorage.getItem(customKey);
      if (modes.includes(mode)) bitrate.value = mode;
      if (customRate(value) !== null) custom.value = value;
    } catch (_) {}
    bitrate.addEventListener('change', () => {
      try { root.localStorage.setItem(rateKey, bitrate.value); } catch (_) {}
      render();
    });
    custom.addEventListener('input', () => {
      if (customRate(custom.value) !== null) {
        try { root.localStorage.setItem(customKey, custom.value.trim()); } catch (_) {}
      }
      render();
    });
  }

  const scene = () => root.XinScoreSceneView?.status?.() || null;
  const ready = () => { const s = scene(); return Boolean(s && s.active && s.status === 'ready' && s.trackId); };
  const clock = seconds => {
    const s = Math.max(1, Math.round(seconds));
    return s < 60 ? say('export.seconds', '{s} 秒', {s}) : say('export.minutes', '{m} 分 {s} 秒', {m: Math.floor(s / 60), s: s % 60});
  };

  function render() {
    const usable = ready();
    open.disabled = working || !usable;
    open.title = usable ? '' : say('export.unavailable', '在谱面场景里、歌有谱面时才能导出。');
    if (!usable && !working) choices.hidden = true;
    const videoBitrate = selectedRate(), invalid = videoBitrate === null;
    if (customRow) customRow.hidden = bitrate.value !== 'custom';
    if (custom) custom.setAttribute('aria-invalid', String(invalid));
    if (bitrateError) {
      bitrateError.hidden = !invalid;
      bitrateError.textContent = invalid ? say('export.bitrateInvalid', '请输入 0.05–32 Mbps，最多三位小数。') : '';
    }
    for (const button of buttons) button.disabled = invalid || working || !usable;
    for (const [tier, node] of Object.entries(sizes)) {
      const rates = tierRates[tier];
      const mb = (audio?.duration || 0) * ((videoBitrate ?? rates.video) + rates.audio) / 8000000;
      const approximate = Number(mb.toFixed(mb < 1 ? 2 : mb < 10 ? 1 : 0));
      const text = !invalid && Number.isFinite(mb) && mb > 0 ? say('export.size', '约 {mb} MB', {mb: approximate}) : '';
      if (node && node.textContent !== text) node.textContent = text;
    }
    cancel.hidden = !working;
    cancel.disabled = cancelling;
    meter.hidden = !working;
    reveal.hidden = working || !saved;
    let text = '';
    if (working) {
      const fraction = step && step.total ? (step.stage === 'video' ? 0.02 + 0.97 * step.done / step.total : step.stage === 'write' ? 0.99 : 0.01) : 0;
      meter.value = Math.round(fraction * 100);
      text = cancelling ? say('export.cancelling', '正在取消…') : say('export.working', '正在导出 · {pct}%', {pct: Math.round(fraction * 100)});
      if (!cancelling && fraction > 0.05 && step.elapsed > 2) text += say('export.left', ' · 还剩约 {time}', {time: clock(step.elapsed * (1 - fraction) / fraction)});
    } else if (saved) text = say('export.saved', '已存到 {file}', {file: saved});
    else if (failure) text = failure;
    status.hidden = !text;
    if (status.textContent !== text) status.textContent = text;
  }

  open.addEventListener('click', () => { if (!open.disabled) { choices.hidden = !choices.hidden; saved = null; failure = null; render(); } });
  for (const button of buttons) {
    button.addEventListener('click', async () => {
      const videoBitrate = selectedRate();
      if (working || !ready() || videoBitrate === null) return;
      const s = scene(), tier = button.dataset.tier;
      choices.hidden = true;
      saved = null; failure = null; step = null; cancelling = false;
      working = true;
      root.XinScoreSceneView?.hold?.(true);
      render();
      let result;
      try {
        const exportLyrics = root.XinScoreLyricsView?.exportData ? await root.XinScoreLyricsView.exportData(s.trackId) : null;
        result = await bridge.scoreExport({
          trackId: s.trackId, tier, fxPreset: s.fxPreset, fxDynamics: s.fxDynamics,
          presentationLook: s.presentationLook, lyrics: exportLyrics,
          ...(videoBitrate === undefined ? {} : {videoBitrate}),
          shapes: s.shapes === true, meteorMotion: s.meteorMotion === true,
          ...(s.meteorMotion && s.transientTiming ? {transientTiming:s.transientTiming} : {}),
          mergeTimbres: s.reading?.mergeTimbres, simplify: s.reading?.simplify,
          useDynamics: root.XinScoreDynamicsControls?.enabled?.() === true,
          localBarTrial: doc.getElementById('trialLocalBars')?.checked === true, lang: doc.documentElement.lang || undefined
        });
      } catch (error) {
        result = {ok: false, message: say('export.failed', '导出失败，没有留下文件。')};
      }
      working = false;
      root.XinScoreSceneView?.hold?.(false);
      if (result?.ok) saved = result.file;
      else if (result?.error !== 'not-chosen') failure = result?.message || say('export.failed', '导出失败，没有留下文件。');
      render();
    });
  }
  cancel.addEventListener('click', async () => {
    if (!working || cancelling) return;
    cancelling = true;
    render();
    try { await bridge.cancelScoreExport(); } catch (_) {}
  });
  reveal.addEventListener('click', () => { if (saved) bridge.revealScoreExport(saved).catch(() => {}); });

  const unsubscribe = bridge.onScoreExportProgress?.(next => { step = next; render(); });
  const unsubscribeLocale = i18n?.subscribe?.(render);
  for (const name of ['xin-score-ready', 'xin-score-track']) root.addEventListener(name, () => root.setTimeout(render, 0));
  const stage = doc.querySelector('.stage');
  if (stage) new root.MutationObserver(render).observe(stage, {attributes: true, attributeFilter: ['data-effect']});
  audio?.addEventListener('loadedmetadata', render);
  root.addEventListener('beforeunload', () => { unsubscribe?.(); unsubscribeLocale?.(); }, {once: true});
  root.XinScoreExportControls = Object.freeze({status: () => ({working, cancelling, step, saved, failure, usable: ready()})});
  render();
})(globalThis);
