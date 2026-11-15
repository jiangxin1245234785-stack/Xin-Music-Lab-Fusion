(function(root){
  'use strict';
  // The timeline toolbar (2026-11-14): one row for the whole song, a second row 「本轨」 only while one lane is
  // focused, and the seldom-used controls behind 「更多 ▾」. Controls are moved, never copied, so every id,
  // listener and owner stays where it was; only their place on screen changes.
  //
  //   row 1      timelineAudition · timelineOriginal · zoom − / label / + · timelineLocate · timelineLoopChoose ·
  //              timelineMore · status        (圈选区间 keeps its own rule: usable without a focus while playing)
  //   row 2      timelineFocusExit · midiEditToggle · timelineEvidenceCheck · timelineEvidenceApply (always there,
  //              disabled until there is something to fix) · [timelineEvidenceExtend when n > 0] · midiExport · status
  //   更多       timelineStrip · timelineAnnotate · timelineSelectNotes · timelineProperties ·
  //              核对全部轨 · 精修全部轨 · [timelineEvidenceExtend without a focus]
  //
  // A mode that lives in the menu (标注, 选择音符) is named on the 更多 button while it is on, so nobody is left in
  // a mode they cannot see.
  const MODE_KEYS = {annotating: 'runtime.timeline.moreAnnotating', selecting: 'runtime.timeline.moreSelecting'};
  function moreLabel(modes, rt) {
    const mode = modes?.annotating ? 'annotating' : modes?.selecting ? 'selecting' : null;
    return {text: rt('runtime.timeline.more') + (mode ? ' · ' + rt(MODE_KEYS[mode]) : '') + ' ▾', mode};
  }

  function create({document: doc = root.document, rt, onCheckAll, onApplyAll} = {}) {
    const $ = id => doc.getElementById(id);
    const main = $('timelineAudition')?.parentElement;
    if (!main || $('timelineMore')) return null;
    const make = (tag, props = {}) => Object.assign(doc.createElement(tag), props);
    const take = ids => ids.map($).filter(Boolean);
    main.classList.add('timeline-main-bar');

    // --- 更多 and its menu ---
    const more = make('button', {type: 'button', id: 'timelineMore', className: 'quiet-button'});
    more.setAttribute('aria-haspopup', 'true');
    more.setAttribute('aria-expanded', 'false');
    more.setAttribute('aria-controls', 'timelineMoreMenu');
    const menu = make('div', {id: 'timelineMoreMenu', className: 'timeline-more-menu'});
    menu.hidden = true;
    menu.setAttribute('role', 'group');
    const wrap = make('span', {className: 'timeline-more'});
    wrap.append(more, menu);
    const strip = $('timelineStripLabel')?.parentElement;
    if (strip) menu.append(strip);
    menu.append(...take(['timelineAnnotate', 'timelineSelectNotes']));
    // workbench-properties.js creates 属性 later and puts it in this slot; before it does, the slot is empty.
    const slot = make('span', {id: 'timelineMoreProperties'});
    slot.hidden = true;
    menu.append($('timelineProperties') || slot);
    let checkAll = null, applyAll = null, allStatus = null;
    if ($('timelineEvidenceCheck')) {
      checkAll = make('button', {type: 'button', id: 'timelineEvidenceCheckAll', className: 'quiet-button'});
      applyAll = make('button', {type: 'button', id: 'timelineEvidenceApplyAll', className: 'quiet-button'});
      applyAll.setAttribute('aria-pressed', 'false');
      checkAll.dataset.keepOpen = applyAll.dataset.keepOpen = '1';
      allStatus = make('p', {id: 'timelineEvidenceAllStatus', className: 'timeline-more-status'});
      allStatus.setAttribute('role', 'status');
      checkAll.addEventListener('click', () => onCheckAll?.());
      applyAll.addEventListener('click', () => onApplyAll?.());
      menu.append(checkAll, applyAll, allStatus);
    }
    // 延长写短的音（n）: one node, moved by render() between row 2 (focused, n > 0) and the menu (next to 精修全部轨).
    const extend = $('timelineEvidenceExtend')?.parentElement;
    if (extend) { extend.className = 'timeline-more-check'; extend.removeAttribute?.('style'); (applyAll ? applyAll.after(extend) : menu.append(extend)); }

    // --- row 1 ---
    const anchor = $('timelineOriginal') || $('timelineAudition');
    anchor.after(...take(['timelineZoomOut', 'noteTimelineZoomLabel', 'timelineZoomIn', 'timelineLocate', 'timelineLoopChoose']), wrap);
    const status = $('timelineAuditionStatus');
    if (status) main.append(status);

    // --- row 2: 本轨 ---
    let lane = $('timelineEvidence');
    if (!lane) { lane = make('div', {id: 'timelineEvidence'}); }
    lane.className = 'timeline-audition timeline-lane-bar';
    main.after(lane);
    lane.append(...take(['timelineFocusExit', 'midiEditToggle', 'timelineEvidenceCheck', 'timelineEvidenceApply', 'midiExport', 'timelineEvidenceStatus']));
    // The exit button used to hide itself outside focus; the whole row does that now.
    lane.hidden = true;
    // Everything has left the header's control group (strip, locate, annotate, exit, zoom).
    const head = doc.querySelector?.('.timeline-zoom');
    if (head && !head.children.length) head.hidden = true;

    // --- open / close ---
    let view = {};
    function isOpen() { return !menu.hidden; }
    function open() {
      if (isOpen()) return;
      menu.hidden = false; more.setAttribute('aria-expanded', 'true');
      render(view);
      // Hang the menu from the button's left edge, or from its right edge when that would cross the window.
      menu.style.left = ''; menu.style.right = '';
      const box = menu.getBoundingClientRect?.(), width = root.innerWidth || doc.documentElement?.clientWidth || 0;
      if (box && width && box.right > width - 8) { menu.style.left = 'auto'; menu.style.right = '0'; }
    }
    function close(returnFocus = false) {
      if (!isOpen()) return false;
      menu.hidden = true; more.setAttribute('aria-expanded', 'false');
      if (returnFocus) more.focus?.();
      return true;
    }
    more.addEventListener('click', () => { if (isOpen()) close(); else open(); });
    // A pick from the menu closes it. The two evidence actions keep it open: their progress is shown inside.
    menu.addEventListener('click', event => {
      const button = event.target?.closest?.('button');
      if (button && !button.dataset.keepOpen) close();
    });
    strip?.querySelector?.('select')?.addEventListener('change', () => close());
    doc.addEventListener?.('pointerdown', event => {
      if (isOpen() && !wrap.contains(event.target)) close();
    }, true);

    function render(next = view) {
      view = next || {};
      const label = moreLabel(view, rt);
      if (more.textContent !== label.text) more.textContent = label.text;
      more.classList.toggle('active', Boolean(label.mode));
      more.dataset.mode = label.mode || '';
      lane.hidden = !view.focused;
      const fixable = Boolean(view.fixable || view.armed);
      // 精修 stays in place, disabled by its own rule in timeline-controls.js, so a finished check moves nothing.
      const apply = $('timelineEvidenceApply');
      if (apply) apply.hidden = false;
      if (checkAll) {
        checkAll.textContent = rt(view.busy && !view.focused ? 'runtime.evidence.working' : 'runtime.evidence.checkAll');
        checkAll.disabled = Boolean(view.focused || view.busy || view.loading || !view.targets);
        checkAll.title = rt(view.focused ? 'runtime.evidence.checkAllFocused' : 'runtime.evidence.checkHint');
        applyAll.hidden = Boolean(view.focused) || !fixable;
        applyAll.textContent = rt(view.armed ? 'runtime.evidence.confirm' : 'runtime.evidence.applyAll');
        applyAll.disabled = Boolean(apply?.disabled);
        applyAll.title = apply?.title || '';
        applyAll.setAttribute('aria-pressed', view.armed ? 'true' : 'false');
        const text = view.focused ? '' : ($('timelineEvidenceStatus')?.textContent || '');
        allStatus.textContent = text;
        allStatus.hidden = !text;
      }
      if (extend) {
        const inRow = Boolean(view.focused && view.short && apply);
        if (inRow && extend.parentElement !== lane) apply.after(extend);
        else if (!inRow && extend.parentElement !== menu) (applyAll ? applyAll.after(extend) : menu.append(extend));
        extend.hidden = !view.short;
      }
    }
    render({});
    return {render, open, close, isOpen, element: menu, button: more, row: lane};
  }

  root.XldTimelineToolbar = {create, moreLabel};
  if (typeof module === 'object' && module.exports) module.exports = root.XldTimelineToolbar;
})(globalThis);
