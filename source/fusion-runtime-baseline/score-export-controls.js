// "Export video": the score of the current song as an MP4 to give to someone (source/scoreview/export).
// Two sizes, each with a rough size; then the system's save dialog; then one progress line with a
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
  const sizes = {'1080p': doc.getElementById('scoreExport1080Size'), '720p': doc.getElementById('scoreExport720Size')};
  const i18n = root.XinMusicLabDynamicUi, say = (key, fallback, params = {}) => i18n?.t(key, params, fallback) || fallback;
  // Megabytes (MiB) a minute, as measured on a song with a busy cover (MEGURI: 4.45 and 2.31); a plainer song
  // comes out smaller. tests/score-export-wiring.cjs holds the estimate within 10 % of MEGURI's real files.
  const PER_MINUTE = {'1080p': 4.5, '720p': 2.3};
  let working = false, cancelling = false, step = null, saved = null, failure = null;

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
    const minutes = audio && audio.duration > 0 ? audio.duration / 60 : 0;
    for (const [tier, node] of Object.entries(sizes)) {
      const text = minutes ? say('export.size', '约 {mb} MB', {mb: Math.max(1, Math.round(minutes * PER_MINUTE[tier]))}) : '';
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
  for (const button of choices.querySelectorAll('button[data-tier]')) {
    button.addEventListener('click', async () => {
      if (working || !ready()) return;
      const s = scene(), tier = button.dataset.tier;
      choices.hidden = true;
      saved = null; failure = null; step = null; cancelling = false;
      working = true;
      root.XinScoreSceneView?.hold?.(true);
      render();
      let result;
      try {
        result = await bridge.scoreExport({
          trackId: s.trackId, tier, fxPreset: s.fxPreset, fxDynamics: s.fxDynamics, mergeTimbres: s.reading?.mergeTimbres, simplify: s.reading?.simplify,
          useDynamics: root.XinScoreDynamicsControls?.enabled?.() === true, lang: doc.documentElement.lang || undefined
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
