(function (root) {
  'use strict';
  // Stems and MIDI are only read here: making or re-making them is XLD's (it deletes the earlier ones), so this
  // app has no button for it, and its main process no IPC either.
  function create({ bridge, audio, getTrack, onSwitch, output }) {
    const select = document.getElementById('fusionStemSelect');
    const reveal = document.getElementById('fusionStemReveal');
    const status = document.getElementById('fusionStemStatus');
    if (!select || !reveal || !status) return null;
    const midiReveal = document.getElementById('fusionMidiReveal');
    const midiStatus = document.getElementById('fusionMidiStatus');
    const i18n = root.XinMusicLabDynamicUi;
    const bind = (node, key, fallback, params = {}) => i18n?.bindText(node, key, params, fallback) || (node.textContent = fallback);
    let result = null, sequence = 0;
    let pending = null, active = null, routed = null, alignmentTimer = null, failedChoice = false;
    const alignmentTolerance = 0.075;
    const preparationIdleMs = 30000;
    const activeName = () => routed?.name || 'original';
    const stemSource = name => result?.stems?.find(stem => stem.name === name);
    const playbackUrl = stem => stem?.playbackUrl || stem?.audioUrl;
    let midiResult = null, midiSequence = 0;
    const hasMidiStem = () => result?.ok && ['bass', 'piano', 'guitar', 'drums'].includes(select.value);
    // Kept in step with MANUAL_ENGINE in xld-runtime-baseline/core/derived-assets.cjs; a renderer cannot require
    // it, so tests/midi-revision-record.cjs pins the two together rather than trusting them to stay equal.
    const MANUAL_ENGINE = 'manual-revision';
    const manualActive = () => Boolean(midiResult?.ok && midiResult.engine === MANUAL_ENGINE);
    function sync() {
      if (midiReveal) midiReveal.disabled = !midiResult?.ok;
      select.disabled = !getTrack();
      reveal.disabled = !result?.ok;
    }
    function showEmptyStatus() {
      bind(status, getTrack() ? 'stems.notGenerated' : 'stems.empty', getTrack() ? '尚未分轨，可在 XLD 中分轨' : '选择曲目后读取分轨');
    }
    function showResultStatus() {
      if (result) bind(status, 'stems.ready', '分轨已就绪');
      else showEmptyStatus();
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
      stopStems();
      failedChoice = false;
      result = null;
      resetOptions();
      showEmptyStatus();
      sync();
    }
    async function refresh() {
      const request = ++sequence;
      const track = getTrack();
      const response = track && bridge?.readStems ? await bridge.readStems(track.id).catch(() => null) : null;
      if (request !== sequence || track?.id !== getTrack()?.id) return;
      result = response?.ok ? response : null;
      const previous = select.value;
      resetOptions();
      if (!result) {
        // A failed directory read (including a single missing file) cannot establish
        // that the currently decoded stem has been replaced. Keep only that usable
        // choice and Original until an authoritative list is available again.
        release(pending);
        pending = null;
        if (active) {
          select.add(new Option(active.name, active.name));
          select.value = active.name;
          if (!failedChoice) bind(status, 'stems.refreshFailedKept', '未能更新分轨列表，继续播放当前音轨。');
        } else if (!failedChoice) showEmptyStatus();
        sync();
        await refreshMidi();
        return;
      }
      for (const name of ['bass', 'piano', 'guitar', 'drums', 'vocals', 'other','strings','winds']) {
        if (result?.stems?.some(stem => stem.name === name)) select.add(new Option(name, name));
      }
      if (Array.from(select.options).some(option => option.value === previous)) select.value = previous;
      const selectedUrl = playbackUrl(stemSource(previous));
      const activeReplaced = active && playbackUrl(stemSource(active.name)) !== active.url;
      const replaced = previous !== 'original' && (activeReplaced || selectedUrl !== (pending?.url || active?.url));
      if(replaced){select.value='original';switchAudio();}
      if (replaced) bind(status,'stems.replaced','分轨已变化，已切回原曲并保留位置');
      else if (!failedChoice) showResultStatus();
      sync();
      await refreshMidi();
    }
    function current(deck) {
      return deck && (deck === pending || deck === active) && deck.trackId === getTrack()?.id;
    }
    function release(deck) {
      if (!deck) return;
      deck.listeners.abort();
      clearTimeout(deck.timeout);
      const stop = () => {
        deck.media.pause();
        deck.media.removeAttribute('src');
        deck.media.load();
      };
      const boundary = deck.route?.release();
      if (boundary?.then) boundary.then(stop, stop);
      else stop();
    }
    function original() {
      if (routed) output.original();
      routed = null;
    }
    function stopStems() {
      clearTimeout(alignmentTimer);
      alignmentTimer = null;
      original();
      release(pending);
      release(active);
      active = pending = null;
    }
    function failed(deck) {
      if (!current(deck)) return;
      const wasActive = deck === active;
      if (wasActive) {
        original();
        active = null;
        if (!result) resetOptions();
      } else pending = null;
      release(deck);
      failedChoice = true;
      if (!pending) {
        select.value = active?.name || 'original';
        refreshMidi();
      }
      if (wasActive) bind(status, 'stems.activeFailed', '分轨播放中断，已切回原曲。');
      else bind(status, 'stems.switchFailed', '无法打开所选音轨，已保留之前的音轨。');
    }
    function activate(deck) {
      if (routed === deck) return;
      try {
        if (deck.route.activate() === false) { failed(deck); return; }
      } catch (_) { failed(deck); return; }
      routed = deck;
      deck.cues = 0;
      deck.shortenedCue = false;
      if (deck !== pending) return;
      const previous = active;
      active = deck;
      pending = null;
      clearTimeout(deck.timeout);
      release(previous);
      if (failedChoice) showResultStatus();
      failedChoice = false;
      onSwitch?.();
    }
    function retryAlignment() {
      if (alignmentTimer !== null) return;
      alignmentTimer = setTimeout(() => {
        alignmentTimer = null;
        syncMedia();
      }, 20);
    }
    function start(deck) {
      if (deck.starting) return;
      deck.starting = true;
      if (deck.media.playbackRate !== audio.playbackRate) deck.media.playbackRate = audio.playbackRate;
      deck.media.play().then(() => {
        deck.starting = false;
        if (current(deck) && !deck.media.paused) { deck.running = true; retryAlignment(); }
      }, error => {
        deck.starting = false;
        if (!current(deck)) return;
        if (error.name === 'AbortError') retryAlignment();
        else failed(deck);
      });
    }
    function position(deck, lead = 0, force = false) {
      if (!current(deck) || !Number.isFinite(deck.media.duration)) return;
      const time = Math.min(audio.currentTime + lead, Math.max(0, deck.media.duration - 0.001));
      if (force || Math.abs(time - deck.media.currentTime) > 0.015) {
        deck.seekBegan = performance.now();
        deck.media.currentTime = time;
      }
    }
    function park(deck) {
      deck.awaitingClock = true;
      deck.running = false;
      if (!deck.media.paused) deck.media.pause();
      if (deck.media.playbackRate !== audio.playbackRate) deck.media.playbackRate = audio.playbackRate;
      retryAlignment();
    }
    function cueAhead(deck) {
      deck.cues++;
      park(deck);
      // Leave enough headroom for the measured seek and its variance. Keep the stem
      // paused at the decoded target until the song catches it, without consuming the
      // buffer at a rate the reader may not be able to sustain.
      const elapsed = deck.seekBegan == null ? 0 : (performance.now() - deck.seekBegan) / 1000;
      const lastSeek = Math.max(elapsed, deck.seekSeconds || 0);
      // After the warm correction has already been used, this is the final cue.
      // Variable warm seek times must not park ready audio far ahead of the song.
      const maxLead = deck.shortenedCue ? 1.5 : 15;
      const seconds = Math.min(maxLead, Math.max(0.45, 2 * lastSeek + 0.35));
      const lead = audio.paused ? 0 : seconds * audio.playbackRate;
      position(deck, lead, true);
    }
    function madeProgress(deck) {
      if (deck !== pending) return;
      clearTimeout(deck.timeout);
      deck.timeout = setTimeout(() => {
        if (!current(deck)) return;
        const media = deck.media;
        // The local FLAC protocol responds only after its decode worker finishes.
        // Before the first byte Chromium can report both 'loading' and 'stalled'.
        // Native errors and cancellation remain live throughout that cold read.
        if (deck.localFlac && media.readyState === 0 && media.networkState === 2) {
          madeProgress(deck);
          return;
        }
        if (!deck.retried && media.readyState >= 1 && Number.isFinite(media.duration)) {
          deck.retried = true;
          cueAhead(deck);
          madeProgress(deck);
        } else failed(deck);
      }, preparationIdleMs);
    }
    function follow(deck) {
      if (!current(deck) || !deck.route) return;
      const media = deck.media;
      const rate = audio.playbackRate;
      if (audio.paused || audio.seeking || audio.readyState < 2) {
        deck.awaitingClock = false;
        deck.cues = 0;
        deck.shortenedCue = false;
        if (!media.paused) media.pause();
        deck.running = false;
        position(deck);
        if (audio.paused && !audio.seeking && media.readyState >= 3 && !media.seeking) {
          media.playbackRate = rate;
          activate(deck);
        }
        return;
      }
      if (media.readyState < 1) return;
      if (audio.currentTime >= media.duration) { failed(deck); return; }
      const drift = audio.currentTime - media.currentTime;
      if (deck.awaitingClock) {
        if (media.seeking || media.readyState < 3) return;
        // An expensive first seek can hugely overestimate a subsequent warm seek.
        // When this leaves several seconds already buffered ahead, recalculate once
        // using the just-completed seek; preserve the original rendezvous if moving
        // again would save less than a second.
        const ahead = rate > 0 ? -drift / rate : 0;
        const warmLead = 0.2 + 1.15 * (deck.seekSeconds || 0);
        if (deck.cues && !deck.shortenedCue && deck.seekBegan == null && ahead > 2 && ahead > warmLead + 1) {
          deck.shortenedCue = true;
          position(deck, warmLead * rate, true);
          return;
        }
        if (drift < -0.025 * rate) { retryAlignment(); return; }
        deck.awaitingClock = false;
      }
      if (media.paused) {
        if (routed === deck) original();
        if (media.seeking) return;
        if (media.readyState >= 3 && drift > 0.25 && deck.cues < 2) { cueAhead(deck); return; }
        start(deck);
        return;
      }
      if (media.seeking || media.readyState < 3 || !deck.running) return;
      // Once audible, leave normal device-clock jitter alone. A large discrepancy (for
      // example, a stalled decoder) is repaired silently while the song clock plays.
      if (routed === deck && Math.abs(drift) < 0.12) {
        if (media.playbackRate !== rate) media.playbackRate = rate;
        return;
      }
      if (Math.abs(drift) <= alignmentTolerance) {
        if (media.playbackRate !== rate) media.playbackRate = rate;
        activate(deck);
        return;
      }
      if (routed === deck) original();
      const distance = Math.abs(drift);
      if (distance < deck.bestDrift - 0.025) {
        deck.bestDrift = distance;
        madeProgress(deck);
      }
      if (drift < 0) {
        park(deck);
        return;
      }
      if (drift > 0.25 && deck.cues < 2) {
        cueAhead(deck);
        return;
      }
      // Only trim small late starts. Sustained fast playback starves the WAV reader.
      const catchup = Math.min(16, rate + Math.min(rate * 0.1, drift));
      if (Math.abs(media.playbackRate - catchup) > 0.005) media.playbackRate = catchup;
      retryAlignment();
    }
    function syncMedia() {
      follow(active);
      follow(pending);
    }
    function switchAudio() {
      release(pending);
      pending = null;
      const name = select.value;
      if (name === 'original') {
        const changed = !!active;
        stopStems();
        if (!result) resetOptions();
        if (failedChoice) showResultStatus();
        failedChoice = false;
        if (changed) onSwitch?.();
        return;
      }
      if (name === active?.name) return;
      const stem = stemSource(name);
      const url = playbackUrl(stem);
      const gain = stem?.playbackUrl ? (stem.playbackGain ?? 1) : 1;
      const media = document.createElement('audio');
      const deck = {name, url, media, trackId: getTrack()?.id, listeners: new AbortController(),
        localFlac: /^file:.*\.flac(?:[?#]|$)/i.test(url), bestDrift: Infinity, cues: 0};
      pending = deck;
      if (!url || !output?.prepare) { failed(deck); return; }
      const options = {signal: deck.listeners.signal};
      madeProgress(deck);
      media.preload = 'auto';
      media.muted = true;
      media.addEventListener('loadedmetadata', () => { madeProgress(deck); position(deck); }, options);
      media.addEventListener('progress', () => madeProgress(deck), options);
      for (const event of ['loadeddata', 'canplay', 'playing']) {
        media.addEventListener(event, () => madeProgress(deck), {...options, once: true});
      }
      media.addEventListener('seeked', () => {
        if (media.seeking) return;
        if (deck.seekBegan != null) {
          deck.seekSeconds = (performance.now() - deck.seekBegan) / 1000;
          deck.seekBegan = null;
          madeProgress(deck);
        }
        follow(deck);
      }, options);
      for (const event of ['canplay', 'timeupdate']) media.addEventListener(event, () => follow(deck), options);
      media.addEventListener('playing', () => { deck.running = true; follow(deck); }, options);
      media.addEventListener('waiting', () => {
        deck.running = false;
        if (routed === deck && !audio.paused) original();
      }, options);
      for (const event of ['ended', 'error']) media.addEventListener(event, () => failed(deck), options);
      media.src = url;
      media.load();
      try {
        Promise.resolve(output.prepare(media, gain)).then(route => {
          if (!current(deck)) { route?.release(); return; }
          if (!route) { failed(deck); return; }
          deck.route = route;
          media.muted = false; // The prepared Web Audio input is still at zero gain.
          follow(deck);
        }).catch(() => failed(deck));
      } catch (_) { failed(deck); }
    }
    // The real song element stays loaded for the entire track. Its transport controls,
    // duration, playback history and all score/lyric clocks keep their original identity.
    audio.addEventListener('seeking', () => {
      if (routed) original();
      position(active);
      position(pending);
      syncMedia();
    });
    for (const event of ['play', 'playing', 'pause', 'seeked', 'ratechange', 'timeupdate', 'waiting']) {
      audio.addEventListener(event, syncMedia);
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
    return { sync, reset, refresh, activeName };
  }
  root.XldStemControls = Object.freeze({ create });
})(globalThis);
