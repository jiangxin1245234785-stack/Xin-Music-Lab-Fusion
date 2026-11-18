(function (root) {
  'use strict';
  const ENABLED_KEY = 'xin-score-variation-enabled-v1';
  const PAIRS_KEY = 'xin-score-variation-pairs-v1';

  function attach({audio, getView, getTrackId, seek, isLoading, stage, say}) {
    const byId = id => root.document.getElementById(id);
    const toggle = byId('scoreVariationEnabled'), panel = byId('scoreVariationControls');
    if (!toggle || !panel) return null;
    const fields = [byId('scoreVariationA'), byId('scoreVariationB')];
    const starts = [byId('scoreVariationPlayA'), byId('scoreVariationPlayB')];
    const jump = byId('scoreVariationJump'), message = byId('scoreVariationStatus');
    const details = byId('scoreVariationDetails'), picker = byId('scoreVariationPicker');
    let saved = new Map(), trackId = '', controller = null, loaded = false, pending = null;
    const store = (key, value) => { try { root.localStorage.setItem(key, value); } catch (_) {} };
    try { toggle.checked = root.localStorage.getItem(ENABLED_KEY) === 'on'; } catch (_) {}
    try {
      const entries = JSON.parse(root.localStorage.getItem(PAIRS_KEY) || '[]');
      if (Array.isArray(entries)) saved = new Map(entries.slice(-80));
    } catch (_) {}

    const supports = style => style === 'starry' || style === 'paper';
    function options(id, style) {
      const enabled = toggle.checked && supports(style);
      return {variationEnabled: enabled, variation: (enabled && saved.get(id)) || null,
        variationLang: root.document.documentElement.lang};
    }

    function settle() { pending = null; }
    audio.addEventListener('seeked', settle);
    audio.addEventListener('emptied', settle);

    function scoreTime(view) { return pending ?? Math.max(0, audio.currentTime + (view?.options().offsetSeconds || 0)); }
    function changeTime(time) {
      if (!Number.isFinite(time)) return;
      const view = getView();
      if (!view) return;
      seek(Math.max(0, Math.min(view.duration(), time - (view.options().offsetSeconds || 0))));
      pending = time;
      update(time);
    }

    function setStatus(text) { if (message.textContent !== text) message.textContent = text; }
    function update(frameTime) {
      if (details.hidden) return;
      if (!controller?.pair) {
        jump.disabled = true;
        setStatus(isLoading() ? say('score.variationLoading', '正在读取这首歌的段落…')
          : say('score.variationEmpty', '这首歌需要至少两段可对照的段落。'));
        return;
      }
      const view = getView();
      const time = pending ?? (Number.isFinite(frameTime) ? frameTime : scoreTime(view));
      const info = controller.state(time);
      jump.disabled = !Number.isFinite(info.alternateTime);
      for (let i = 0; i < starts.length; i++) {
        const pressed = String(info.active === (i ? 'b' : 'a'));
        if (starts[i].getAttribute('aria-pressed') !== pressed) starts[i].setAttribute('aria-pressed', pressed);
      }
      const text = info.reason === 'outside' ? say('score.variationOutside', '先从 A 或 B 开始聆听。')
        : info.reason === 'outside-common' ? say('score.variationBeyond', '另一遍没有对应的拍点。')
        : info.reason === 'missing-beats' ? say('score.variationMissingBeats', '这个位置缺少可靠拍点。')
        : info.basis === 'lyric' ? say('score.variationLyrics', '用拍点和重复歌词对齐')
        : say('score.variationBeat', '按拍点对齐');
      setStatus(text);
    }

    function refresh(style) {
      const view = getView();
      const current = getTrackId();
      const next = view?.variationController?.() || null;
      details.hidden = !toggle.checked || !supports(style);
      panel.hidden = details.hidden || stage.dataset.effect !== 'score';
      if (current !== trackId || next !== controller || Boolean(view) !== loaded) {
        trackId = current;
        controller = next;
        loaded = Boolean(view);
        settle();
        for (const field of fields) {
          const choices = (controller?.sections || []).map(section => {
            const option = root.document.createElement('option');
            const seconds = Math.floor(section.start);
            option.value = section.id;
            option.textContent = `${section.label} · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
            return option;
          });
          field.replaceChildren(...choices);
        }
      }
      const choose = controller?.sections.length >= 2;
      picker.hidden = !choose;
      for (const button of starts) button.disabled = !controller?.pair;
      if (controller?.pair) {
        fields[0].value = controller.pair.a.id;
        fields[1].value = controller.pair.b.id;
      }
      update();
    }

    for (let i = 0; i < fields.length; i++) {
      fields[i].addEventListener('change', () => {
        if (!controller) return;
        const a = fields[0].value, b = fields[1].value;
        const old = controller.pair;
        const chosen = a !== b ? controller.setPair(a, b) : old && controller.setPair(old.b.id, old.a.id);
        if (chosen) {
          saved.delete(trackId);
          saved.set(trackId, {trackId, aId: controller.pair.a.id, bId: controller.pair.b.id});
          while (saved.size > 80) saved.delete(saved.keys().next().value);
          store(PAIRS_KEY, JSON.stringify([...saved]));
        }
        fields[0].value = controller.pair?.a.id ?? a;
        fields[1].value = controller.pair?.b.id ?? b;
        settle();
        update();
      });
      starts[i].addEventListener('click', () => changeTime(controller?.pair?.[i ? 'b' : 'a'].start));
    }
    jump.addEventListener('click', () => changeTime(controller?.alternateTime(scoreTime(getView()))));
    toggle.addEventListener('change', () => {
      store(ENABLED_KEY, toggle.checked ? 'on' : 'off');
      const view = getView();
      const style = byId('scoreStyle')?.value;
      view?.setOptions(options(getTrackId(), style));
      refresh(style);
    });
    return {options, refresh, update, settle};
  }
  root.XinScoreCompareControls = Object.freeze({attach});
})(globalThis);
