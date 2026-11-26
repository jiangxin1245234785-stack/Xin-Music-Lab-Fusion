/* Live inspector for the playback window. No observer, graph or timer runs while disabled. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XinScoreMoodDebug = api;
})(globalThis, function (root) {
  'use strict';
  const STORAGE = 'xin-score-mood-debug-v1';
  const components = [
    ['lufs', 'Lufs', 'LUFS'], ['band28Dbfs', 'Band', 'dBFS'], ['logFlatness', 'Flat', '']
  ];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const finite = Number.isFinite;
  const cap = text => text[0].toUpperCase() + text.slice(1);
  const format = (value, places = 3) => finite(value) ? value.toFixed(places) : '—';
  function clockLabel(time, digits = 0) {
    if (!finite(time)) return '—';
    const base = 10 ** digits, ticks = Math.floor(Math.max(0, time) * base + 1e-7);
    const seconds = Math.floor(ticks / base);
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0') +
      (digits ? '.' + String(ticks % base).padStart(digits, '0') : '');
  }
  function rawAt(record, key, time) {
    if (!finite(time) || time < 0 || time > record.duration) return null;
    const values = record.components[key], last = values.length - 1;
    if (time === record.duration) return values[last];
    const index = Math.floor(time / record.step), start = index * record.step, a = values[index];
    if (time === start || !finite(a)) return a;
    const b = values[index + 1], end = Math.min(record.duration, start + record.step);
    return finite(b) ? a + (b - a) * (time - start) / (end - start) : null;
  }
  function range(values) {
    let min = Infinity, max = -Infinity;
    for (const value of values) if (finite(value)) { min = Math.min(min, value); max = Math.max(max, value); }
    return min <= max ? [min, max] : null;
  }
  function linePath(values, record, bounds = [0, 1]) {
    if (!bounds) return '';
    const [min, max] = bounds, parts = [];
    let start = true;
    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      if (!finite(value)) { start = true; continue; }
      const height = max > min ? 100 * (1 - (value - min) / (max - min)) : 50;
      parts.push((start ? 'M' : 'L') + Math.min(i * record.step, record.duration).toFixed(3) + ' ' + height.toFixed(2));
      start = false;
    }
    return parts.join('');
  }
  function zoomBounds(time, duration) { return [Math.max(0, time - 30), Math.min(duration, time + 30)]; }
  function sectionRows(rows, duration) {
    if (!Array.isArray(rows)) return [];
    return rows.flatMap(row => {
      const start = row?.[0] ?? row?.start, end = row?.[1] ?? row?.end, name = row?.[2] ?? row?.label;
      if (!finite(start) || !finite(end) || end <= start || end <= 0 || start >= duration || !name) return [];
      return [{start: Math.max(0, start), end: Math.min(duration, end), name: String(name)}];
    });
  }
  function targetAt(domain, fraction) { return domain[0] + clamp(fraction, 0, 1) * (domain[1] - domain[0]); }
  function flashesAround(flashes, time) {
    let lo = 0, hi = flashes.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (flashes[mid].time <= time) lo = mid + 1;
      else hi = mid;
    }
    return [flashes[lo - 1]?.time, flashes[lo]?.time];
  }
  function weatherComparison(model, weather, terrainArt) {
    const window = terrainArt.weatherWindow(model);
    const options = {terrainWeather: 'rain', ...window};
    const mood = weather.sample(model, 0, {...options, terrainWeatherDriver: 'mood'});
    const original = weather.sample(model, 0, {...options, terrainWeatherDriver: 'original'});
    return {window, mood, original};
  }

  function attach({stage, canvas, audio, held, context, time, seek}) {
    const doc = root.document, get = id => doc.getElementById(id);
    const panel = get('scoreMoodDebug'), toggle = get('scoreMoodDebugSwitch');
    if (!panel || !toggle) return null;
    const close = get('scoreMoodDebugClose'), body = get('scoreMoodDebugBody'), subtitle = get('scoreMoodDebugTrack');
    const settings = get('xlSettings'), library = get('fusionPanel'), welcome = get('welcome');
    const translate = key => root.XinMusicLabDynamicUi.t('score.' + key);
    const label = suffix => translate('moodDebug' + suffix);
    const setText = (node, value) => { if (node.textContent !== value) node.textContent = value; };
    const el = (name, className, text) => {
      const node = doc.createElement(name);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };
    const svg = (name, attrs) => {
      const node = doc.createElementNS('http://www.w3.org/2000/svg', name);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
      return node;
    };
    function legend(a, b, blue = false) {
      const node = el('small');
      node.append(el('span', 'mood-legend-slow', label(a)), '  /  ', el('span', blue ? 'mood-legend-original' : '', label(b)));
      return node;
    }
    let visible = false, enabled = false, watch = null, sizeWatch = null, fitFrame = 0, timer = 0;
    let drawing = null, comparisonModel = null, comparison = null, gesture = null;
    let signature = null, lastTime = NaN;
    const mediaEvents = ['play', 'pause', 'ended', 'loadedmetadata', 'emptied', 'seeking', 'seeked', 'timeupdate', 'ratechange'];
    function chart(parent, kind, title, note) {
      const section = el('section', 'mood-debug-section'), head = el('div', 'mood-debug-heading');
      const caption = el('strong', '', title);
      head.append(caption);
      if (note) head.append(note);
      const area = el('div', 'mood-debug-chart');
      area.dataset.debugPlot = kind;
      area.tabIndex = 0;
      area.setAttribute('role', 'slider');
      area.setAttribute('aria-label', title);
      const plot = svg('svg', {preserveAspectRatio:'none', 'aria-hidden':'true'});
      const mark = el('span', 'mood-debug-headmark');
      area.append(plot, mark);
      section.append(head, area);
      parent.append(section);
      const g = {area, plot, mark, caption, domain: [0, 1], kind};
      const locate = (event, domain) => {
        const box = area.getBoundingClientRect();
        if (box.width) seek(targetAt(domain, (event.clientX - box.left) / box.width));
      };
      area.addEventListener('pointerdown', event => {
        if (!event.isPrimary || event.button !== 0) return;
        gesture = {area, id: event.pointerId, domain: g.domain, x: event.clientX, dragging: false};
        area.setPointerCapture(event.pointerId);
      });
      area.addEventListener('pointermove', event => {
        if (gesture?.area !== area || gesture.id !== event.pointerId) return;
        if (Math.abs(event.clientX - gesture.x) > 3) gesture.dragging = true;
        if (gesture.dragging) locate(event, gesture.domain);
      });
      area.addEventListener('pointerup', event => {
        if (gesture?.area !== area || gesture.id !== event.pointerId) return;
        locate(event, gesture.domain);
        gesture = null;
        refresh();
      });
      area.addEventListener('lostpointercapture', () => { if (gesture?.area === area) gesture = null; });
      area.addEventListener('keydown', event => {
        const step = event.shiftKey ? 5 : .5;
        const t = time(), targets = {ArrowLeft:t-step, ArrowDown:t-step, ArrowRight:t+step, ArrowUp:t+step, Home:g.domain[0], End:g.domain[1]};
        if (!Object.hasOwn(targets, event.key)) return;
        event.preventDefault();
        seek(clamp(targets[event.key], g.domain[0], g.domain[1]));
        refresh();
      });
      return g;
    }
    function addLine(g, kind, data) {
      if (data) g.plot.append(svg('path', {class:'mood-line-' + kind, d:data}));
    }
    function guides(g, duration, thresholds, flashes) {
      const bands = [thresholds.start, thresholds.moderate, thresholds.heavy, thresholds.storm];
      let previous = 1;
      for (const edge of [...bands].reverse()) {
        g.plot.append(svg('rect', {class:'mood-band', x:0, y:100*(1-previous), width:duration,
          height:100*(previous-edge), opacity:previous*.19}));
        previous = edge;
      }
      for (const edge of bands) addLine(g, 'guide', 'M0 ' + 100*(1-edge) + 'h' + duration);
      addLine(g, 'gate', 'M0 ' + 100*(1-thresholds.lightning) + 'h' + duration);
      addLine(g, 'flash', flashes.filter(f => f.time <= duration).map(f => 'M' + f.time + ' 0v10').join(''));
    }
    function setDomain(g, domain) {
      g.domain = domain;
      const [start, end] = domain;
      g.plot.setAttribute('viewBox', start + ' 0 ' + (end - start) + ' 100');
      g.area.setAttribute('aria-valuemin', String(start));
      g.area.setAttribute('aria-valuemax', String(end));
    }
    function build(state) {
      body.replaceChildren();
      gesture = null;
      const {curve, model, status, scoreStyle, terrain} = state;
      drawing = null;
      if (model !== comparisonModel) { comparison = null; comparisonModel = model; }
      if (!curve) {
        const message = {idle:'Idle', loading:'Loading', failed:'Failed'}[status] || 'Missing';
        body.append(el('p', 'mood-debug-note', label(message)));
        return;
      }
      const activeWeather = Boolean(model && scoreStyle === 'terrain');
      const mode = activeWeather ? terrain.terrainWeather : '';
      const wetWeather = mode && mode !== 'clear', rain = mode === 'rain';
      const weather = root.XinTerrainWeather;
      if (activeWeather && !comparison) comparison = weatherComparison(model, weather, root.XinArt.terrain);
      const fields = new Map(), charts = [];
      const stats = el('dl', 'mood-debug-stats');
      function field(id, suffix) {
        const row = el('div'), output = el('dd');
        output.dataset.debugValue = id;
        fields.set(id, output);
        row.append(el('dt', '', label(suffix)), output);
        stats.append(row);
      }
      field('slow', 'Slow'); field('fast', 'Fast');
      if (activeWeather) {
        field('tier', 'Tier');
        if (wetWeather) {
          field('intensity', {rain:'Intensity', snow:'Snow', sandstorm:'Sand'}[mode]);
          field('drive', 'Drive');
        }
        field('cloud', 'Cloud');
        if (rain) {
          field('wet', 'Wet'); field('far', 'Far'); field('original', 'Original');
          field('previous', 'Previous'); field('next', 'Next');
        }
      }
      body.append(stats);
      if (!activeWeather) body.append(el('p', 'mood-debug-note', label(model ? 'Other' : 'NoNotes')));
      const domain = [0, curve.duration];
      const whole = chart(body, 'overview', label('Overview'), legend('LegendSlow', 'LegendFast'));
      const sections = sectionRows(model?.sections, curve.duration);
      const strip = el('div', 'mood-debug-sections');
      for (const section of sections) {
        const cell = el('span', 'mood-debug-section-label');
        cell.style.left = section.start / curve.duration * 100 + '%';
        cell.style.width = (section.end - section.start) / curve.duration * 100 + '%';
        cell.title = section.name + ' · ' + clockLabel(section.start) + ' – ' + clockLabel(section.end);
        cell.append(el('small', '', section.name));
        strip.append(cell);
        section.cell = cell;
      }
      strip.hidden = !sections.length;
      strip.addEventListener('click', event => {
        const box = strip.getBoundingClientRect();
        if (box.width) seek(targetAt(domain, (event.clientX - box.left) / box.width));
        refresh();
      });
      const axis = el('div', 'mood-debug-axis');
      const sectionName = el('span', 'mood-debug-current-section');
      sectionName.dataset.debugValue = 'section';
      axis.append(el('span', '', '0:00'), sectionName, el('span', '', clockLabel(curve.duration)));
      whole.area.after(strip, axis);
      const zoomRange = el('small');
      const zoom = chart(body, 'zoom', label('Zoom'), zoomRange);
      const slowLine = linePath(curve.slow, curve), fastLine = linePath(curve.fast, curve);
      const enabledFlashes = rain && terrain.terrainLightning;
      const flashes = enabledFlashes ? comparison[terrain.terrainWeatherDriver === 'original' ? 'original' : 'mood'].flashes : [];
      for (const g of [whole, zoom]) {
        if (activeWeather) guides(g, curve.duration, weather.moodThresholds, flashes);
        addLine(g, 'fast', fastLine); addLine(g, 'slow', slowLine);
        charts.push(g);
      }
      if (activeWeather) {
        const b = weather.moodThresholds;
        const levels = [b.start, b.moderate, b.heavy, b.storm].map(v => v.toFixed(2)).join(' / ');
        const gates = el('p', 'mood-debug-hint', label('Tiers') + ' ' + levels + ' · ' + label('FlashGate') + ' ' + b.lightning.toFixed(2));
        if (flashes.length) gates.append(' · ' + label('Flashes') + ' ×' + flashes.length);
        zoom.area.after(gates);
      }
      const raw = el('section', 'mood-debug-components');
      raw.append(el('strong', '', label('Raw')));
      body.append(raw);
      for (const [key, suffix, unit] of components) {
        const values = curve.components[key], bounds = range(values), caption = label(suffix);
        const units = unit || label('FlatUnit');
        const extents = bounds ? bounds.map(v => format(v, 1)).join(' … ') : '—';
        const g = chart(raw, key, caption, el('small', '', extents));
        g.caption.dataset.debugValue = key;
        g.readout = [caption, units];
        addLine(g, key, linePath(values, curve, bounds));
        charts.push(g);
      }
      if (activeWeather) {
        const g = chart(body, 'compare', label('Compare') + ' 0–1', legend('Mood', 'Old', true));
        for (const [name, kind] of [['original', 'original'], ['mood', 'slow']]) {
          const values = curve.slow.map((_, i) => comparison[name].rainAt(Math.min(i * curve.step, curve.duration, model.track.duration)));
          addLine(g, kind, linePath(values, curve));
        }
        charts.push(g);
      }
      body.append(el('p', 'mood-debug-hint', label('Hint')));
      for (const g of charts) setDomain(g, domain);
      drawing = {charts, fields, zoom, zoomRange, flashes, mode, enabledFlashes, sectionName, sections};
    }

    function render() {
      const state = context(), {curve, terrain = {}, title, status} = state;
      const identity = [curve, state.model, status, state.scoreStyle, terrain.terrainWeather, terrain.terrainWeatherDriver,
        terrain.terrainLightning, doc.documentElement.lang];
      const changed = !signature || identity.some((value, i) => value !== signature[i]);
      if (changed) { signature = identity; build(state); lastTime = NaN; }
      if (!curve || !drawing) { setText(subtitle, title || ''); return; }
      const t = clamp(time(), 0, curve.duration);
      if (!finite(t) || t === lastTime) return;
      lastTime = t;
      const {charts, fields, zoom, zoomRange, flashes, mode, enabledFlashes} = drawing;
      const stamp = clockLabel(t, 1);
      const section = drawing.sections.find(s => t >= s.start && t < s.end);
      if (section !== drawing.section) {
        drawing.section?.cell.classList.remove('is-current');
        section?.cell.classList.add('is-current');
        drawing.section = section;
      }
      setText(drawing.sectionName, section ? section.name : drawing.sections.length ? '—' : label('NoSections'));
      const sub = [title, stamp + ' / ' + clockLabel(curve.duration)];
      if (mode) {
        sub.push(translate('terrainWeather' + cap(mode)),
          translate('terrainWeatherDriver' + (terrain.terrainWeatherDriver === 'original' ? 'Original' : 'Mood')));
      }
      setText(subtitle, sub.filter(Boolean).join(' · '));
      const current = root.XinMoodCurve.at(curve, t);
      const put = (key, value) => { if (fields.has(key)) setText(fields.get(key), value); };
      put('slow', format(current.slow)); put('fast', format(current.fast));
      if (mode) {
        const engine = root.XinTerrainWeather;
        const weather = engine.sample(state.model, t, {...terrain, ...comparison.window});
        const tier = engine.moodTier(current.slow);
        put('tier', tier ? label(cap(tier)) : '—');
        put('intensity', format(weather.intensity)); put('drive', format(weather.stormDrive));
        put('wet', format(weather.humidity)); put('far', format(weather.farRain));
        put('cloud', finite(weather.cloudOpacity) ? format(weather.cloudOpacity) : label('NoCloud'));
        put('original', format(comparison.original.rainAt(Math.min(t, state.model.track.duration))));
        if (mode === 'rain') {
          const [last, next] = flashesAround(flashes, t);
          const flashText = value => enabledFlashes ? finite(value) ? clockLabel(value, 2) : label('Absent') : label('Off');
          put('previous', flashText(last)); put('next', flashText(next));
        }
      }
      const zoomDomain = gesture?.area === zoom.area ? gesture.domain : zoomBounds(t, curve.duration);
      setDomain(zoom, zoomDomain);
      setText(zoomRange, zoomDomain.map(v => clockLabel(v)).join(' – '));
      for (const g of charts) {
        const [start, end] = g.domain, fraction = clamp((t - start) / (end - start), 0, 1);
        g.mark.style.left = (fraction * 100).toFixed(3) + '%';
        g.area.setAttribute('aria-valuenow', t.toFixed(2));
        g.area.setAttribute('aria-valuetext', stamp);
        if (g.readout) {
          const [caption, units] = g.readout;
          setText(g.caption, caption + '  ' + format(rawAt(curve, g.kind, t), 2) + ' ' + units);
        }
      }
    }

    // Measure the unmodified live canvas. Keeping its aspect ratio preserves terrain
    // geometry and native hit coordinates even when album layout or UI scale changes.
    function fit() {
      fitFrame = 0;
      canvas.classList.remove('mood-debug-fitted');
      if (!visible || root.matchMedia('(max-width: 1000px)').matches) return;
      const normal = canvas.getBoundingClientRect(), available = panel.getBoundingClientRect().left - normal.left - 6;
      if (!(available > 0 && available < normal.width)) return;
      const h = normal.height * available / normal.width;
      canvas.style.setProperty('--mood-fit-width', available + 'px');
      canvas.style.setProperty('--mood-fit-height', h + 'px');
      canvas.style.setProperty('--mood-fit-inset', (normal.height - h) / 2 + 'px');
      canvas.classList.add('mood-debug-fitted');
    }
    function scheduleFit() {
      if (visible && !fitFrame) fitFrame = root.requestAnimationFrame(fit);
    }
    function refresh() {
      if (!visible) return;
      root.clearTimeout(timer);
      timer = 0;
      render();
      if (!audio.paused && !audio.ended) timer = root.setTimeout(refresh, 65);
    }
    function sync() {
      const open = enabled && stage.dataset.effect === 'score' && !held() && !doc.hidden &&
        !stage.classList.contains('ui-hidden') && !stage.classList.contains('is-immersive') &&
        ![settings, library].some(node => node?.classList.contains('is-open')) &&
        (!welcome || welcome.classList.contains('is-gone'));
      if (open === visible) { if (open) scheduleFit(); return; }
      visible = open;
      panel.hidden = !visible;
      if (visible) {
        for (const name of mediaEvents) audio.addEventListener(name, refresh);
        sizeWatch = new root.ResizeObserver(scheduleFit);
        for (const node of [stage, canvas, panel]) sizeWatch.observe(node);
        fit(); refresh();
      } else {
        for (const name of mediaEvents) audio.removeEventListener(name, refresh);
        sizeWatch?.disconnect(); sizeWatch = null;
        if (fitFrame) root.cancelAnimationFrame(fitFrame);
        fitFrame = 0;
        root.clearTimeout(timer); timer = 0;
        canvas.classList.remove('mood-debug-fitted');
        body.replaceChildren();
        signature = drawing = comparison = comparisonModel = gesture = null;
      }
    }
    function setEnabled(on) {
      enabled = toggle.checked = on;
      if (on && !watch) {
        watch = new root.MutationObserver(sync);
        watch.observe(stage, {attributes:true, attributeFilter:['class', 'data-effect']});
        for (const node of [settings, library, welcome]) if (node) watch.observe(node, {attributes:true, attributeFilter:['class']});
        doc.addEventListener('visibilitychange', sync);
      } else if (!on) {
        watch?.disconnect(); watch = null;
        doc.removeEventListener('visibilitychange', sync);
      }
      sync();
    }
    function change() {
      try { root.localStorage.setItem(STORAGE, toggle.checked ? 'on' : 'off'); } catch (_) {}
      if (toggle.checked && stage.dataset.effect === 'score') {
        if (settings?.classList.contains('is-open')) get('xlSettingsClose')?.click();
        if (library?.classList.contains('is-open')) get('fusionClose')?.click();
      }
      setEnabled(toggle.checked);
      if (visible) close.focus({preventScroll:true});
    }
    function press() {
      toggle.checked = !enabled;
      toggle.dispatchEvent(new root.Event('change', {bubbles:true}));
    }
    function shortcut(event) {
      if (stage.dataset.effect !== 'score' || event.defaultPrevented || event.repeat || event.isComposing ||
          event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.key.toLowerCase() !== 'm' ||
          event.target?.closest?.('input, select, textarea, [contenteditable]:not([contenteditable="false"])')) return;
      event.preventDefault();
      press();
    }
    toggle.addEventListener('change', change);
    close.addEventListener('click', press);
    root.addEventListener('keydown', shortcut);
    let saved = false;
    try { saved = root.localStorage.getItem(STORAGE) === 'on'; } catch (_) {}
    setEnabled(saved);
    return {sync, refresh, destroy() {
      setEnabled(false);
      root.removeEventListener('keydown', shortcut);
      toggle.removeEventListener('change', change);
      close.removeEventListener('click', press);
    }};
  }
  return Object.freeze({attach, rawAt, range, linePath, clockLabel, sectionRows, zoomBounds, targetAt, flashesAround, weatherComparison});
});
