'use strict';
// timeline.7: section, chord and MIDI note lanes on one shared time axis, single-lane focus, a playhead that
// follows playback, annotating on the chart, navigating a zoomed axis, and one strip per lane that reads either
// how the part is played (chordal / arpeggiated / linear) or how it sits against the chord (inside / adds / against).
// Checks the wiring (tab, panel, controller, IPC) and exercises the controller against a DOM double so the
// lane composition, shared duration, zoom and playhead maths are covered without Electron.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// --- wiring -------------------------------------------------------------------------------------
const html = read('index.html');
assert(html.includes('data-workspace-tab="timeline"') && html.includes('data-workspace-copy="timeline"'), 'timeline tab present');
assert(html.includes('id="workspaceTimeline"') && html.includes('id="timelineLanes"'), 'timeline panel present');
assert(html.includes('timeline-controls.js'), 'controller script included');
assert(html.includes('id="timelineFocusExit"'), 'focus exit button present');
assert(html.includes('id="timelineAnnotate"') && html.includes('id="timelineEditor"'), 'annotate toggle and editor present');
assert(html.includes('id="timelineLocate"'), 'locate control present');
assert(html.includes('id="timelineStrip"'), 'the strip selector is present');
// Alt belongs to the Windows menu bar; the pan modifier must not fight it.
assert(!/altKey/.test(read('timeline-controls.js')), 'Alt is not used as a modifier');
assert(html.indexOf('data-workspace-tab="timeline"') > html.indexOf('data-workspace-tab="midi"'), 'timeline tab sits after the transcription tab');
const workspace = read('workspace-controls.js');
assert(workspace.includes("'stems', 'midi', 'timeline'"), 'timeline registered as a tab');
assert(workspace.includes("const resultCards = ['section', 'harmony', 'stems', 'midi']"), 'overview keeps one card per result type, not per tab');
assert(workspace.includes("$('workspaceTimeline').hidden = false"), 'panel visibility wired');
const app = read('app.js');
assert(app.includes('window.XldTimelineControls.create('), 'controller created');
assert(app.includes('timelineControls?.render()'), 'controller re-renders with the app');
assert(app.includes('timelineControls?.refresh()'), 'loading a track re-reads the note lanes');
assert(/timeupdate[\s\S]{0,600}timelineControls\?\.updatePlayhead\(\)/.test(app), 'playback drives the playhead');
const main = read('desktop/main.cjs');
assert(main.includes("ipcMain.handle('assets:midi-notes'") && main.includes('async function readMidiNotes('), 'notes IPC present');
assert(read('desktop/preload.cjs').includes("readMidiNotes: (trackId, selection = null) => ipcRenderer.invoke('assets:midi-notes'"), 'notes IPC exposed');
const messages = read('i18n/runtime-messages.js');
assert.equal((messages.match(/"runtime\.workspace\.timeline"/g) || []).length, 2, 'tab label in both locales');
assert.equal((messages.match(/"runtime\.workspace\.midi": "转谱"/g) || []).length, 1, 'MIDI tab renamed to 转谱');
assert(!/"runtime\.workspace\.midi": "MIDI"/.test(messages), 'the old MIDI tab label is gone');
for (const key of ['title', 'hint', 'summary', 'segments', 'notes', 'manual', 'sync', 'focus', 'focusExit', 'focused',
  'annotate', 'annotateHint', 'manualChords', 'editSection', 'editChord', 'start', 'end', 'label', 'cancel', 'busy',
  'locate', 'locateHint', 'locateIdle', 'roleWhy', 'harmonyWhy', 'strip']) {
  assert.equal((messages.match(new RegExp(`"runtime\\.timeline\\.${key}"`, 'g')) || []).length, 2, `timeline.${key} in both locales`);
}
const css = read('workspace.css');
assert(css.includes('.tl-notes {') && css.includes('.tl-playhead'), 'note canvas and playhead styled');
assert(css.includes('.tl-focused .tl-notes-row .tl-row-body'), 'a focused lane gets its own height');
assert(css.includes('.tl-draft') && css.includes('.timeline-editor'), 'draft interval and editor styled');
assert(/\.tl-row-head \{[^}]*position:sticky/.test(css), 'lane heads stay pinned while the axis is panned');
assert(css.includes('.tl-scale.panning'), 'the ruler shows it can be grabbed');
assert(css.includes('.tl-roles') && css.includes('.tl-role '), 'the role strip is styled');
for (const role of ['block', 'arpeggio', 'line', 'unclear', 'rest']) {
  assert.equal((messages.match(new RegExp(`"runtime\\.timeline\\.role\\.${role}"`, 'g')) || []).length, 2, `role.${role} in both locales`);
}
for (const relation of ['fit', 'extend', 'clash', 'unclear', 'rest']) {
  assert.equal((messages.match(new RegExp(`"runtime\\.timeline\\.harmony\\.${relation}"`, 'g')) || []).length, 2, `harmony.${relation} in both locales`);
}
for (const degree of ['root', 'third', 'fifth', 'seventh', 'other']) {
  assert.equal((messages.match(new RegExp(`"runtime\\.timeline\\.inversion\\.${degree}"`, 'g')) || []).length, 2, `inversion.${degree} in both locales`);
}
for (const mode of ['role', 'harmony', 'off']) {
  assert.equal((messages.match(new RegExp(`"runtime\\.timeline\\.strip\\.${mode}"`, 'g')) || []).length, 2, `strip.${mode} in both locales`);
}
// A pinned head must stay opaque, or the notes underneath show through the lane name.
assert(!/\.tl-row-toggle \{[^}]*background:none/.test(css), 'the note lane head keeps the pinned background');
const controller = read('timeline-controls.js');
assert(controller.includes('MAX_CANVAS') && controller.includes('devicePixelRatio'), 'canvas width is capped against the device pixel ratio');
assert(!/addNote|editNote|quantiz/i.test(controller), 'note editing and quantisation stay out of scope');
// Model results must never be rewritten: the chart writes annotations, nothing else.
assert(!/saveAnalysis|writeResult|promoteResult/.test(controller), 'the chart does not write analysis results');
assert(main.includes("const kind = input?.kind === 'chord' ? 'chord' : 'section'"), 'annotations carry which axis they belong to');
assert(main.includes("tag.kind === 'chord' ? 'chord' : 'section'"), 'annotations written before the field existed read back as section marks');
assert(main.includes("manualTags: annotations.tags.filter(tag => tag.kind !== 'chord')"), 'the bridge keeps exporting section marks only');
assert(read('core/analysis-service.cjs').includes("tags.filter(tag => tag.kind !== 'chord')"), 'the service bridge agrees with the main one');

// --- controller behaviour against a DOM double ---------------------------------------------------
const nodes = new Map();
let deepGeometry=false;
const makeNode = (tag = 'div') => {
  const node = {
    tagName: tag, className: '', dataset: {}, style: {setProperty(name,value){this[name]=value;}}, children: [], attributes: {},
    textContent: '', disabled: false, hidden: false, _html: '',
    // Setting innerHTML clears children, like the real DOM — the controller relies on that to re-render.
    get innerHTML() { return this._html; },
    set innerHTML(value) { this._html = String(value); this.children = []; },
    append(...items) { for(const item of items)item.parent=this; this.children.push(...items); },
    listeners: {},
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    removeEventListener() {},
    remove() {},
    value: '',
    options: [],
    dispatch(type, event = {}) { for (const fn of this.listeners[type] || []) fn({ preventDefault() {}, ...event }); },
    setAttribute(name, value) { this.attributes[name] = value; },
    // Browsers clamp scrollLeft at 0 and so must the double, or a reveal near 0:00 scrolls into negative space.
    _scrollLeft: 0,
    get scrollLeft() { return this._scrollLeft; },
    set scrollLeft(value) { this._scrollLeft = Math.max(0, Number(value) || 0); },
    // A 1000 px viewport over a 1000 px lane; anything inside the scroller moves with scrollLeft, like the real thing.
    getBoundingClientRect() {
      const scroller = nodes.get('timelineLanes');
      const offset = this === scroller ? 0 : (scroller?.scrollLeft || 0);
      return { left: -offset, right: this.clientWidth - offset, width: this.clientWidth, top: 0, bottom: this.clientHeight, height: this.clientHeight };
    },
    // Chromium throws NotFoundError when the pointer id was never a real pointer, which is exactly what a
    // synthetic event is. Capture is an optimisation, so every gesture must still work when it fails.
    setPointerCapture() { throw new Error("Failed to execute 'setPointerCapture': No active pointer with the given id is found."); },
    releasePointerCapture() { throw new Error("Failed to execute 'releasePointerCapture': No active pointer with the given id is found."); },
    hasPointerCapture: () => false,
    paints: [], transforms: [], clears: 0, widthWrites: 0, heightWrites: 0,
    _width:300, _height:150,
    get width(){return this._width;},set width(v){this._width=v;this.widthWrites++;},
    get height(){return this._height;},set height(v){this._height=v;this.heightWrites++;},
    getContext() {
      if(!this.context) {
        this.context=Object.create(ctx);
        this.context.fillRect=(...args)=>{this.paints.push(args);ctx.fillRect(...args);};
        this.context.clearRect=(...args)=>{this.clears++;ctx.clearRect(...args);};
        this.context.setTransform=(...args)=>{this.transforms.push(args);ctx.setTransform(...args);};
      }
      return this.context;
    },
    get clientWidth() {
      if(this._clientWidth!==undefined)return this._clientWidth;
      if(deepGeometry && this.className==='tl-row-body'){
        let p=this.parent;while(p&&p.className!=='tl-canvas')p=p.parent;
        return 1000*parseFloat(p?.style.width||'100')/100;
      }
      return 1000;
    },
    get clientHeight() { return this._clientHeight ?? (this.style['--tl-pitch-height']?Math.min(500,parseFloat(this.style['--tl-pitch-height'])):72); },
    querySelectorAll(selector) { return collect(this, selector); },
    querySelector(selector) { return collect(this, selector)[0] || null; },
    classList: { toggle() {}, add() {}, remove() {} }
  };
  return node;
};
const drawn = [], labels = [];
const ctx = {
  setTransform() {}, clearRect() {}, fillRect(...args) { drawn.push(args); },
  fillText(text, x, y) { labels.push({ text, x, y }); },
  set fillStyle(v) {}, get fillStyle() { return ''; }, set globalAlpha(v) {}, get globalAlpha() { return 1; },
  set font(v) {}, get font() { return ''; }, set textBaseline(v) {}, get textBaseline() { return ''; }
};
function collect(node, selector) {
  const out = [];
  const want = selector.replace('.', '');
  const walk = item => {
    for (const child of item.children || []) {
      if (String(child.className || '').split(/\s+/).includes(want)) out.push(child);
      walk(child);
    }
  };
  walk(node);
  return out;
}
for (const id of ['workspace-tab-timeline', 'timelineFocusExit', 'timelineAnnotate', 'timelineLocate', 'timelineStrip', 'timelineStripLabel', 'timelineEditor', 'timelineEditorKind',
  'timelineEditorStart', 'timelineEditorEnd', 'timelineEditorLabel', 'timelineEditorStartLabel', 'timelineEditorEndLabel',
  'timelineEditorLabelLabel', 'timelineEditorSave', 'timelineEditorDelete', 'timelineEditorCancel', 'timelineEditorStatus',
  'timelineLanes', 'timelineTitle', 'timelineHint', 'timelineSummary', 'timelineReadout', 'noteTimelineZoomLabel', 'timelineZoomIn', 'timelineZoomOut', 'workspaceTimeline']) nodes.set(id, makeNode());
// The strip selector is a real <select> in the page, so the double carries its three options.
nodes.get('timelineStrip').options = ['role', 'harmony', 'off'].map(value => ({ value, textContent: '' }));
const sandbox = {
  window: {}, document: {
    getElementById: id => nodes.get(id) || null,
    createElement: tag => makeNode(tag)
  },
  requestAnimationFrame: fn => fn(),
  console
};
sandbox.window.devicePixelRatio = 2;
const windowListeners = {};
sandbox.window.addEventListener = (type, fn) => { (windowListeners[type] ||= []).push(fn); };
vm.runInNewContext(read('track-layout.js'), sandbox);sandbox.window.XldTrackLayout=sandbox.XldTrackLayout;
vm.runInNewContext(read('timeline-controls.js'), sandbox);
assert(sandbox.window.XldTimelineControls, 'controller registered on window');

const notes = Array.from({ length: 500 }, (_, i) => [i * 0.8, i * 0.8 + 0.4, 40 + (i % 24), 30 + (i % 90)]);
const state = {
  selectedTrack: { id: 'track-1', title: 'T' },
  currentTrack: { id: 'track-1' },
  analysisResults: new Map([
    ['songformer', { engine: { id: 'songformer', name: 'SongFormer' }, duration: 400, segments: [{ start: 0, end: 200, label: 'intro' }, { start: 200, end: 400, label: 'outro' }] }],
    ['chord-chordmini', { engine: { id: 'chord-chordmini', name: 'ChordMini' }, duration: 400, segments: [{ start: 0, end: 100, label: 'C' }, { start: 100, end: 400, label: 'Am' }] }]
  ]),
  annotations: [{ id: 'tag-1', start: 10, end: 20, label: 'note to self' }]
};
const audio = { currentTime: 100, duration: 400 };
const bridge = { readMidiNotes: async () => ({ ok: true, lanes: [{ stem: 'piano', engine: 'piano-transkun', engineName: 'Transkun V2', duration: 420, noteCount: notes.length, notes }] }) };
const saved = [];
bridge.saveAnnotation = async (trackId, tag) => {
  saved.push({ trackId, tag });
  const stored = { ...tag, id: tag.id || `tag-${saved.length + 1}`, kind: tag.kind === 'chord' ? 'chord' : 'section' };
  const tags = [...state.annotations.filter(item => item.id !== stored.id), stored].sort((a, b) => a.start - b.start);
  return { ok: true, tag: stored, document: { tags } };
};
bridge.deleteAnnotation = async (trackId, id) => ({ ok: true, document: { tags: state.annotations.filter(tag => tag.id !== id) } });
const clock = seconds => `${Math.floor(seconds / 60)}:${(seconds - Math.floor(seconds / 60) * 60).toFixed(3).padStart(6, '0')}`;
const controls = sandbox.window.XldTimelineControls.create({
  bridge,
  audio, getState: () => state, rt: (key, params) => `${key}:${JSON.stringify(params || {})}`,
  playTrack: () => {}, albumTracks: () => [],
  formatTime: clock,
  parseTime: text => String(text).split(':').map(Number).reduce((acc, n) => acc * 60 + n, 0),
  onAnnotationsChanged: tags => { state.annotations = tags; }
});

(async () => {
  await controls.refresh();
  assert.equal(controls.laneCount(), 1, 'note lane loaded');
  const host = nodes.get('timelineLanes');
  const rows = host.querySelectorAll('.tl-row');
  // two segment engines + the manual tag lane + one note lane
  assert.equal(rows.length, 4, 'section, manual, chord and note lanes render together: ' + rows.length);
  assert.equal(host.querySelectorAll('.tl-notes').length, 1, 'note lane uses a canvas');
  assert.equal(host.querySelectorAll('.tl-playhead').length, 4, 'every lane carries a playhead');
  assert(drawn.length >= notes.length, 'every note is painted: ' + drawn.length);
  // Shared axis: the widest source (the 420 s note lane) sets the duration, so a 100 s segment cannot be full width.
  const segments = host.querySelectorAll('.tl-seg');
  const first = segments.find(block => block.dataset.start === '0' && block.dataset.end === '100');
  assert(first, 'chord segment present');
  assert.equal(first.style.width, `${(100 / 420) * 100}%`, 'segment width uses the shared duration');
  // Opening the tab re-reads the notes, so activating a different MIDI shows up without reloading the analysis.
  controls.bind();
  let reads = 0;
  bridge.readMidiNotes = async () => { reads += 1; return { ok: true, lanes: [] }; };
  nodes.get('workspace-tab-timeline').dispatch('click');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reads, 1, 'the tab button refetches the lanes');
  assert.equal(controls.laneCount(), 0, 'the refetch replaces the lanes');
  assert.equal(controls.zoom(), 1);
  assert.equal(nodes.get('timelineZoomOut').disabled, true, 'cannot zoom below fit');
  controls.updatePlayhead();
  assert(nodes.get('timelineReadout').textContent.includes('1:40'), 'readout shows the playback position');
  assert(nodes.get('timelineReadout').textContent.includes('Am'), 'readout names the chord under the playhead');
  // Crossing a boundary must re-find the active block even though each row caches the one it was standing in.
  audio.currentTime = 50;
  controls.updatePlayhead();
  assert(nodes.get('timelineReadout').textContent.includes(': C'), 'the cached active block is dropped when the playhead leaves it: ' + nodes.get('timelineReadout').textContent);

  // --- single-lane focus -------------------------------------------------------------------------
  const drumNotes = Array.from({ length: 60 }, (_, i) => [i * 2, i * 2 + 0.1, [36, 38, 42, 51][i % 4], 60 + (i % 40)]);
  bridge.readMidiNotes = async () => ({ ok: true, lanes: [
    { stem: 'piano', engine: 'piano-transkun', engineName: 'Transkun V2', duration: 420, noteCount: notes.length, notes },
    { stem: 'drums', engine: 'drums-adtof', engineName: 'ADTOF Drums', duration: 420, noteCount: drumNotes.length, notes: drumNotes }
  ] });
  await controls.refresh();
  assert.equal(host.querySelectorAll('.tl-notes').length, 2, 'both note lanes render');
  labels.length = 0;
  controls.setFocus('piano');
  assert.equal(controls.focus(), 'piano');
  assert.equal(host.querySelectorAll('.tl-notes').length, 1, 'focus shows one note lane');
  assert.equal(host.querySelectorAll('.tl-row').length, 4, 'segment lanes stay visible while focused');
  assert(labels.some(label => /^C-?\d$/.test(label.text)), 'focused melodic lane labels octaves: ' + JSON.stringify(labels.slice(0, 4)));
  assert(new Set(labels.map(label => label.x)).size > 1, 'pitch labels repeat along the lane so zooming does not hide them');
  assert.equal(nodes.get('timelineFocusExit').hidden, false, 'exit control offered while focused');
  labels.length = 0;
  controls.setFocus('drums');
  assert(labels.some(label => label.text === 'kick') && labels.some(label => label.text === 'ride'), 'focused drum lane labels GM keys: ' + JSON.stringify(labels.map(l => l.text)));
  controls.setFocus(null);
  assert.equal(host.querySelectorAll('.tl-notes').length, 2, 'leaving focus restores every lane');
  assert.equal(nodes.get('timelineFocusExit').hidden, true, 'exit control hidden when not focused');
  // A focused stem that is no longer in the payload must not blank the view.
  controls.setFocus('piano');
  bridge.readMidiNotes = async () => ({ ok: true, lanes: [{ stem: 'drums', engine: 'drums-adtof', engineName: 'ADTOF Drums', duration: 420, noteCount: drumNotes.length, notes: drumNotes }] });
  await controls.refresh();
  assert.equal(controls.focus(), null, 'a vanished stem drops focus');
  assert.equal(host.querySelectorAll('.tl-notes').length, 1, 'remaining lane still renders');

  // --- annotating on the chart -------------------------------------------------------------------
  bridge.readMidiNotes = async () => ({ ok: true, lanes: [{ stem: 'piano', engine: 'piano-transkun', engineName: 'Transkun V2', duration: 420, noteCount: notes.length, notes }] });
  await controls.refresh();
  const rowsOf = () => host.querySelectorAll('.tl-row');
  const laneOf = axis => rowsOf().find(row => row.dataset.axis === axis && String(row.className).includes('tl-manual'));
  assert(!laneOf('chord'), 'an empty chord mark lane stays hidden while reading');
  controls.setAnnotating(true);
  assert.equal(controls.annotating(), true);
  assert(laneOf('chord'), 'annotating offers the chord mark lane even before the first mark');
  assert(laneOf('section'), 'the section mark lane is there too');

  // Clicking a model's chord block copies its range and label into a new mark — it does not touch the result.
  const chordRow = rowsOf().find(row => row.dataset.engine === 'chord-chordmini');
  const chordBody = chordRow.querySelector('.tl-row-body');
  const press = (body, from, to = from) => {
    body.dispatch('pointerdown', { clientX: from, pointerId: 1 });
    body.dispatch('pointerup', { clientX: to, pointerId: 1 });
  };
  press(chordBody, 100);   // 100/1000 of a 420 s axis = 42 s, inside the 0–100 s block
  let open = controls.draft();
  assert(open, 'clicking a block opens the editor');
  assert.equal(open.axis, 'chord');
  assert.equal(open.id, null, 'a model block becomes a new mark, never an edit of the result');
  assert.equal(open.start, 0);
  assert.equal(open.end, 100);
  assert.equal(open.label, 'C');
  assert.equal(nodes.get('timelineEditor').hidden, false, 'the editor is shown');
  assert.equal(nodes.get('timelineEditorDelete').hidden, true, 'a new mark has nothing to delete');

  nodes.get('timelineEditorLabel').value = 'Cmaj7';
  await controls.saveDraft();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].tag.kind, 'chord', 'saved on the chord axis: ' + JSON.stringify(saved[0].tag));
  assert.equal(saved[0].tag.label, 'Cmaj7');
  assert.equal(saved[0].tag.start, 0);
  assert.equal(saved[0].tag.end, 100);
  assert.equal(saved[0].tag.id, undefined, 'a new mark carries no id');
  assert.equal(controls.draft(), null, 'saving closes the editor');
  assert.equal(state.annotations.length, 2, 'the mark reached the shared annotation state');
  const chordMarks = laneOf('chord').querySelectorAll('.tl-seg');
  assert.equal(chordMarks.length, 1, 'the mark is drawn on the chord mark lane');
  assert.equal(chordMarks[0].textContent, 'Cmaj7');

  // Clicking your own mark edits it; the editor then offers delete.
  press(laneOf('chord').querySelector('.tl-row-body'), 100);
  open = controls.draft();
  assert(open?.id, 'clicking a manual mark edits it: ' + JSON.stringify(open));
  assert.equal(nodes.get('timelineEditorDelete').hidden, false);
  await controls.deleteDraft();
  assert.equal(state.annotations.length, 1, 'delete removed the mark');
  assert.equal(controls.draft(), null);

  // Dragging a note lane marks a section change while reading one stem.
  const noteBody = rowsOf().find(row => row.dataset.stem === 'piano').querySelector('.tl-row-body');
  press(noteBody, 100, 400);
  open = controls.draft();
  assert.equal(open.axis, 'section', 'a note lane marks the section axis');
  assert.equal(Math.round(open.start), 42);
  assert.equal(Math.round(open.end), 168);
  assert.equal(open.label, '');

  // Escape backs out of the mark, not out of the tab.
  for (const fn of windowListeners.keydown || []) fn({ key: 'Escape' });
  assert.equal(controls.draft(), null, 'Escape closes the open mark');

  // Switching annotating off restores seeking and hides the empty mark lane.
  controls.setAnnotating(false);
  assert.equal(controls.annotating(), false);
  assert(!laneOf('chord'), 'the empty chord mark lane goes away again');

  // --- navigating a zoomed axis ------------------------------------------------------------------
  // The stub geometry is a 1000 px viewport over a 1000 px lane covering 420 s, so the middle is 210 s.
  assert.equal(Math.round(controls.centreTime()), 210, 'centre of the picture reads back in seconds');
  host.scrollLeft = 0;
  audio.currentTime = 400;
  assert.equal(controls.locatePlayhead(), true, 'locating works while the selected track is the one playing');
  const jumped = host.scrollLeft;
  assert(jumped > 0, 'locating scrolls the axis to the playhead: ' + jumped);
  // Locating is an action, not a mode: it is exactly repeatable and nothing else moves the picture.
  controls.locatePlayhead();
  assert.equal(host.scrollLeft, jumped, 'locating twice lands in the same place');

  const ruler = host.querySelector('.tl-scale');
  assert(ruler, 'the ruler is there to grab');
  ruler.dispatch('pointerdown', { clientX: 500, button: 0, pointerId: 2 });
  ruler.dispatch('pointermove', { clientX: 380, pointerId: 2 });
  assert.equal(host.scrollLeft, jumped + 120, 'dragging the ruler moves the axis by the drag distance');
  ruler.dispatch('pointerup', { clientX: 380, pointerId: 2 });
  const parked = host.scrollLeft;
  // The clock moving must never move the picture on its own.
  audio.currentTime = 410;
  controls.updatePlayhead();
  assert.equal(host.scrollLeft, parked, 'playback does not scroll the axis by itself');
  assert.equal(nodes.get('timelineLocate').disabled, false, 'locate is offered while the track is playing');
  controls.locatePlayhead();
  assert.equal(Math.round(controls.centreTime()), 410, 'locate centres on the playhead wherever the picture had been dragged');

  // A lane drag with Shift pans instead of seeking; Alt is left to the window menu.
  const paneBody = rowsOf()[0].querySelector('.tl-row-body');
  const beforePan = host.scrollLeft;
  audio.currentTime = 410;
  paneBody.dispatch('pointerdown', { clientX: 600, pointerId: 3, shiftKey: true, button: 0 });
  paneBody.dispatch('pointermove', { clientX: 540, pointerId: 3, shiftKey: true });
  paneBody.dispatch('pointerup', { clientX: 540, pointerId: 3, shiftKey: true });
  assert.equal(host.scrollLeft, beforePan + 60, 'Shift-dragging a lane pans it');
  assert.equal(audio.currentTime, 410, 'and does not seek');

  // With no playing track there is nothing to locate.
  const wasCurrent = state.currentTrack;
  state.currentTrack = { id: 'other-track' };
  assert.equal(controls.locatePlayhead(), false, 'locating needs the selected track to be the one playing');
  controls.updatePlayhead();
  assert.equal(nodes.get('timelineLocate').disabled, true, 'and the control says so');
  state.currentTrack = wasCurrent;

  // --- how a part is played ----------------------------------------------------------------------
  // Four four-second spans, one per way of playing, over a chord lane that says C then Am then C then Am.
  const chordSpans = [
    { start: 0, end: 4, label: 'C' }, { start: 4, end: 8, label: 'Am' },
    { start: 8, end: 12, label: 'C' }, { start: 12, end: 16, label: 'Am' }
  ];
  state.analysisResults = new Map([['chord-chordmini', { engine: { id: 'chord-chordmini', name: 'ChordMini' }, duration: 16, segments: chordSpans }]]);
  const at = (time, pitches, length = 0.4) => pitches.map(pitch => [time, time + length, pitch, 80]);
  const played = [
    // 0–4 s, C triad struck together three times: chordal.
    ...at(0.0, [60, 64, 67]), ...at(1.0, [60, 64, 67]), ...at(2.0, [60, 64, 67]),
    // 4–8 s, A minor one note at a time, chord tones only, leaps not steps: arpeggiated.
    ...[57, 60, 64, 69, 72, 76, 69, 64].flatMap((pitch, i) => at(4 + i * 0.4, [pitch], 0.3)),
    // 8–12 s, a scale over C: linear.
    ...[60, 62, 64, 65, 67, 69, 71, 72].flatMap((pitch, i) => at(8 + i * 0.4, [pitch], 0.3))
    // 12–16 s: nothing at all.
  ];
  const guitar = { stem: 'guitar', engine: 'muscriptor-medium', engineName: 'MuScriptor Medium', runId: 'run-roles', duration: 16, noteCount: played.length, notes: played.slice().sort((a, b) => a[0] - b[0]) };
  const roles = controls.rolesFor(guitar);
  // rolesFor runs in the vm realm, so its arrays carry a different prototype: copy before a deep compare.
  assert.deepEqual(Array.from(roles, span => span.role), ['block', 'arpeggio', 'line', 'rest'],
    'each way of playing is told apart: ' + JSON.stringify(roles.map(r => ({ role: r.role, voices: r.voices, chord: r.chordTone, step: r.step }))));
  const arp = roles[1];
  assert.equal(arp.voices, 1, 'an arpeggio is one note at a time');
  assert.equal(Math.round(arp.chordTone * 100), 100, 'and stays inside the chord');
  assert.equal(arp.step, 0, 'and moves by leaps, not steps');
  const line = roles[2];
  assert(line.step > 0.35, 'a scale is mostly stepwise: ' + line.step);
  // The same notes with no chord lane cannot be called an arpeggio — there is nothing to be inside of.
  state.analysisResults = new Map();
  const blind = controls.rolesFor({ ...guitar, runId: 'run-blind' });
  assert(!blind.some(span => span.role === 'arpeggio'), 'no chord reference, no arpeggio call: ' + JSON.stringify(blind.map(r => r.role)));
  assert(blind.some(span => span.role === 'block'), 'but notes struck together are still chordal without a reference');
  // An arpeggio of notes that are not in the chord is not an arpeggio.
  state.analysisResults = new Map([['chord-chordmini', { engine: { id: 'chord-chordmini', name: 'ChordMini' }, duration: 16, segments: chordSpans }]]);
  const foreign = [58, 61, 66, 70, 73, 78].flatMap((pitch, i) => at(0.2 + i * 0.4, [pitch], 0.3));
  const wrong = controls.rolesFor({ ...guitar, runId: 'run-foreign', notes: foreign, noteCount: foreign.length });
  assert.notEqual(wrong[0].role, 'arpeggio', 'pitches outside the chord are not an arpeggio of it: ' + JSON.stringify(wrong[0]));
  // Percussion has no harmony to break up, so it never gets a reading.
  assert.equal(controls.roleAt(roles, 5), roles[1], 'a role can be looked up by time');

  // --- how a part sits against the chord ---------------------------------------------------------
  // Same four-second spans, same chord lane: C then Am then C then Am.
  const harmonyLane = stem => ({ stem, engine: 'x', engineName: 'X', runId: 'run-' + stem, duration: 16, noteCount: 0, notes: [] });
  const held = (time, pitches, length = 3.6) => pitches.map(pitch => [time, time + length, pitch, 80]);
  const played2 = [
    ...held(0, [60, 64, 67]),          // 0–4 s over C: C E G, all named
    ...held(4, [57, 60, 64, 67]),      // 4–8 s over Am: A C E plus G, a seventh the label does not name
    ...held(8, [61, 66, 68]),          // 8–12 s over C: C# F# G#, nothing the chord has room for
    ...held(12, [64, 69, 72])          // 12–16 s over Am: E A C, named again
  ];
  const piano = { ...harmonyLane('piano'), noteCount: played2.length, notes: played2.slice().sort((a, b) => a[0] - b[0]) };
  const relations = controls.harmonyFor(piano);
  assert.deepEqual(Array.from(relations, span => span.relation), ['fit', 'extend', 'clash', 'fit'],
    'each relation is told apart: ' + JSON.stringify(Array.from(relations, r => ({ relation: r.relation, fit: r.fit, extend: r.extend, clash: r.clash }))));
  assert.equal(Math.round(relations[0].fit * 100), 100, 'the first span is entirely inside the chord');
  assert(relations[1].extend > 0.15, 'the seventh reads as an addition, not a clash: ' + relations[1].extend);
  assert(relations[2].clash > 0.9, 'three foreign pitches are a clash: ' + relations[2].clash);
  // The lowest note against the root is what settles an inversion.
  assert.equal(relations[0].inversion, 'root', 'C under a C chord is the root');
  assert.equal(relations[3].inversion, 'fifth', 'E under an A minor chord is the fifth: ' + JSON.stringify(relations[3]));
  // Without a chord lane there is nothing to be inside of.
  const chordless = new Map(state.analysisResults);
  state.analysisResults = new Map();
  assert(controls.harmonyFor({ ...piano, runId: 'run-blind' }).every(span => ['unclear', 'rest'].includes(span.relation)),
    'no chord reference, no relation');
  state.analysisResults = chordless;

  // R13: a sustained C continues across the chord boundary, with duration clipped per span.
  state.analysisResults=new Map([['chord-chordmini',{engine:{id:'chord-chordmini',name:'ChordMini'},duration:4,
    segments:[{start:0,end:2,label:'C'},{start:2,end:4,label:'Db'}]}]]);
  const sustained={...piano,runId:'r13-held',notes:[[0,4,60,80]],noteCount:1};
  const cross=controls.harmonyFor(sustained);
  assert.deepEqual(Array.from(cross,x=>x.relation),['fit','extend']);
  assert.deepEqual(Array.from(cross,x=>x.held),[2,2],'each duration is clipped to its chord span');
  assert.equal(controls.rolesFor(sustained).at(-1).role,'rest','role statistics still use onsets');
  state.analysisResults.get('chord-chordmini').segments[1].label='C';
  const updated=controls.harmonyFor(sustained);
  assert.equal(updated.length,2,'separate harmonic spans preserve their own tooltip statistics');
  assert.equal(updated[1].relation,'fit','same-count changed chord labels invalidate cached readings');
  state.analysisResults.get('chord-chordmini').segments[1].label='Cunknown';
  assert.equal(controls.harmonyFor(sustained)[1].relation,'unclear','unknown quality has no guessed reference');
  state.analysisResults=chordless;

  // The strip shows one reading at a time, and switching redraws it.
  bridge.readMidiNotes = async () => ({ ok: true, lanes: [{ ...piano, stem: 'piano' }] });
  await controls.refresh();
  assert.equal(controls.stripMode(), 'role', 'the strip starts on how it is played');
  const marks = () => host.querySelectorAll('.tl-role').length;
  const asRole = marks();
  assert(asRole > 0, 'the role strip is drawn');
  controls.setStripMode('harmony');
  assert.equal(controls.stripMode(), 'harmony');
  assert(marks() > 0, 'the harmony strip is drawn');
  assert.equal(nodes.get('timelineStrip').value, 'harmony', 'the selector follows the state');
  controls.setStripMode('off');
  assert.equal(marks(), 0, 'turning the strip off removes it');
  controls.setStripMode('role');
  assert.equal(marks(), asRole, 'and switching back restores it');

  // --- one stem is not one voice -------------------------------------------------------------------------------
  // A strings result has always been cello / string ensemble / contrabass / violin / viola inside the .mid; the flat
  // notes.json was the only reason the interface showed one block. The main process now tags each note with the
  // instrument it came from, and a lane splits on that tag.
  const strings = [[0, 1, 50, 80, 0, 0], [2, 3, 52, 80, 0, 1], [4, 5, 54, 80, 0, 2],
    [1, 2, 70, 80, 1, 3], [3, 4, 72, 80, 1, 4],
    [0.5, 1.5, 60, 80, 2, 5]];
  const stringsLane = {
    stem: 'strings', engine: 'muscriptor-medium', engineName: 'MuScriptor Medium', runId: 'run-strings', duration: 16,
    noteCount: strings.length, editable: true, notes: strings,
    instruments: [{ index: 0, name: 'cello', program: 42, isDrum: false, noteCount: 3 },
      { index: 1, name: 'violin', program: 40, isDrum: false, noteCount: 2 },
      { index: 2, name: 'viola', program: 41, isDrum: false, noteCount: 1 }]
  };
  bridge.readMidiNotes = async () => ({ ok: true, lanes: [stringsLane] });
  await controls.refresh();
  assert.equal(controls.laneCount(), 3, 'one strings result becomes three rows');
  const heads = () => collect(host, '.tl-row-head').map(node => String(node.innerHTML));
  assert.equal(controls.visibleLanes().length,1,'multi instrument starts folded');
  controls.setCollapsed('strings',false);
  for (const part of ['cello', 'violin', 'viola']) assert(heads().some(text => text.includes(part)), 'the row says which instrument: ' + part);
  // The counts come from the instrument, not from the stem, so a row cannot claim the whole result's notes.
  const counts = () => heads().map(text => (text.match(/timeline\.notes:\{&quot;count&quot;:(\d+)\}/) || [])[1]).filter(Boolean);
  assert.deepEqual(counts(), ['6', '3', '2', '1'], 'group summary followed by each instrument count: ' + counts().join(','));

  // Focus is per row. Before this round the identity was the stem, so focusing one of five string parts would have
  // matched all five — and would have been indistinguishable from working.
  const violinRow = collect(host, '.tl-row').find(row => row.dataset.laneId === 'strings#1');
  assert(violinRow, 'rows carry the lane identity: ' + collect(host, '.tl-row').map(r => r.dataset.laneId).join(','));
  assert.equal(violinRow.dataset.stem, 'strings', 'while the stem stays, because colour and strips key off it');
  collect(host, '.tl-row-toggle').find(node => String(node.innerHTML).includes('violin')).dispatch('click');
  assert.equal(collect(host, '.tl-notes').length, 1, 'focusing one instrument leaves one note lane, not the stem’s five');
  assert(heads().some(text => text.includes('violin')) && !heads().some(text => text.includes('cello')),
    'and the other parts of the same stem are not along for the ride: ' + heads().join(' / '));
  controls.setFocus(null);
  assert.equal(collect(host, '.tl-notes').length, 3, 'leaving focus restores every part');

  // A file the reader could not account for is NOT split. A wrong split looks exactly like a right one on screen,
  // so the only safe answer is the undivided lane the interface has always shown.
  bridge.readMidiNotes = async () => ({ ok: true, lanes: [{ ...stringsLane, editable: false }] });
  await controls.refresh();
  assert.equal(controls.laneCount(), 1, 'an unreadable .mid stays one row rather than being guessed at');
  bridge.readMidiNotes = async () => ({ ok: true, lanes: [{ ...stringsLane, instruments: [stringsLane.instruments[0]] }] });
  await controls.refresh();
  assert.equal(controls.laneCount(), 1, 'and a single-instrument result is not split either');

  // An empty result keeps its row and says so. It used to be dropped before it reached the renderer, which is why
  // a stem with nothing transcribed had no row at all — and, once notes can be added, nowhere to add the first one.
  bridge.readMidiNotes = async () => ({ ok: true, lanes: [{ stem: 'bass', engine: 'muscriptor-medium', engineName: 'MuScriptor Medium',
    runId: 'run-empty', duration: 16, noteCount: 0, editable: true, instruments: [], notes: [] }] });
  await controls.refresh();
  assert.equal(controls.laneCount(), 1, 'an empty result still has a row');
  assert(heads().some(text => text.includes('runtime.timeline.laneEmpty')), 'and says it is empty: ' + heads().join(' / '));


  {
  // R7: selection stays in the focused lane and uses original note identifiers after the time sort.
  for(const id of ['timelineSelectNotes','timelineSelection','timelineSelectionCount','timelineSelectionClear','timelineSelectionHint',
    'timelineSelectionProperties','timelineSelectionPitch','timelineSelectionStart','timelineSelectionEnd','timelineSelectionLength','timelineSelectionVelocity'])
    nodes.set(id,makeNode());
  const selectableNotes=[[20,24,60,90,2,8],[10,14,64,100,2,3],[30,35,68,70,2,19],[60,65,64,110,2,33]];
  const selectLane={stem:'strings',runId:'selection-run',engine:'test',duration:1000,noteCount:4,editable:true,notes:selectableNotes};
  bridge.readMidiNotes=async()=>({ok:true,lanes:[selectLane]});
  await controls.refresh();controls.setFocus('strings');controls.setNoteSelecting(true);host.scrollLeft=0;
  assert(controls.noteSelecting());
  const selectedIds=()=>Array.from(controls.selection().notes,n=>n.noteIndex);
  const pointer=(body,type,x,y,mod={})=>{const r=body.getBoundingClientRect();body.dispatch(type,{type,button:0,pointerId:41,clientX:r.left+x,clientY:r.top+y,...mod});};
  const noteBody=()=>host.querySelectorAll('.tl-notes-row')[0].querySelector('.tl-row-body');
  const clickNote=(x,y,mod={})=>{const b=noteBody();pointer(b,'pointerdown',x,y,mod);pointer(b,'pointerup',x,y,mod);};
  const originalTime=audio.currentTime, originalNotes=JSON.stringify(controls.laneFor('strings').notes);
  clickNote(12,116);
  assert.deepEqual(selectedIds(),[3],'sorted position 0 keeps original noteIndex 3');
  assert.equal(controls.selection().notes[0].instrumentIndex,2);
  assert(nodes.get('timelineSelectionStart').textContent.includes('10.000'));
  assert(nodes.get('timelineSelectionPitch').textContent.includes('E4'));
  clickNote(22,188,{ctrlKey:true});assert.deepEqual(selectedIds(),[3,8],'Ctrl adds');
  clickNote(12,116,{metaKey:true});assert.deepEqual(selectedIds(),[8],'Cmd toggles off');
  // Pitch gap is not inflated to cover a neighbouring semitone.
  clickNote(12,134);assert.deepEqual(selectedIds(),[]);
  const b=noteBody();pointer(b,'pointerdown',9,0);pointer(b,'pointermove',36,220);pointer(b,'pointerup',36,220);
  assert.deepEqual(selectedIds(),[3,8,19],'box selects intersecting rectangles in both axes');
  assert(nodes.get('timelineSelectionVelocity').textContent.includes('70–100'));
  pointer(b,'pointerdown',59,108,{ctrlKey:true});pointer(b,'pointermove',66,125,{ctrlKey:true});pointer(b,'pointerup',66,125,{ctrlKey:true});
  assert.deepEqual(selectedIds(),[3,8,19,33],'Ctrl-box adds to selection');
  pointer(b,'pointerdown',300,0);pointer(b,'pointermove',350,30);pointer(b,'pointercancel',350,30);
  assert.deepEqual(selectedIds(),[3,8,19,33],'cancelled box leaves selection alone');
  pointer(b,'pointerdown',300,0);pointer(b,'pointermove',350,30);
  for(const fn of windowListeners.keydown||[])fn({key:'Escape'});
  pointer(b,'pointerup',350,30);
  assert.equal(selectedIds().length,4,'Escape cancels the gesture before clearing existing selection');
  const scrolled=host.scrollLeft;
  pointer(b,'pointerdown',500,30,{shiftKey:true});pointer(b,'pointermove',450,30,{shiftKey:true});pointer(b,'pointerup',450,30,{shiftKey:true});
  assert(host.scrollLeft>scrolled,'Shift still pans');
  assert.equal(selectedIds().length,4);
  assert.equal(audio.currentTime,originalTime,'selection never seeks the recording');
  assert.equal(JSON.stringify(controls.laneFor('strings').notes),originalNotes,'selection never changes notes');
  for(const fn of windowListeners.keydown||[])fn({key:'Escape'});
  assert.equal(selectedIds().length,0);assert(controls.noteSelecting(),'first Escape clears');
  for(const fn of windowListeners.keydown||[])fn({key:'Escape'});
  assert(!controls.noteSelecting());assert.equal(controls.focus(),'strings','second Escape exits selection only');
  controls.setNoteSelecting(true);controls.setRangeSelecting(true);
  assert(!controls.noteSelecting(),'loop circle and selection are exclusive');
  controls.setNoteSelecting(true);controls.setAnnotating(true);
  assert(!controls.noteSelecting(),'annotations and selection are exclusive');
  controls.setNoteSelecting(true);host.scrollLeft=0;clickNote(12,116);
  await controls.refresh();assert.equal(selectedIds().length,0,'refresh/version change clears selection');
  controls.setFocus(null);assert(!controls.noteSelecting());
  bridge.readMidiNotes=async()=>({ok:true,lanes:[{...selectLane,notes:selectableNotes.map(n=>n.slice(0,4))}]});
  await controls.refresh();controls.setFocus('strings');controls.setNoteSelecting(true);
  assert(!controls.noteSelecting(),'missing identity cannot be selected for correction');
  assert(nodes.get('timelineSelectNotes').disabled);
  bridge.readMidiNotes=async()=>({ok:true,lanes:[{...selectLane,notes:[selectableNotes[0],selectableNotes[0]]}]});
  await controls.refresh();controls.setNoteSelecting(true);
  assert(!controls.noteSelecting(),'duplicate identity fails closed');

  }

  {
    // R8: a narrow viewport through a long lane. Include a sustain starting offscreen, a sub-pixel note
    // whose minimum drawn width crosses the left boundary, a normal visible note and two invisible notes.
    const viewportNotes=[[0,1,60,90,0,0],[20,730,60,90,0,1],[499.9,499.91,62,90,0,2],
      [520,540,64,90,0,3],[800,820,65,90,0,4]];
    const fixture={stem:'piano',engine:'test',runId:'viewport-a',duration:1000,noteCount:5,editable:true,notes:viewportNotes};
    host._clientWidth=250;host.scrollLeft=0;
    bridge.readMidiNotes=async()=>({ok:true,lanes:[fixture]});
    await controls.refresh();controls.setFocus('piano');controls.setStripMode('off');controls.setNoteSelecting(true);
    const base=host.querySelector('.tl-notes'),overlay=host.querySelector('.tl-note-selection');
    assert(base&&overlay&&base!==overlay,'independent selection surface');
    assert.equal(base.width,500,'device pixels follow viewport, not the 1000px lane');
    const beforeWidths=base.widthWrites,beforeHeights=base.heightWrites;
    base.paints.length=0;host.scrollLeft=500;host.dispatch('scroll');
    const has=(x,w)=>base.paints.some(r=>Math.abs(r[0]-x)<1e-8&&Math.abs(r[2]-w)<1e-8);
    assert(has(20,710),'sustain entering from the left is retained');
    assert(has(499.9,1.5),'minimum-width note crossing the left edge is retained');
    assert(has(520,20),'ordinary note in the viewport is drawn');
    assert(!has(0,1.5)&&!has(800,20),'notes outside viewport never issue paint calls');
    assert.equal(base.style.left,'500px');
    assert.deepEqual(base.transforms.at(-1).map(n=>n||0),[2,0,0,2,-1000,0],'same song coordinates, translated into viewport buffer');
    assert.equal(base.widthWrites,beforeWidths,'scroll does not reallocate width');
    assert.equal(base.heightWrites,beforeHeights,'scroll does not reallocate height');

    const clears=base.clears,overlayClears=overlay.clears;
    const body=host.querySelectorAll('.tl-notes-row')[0].querySelector('.tl-row-body');
    for(const type of ['pointerdown','pointerup'])body.dispatch(type,{type,button:0,pointerId:88,clientX:30,clientY:98});
    assert.equal(controls.selection().notes[0].noteIndex,3,'hit test after pan still uses whole-lane coordinates');
    assert.equal(base.clears,clears,'selecting does not repaint the note layer');
    assert(overlay.clears>overlayClears,'selection repaints only overlay');
    controls.clearSelection();assert.equal(base.clears,clears,'clearing does not repaint the note layer');
    controls.render();
    assert.equal(host.querySelector('.tl-notes'),base,'ordinary render retains the canvas node');
    assert.equal(base.widthWrites,beforeWidths,'ordinary render keeps the bitmap');
    assert.equal(base.clears,clears,'unchanged surface does not repaint');

    sandbox.window.devicePixelRatio=1.5;
    for(const fn of windowListeners.resize||[])fn({});
    assert.equal(base.width,375,'DPR change resizes the bitmap');
    assert.equal(base.widthWrites,beforeWidths+1);
    const afterDpr=base.widthWrites;
    controls.render();assert.equal(base.widthWrites,afterDpr,'stable DPR does not resize again');

    // A burst of native scroll events gets one repaint with the final offset.
    const frames=[];sandbox.requestAnimationFrame=fn=>frames.push(fn);
    const beforeScroll=base.clears;
    for(const x of [550,575,600]){host.scrollLeft=x;host.dispatch('scroll');}
    assert.equal(frames.length,1,'scrolls are coalesced into one animation frame');
    frames.shift()();
    assert.equal(base.clears,beforeScroll+1);assert.equal(base.style.left,'600px');

    // A refresh replaces the lane/index even when its identity and note count are unchanged.
    const replacement={...fixture,notes:[[0,1,60,90,0,0],[20,730,60,90,0,1],[600,610,62,90,0,2],
      [650,655,64,90,0,3],[900,920,65,90,0,4]]};
    bridge.readMidiNotes=async()=>({ok:true,lanes:[replacement]});
    await controls.refresh();base.paints.length=0;
    while(frames.length)frames.shift()();
    assert(has(650,5),'fresh notes invalidate cached geometry');
    assert(!has(520,20),'previous note geometry is gone');
    host.scrollLeft=700;host.dispatch('scroll');
    state.selectedTrack=null;await controls.refresh();
    const oldClears=base.clears;
    while(frames.length)frames.shift()();
    assert.equal(base.clears,oldClears,'pending frame cannot draw a removed track');
    assert.equal(base.width,1,'removed lane releases its bitmap');
    sandbox.requestAnimationFrame=fn=>fn();
  }


  {
    // R9: fixed semitone rows across the full MIDI range, vertical panning without seeking, and deep time zoom.
    host._clientWidth=1000;host.scrollLeft=0;
    state.selectedTrack={id:'r9-track'};state.currentTrack=state.selectedTrack;audio.duration=1000;
    const wide=[[0,1,0,90,0,0],[990,991,127,90,0,1],[500,500.02,60,90,0,2],[520,530,61,90,0,3]];
    const fixture={stem:'piano',runId:'pitch-a',engine:'test',duration:1000,noteCount:wide.length,editable:true,notes:wide};
    bridge.readMidiNotes=async()=>({ok:true,lanes:[fixture]});
    await controls.refresh();controls.setFocus('piano');controls.setNoteSelecting(true);
    const body=host.querySelectorAll('.tl-notes-row')[0].querySelector('.tl-row-body');
    let bar=host.querySelector('.tl-pitch-scroll');
    assert.equal(bar.scrollTop,908,'first focus centres a wide pitch range');
    const base=host.querySelector('.tl-notes'),beforeWidths=base.widthWrites,beforeHeights=base.heightWrites;
    const position=audio.currentTime;
    body.dispatch('wheel',{deltaY:18,deltaX:0,deltaMode:0});
    assert.equal(bar.scrollTop,926,'one row wheel movement moves by one semitone');
    assert.equal(base.widthWrites,beforeWidths);assert.equal(base.heightWrites,beforeHeights,'pitch pan retains pixel buffer');
    const notePaint=base.paints.filter(r=>Math.abs(r[0]-500)<1e-9&&r[2]===1.5).at(-1);
    assert.equal(notePaint[1],1206);assert.equal(notePaint[3],17,'a fixed row is 18px with 1px separation');
    for(const type of ['pointerdown','pointerup'])body.dispatch(type,{type,button:0,pointerId:90,clientX:500.5,clientY:288});
    assert.deepEqual(Array.from(controls.selection().notes,n=>n.noteIndex),[2],'vertical offset is included in hit test');
    assert.equal(audio.currentTime,position,'pitch pan/selection never seek');

    // Beginning a box then scrolling cancels that gesture, not the existing selection.
    body.dispatch('pointerdown',{button:0,pointerId:91,clientX:550,clientY:200});
    body.dispatch('pointermove',{pointerId:91,clientX:600,clientY:260});
    body.dispatch('wheel',{deltaY:18,deltaX:0,deltaMode:0});
    body.dispatch('pointerup',{type:'pointerup',pointerId:91,clientX:600,clientY:260});
    assert.deepEqual(Array.from(controls.selection().notes,n=>n.noteIndex),[2]);
    const y=1206-bar.scrollTop;
    body.dispatch('pointerdown',{button:0,pointerId:92,clientX:499,clientY:y-1});
    body.dispatch('pointermove',{pointerId:92,clientX:535,clientY:y+18});
    body.dispatch('pointerup',{type:'pointerup',pointerId:92,clientX:535,clientY:y+18});
    assert.deepEqual(Array.from(controls.selection().notes,n=>n.noteIndex),[2,3],'box after pitch pan uses content coordinates');
    bar.scrollTop=99999;bar.dispatch('scroll');assert.equal(bar.scrollTop,1816,'pitch scrolling is clamped to its content');
    controls.render();bar=host.querySelector('.tl-pitch-scroll');assert.equal(bar.scrollTop,1816,'mode/render preserves pitch position');
    const pitchPosition=bar.scrollTop;
    const x=host.scrollLeft;host.querySelectorAll('.tl-notes-row')[0].querySelector('.tl-row-body').dispatch('wheel',{shiftKey:true,deltaY:40,deltaX:0});
    assert.equal(host.scrollLeft,x+40);assert.equal(bar.scrollTop,pitchPosition,'Shift wheel pans only time');

    deepGeometry=true;nodes.get('noteTimelineZoomLabel').dispatch('click');controls.scrollTo(500);
    for(let i=0;i<7;i++)nodes.get('timelineZoomIn').dispatch('click');
    assert.equal(controls.zoom(),128);assert(nodes.get('timelineZoomIn').disabled);
    assert(Math.abs(controls.centreTime()-500)<1e-6,'deep zoom keeps the chosen centre');
    assert.equal(host.querySelector('.tl-notes'),base,'deep zoom retains base canvas');
    assert(base.width<=1500,'deep zoom does not allocate a song-width bitmap');
    assert(/\d:\d\d\.\d{3}/.test(host.querySelector('.tl-scale').innerHTML),'deep zoom displays fractional seconds');
    assert.equal(host.querySelector('.tl-pitch-scroll').scrollTop,pitchPosition,'deep time zoom keeps pitch position');
    nodes.get('noteTimelineZoomLabel').dispatch('click');assert.equal(controls.zoom(),1,'clicking scale returns to whole song');
    deepGeometry=false;

    // Discrete GM keys get the same fixed row height, never octave spacing.
    const drums={...fixture,stem:'drums',runId:'drum-r9',notes:[[10,10.1,36,90,0,0],[20,20.1,38,90,0,1],[30,30.1,51,90,0,2]],noteCount:3};
    bridge.readMidiNotes=async()=>({ok:true,lanes:[drums]});
    await controls.refresh();controls.setFocus('drums');controls.setNoteSelecting(true);host.scrollLeft=0;
    const drumBody=host.querySelectorAll('.tl-notes-row')[0].querySelector('.tl-row-body');
    assert(host.querySelector('.tl-pitch-scroll').hidden,'small drum kit needs no vertical scrollbar');
    for(const type of ['pointerdown','pointerup'])drumBody.dispatch(type,{type,button:0,pointerId:93,clientX:10.5,clientY:44});
    assert.equal(controls.selection().notes[0].pitch,36,'GM kick is the third fixed row, regardless of pitch intervals');
  }

  console.log('timeline-view: ok (selection, viewport buffers, fixed pitch rows, vertical scrolling, deep zoom and drums)');
})().catch(error => { console.error(error); process.exitCode = 1; });
