(function (root) {
  'use strict';
  function create({ bridge, audio, getTrack, getOriginalUrl, isBusy, onTask, onSwitch }) {
    const run = document.getElementById('fusionStemRun');
    const select = document.getElementById('fusionStemSelect');
    const reveal = document.getElementById('fusionStemReveal');
    const status = document.getElementById('fusionStemStatus');
    if (!run || !select || !reveal || !status) return null;
    const midiRun = document.getElementById('fusionMidiRun');
    const midiReveal = document.getElementById('fusionMidiReveal');
    const midiStatus = document.getElementById('fusionMidiStatus');
    const i18n = root.XinMusicLabDynamicUi;
    const bind = (node, key, fallback, params = {}) => i18n?.bindText(node, key, params, fallback) || (node.textContent = fallback);
    let result = null, sequence = 0, switching = false, removeMediaListeners = null;
    let midiResult = null, midiSequence = 0;
    const canTranscribe = () => result?.ok && ['bass', 'piano', 'guitar', 'drums'].includes(select.value);
    function sync() {
      if (midiRun) {
        midiRun.disabled = isBusy() || switching || !canTranscribe() || !bridge?.runMidi;
        midiReveal.disabled = !midiResult?.ok;
        bind(midiRun, midiResult?.ok ? 'midi.redo' : 'midi.run', midiResult?.ok ? '重新转谱' : '转 MIDI');
      }
      run.disabled = isBusy() || !getTrack() || !bridge?.runSeparation;
      select.disabled = switching || !getTrack();
      reveal.disabled = !result?.ok;
      bind(run, result?.ok ? 'stems.redo' : 'stems.run', result?.ok ? '重新分轨' : '分轨');
    }
    function showEmptyStatus() {
      bind(status, getTrack() ? 'stems.notGenerated' : 'stems.empty', getTrack() ? '尚未分轨，可在 XLD 中生成 WAV' : '选择曲目后读取分轨');
    }
    async function refreshMidi() {
      const request = ++midiSequence, track = getTrack(), stem = select.value;
      midiResult = null; sync();
      if (!midiRun) return;
      if (!canTranscribe() || !track) { bind(midiStatus, 'midi.select', '选择 bass / piano / guitar / drums 后转 MIDI'); return; }
      bind(midiStatus, 'midi.reading', '读取转谱结果…');
      const response = await bridge?.readMidi?.(track.id, stem).catch(() => null);
      if (request !== midiSequence || track.id !== getTrack()?.id || stem !== select.value) return;
      midiResult = response?.ok ? response : null;
      if (midiResult?.noteCount > 0) bind(midiStatus, 'midi.ready', 'MIDI 已就绪 · ' + midiResult.noteCount + ' 个音符', { count: midiResult.noteCount });
      else if (midiResult) bind(midiStatus, 'midi.noNotes', '未识别到音符，可重新转谱');
      else bind(midiStatus, 'midi.empty', '转谱保留母曲时间位置，可导入外部软件编辑');
      sync();
    }
    function reset() {
      sequence++; midiSequence++; midiResult = null;
      if (midiStatus) bind(midiStatus, 'midi.select', '选择 bass / piano / guitar / drums 后转 MIDI');
      removeMediaListeners?.(); removeMediaListeners = null; switching = false;
      result = null;
      select.replaceChildren(new Option('原曲', 'original'));
      bind(select.options[0], 'stems.original', '原曲');
      showEmptyStatus();
      sync();
    }
    async function refresh() {
      if(switching)return;
      const request = ++sequence;
      const track = getTrack();
      const response = track && bridge?.readStems ? await bridge.readStems(track.id).catch(() => null) : null;
      if (request !== sequence || track?.id !== getTrack()?.id) return;
      result = response?.ok ? response : null;
      const previous = select.value;
      select.replaceChildren(new Option('原曲', 'original'));
      bind(select.options[0], 'stems.original', '原曲');
      for (const name of ['bass', 'piano', 'guitar', 'drums', 'vocals', 'other']) {
        if (result?.stems?.some(stem => stem.name === name)) select.add(new Option(name, name));
      }
      if (Array.from(select.options).some(option => option.value === previous)) select.value = previous;
      const replaced=previous!=='original' && !result?.stems?.some(stem=>stem.audioUrl===audio.src);
      if(replaced){select.value='original';switchAudio();}
      if (replaced) bind(status,'stems.replaced','分轨已变化，已切回原曲并保留位置');
      else if (result) bind(status, 'stems.ready', '分轨已就绪');
      else showEmptyStatus();
      sync();
      await refreshMidi();
    }
    function switchAudio() {
      const url = select.value === 'original' ? getOriginalUrl() : result?.stems.find(stem => stem.name === select.value)?.audioUrl;
      if (!url || audio.src === url) return;
      removeMediaListeners?.();
      const trackId = getTrack()?.id;
      const time = Number(audio.currentTime) || 0;
      const wasPlaying = !audio.paused;
      switching = true; sync(); audio.pause();
      const cleanup = () => {
        audio.removeEventListener('loadedmetadata', ready);
        audio.removeEventListener('error', failed);
        removeMediaListeners = null;
      };
      const ready = () => {
        cleanup(); switching = false; sync();
        if (trackId !== getTrack()?.id) return;
        audio.currentTime = Math.min(time, Math.max(0, audio.duration - 0.02));
        onSwitch?.();
        if (wasPlaying) audio.play().catch(() => bind(status, 'stems.playFailed', '请点击播放重试'));
      };
      const failed = () => { cleanup(); switching = false; sync(); bind(status, 'stems.playFailed', '音频打开失败，请切回原曲'); };
      removeMediaListeners = cleanup;
      audio.addEventListener('loadedmetadata', ready);
      audio.addEventListener('error', failed);
      audio.src = url; audio.load();
    }
    select.addEventListener('change', () => { switchAudio(); refreshMidi(); });
    run.addEventListener('click', async () => {
      const track = getTrack();
      if (!track || isBusy()) return;
      if (select.value !== 'original') { select.value = 'original'; switchAudio(); refreshMidi(); }
      const task = { trackId: track.id, trackTitle: track.title, engine: 'demucs-6s', engineName: '分轨', status: 'starting', progress: 0, cancellable: true };
      bind(status, 'stems.running', '正在分轨，完成后可打开输出目录');
      onTask(task); sync();
      const response = await bridge.runSeparation(track.id, Boolean(result?.ok)).catch(error => ({ ok: false, detail: error.message }));
      onTask(response.task || { ...task, status: 'failed', cancellable: false, message: response.detail || response.error });
      if (track.id === getTrack()?.id) {
        await refresh();
        if (!response.ok) bind(status, response.error === 'analysis-cancelled' ? 'stems.cancelled' : 'stems.failed', response.error === 'analysis-cancelled' ? '已取消，原有结果保留' : '分轨失败，请查看分析状态或运行日志');
      }
      sync();
    });
    reveal.addEventListener('click', () => {
      const track = getTrack();
      if (track) bridge.revealStems(track.id).then(response => { if (!response?.ok) bind(status, 'stems.folderFailed', '无法打开输出目录'); }).catch(() => bind(status, 'stems.folderFailed', '无法打开输出目录'));
    });
    midiRun?.addEventListener('click', async () => {
      const track = getTrack(), stem = select.value;
      if (!track || isBusy() || !canTranscribe()) return;
      const task = { trackId: track.id, trackTitle: track.title, engine: 'basic-pitch', engineName: stem + ' MIDI', status: 'starting', progress: 0, cancellable: true };
      bind(midiStatus, 'midi.running', '正在转谱…');
      onTask(task); sync();
      const response = await bridge.runMidi(track.id, stem, Boolean(midiResult?.ok)).catch(error => ({ ok: false, detail: error.message }));
      onTask(response.task || { ...task, status: 'failed', cancellable: false, message: response.detail || response.error });
      if (track.id === getTrack()?.id) {
        await refreshMidi();
        if (!response.ok && stem === select.value) bind(midiStatus, response.error === 'analysis-cancelled' ? 'stems.cancelled' : 'midi.failed', response.error === 'analysis-cancelled' ? '已取消，原有结果保留' : '转谱失败，请查看分析状态或运行日志');
      }
      sync();
    });
    midiReveal?.addEventListener('click', async () => {
      const track = getTrack();
      if (!track || !midiResult?.ok) return;
      const response = await bridge.revealMidi(track.id, select.value).catch(() => null);
      if (!response?.ok) bind(midiStatus, 'stems.folderFailed', '无法打开输出目录');
    });
    reset();
    return { sync, reset, refresh };
  }
  root.XldStemControls = Object.freeze({ create });
})(globalThis);
