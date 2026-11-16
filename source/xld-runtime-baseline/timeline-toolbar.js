(function(root){
  'use strict';
  // The timeline toolbar (2026-11-14): one row for the whole song; with one lane open, the lane page's two rows.
  // Controls are moved, never copied, so every id, listener and owner stays where it was; only their place on
  // screen changes.
  //
  // Whole song (no lane open):
  //   row 1      timelineAudition · timelineOriginal · zoom − / label / + · timelineLocate · timelineLoopChoose ·
  //              timelineMore · status        (圈选区间 keeps its own rule: usable without a focus while playing)
  //   row 2      hidden (holds the lane controls between visits)
  //   更多       timelineStrip · timelineAnnotate · timelineSelectNotes · timelineProperties ·
  //              核对全部轨 · 精修全部轨 · [timelineEvidenceExtend]
  //
  // Lane page (lane-page round, 2026-11-14), row 1 is for looking, row 2 for changing:
  //   row 1      timelineFocusExit · ‹ › (other lanes) · title · the lane's version / M / S / ⋯ · timelineAudition ·
  //              timelineOriginal · zoom − / label / + · pitch − / 适应 / + · timelineLocate · timelineLoopChoose · status
  //   row 2      midiEditToggle · timelineSelectNotes · timelineEvidenceCheck · timelineEvidenceApply ·
  //              [timelineEvidenceExtend when n > 0] · 上一处 n / m 下一处 · midiExport · timelineMore · status
  //   更多       timelineStrip · timelineAnnotate · timelineProperties   (核对全部轨 / 精修全部轨 are whole-song actions)
  //
  // A mode that lives in the menu (标注, 选择音符) is named on the 更多 button while it is on, so nobody is left in
  // a mode they cannot see.
  const MODE_KEYS = {annotating: 'runtime.timeline.moreAnnotating', selecting: 'runtime.timeline.moreSelecting'};
  function moreLabel(modes, rt) {
    const mode = modes?.annotating ? 'annotating' : modes?.selecting ? 'selecting' : null;
    return {text: rt('runtime.timeline.more') + (mode ? ' · ' + rt(MODE_KEYS[mode]) : '') + ' ▾', mode};
  }

  function create({document: doc = root.document, rt, onCheckAll, onApplyAll, onLaneStep, onPitch, onIssue, merged, onMerge} = {}) {
    const $ = id => doc.getElementById(id);
    const main = $('timelineAudition')?.parentElement;
    if (!main || $('timelineMore')) return null;
    const make = (tag, props = {}) => Object.assign(doc.createElement(tag), props);
    const take = ids => ids.map($).filter(Boolean);
    const button = (id, onClick) => { const node = make('button', {type: 'button', id, className: 'quiet-button'}); node.addEventListener('click', () => onClick?.()); return node; };
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
    // 合并同类乐器声部 (W1): the switch XML has, here for the timeline's lanes.
    const merge = make('label', {className: 'timeline-more-check'});
    const mergeBox = make('input', {type: 'checkbox', id: 'timelineMergeTimbres'});
    const mergeText = make('span', {id: 'timelineMergeTimbresLabel'});
    merge.append(mergeBox, mergeText);
    mergeBox.checked = Boolean(merged ? merged() : true);
    mergeBox.addEventListener('change', () => onMerge?.(Boolean(mergeBox.checked)));
    menu.append(merge);
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

    // --- the lane page's own controls (kept off the page while no lane is open) ---
    const holder = make('div');
    const lanePrev = button('timelineLanePrev', () => onLaneStep?.(-1));
    const laneNext = button('timelineLaneNext', () => onLaneStep?.(1));
    const title = make('span', {id: 'lanePageTitle', className: 'lane-page-title'});
    const track = make('span', {id: 'lanePageTrack', className: 'lane-page-track'});
    const pitch = make('span', {id: 'lanePagePitch', className: 'lane-page-group'});
    const pitchOut = button('timelinePitchOut', () => onPitch?.(-1));
    const pitchFit = button('timelinePitchFit', () => onPitch?.(0));
    const pitchIn = button('timelinePitchIn', () => onPitch?.(1));
    pitch.append(pitchOut, pitchFit, pitchIn);
    const issue = make('span', {id: 'lanePageIssues', className: 'lane-page-group'});
    const issuePrev = button('timelineIssuePrev', () => onIssue?.(-1));
    const issueCount = make('span', {id: 'timelineIssueCount', className: 'lane-page-count'});
    const issueNext = button('timelineIssueNext', () => onIssue?.(1));
    issue.append(issuePrev, issueCount, issueNext);
    holder.append(lanePrev, laneNext, title, track, pitch, issue);

    // --- row 2 ---
    let lane = $('timelineEvidence');
    if (!lane) { lane = make('div', {id: 'timelineEvidence'}); }
    lane.className = 'timeline-audition timeline-lane-bar';
    main.after(lane);
    // The exit button used to hide itself outside focus; the whole row does that now.
    lane.hidden = true;

    // --- where everything sits, for the whole song or for one lane ---
    let arranged = null;
    function arrange(page) {
      if (arranged === page) return;
      arranged = page;
      const status = $('timelineAuditionStatus'), laneStatus = $('timelineEvidenceStatus');
      if (page) {
        main.prepend(...take(['timelineFocusExit']), lanePrev, laneNext, title, track,
          ...take(['timelineAudition', 'timelineOriginal', 'timelineZoomOut', 'noteTimelineZoomLabel', 'timelineZoomIn']), pitch,
          ...take(['timelineLocate', 'timelineLoopChoose']));
        lane.prepend(...take(['midiEditToggle', 'timelineSelectNotes', 'timelineEvidenceCheck', 'timelineEvidenceApply']), issue,
          ...take(['midiExport']), wrap);
      } else {
        main.prepend(...take(['timelineAudition', 'timelineOriginal', 'timelineZoomOut', 'noteTimelineZoomLabel', 'timelineZoomIn', 'timelineLocate', 'timelineLoopChoose']), wrap);
        lane.prepend(...take(['timelineFocusExit', 'midiEditToggle', 'timelineEvidenceCheck', 'timelineEvidenceApply', 'midiExport']));
        const select = $('timelineSelectNotes'), annotate = $('timelineAnnotate');
        if (select) { if (annotate?.parentElement === menu) annotate.after(select); else menu.prepend(select); }
        holder.append(lanePrev, laneNext, title, track, pitch, issue);
      }
      if (status) main.append(status);
      if (laneStatus) lane.append(laneStatus);
    }
    arrange(false);
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
      const picked = event.target?.closest?.('button');
      if (picked && !picked.dataset.keepOpen) close();
    });
    strip?.querySelector?.('select')?.addEventListener('change', () => close());
    doc.addEventListener?.('pointerdown', event => {
      if (isOpen() && !wrap.contains(event.target)) close();
    }, true);

    const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
    function renderPage(page = {}) {
      setText(lanePrev, '‹'); setText(laneNext, '›');
      lanePrev.title = rt('runtime.lanePage.prevLane'); laneNext.title = rt('runtime.lanePage.nextLane');
      lanePrev.disabled = laneNext.disabled = !(page.lanes > 1);
      setText(title, page.title || ''); title.title = page.title || '';
      const p = page.pitch || {};
      setText(pitchOut, '−'); setText(pitchIn, '+'); setText(pitchFit, rt('runtime.lanePage.pitchFit'));
      pitchOut.title = rt('runtime.lanePage.pitchOut'); pitchIn.title = rt('runtime.lanePage.pitchIn'); pitchFit.title = rt('runtime.lanePage.pitchFitHint');
      pitchOut.disabled = Boolean(p.off || p.row <= p.min); pitchIn.disabled = Boolean(p.off || p.row >= p.max);
      pitchFit.disabled = Boolean(p.off || !p.zoomed);
      pitch.title = rt('runtime.lanePage.pitch');
      const i = page.issues || {};
      setText(issuePrev, rt('runtime.lanePage.issuePrev')); setText(issueNext, rt('runtime.lanePage.issueNext'));
      issuePrev.disabled = issueNext.disabled = !(i.count > 0);
      issuePrev.title = issueNext.title = rt(!i.checked ? 'runtime.lanePage.issuesUnchecked' : i.count ? 'runtime.lanePage.issuesHint' : 'runtime.lanePage.issuesNone');
      setText(issueCount, i.count > 0 ? (i.at >= 0 ? i.at + 1 : '–') + ' / ' + i.count : '');
      issueCount.hidden = !(i.count > 0);
    }

    function render(next = view) {
      view = next || {};
      arrange(Boolean(view.focused));
      const label = moreLabel(view, rt);
      setText(mergeText, rt('runtime.timeline.mergeTimbres')); merge.title = rt('runtime.timeline.mergeTimbresHint');
      if (merged) mergeBox.checked = Boolean(merged());
      merge.hidden = Boolean(view.focused);   // the lane page shows one lane: nothing to merge there
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
        // On the lane page the menu holds only 轨下条带 / 标注 / 属性: the whole-song actions stay in the whole-song view.
        checkAll.hidden = Boolean(view.focused);
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
        // Right after 精修, also after arrange() has put the lane-page buttons back in front of it.
        if (inRow) { if (extend.parentElement !== lane || apply.nextElementSibling !== extend) apply.after(extend); }
        else if (extend.parentElement !== menu) (applyAll ? applyAll.after(extend) : menu.append(extend));
        extend.hidden = !view.short;
      }
      if (view.focused) renderPage(view.page);
    }
    render({});
    return {render, open, close, isOpen, element: menu, button: more, row: lane, slots: {track, title}};
  }

  root.XldTimelineToolbar = {create, moreLabel};
  if (typeof module === 'object' && module.exports) module.exports = root.XldTimelineToolbar;
})(globalThis);
