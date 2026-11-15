'use strict';
// The timeline toolbar (2026-11-14): one row without a focused lane, two with one, the seldom-used controls in
// 「更多 ▾」. Builds the toolbar against a small DOM double shaped like index.html after the evidence row is
// inserted, and checks: the controls are moved (same nodes, same ids), row 2 is hidden without a focus, the menu
// opens and closes (button, outside click, a pick, Esc first), and a mode living in the menu shows on the button.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// --- a DOM double: a tree with moving, bubbling clicks and lookups by id -------------------------------------------
class Node {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase(); this.children = []; this.parentElement = null; this.attributes = {};
    this.listeners = {}; this.dataset = {}; this.style = {}; this.hidden = false; this.disabled = false;
    this.textContent = ''; this.title = ''; this.id = ''; this.className = '';
    const self = this;
    this.classList = {
      add: (...names) => { for (const n of names) if (!self.classList.contains(n)) self.className = (self.className + ' ' + n).trim(); },
      remove: n => { self.className = self.className.split(/\s+/).filter(c => c && c !== n).join(' '); },
      contains: n => self.className.split(/\s+/).includes(n),
      toggle: (n, force) => { const on = force === undefined ? !self.classList.contains(n) : Boolean(force); if (on) self.classList.add(n); else self.classList.remove(n); return on; }
    };
  }
  detach() { if (this.parentElement) { const list = this.parentElement.children; list.splice(list.indexOf(this), 1); this.parentElement = null; } }
  append(...items) { for (const item of items) { item.detach(); item.parentElement = this; this.children.push(item); } }
  prepend(...items) { for (const item of items.reverse()) { item.detach(); item.parentElement = this; this.children.unshift(item); } }
  after(...items) {
    const parent = this.parentElement; let at = parent.children.indexOf(this) + 1;
    for (const item of items) { item.detach(); item.parentElement = parent; at = Math.min(at, parent.children.length); parent.children.splice(at++, 0, item); }
  }
  replaceWith(item) { this.after(item); this.detach(); }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; }
  removeAttribute(k) { delete this.attributes[k]; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  dispatch(type, init = {}) {
    const event = {type, target: this, preventDefault() {}, ...init};
    for (let node = this; node; node = node.parentElement) for (const fn of node.listeners[type] || []) fn(event);
    return event;
  }
  click() { if (!this.disabled) this.dispatch('click'); }
  focus() { doc.activeElement = this; }
  contains(other) { for (let n = other; n; n = n.parentElement) if (n === this) return true; return false; }
  closest(selector) { const tag = selector.toUpperCase(); for (let n = this; n; n = n.parentElement) if (n.tagName === tag) return n; return null; }
  walk(fn) { for (const child of this.children) { if (fn(child)) return child; const hit = child.walk(fn); if (hit) return hit; } return null; }
  querySelector(selector) {
    if (selector.startsWith('.')) return this.walk(n => n.classList.contains(selector.slice(1)));
    return this.walk(n => n.tagName === selector.toUpperCase());
  }
  getBoundingClientRect() { return {left: 0, right: 200, width: 200, top: 0, bottom: 30, height: 30}; }
}
const body = new Node('body');
const docListeners = {};
const doc = {
  body, activeElement: null,
  createElement: tag => new Node(tag),
  getElementById: id => body.walk(n => n.id === id),
  querySelector: selector => body.querySelector(selector),
  addEventListener: (type, fn) => { (docListeners[type] ||= []).push(fn); }
};
const el = (tag, id, parent, props = {}) => { const n = new Node(tag); n.id = id || ''; Object.assign(n, props); parent.append(n); return n; };

// index.html's timeline card, after workbench-properties.js and timeline-controls.js bindEvidence() have run
// (properties is created later, so it is absent here; see the slot test below).
const card = el('section', 'workspaceTimeline', body);
const head = el('div', '', card, {className: 'timeline-head'});
const zoom = el('div', '', head, {className: 'timeline-zoom'});
const stripLabel = el('label', '', zoom, {className: 'timeline-strip'});
el('span', 'timelineStripLabel', stripLabel); el('select', 'timelineStrip', stripLabel);
for (const id of ['timelineLocate', 'timelineAnnotate', 'timelineFocusExit', 'timelineZoomOut', 'noteTimelineZoomLabel', 'timelineZoomIn']) el('button', id, zoom);
const bar = el('div', '', card, {className: 'timeline-audition'});
for (const id of ['timelineAudition', 'timelineOriginal', 'midiEditToggle', 'timelineSelectNotes', 'timelineLoopChoose', 'midiExport']) el('button', id, bar);
el('span', 'timelineAuditionStatus', bar);
const evidence = el('div', 'timelineEvidence', card, {className: 'timeline-audition timeline-evidence'});
el('button', 'timelineEvidenceCheck', evidence); el('button', 'timelineEvidenceApply', evidence);
const extendLabel = el('label', '', evidence); extendLabel.setAttribute('style', 'display:inline-flex');
el('input', 'timelineEvidenceExtend', extendLabel); el('span', 'timelineEvidenceExtendLabel', extendLabel);
el('span', 'timelineEvidenceStatus', evidence);
el('div', 'timelineLanes', card);

const before = new Map(['timelineAudition', 'timelineStrip', 'timelineAnnotate', 'timelineSelectNotes', 'midiEditToggle', 'timelineEvidenceExtend', 'timelineFocusExit']
  .map(id => [id, doc.getElementById(id)]));
const sandbox = {document: doc, innerWidth: 1200, console};
vm.runInNewContext(read('timeline-toolbar.js'), sandbox);
const api = sandbox.XldTimelineToolbar;
assert(api && typeof api.create === 'function', 'the toolbar registers itself');

const rt = (key, params) => ({
  'runtime.timeline.more': '更多', 'runtime.timeline.moreAnnotating': '标注中', 'runtime.timeline.moreSelecting': '选择音符中'
}[key] || key) + (params ? JSON.stringify(params) : '');
let checkedAll = 0, appliedAll = 0;
const pageCalls = [];
const toolbar = api.create({document: doc, rt, onCheckAll: () => { checkedAll += 1; }, onApplyAll: () => { appliedAll += 1; },
  onLaneStep: d => pageCalls.push(['lane', d]), onPitch: d => pageCalls.push(['pitch', d]), onIssue: d => pageCalls.push(['issue', d])});
assert(toolbar, 'built once');
assert.equal(api.create({document: doc, rt}), null, 'a second call does not build a second toolbar');

// --- the same nodes, moved -----------------------------------------------------------------------------------------
for (const [id, node] of before) assert.equal(doc.getElementById(id), node, `${id} is the same node, moved not copied`);
const ids = parent => parent.children.map(n => n.id || n.className);
const more = doc.getElementById('timelineMore'), menu = doc.getElementById('timelineMoreMenu'), row2 = doc.getElementById('timelineEvidence');
assert.deepEqual(ids(bar), ['timelineAudition', 'timelineOriginal', 'timelineZoomOut', 'noteTimelineZoomLabel', 'timelineZoomIn', 'timelineLocate', 'timelineLoopChoose', 'timeline-more', 'timelineAuditionStatus'],
  'row 1: play, compare, zoom, locate, range, more, status (range works without a focus while playing)');
assert.equal(bar.nextSibling ?? card.children[card.children.indexOf(bar) + 1], row2, 'row 2 sits right under row 1');
assert.deepEqual(ids(row2), ['timelineFocusExit', 'midiEditToggle', 'timelineEvidenceCheck', 'timelineEvidenceApply', 'midiExport', 'timelineEvidenceStatus'],
  'row 2: back, edit, check, refine, export, status');
assert.deepEqual(ids(menu), ['timeline-strip', 'timelineAnnotate', 'timelineSelectNotes', 'timelineMoreProperties', 'timelineEvidenceCheckAll', 'timelineEvidenceApplyAll', 'timeline-more-check', 'timelineEvidenceAllStatus'],
  'menu: strip, annotate, select, properties slot, check all, refine all, lengthen, status');
assert.equal(zoom.hidden, true, 'the emptied header group is hidden');
assert.equal(extendLabel.getAttribute('style'), null, 'the lengthen label loses its inline layout to the menu style');

// --- row 2 only with a focused lane ---------------------------------------------------------------------------------
toolbar.render({focused: false, targets: 3});
assert.equal(row2.hidden, true, 'no focused lane: row 2 is hidden');
assert.equal(doc.getElementById('timelineEvidenceCheckAll').disabled, false, 'check every part is offered without a focus');
// --- the lane page: a lane open rearranges the same nodes into two rows (look / change) -------------------------------
const row1Overview = ids(bar), row2Overview = ids(row2), menuOverview = ids(menu);
const shown = parent => parent.children.filter(n => !n.hidden).map(n => n.id || n.className);
toolbar.render({focused: true, targets: 1, page: {lanes: 3, title: 'Mirrors · bass · HiRes Bass · 1539', pitch: {row: 18, min: 6, max: 40, zoomed: false}, issues: {count: 0, at: -1, checked: false}}});
assert.equal(row2.hidden, false, 'a focused lane shows row 2');
assert.deepEqual(ids(bar), ['timelineFocusExit', 'timelineLanePrev', 'timelineLaneNext', 'lanePageTitle', 'lanePageTrack', 'timelineAudition', 'timelineOriginal',
  'timelineZoomOut', 'noteTimelineZoomLabel', 'timelineZoomIn', 'lanePagePitch', 'timelineLocate', 'timelineLoopChoose', 'timelineAuditionStatus'],
  'lane page row 1 (look): back, other lanes, title, the lane controls, play, compare, time zoom, pitch zoom, locate, range, status');
assert.deepEqual(ids(row2), ['midiEditToggle', 'timelineSelectNotes', 'timelineEvidenceCheck', 'timelineEvidenceApply', 'lanePageIssues', 'midiExport', 'timeline-more', 'timelineEvidenceStatus'],
  'lane page row 2 (change): edit, select, check, refine, problem notes, export, more, status');
assert.deepEqual(shown(menu), ['timeline-strip', 'timelineAnnotate'],
  'the lane page menu: strip, annotate (and 属性 once it exists); no whole-song actions');
assert.equal(doc.getElementById('timelineEvidenceCheckAll').hidden, true, 'check every part is a whole-song action');
assert.equal(doc.getElementById('timelineLanePrev').disabled, false, 'three lanes: ‹ › usable');
assert.equal(doc.getElementById('lanePageTitle').textContent, 'Mirrors · bass · HiRes Bass · 1539');
assert.equal(doc.getElementById('timelinePitchFit').disabled, true, 'fit is idle until the rows were zoomed by hand');
assert.equal(doc.getElementById('timelineIssuePrev').disabled, true, 'no check, no problem notes to walk');
assert.equal(doc.getElementById('timelineIssueCount').hidden, true);
assert.equal(doc.getElementById('timelineEvidenceApply').hidden, false, 'refine is always in row 2 (disabled by its own rule), so nothing shifts');
assert.equal(extendLabel.hidden, true, 'lengthen (n) only when n > 0');
assert.equal(extendLabel.parentElement, menu, 'n = 0: the lengthen box stays in the menu');
const row2Before = ids(row2).slice(0, 4);
toolbar.render({focused: true, targets: 1, fixable: true, short: 3, page: {lanes: 1, pitch: {row: 40, min: 6, max: 40, zoomed: true}, issues: {count: 17, at: 2, checked: true}}});
assert.equal(doc.getElementById('timelineEvidenceApply').hidden, false);
assert.equal(extendLabel.hidden, false);
assert.equal(extendLabel.parentElement, row2, 'focused and n > 0: lengthen moves into row 2');
assert.deepEqual(ids(row2), ['midiEditToggle', 'timelineSelectNotes', 'timelineEvidenceCheck', 'timelineEvidenceApply', 'timeline-more-check', 'lanePageIssues', 'midiExport', 'timeline-more', 'timelineEvidenceStatus'], 'right after refine');
assert.deepEqual(ids(row2).slice(0, 4), row2Before, 'the buttons up to refine keep their places after a check');
assert.equal(doc.getElementById('timelineEvidenceExtend'), before.get('timelineEvidenceExtend'), 'one node, moved, not a copy');
assert.equal(doc.getElementById('timelineEvidenceApplyAll').hidden, true, 'refine every part is a no-focus action');
assert.equal(doc.getElementById('timelineLaneNext').disabled, true, 'one lane: nowhere to step');
assert.equal(doc.getElementById('timelinePitchIn').disabled, true, 'at 40 px the rows cannot grow');
assert.equal(doc.getElementById('timelinePitchFit').disabled, false, 'zoomed by hand: fit is offered');
assert.equal(doc.getElementById('timelineIssueCount').textContent, '3 / 17', 'which problem note, of how many');
assert.equal(doc.getElementById('timelineIssueNext').disabled, false);
toolbar.render({focused: false, targets: 3, fixable: true, short: 3});
assert.deepEqual(ids(bar), row1Overview, 'leaving the lane page puts row 1 back exactly');
assert.equal(doc.getElementById('timelineEvidenceApplyAll').hidden, false);
assert.equal(extendLabel.parentElement, menu, 'no focus: lengthen goes back to the menu');
assert.equal(menu.children[menu.children.indexOf(doc.getElementById('timelineEvidenceApplyAll')) + 1], extendLabel, 'next to refine every part');
assert.deepEqual(ids(menu), menuOverview, 'and the menu, 选择音符 included');
toolbar.render({focused: true, targets: 1, short: 0});
assert.equal(extendLabel.parentElement, menu, 'focused with n = 0: not in row 2');
toolbar.render({focused: false, targets: 3, fixable: true});
assert.deepEqual(ids(row2), row2Overview, 'row 2 holds the lane controls again between visits');
assert.equal(doc.getElementById('timelineLanePrev'), null, 'the lane page controls are off the page without a lane');
toolbar.render({focused: true, targets: 1, page: {lanes: 2, pitch: {row: 18, min: 6, max: 40, zoomed: true}, issues: {count: 4, at: -1, checked: true}}});
for (const id of ['timelineLanePrev', 'timelineLaneNext', 'timelinePitchOut', 'timelinePitchFit', 'timelinePitchIn', 'timelineIssuePrev', 'timelineIssueNext']) doc.getElementById(id).click();
assert.deepEqual(pageCalls, [['lane', -1], ['lane', 1], ['pitch', -1], ['pitch', 0], ['pitch', 1], ['issue', -1], ['issue', 1]], 'the lane page buttons call back into the timeline');
assert.equal(doc.getElementById('timelineIssueCount').textContent, '– / 4', 'before the first jump: which one is not known yet');
toolbar.render({focused: false, targets: 3, fixable: true});

// --- the menu opens and closes ----------------------------------------------------------------------------------------
assert.equal(menu.hidden, true, 'closed at start');
more.click();
assert.equal(menu.hidden, false, 'the button opens it'); assert.equal(more.getAttribute('aria-expanded'), 'true');
more.click();
assert.equal(menu.hidden, true, 'and closes it');
more.click();
for (const fn of docListeners.pointerdown) fn({target: doc.getElementById('timelineLanes')});
assert.equal(menu.hidden, true, 'a press outside closes it');
more.click();
for (const fn of docListeners.pointerdown) fn({target: doc.getElementById('timelineAnnotate')});
assert.equal(menu.hidden, false, 'a press inside does not');
doc.getElementById('timelineAnnotate').click();
assert.equal(menu.hidden, true, 'picking a control closes it');
more.click();
doc.getElementById('timelineEvidenceCheckAll').click();
assert.equal(checkedAll, 1, 'check every part runs the unfocused check');
assert.equal(menu.hidden, false, 'and keeps the menu open, where its progress shows');
doc.getElementById('timelineEvidenceApplyAll').click();
assert.equal(appliedAll, 1);
assert.equal(toolbar.close(true), true, 'close() reports it closed an open menu (Esc uses this)');
assert.equal(doc.activeElement, more, 'and gives focus back to 更多');
assert.equal(toolbar.close(true), false, 'a closed menu lets Esc go on to its usual order');

// --- a mode in the menu shows on the button --------------------------------------------------------------------------
toolbar.render({focused: true});
assert.equal(more.textContent, '更多 ▾'); assert.equal(more.classList.contains('active'), false);
toolbar.render({focused: true, annotating: true});
assert.equal(more.textContent, '更多 · 标注中 ▾', 'annotating is named on the button');
assert.equal(more.classList.contains('active'), true, 'and drawn as on (the family accent, no new colour)');
toolbar.render({focused: true, selecting: true});
assert.equal(more.textContent, '更多 · 选择音符中 ▾', 'selecting notes is named too');
assert.equal(api.moreLabel({annotating: true, selecting: true}, rt).mode, 'annotating', 'the modes are exclusive; annotate wins if both are reported');

// --- 属性 takes its slot ------------------------------------------------------------------------------------------------
toolbar.render({focused: false});
{
  const props = read('workbench-properties.js');
  assert(/\$\('timelineMoreProperties'\)[\s\S]{0,40}replaceWith\(launch\)/.test(props), '属性 replaces the menu slot');
  const slot = doc.getElementById('timelineMoreProperties'), launch = new Node('button'); launch.id = 'timelineProperties';
  slot.replaceWith(launch);
  assert.equal(menu.children[3], launch, '属性 sits after 选择音符 in the menu');
}

// --- wiring in the page and the timeline controller ------------------------------------------------------------------
const html = read('index.html'), controls = read('timeline-controls.js');
assert(/<script src="timeline-toolbar\.js"><\/script>\s*<script src="timeline-controls\.js">/.test(html), 'the toolbar loads before the timeline controller');
assert(/XldTimelineToolbar\?\.create\(/.test(controls), 'the controller builds the toolbar');
assert(/selecting: noteSelecting && !midiEditor\?\.active\(\)/.test(controls), 'select mode (not the editor, which has its own row-2 button) marks 更多');
const esc = controls.slice(controls.indexOf("event.key !== 'Escape'"));
assert(esc.indexOf('toolbar?.close(true)') > 0 && esc.indexOf('toolbar?.close(true)') < esc.indexOf('cancelNoteGesture'), 'Esc closes the menu before anything else');
const messages = read('i18n/runtime-messages.js');
for (const key of ['runtime.timeline.more', 'runtime.timeline.moreAnnotating', 'runtime.timeline.moreSelecting', 'runtime.evidence.checkAll', 'runtime.evidence.checkAllFocused', 'runtime.evidence.applyAll', 'runtime.mix.title'])
  assert.equal((messages.match(new RegExp(`"${key.replace(/\./g, '\\.')}"`, 'g')) || []).length, 2, `${key} in both locales`);
assert(!/"runtime\.mix\.hint": "[^"]*合成音色/.test(messages), 'the standing synth note left the status line (it is the play button tooltip now)');

console.log('timeline-toolbar: ok (controls moved not copied, row 2 only when focused, menu opens / closes / Esc first, menu modes show on 更多)');
