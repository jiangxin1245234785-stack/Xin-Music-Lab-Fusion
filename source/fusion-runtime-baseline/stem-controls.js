(function (root) {
  'use strict';
  // Stems and MIDI are only read here: making or re-making them is XLD's (it deletes the earlier ones), so this
  // app has no button for it, and its main process no IPC either.
  function create({ bridge, audio, getTrack, getOriginalUrl, onSwitch }) {
    const select = document.getElementById('fusionStemSelect');
    const reveal = document.getElementById('fusionStemReveal');
    const status = document.getElementById('fusionStemStatus');
    if (!select || !reveal || !status) return null;
    const midiReveal = document.getElementById('fusionMidiReveal');
    const midiStatus = document.getElementById('fusionMidiStatus');
    const i18n = root.XinMusicLabDynamicUi;
    const bind = (node, key, fallback, params = {}) => i18n?.bindText(node, key, params, fallback) || (node.textContent = fallback);
    let result = null, sequence = 0, switching = false, removeMediaListeners = null;
    let midiResult = null, midiSequence = 0;
    const hasMidiStem = () => result?.ok && ['bass', 'piano', 'guitar', 'drums'].includes(select.value);
    // Kept in step with MANUAL_ENGINE in xld-runtime-baseline/core/derived-assets.cjs; a renderer cannot require
    // it, so tests/midi-revision-record.cjs pins the two together rather than trusting them to stay equal.
    const MANUAL_ENGINE = 'manual-revision';
    const manualActive = () => Boolean(midiResult?.ok && midiResult.engine === MANUAL_ENGINE);
    function sync() {
      if (midiReveal) midiReveal.disabled = !midiResult?.ok;
      select.disabled = switching || !getTrack();
      reveal.disabled = !result?.ok;
    }
    function showEmptyStatus() {
      bind(status, getTrack() ? 'stems.notGenerated' : 'stems.empty', getTrack() ? '尚未分轨，可在 XLD 中生成 WAV' : '选择曲目后读取分轨');
    }
    async function refreshMidi() {
      const request = ++midiSequence, track = getTrack(), stem = select.value;
      midiResult = null; sync();
      if (!midiStatus) return;
      if (!hasMidiStem() || !track) { bind(midiStatus, 'midi.select', '选择 bass / piano / guitar / drums 查看 MIDI'); return; }
      bind(midiStatus, 'midi.reading', '读取转谱结果…');
      const response = await bridge?.readMidi?.(track.id, stem).catch(() => null);
      if (request !== midiSequence || track.id !== getTrack()?.id || stem !== select.value) return;
      midiResult = response?.ok ? response : null;
      if (manualActive()) bind(midiStatus, 'midi.manual', '当前使用人工修订 · ' + (midiResult.noteCount || 0) + ' 个音符 · 在 XLD 中编辑或切换版本', { count: midiResult.noteCount || 0 });
      else if (midiResult?.noteCount > 0) bind(midiStatus, 'midi.ready', 'MIDI 已就绪 · ' + midiResult.noteCount + ' 个音符', { count: midiResult.noteCount });
      else if (midiResult) bind(midiStatus, 'midi.noNotes', '未识别到音符，可在 XLD 里重新转谱');
      else bind(midiStatus, 'midi.empty', '转谱保留母曲时间位置，可导入外部软件编辑');
      sync();
    }
    function resetOptions() {
      for(const option of select.options)i18n?.unbind?.(option);
      select.replaceChildren(new Option('原曲', 'original'));
      bind(select.options[0], 'stems.original', '原曲');
    }
    function reset() {
      sequence++; midiSequence++; midiResult = null;
      if (midiStatus) bind(midiStatus, 'midi.select', '选择 bass / piano / guitar / drums 查看 MIDI');
      removeMediaListeners?.(); removeMediaListeners = null; switching = false;
      result = null;
      resetOptions();
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
      resetOptions();
      for (const name of ['bass', 'piano', 'guitar', 'drums', 'vocals', 'other','strings']) {
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
    reveal.addEventListener('click', () => {
      const track = getTrack();
      if (track) bridge.revealStems(track.id).then(response => { if (!response?.ok) bind(status, 'stems.folderFailed', '无法打开输出目录'); }).catch(() => bind(status, 'stems.folderFailed', '无法打开输出目录'));
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
