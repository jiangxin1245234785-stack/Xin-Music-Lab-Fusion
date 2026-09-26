// Timeline view (timeline.7): sections, chords and MIDI notes of one track on a single shared time axis.
// Read only until 标注 is switched on: then dragging any lane draws an interval and clicking a block copies its
// range and label into the editor, so a model's chord block becomes a manual correction with two clicks. Manual
// marks are the same annotation objects the section lab writes, with a kind saying which axis they belong to —
// model results are never rewritten.
// Clicking a note lane's header focuses it: that one stem fills the view with piano-roll shading, octave guides and
// repeated pitch labels, while the section and chord lanes stay above it as the reference for reading (and, later,
// for annotating) that stem.
// Segment lanes stay DOM (a few hundred blocks, keeps tooltips and hit-testing); note lanes are canvas because a
// track can carry >10k notes across five stems. Everything derives x from the same duration and the same zoom, so
// the lanes cannot drift apart. No quantisation, no grid, no editing — annotation stays in the section lab for now.
(function () {
  'use strict';
  const STEM_COLORS = { bass: '#63b3e0', piano: '#cf82d6', guitar: '#e9b45f', drums: '#65c795', strings: '#a78be6' };
  const GM_DRUM_KEYS = { 35: 'kick', 36: 'kick', 38: 'snare', 40: 'snare', 42: 'hihat', 44: 'hihat', 46: 'hihat', 45: 'tom', 47: 'tom', 48: 'tom', 50: 'tom', 49: 'crash', 51: 'ride', 57: 'crash', 59: 'ride' };
  const MAX_CANVAS = 16384;   // Chromium's per-dimension canvas limit; the device pixel ratio is capped against it.
  const PITCH_ROW_HEIGHT = 18;
  const MAX_ZOOM = 128;
  const MIN_SEMITONES = 8;    // keep a sparse lane (bass, drums) from drawing absurdly thick note bars
  const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);

  // --- what a part is doing over one chord span --------------------------------------------------
  // Three ways of playing the same harmony, told apart by how far the onsets of one group of chord tones are
  // spread. A strum is not simultaneous either (it smears over a few tens of milliseconds), and an arpeggio is not
  // a melody just because it is one note at a time — so the honest measure is onset spacing, not polyphony.
  //   block    柱式 / 扫弦   onsets inside ~60 ms of each other
  //   arpeggio 分解和弦      staggered onsets, but the pitches stay inside the chord and move by chord-tone leaps
  //   line     线性          steps and non-chord tones, does not reset with the chord
  const ROLE_CLUSTER = 0.06;      // a strum this wide still reads as one chord
  const ROLE_MIN_NOTES = 3;       // fewer notes in a span says nothing either way
  const ROLE_CHORD_TONE = 0.75;   // an arpeggio stays inside the chord
  const ROLE_STEP = 0.35;         // ... and moves by leaps, not by step
  const ROLE_BLOCK_SHARE = 0.5;   // half the notes struck together before a span is called chordal
  const ROLE_COLORS = { block: '#e9b45f', arpeggio: '#65c795', line: '#63b3e0', unclear: '#4a4f60', rest: 'transparent' };
  const ROOTS = { C:0,D:2,E:4,F:5,G:7,A:9,B:11 };
  const DEGREE = {1:0,2:2,3:4,4:5,5:7,6:9,7:11,9:2,11:5,13:9};
  // Exact qualities emitted by harmony_runner.py plus common extended spellings.
  // Consume the entire label; an unfamiliar suffix is not a major triad.
  const QUALITIES = {
    '':[0,4,7],maj:[0,4,7],M:[0,4,7],m:[0,3,7],min:[0,3,7],'-':[0,3,7],
    dim:[0,3,6],o:[0,3,6],aug:[0,4,8],'+':[0,4,8],'5':[0,7],
    sus2:[0,2,7],sus:[0,5,7],sus4:[0,5,7],
    '6':[0,4,7,9],maj6:[0,4,7,9],m6:[0,3,7,9],min6:[0,3,7,9],
    '7':[0,4,7,10],maj7:[0,4,7,11],M7:[0,4,7,11],
    m7:[0,3,7,10],min7:[0,3,7,10],'-7':[0,3,7,10],
    mM7:[0,3,7,11],minmaj7:[0,3,7,11],mMaj7:[0,3,7,11],
    dim7:[0,3,6,9],o7:[0,3,6,9],hdim7:[0,3,6,10],m7b5:[0,3,6,10],
    '9':[0,2,4,7,10],maj9:[0,2,4,7,11],M9:[0,2,4,7,11],
    m9:[0,2,3,7,10],min9:[0,2,3,7,10],
    '11':[0,2,4,5,7,10],maj11:[0,2,4,5,7,11],m11:[0,2,3,5,7,10],min11:[0,2,3,5,7,10],
    '13':[0,2,4,5,7,9,10],maj13:[0,2,4,5,7,9,11],m13:[0,2,3,5,7,9,10],min13:[0,2,3,5,7,9,10],
    add9:[0,2,4,7],madd9:[0,2,3,7],'7sus4':[0,5,7,10]
  };
  function rootPitch(text){
    const m=/^([A-G])([#b]?)$/.exec(text);
    return m ? (ROOTS[m[1]]+(m[2]==='#'?1:m[2]==='b'?-1:0)+12)%12 : null;
  }
  function chordTones(label) {
    const text=String(label||'').trim().replaceAll('♭','b').replaceAll('♯','#');
    const match=/^([A-G][#b]?)(?::)?([^/]*)(?:\/([A-G][#b]?|[#b]?(?:1|2|3|4|5|6|7)))?$/.exec(text);
    if(!match)return null;
    const root=rootPitch(match[1]);let quality=match[2],degrees=null;
    const parenthesis=/^(.*?)\(([^()]*)\)$/.exec(quality);
    if(parenthesis){quality=parenthesis[1];degrees=parenthesis[2].split(',');if(!degrees.length||degrees.some(d=>!d))return null;}
    let values;
    if(Object.hasOwn(QUALITIES,quality))values=new Set(quality===''&&degrees?[0]:QUALITIES[quality]);
    else {
      const alteration=/^(.*?)([b#](?:5|9|11|13)(?:[b#](?:5|9|11|13))*)$/.exec(quality);
      if(!alteration||!Object.hasOwn(QUALITIES,alteration[1]))return null;
      values=new Set(QUALITIES[alteration[1]]);
      for(const token of alteration[2].match(/[b#](?:5|9|11|13)/g)){
        const degree=DEGREE[token.slice(1)];values.delete(degree);values.add((degree+(token[0]==='b'?-1:1)+12)%12);
      }
    }
    // Explicit Harte intervals from consonance-ACE, including removed degrees.
    for(const token of degrees||[]){
      const m=/^(\*?)([b#]?)(1|2|3|4|5|6|7|9|11|13)$/.exec(token);
      if(!m)return null;
      const interval=(DEGREE[m[3]]+(m[2]==='b'?-1:m[2]==='#'?1:0)+12)%12;
      if(m[1])values.delete(interval);else values.add(interval);
    }
    return values.size?new Set([...values].map(step=>(root+step)%12)):null;
  }

  // What one part contributes to the chord that is sounding. The chord lane stays the reference — this is a
  // relation, not a second opinion about the harmony — because a single part is usually not enough to name a chord.
  //   fit     一致   everything it plays is named by the label
  //   extend  补充   it adds sevenths / ninths / suspensions the label does not name
  //   clash   冲突   it sustains pitch classes the chord has no room for, long enough not to be passing notes
  const HARMONY_COLORS = { fit: '#65c795', extend: '#63b3e0', clash: '#e36fae', unclear: '#4a4f60', rest: 'transparent' };
  const HARMONY_CLASH = 0.25;   // duration share outside the chord before it stops being passing notes
  const HARMONY_EXTEND = 0.15;  // ... and before an addition is worth naming
  const HARMONY_FIT = 0.6;
  const INVERSIONS = { 0: 'root', 3: 'third', 4: 'third', 7: 'fifth', 10: 'seventh', 11: 'seventh' };

  // Root, the tones the label names, and the additions a part may bring without contradicting it.
  function chordParts(label) {
    const text = String(label || '').trim();
    const match = /^([A-G](?:#|b)?)(.*)$/.exec(text);
    if (!match) return null;
    const root = rootPitch(match[1]);
    const named = chordTones(label);
    if(root===null||!named)return null;
    // Sevenths, ninths, elevenths and thirteenths sit naturally over a triad; anything else is a clash.
    const extensions = new Set([10, 11, 2, 5, 9].map(step => (root + step) % 12));
    for (const tone of named) extensions.delete(tone);
    return { root, named, extensions };
  }

  function classifyHarmony(notes, parts) {
    if (!notes.length) return { relation: 'rest' };
    if (!parts) return { relation: 'unclear', notes: notes.length };
    let held = 0, fit = 0, extend = 0;
    let lowest = null;
    for (const [start, end, pitch] of notes) {
      const length = Math.max(0, end - start);
      held += length;
      const pc = ((pitch % 12) + 12) % 12;
      if (parts.named.has(pc)) fit += length;
      else if (parts.extensions.has(pc)) extend += length;
      if (lowest === null || pitch < lowest) lowest = pitch;
    }
    if (!(held > 0)) return { relation: 'unclear', notes: notes.length };
    const fitShare = fit / held, extendShare = extend / held, clashShare = 1 - fitShare - extendShare;
    // The lowest note against the root is what makes an inversion, which is the one thing a bass part settles alone.
    const interval = lowest === null ? null : ((((lowest % 12) + 12) % 12) - parts.root + 12) % 12;
    const detail = { fit: fitShare, extend: extendShare, clash: clashShare, lowest, inversion: interval === null ? null : (INVERSIONS[interval] || 'other'), notes: notes.length, held };
    if (clashShare >= HARMONY_CLASH) return { relation: 'clash', ...detail };
    if (extendShare >= HARMONY_EXTEND) return { relation: 'extend', ...detail };
    if (fitShare >= HARMONY_FIT) return { relation: 'fit', ...detail };
    return { relation: 'unclear', ...detail };
  }

  function classifySpan(notes, tones) {
    // Too few notes to say anything, but still report what was actually there: a tooltip claiming 0 notes for a
    // span that held two of them is worse than saying nothing.
    if (notes.length < ROLE_MIN_NOTES) return { role: notes.length ? 'unclear' : 'rest', voices: Math.min(notes.length, 1), chordTone: null, step: 0, notes: notes.length };
    const sorted = notes.slice().sort((a, b) => a[0] - b[0]);
    // Onset clusters, each bounded by the window from its own first note so a fast run does not chain into one
    // long "cluster". A cluster counts as chordal only if it holds three different pitch classes — three notes at
    // the same pitch is a transcription splitting one note, not a chord.
    const clusters = [[sorted[0]]];
    for (let i = 1; i < sorted.length; i += 1) {
      const current = clusters[clusters.length - 1];
      if (sorted[i][0] - current[0][0] <= ROLE_CLUSTER) current.push(sorted[i]);
      else clusters.push([sorted[i]]);
    }
    const classes = group => new Set(group.map(note => ((note[2] % 12) + 12) % 12));
    const chordal = clusters.filter(group => classes(group).size >= 3);
    // The share of notes struck together, not the single densest moment: one accidental cluster must not label a
    // whole span chordal.
    const blockShare = chordal.reduce((total, group) => total + group.length, 0) / sorted.length;
    const voices = Math.max(...clusters.map(group => classes(group).size));
    const held = sorted.reduce((total, note) => total + Math.max(0, note[1] - note[0]), 0) || 1;
    const inside = tones ? sorted.reduce((total, note) => total + (tones.has(((note[2] % 12) + 12) % 12) ? Math.max(0, note[1] - note[0]) : 0), 0) : 0;
    const chordTone = tones ? inside / held : null;
    // Melodic motion is read between clusters, using each cluster's lowest note, so a strum contributes one point.
    const heads = clusters.map(group => Math.min(...group.map(note => note[2])));
    const steps = heads.slice(1).map((pitch, i) => Math.abs(pitch - heads[i]));
    const step = steps.length ? steps.filter(interval => interval > 0 && interval <= 2).length / steps.length : 0;
    const detail = { voices, chordTone, step, notes: sorted.length, blockShare: Math.round(blockShare * 100) / 100 };
    if (blockShare >= ROLE_BLOCK_SHARE) return { role: 'block', ...detail };
    if (tones && chordTone >= ROLE_CHORD_TONE && step <= ROLE_STEP && steps.length >= 2) return { role: 'arpeggio', ...detail };
    if (steps.length >= 2 && (step > ROLE_STEP || (tones && chordTone < 0.6))) return { role: 'line', ...detail };
    return { role: 'unclear', ...detail };
  }

  function create({ bridge, audio, getState, rt, playTrack, albumTracks, formatTime, parseTime, onAnnotationsChanged, onLanesChanged, onSeek, onLoop, getLoop, decorateLane }) {
    const $ = id => document.getElementById(id);
    let mixCatalog = null, mixSelection = null, mixError = null;
    let trackId = null, lanes = [], zoom = 1, sequence = 0, loading = false, seeking = false, focusStem = null;
    let annotating = false, draft = null, rangeSelecting = false, gestureEpoch = 0;
    // When the audition is sounding a part, it owns the clock: WebAudio has no `timeupdate`, and the <audio>
    // element it would come from is paused (or loaded with a different track entirely). R6 swaps the same seam.
    let timeSource = null, midiEditor = null;
    let noteSelecting = false, selectionKeys = new Set(), cancelNoteGesture = null;
    const roleCache = new Map(), harmonyCache = new Map();
    const surfaces = new Map();
    let paintQueued = false;
    // One strip per lane, two things it can say. Showing both at once would cost a third of a compact lane.
    let stripMode = 'role';   // 'role' | 'harmony' | 'off'


    let layout=window.XldTrackLayout.create(),groupCache=new Map(),editTargets=new Map(),dragRow=null;
    function loadLayout(){let value;try{value=JSON.parse(localStorage.getItem('xld:track-layout:'+trackId)||'null');}catch(_){}layout=window.XldTrackLayout.create(value);groupCache.clear();editTargets.clear();}
    function saveLayout(){try{localStorage.setItem('xld:track-layout:'+trackId,JSON.stringify(layout.snapshot()));}catch(_){}}
    const groupId=stem=>'@stem:'+stem;
    const partsFor=stem=>layout.children(stem,lanes.filter(l=>l.stem===stem));
    function groupLane(stem){
      const parts=lanes.filter(l=>l.stem===stem);if(parts.length<2)return parts[0]||null;
      if(!groupCache.has(stem)){const notes=parts.flatMap(l=>l.notes).sort((a,b)=>a[0]-b[0]||a[4]-b[4]||a[5]-b[5]);
        groupCache.set(stem,{...parts[0],laneId:groupId(stem),instrument:null,grouped:true,notes,noteCount:notes.length,isDraft:parts.some(l=>l.isDraft)});
      }return groupCache.get(stem);
    }
    function lookup(id){return lanes.find(l=>l.laneId===id)||(id?.startsWith('@stem:')?groupLane(id.slice(6)):null);}
    function visibleLanes(){
      if(focusStem)return lookup(focusStem)?[lookup(focusStem)]:[];
      return [...new Set(lanes.map(l=>l.stem))].flatMap(stem=>{const parts=partsFor(stem);if(parts.length<2)return parts;
        const group=groupLane(stem);return layout.collapsed(stem)?[group]:[{...group,groupHeader:true},...parts];});
    }
    function editLane(){
      const view=lookup(focusStem);if(!view?.grouped)return view;
      const indices=[...new Set(chosenNotes().map(n=>n[4]))];if(indices.length>1){if($('timelineEditTarget'))$('timelineEditTarget').value='';return null;}
      const parts=partsFor(view.stem),wanted=indices[0]??editTargets.get(view.stem);
      const part=parts.find(l=>l.instrument?.index===wanted)||parts[0];
      if(part){editTargets.set(view.stem,part.instrument?.index);if($('timelineEditTarget'))$('timelineEditTarget').value=String(part.instrument?.index);}
      return part||null;
    }
    function setEditInstrument(stem,index){editTargets.set(stem,Number(index));selectionKeys.clear();cancelNoteGesture?.();render();}
    function setCollapsed(stem,value){
      const parts=partsFor(stem);if(parts.length<2)return;
      const focused=lookup(focusStem),wasSelecting=noteSelecting;
      cancelNoteGesture?.();selectionKeys.clear();gestureEpoch++;
      layout.fold(stem,value);saveLayout();
      if(focused?.stem===stem){
        if(focused.instrument)editTargets.set(stem,focused.instrument.index);
        focusStem=value?groupId(stem):(parts.find(l=>l.instrument?.index===editTargets.get(stem))||parts[0]).laneId;
        noteSelecting=wasSelecting;onLanesChanged?.(focusStem);
      }
      render();
    }
    const rootKeys=()=>[...segmentRows().map(r=>'analysis:'+r.result.engine.id),...new Set(lanes.map(l=>'stem:'+l.stem))];
    function moveRow(from,to,after=false,parent=null){
      const ids=parent?partsFor(parent).map(l=>l.laneId):layout.ordered(rootKeys(),x=>x);
      if(!ids.includes(from)||!ids.includes(to)||from===to)return false;
      cancelNoteGesture?.();gestureEpoch++;layout.move(ids,from,to,after,parent);saveLayout();render();return true;
    }
    function addOrderControls(head,element,key,parent=null){
      element.dataset.layoutKey=key;element.dataset.layoutParent=parent||'';
      const handle=document.createElement('button');handle.type='button';handle.className='tl-drag-handle';handle.textContent='⠿';handle.draggable=true;
      handle.title=rt('runtime.layout.drag');handle.setAttribute('aria-label',handle.title);handle.dataset.dragKey=key;
      handle.addEventListener('click',e=>e.stopPropagation());
      handle.addEventListener('dragstart',e=>{dragRow={key,parent};e.dataTransfer?.setData('text/plain',key);if(e.dataTransfer)e.dataTransfer.effectAllowed='move';});
      handle.addEventListener('dragend',()=>{dragRow=null;element.classList.remove('tl-drop-before','tl-drop-after');});
      handle.addEventListener('keydown',e=>{if(!e.ctrlKey||!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const ids=parent?partsFor(parent).map(l=>l.laneId):layout.ordered(rootKeys(),x=>x),at=ids.indexOf(key),next=ids[at+(e.key==='ArrowUp'?-1:1)];if(next)moveRow(key,next,e.key==='ArrowDown',parent);});
      element.addEventListener('dragover',e=>{if(!dragRow||dragRow.parent!==parent||dragRow.key===key)return;e.preventDefault();const after=e.clientY>element.getBoundingClientRect().top+element.getBoundingClientRect().height/2;element.classList.toggle('tl-drop-after',after);element.classList.toggle('tl-drop-before',!after);});
      element.addEventListener('dragleave',()=>element.classList.remove('tl-drop-before','tl-drop-after'));
      element.addEventListener('drop',e=>{e.preventDefault();const from=dragRow;dragRow=null;element.classList.remove('tl-drop-before','tl-drop-after');if(from?.parent===parent){const r=element.getBoundingClientRect();moveRow(from.key,key,e.clientY>r.top+r.height/2,parent);}});
      head.append(handle);
    }
    function decorateTrack(lane,head,element){
      const parts=partsFor(lane.stem),isGroup=lane.grouped||parts.length===1,isChild=parts.length>1&&!lane.grouped;
      const box=decorateLane?.(lane,head,{parent:isGroup||Boolean(focusStem),child:isChild})||head;
      const top=document.createElement('div');top.className='tl-track-tools';
      addOrderControls(top,element,isChild?lane.laneId:'stem:'+lane.stem,isChild?lane.stem:null);
      if(parts.length>1){const fold=document.createElement('button');fold.type='button';fold.className='tl-fold quiet-button';
        const folded=lane.grouped&&!lane.groupHeader;fold.textContent=folded?'▸':'▾';fold.title=rt(folded?'runtime.layout.expand':'runtime.layout.collapse');
        fold.dataset.foldStem=lane.stem;fold.setAttribute('aria-expanded',String(!folded));fold.addEventListener('click',()=>setCollapsed(lane.stem,!folded));top.append(fold);
      }
      box.append(top);
      if(lane.grouped&&focusStem){const select=document.createElement('select');select.id='timelineEditTarget';select.className='tl-edit-target';select.dataset.editStem=lane.stem;select.title=rt('runtime.layout.editTarget');select.setAttribute('aria-label',select.title);
        const empty=document.createElement('option');empty.value='';empty.disabled=true;empty.textContent=rt('runtime.layout.selectionTarget');select.append(empty);
        for(const p of parts){const o=document.createElement('option');o.value=String(p.instrument.index);o.textContent=p.instrument.name||'#'+(p.instrument.index+1);select.append(o);}
        select.value=String(editLane()?.instrument?.index??parts[0].instrument.index);select.addEventListener('change',()=>setEditInstrument(lane.stem,select.value));box.append(select);
      }
      return box;
    }

    const duration = () => {
      const state = getState();
      const fromResults = [...(state.analysisResults?.values() || [])].map(r => Number(r?.duration) || 0);
      const fromNotes = lanes.map(lane => Number(lane.duration) || 0);
      const fromTags = (state.annotations || []).map(tag => Number(tag.end) || 0);
      const fromAudio = state.currentTrack?.id === state.selectedTrack?.id && Number.isFinite(audio.duration) ? audio.duration : 0;
      return Math.max(0, ...fromResults, ...fromNotes, ...fromTags, fromAudio);
    };

    // Manual marks get their own lane per axis, each sitting with the engines it is correcting: section marks under
    // the section engines, chord marks under the chord engines. While annotating both lanes stay visible even when
    // empty, otherwise there is nowhere to drag the first mark.
    function segmentRows() {
      const state = getState();
      const results = [...(state.analysisResults?.values() || [])].filter(r => Array.isArray(r?.segments) && r.segments.length);
      const isHarmony = r => String(r.engine?.id || '').startsWith('chord-');
      const tags = state.annotations || [];
      const manual = (kind, id, nameKey) => {
        const segments = tags.filter(tag => (tag.kind === 'chord' ? 'chord' : 'section') === kind);
        if (!segments.length && !annotating) return [];
        return [{ kind: 'manual', axis: kind, result: { engine: { id, name: rt(nameKey) }, segments } }];
      };
      return [
        ...results.filter(r => !isHarmony(r)).map(r => ({ kind: 'section', axis: 'section', result: r })),
        ...manual('section', 'manual', 'runtime.timeline.manual'),
        ...results.filter(isHarmony).map(r => ({ kind: 'harmony', axis: 'chord', result: r })),
        ...manual('chord', 'manual-chord', 'runtime.timeline.manualChords')
      ];
    }

    // The chord lane is the reference an arpeggio is measured against, so take the primary engine's reading.
    // Without one there is still block-vs-line to say, measured over fixed windows, but no arpeggio call.
    function referenceChords() {
      const results = getState().analysisResults;
      const pick = ['chord-chordmini', 'chord-btc'].map(id => results?.get(id)).find(result => result?.segments?.length)
        || [...(results?.values() || [])].find(result => String(result?.engine?.id || '').startsWith('chord-') && result?.segments?.length);
      if (!pick) {
        const total = duration(), windows = [];
        for (let start = 0; start < total; start += 2) windows.push({ start, end: Math.min(total, start + 2), label: null, tones: null, parts: null });
        return { key: `window:${total}`, name:null, list: windows };
      }
      return {
        key: JSON.stringify([pick.engine?.id,pick.segments]),
        name: pick.engine?.name||pick.engine?.id,
        list: pick.segments.map(segment => ({ start: Number(segment.start) || 0, end: Number(segment.end) || 0, label: segment.label, tones: chordTones(segment.label), parts: chordParts(segment.label) }))
      };
    }

    // Both readings walk the same chord spans over the same notes, so they share one pass and one cache shape.
    function spansFor(lane, cache, field, classify, overlap=false) {
      const spans = referenceChords();
      const key = `${lane.runId || lane.engine || lane.stem}:${lane.laneId}:${lane.noteCount}:${spans.key}`;
      const cached = cache.get(lane.laneId);
      if (cached?.key === key) return cached.value;
      const notes = lane.notes, out = [];
      let index = 0, active=[];
      for (const span of spans.list.slice().sort((a,b)=>a.start-b.start)) {
        let bucket=[];
        if(overlap){
          while(index<notes.length&&notes[index][0]<span.end)active.push(notes[index++]);
          active=active.filter(note=>note[1]>span.start);
          bucket=active.filter(note=>note[0]<span.end).map(note=>[Math.max(note[0],span.start),Math.min(note[1],span.end),...note.slice(2)]);
        }else{
          while(index<notes.length&&notes[index][0]<span.start)index++;
          let scan=index;
          while(scan<notes.length&&notes[scan][0]<span.end)bucket.push(notes[scan++]);
        }
        const verdict = classify(bucket, span);
        const previous = out[out.length - 1];
        // Neighbouring spans that read the same way are one gesture; merging keeps the strip readable.
        if (!overlap && previous && previous[field] === verdict[field] && Math.abs(previous.end - span.start) < 0.001) previous.end = span.end;
        else out.push({ start: span.start, end: span.end, label: span.label, ...verdict });
      }
      cache.set(lane.laneId, { key, value: out });
      return out;
    }

    const rolesFor = lane => spansFor(lane, roleCache, 'role', (bucket, span) => classifySpan(bucket, span.tones));
    const harmonyFor = lane => spansFor(lane, harmonyCache, 'relation', (bucket, span) => classifyHarmony(bucket, span.parts), true);
    const stripFor = lane => lane.stem === 'drums' ? null : stripMode === 'role' ? rolesFor(lane) : stripMode === 'harmony' ? harmonyFor(lane) : null;
    const stripKind = span => stripMode === 'harmony' ? span.relation : span.role;

    const roleAt = (roles, seconds) => roles.find(span => seconds >= span.start && seconds < span.end) || null;

    // --- note lane painting -------------------------------------------------------------------
    // Focused drums get one row per GM key actually played; everything else is a semitone grid. A compact lane is a
    // few pixels tall, so its shading stays neutral stripes — piano-roll detail only means something when focused.
    function laneLayout(lane, detailed) {
      if (lane.stem === 'drums' && detailed) {
        const keys = [...new Set(lane.notes.map(note => note[2]))].sort((a, b) => b - a);
        return { kind: 'keys', keys, rowOf: new Map(keys.map((pitch, index) => [pitch, index])), span: Math.max(1, keys.length) };
      }
      const pitches = lane.notes.map(note => note[2]);
      if (!pitches.length) return {kind:'pitch',low:48,high:72,span:25};
      let low = Math.min(...pitches), high = Math.max(...pitches);
      if (detailed) {
        low=Math.max(0,Math.floor(low)-2);high=Math.min(127,Math.ceil(high)+2);
        const missing=Math.max(0,13-(high-low+1));
        low=Math.max(0,low-Math.floor(missing/2));high=Math.min(127,Math.max(high,low+12));
        low=Math.max(0,Math.min(low,high-12));
        return {kind:'pitch',low,high,span:high-low+1};
      }
      if (high - low < MIN_SEMITONES) {
        const pad = (MIN_SEMITONES - (high - low)) / 2;
        low -= pad; high += pad;
      }
      return { kind: 'pitch', low, high, span: Math.max(1, high - low + 1) };
    }


    // Shared CSS-pixel geometry for painting and pointer hit tests. No vertical hit halo crosses a semitone.
    const noteKey = note => Number.isInteger(note[4]) && Number.isInteger(note[5]) && note[4] >= 0 && note[5] >= 0
      ? note[4] + ':' + note[5] : null;
    function noteRect(note, layout, total, width, height, detailed) {
      const rowHeight = detailed ? PITCH_ROW_HEIGHT : height / layout.span;
      const row = layout.kind === 'keys' ? (layout.rowOf.get(note[2]) ?? 0) : layout.high - note[2];
      return { x: note[0] / total * width, y: row * rowHeight,
        width: Math.max(1.5, (note[1] - note[0]) / total * width),
        height: Math.max(1.5, rowHeight - (detailed ? 1 : 0.5)) };
    }
    const selectedLane = () => lookup(focusStem);
    function selectable(lane = selectedLane()) {
      if (loading || !lane?.editable || !lane.notes.length) return false;
      const keys = lane.notes.map(noteKey);
      return keys.every(key => key !== null) && new Set(keys).size === keys.length;
    }
    const chosenNotes = () => (selectedLane()?.notes || []).filter(note => selectionKeys.has(noteKey(note)));
    function selection() {
      const lane = selectedLane();
      return { trackId, runId: lane?.runId || null, laneId: lane?.laneId || null,
        notes: chosenNotes().map(n => ({instrumentIndex:n[4],noteIndex:n[5],start:n[0],end:n[1],pitch:n[2],velocity:n[3]})) };
    }
    const noteName = pitch => ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][pitch % 12] + (Math.floor(pitch / 12) - 1);
    function renderSelection() {
      midiEditor?.render();
      const toggle = $('timelineSelectNotes'), clear = $('timelineSelectionClear'), panel = $('timelineSelection');
      const ready = selectable();
      if (toggle) {
        toggle.disabled = !ready;
        toggle.textContent = rt('runtime.selection.mode');
        toggle.setAttribute('aria-pressed', noteSelecting ? 'true' : 'false');
        toggle.title = rt(!focusStem ? 'runtime.selection.focusFirst' : !ready ? 'runtime.selection.unavailable' : 'runtime.selection.hint');
      }
      if (!panel) return;
      panel.hidden = !noteSelecting;
      const notes = chosenNotes(), count = notes.length;
      if (clear) { clear.textContent = rt('runtime.selection.clear'); clear.disabled = count === 0; }
      const label = (id,text) => { const node = $(id); if (node) node.textContent = text; };
      label('timelineSelectionCount',rt('runtime.selection.count',{count}));
      label('timelineSelectionHint',midiEditor?.active() ? '' : rt(count ? 'runtime.selection.readonly' : 'runtime.selection.hint'));
      const properties = $('timelineSelectionProperties');
      if (properties) properties.hidden = !count;
      if (!count) return;
      const minimum = index => Math.min(...notes.map(n => n[index]));
      const maximum = index => Math.max(...notes.map(n => n[index]));
      const range = (a,b,format = String) => a === b ? format(a) : format(a) + '–' + format(b);
      const pitchText = pitch => selectedLane()?.stem === 'drums'
        ? (GM_DRUM_KEYS[pitch] || 'GM') + ' (' + pitch + ')' : noteName(pitch) + ' (' + pitch + ')';
      const lengths = notes.map(n => n[1]-n[0]);
      label('timelineSelectionPitch',rt('runtime.selection.pitch',{value:range(minimum(2),maximum(2),pitchText)}));
      label('timelineSelectionStart',rt(count === 1 ? 'runtime.selection.start' : 'runtime.selection.first',{value:minimum(0).toFixed(3)}));
      label('timelineSelectionEnd',rt(count === 1 ? 'runtime.selection.end' : 'runtime.selection.last',{value:maximum(1).toFixed(3)}));
      label('timelineSelectionLength',rt('runtime.selection.length',{value:range(Math.min(...lengths),Math.max(...lengths),v=>v.toFixed(3))}));
      label('timelineSelectionVelocity',rt('runtime.selection.velocity',{value:range(minimum(3),maximum(3))}));
    }
    function redrawSelectedLane() {
      const surface = surfaces.get(focusStem);
      if (surface) { surface.overlayDirty = true; queuePaint(); }
      renderSelection();
    }
    function clearSelection() { selectionKeys.clear(); redrawSelectedLane(); }
    function setNoteSelecting(value) {
      cancelNoteGesture?.();
      noteSelecting = Boolean(value && selectable());
      gestureEpoch += 1;
      selectionKeys.clear();
      if (noteSelecting) { annotating = false; rangeSelecting = false; draft = null; }
      render();
    }
    function attachNoteSelection(body,lane,total) {
      let active = null, start = null, marquee = null, moved = false, additive = false, epoch = 0;
      const point = event => {
        const r = body.getBoundingClientRect();
        return {x:Math.max(0,Math.min(r.width,event.clientX-r.left)),y:Math.max(0,Math.min(r.height,event.clientY-r.top))+(surfaces.get(lane.laneId)?.pitchTop||0)};
      };
      const cancel = () => {
        if (active !== null) uncapture(body,active);
        active = null; start = null; marquee?.remove(); marquee = null;
        if (cancelNoteGesture === cancel) cancelNoteGesture = null;
      };
      midiEditor?.attach(body,lane,{point,total,layout:laneLayout(lane,true),
        rect:n=>{const r=body.getBoundingClientRect();return noteRect(n,laneLayout(lane,true),total,r.width,r.height,true);},
        cancelGesture:cancel=>{cancelNoteGesture=cancel;}
      });
      body.addEventListener('pointerdown',event=>{
        if (event.defaultPrevented || midiEditor?.busy()) return;
        if (!noteSelecting || lane.laneId !== focusStem || event.button !== 0 || event.shiftKey) return;
        event.preventDefault(); active = event.pointerId; start = point(event); moved = false;
        additive = Boolean(event.ctrlKey || event.metaKey); epoch = gestureEpoch;
        cancelNoteGesture = cancel; capture(body,event.pointerId);
      });
      body.addEventListener('pointermove',event=>{
        if (active !== event.pointerId || !start || epoch !== gestureEpoch) return;
        const p = point(event);
        if (Math.hypot(p.x-start.x,p.y-start.y) >= 4) moved = true;
        if (!moved) return;
        if (!marquee) { marquee = document.createElement('i'); marquee.className = 'tl-note-marquee'; body.append(marquee); }
        Object.assign(marquee.style,{left:Math.min(start.x,p.x)+'px',top:(Math.min(start.y,p.y)-(surfaces.get(lane.laneId)?.pitchTop||0))+'px',
          width:Math.abs(p.x-start.x)+'px',height:Math.abs(p.y-start.y)+'px'});
      });
      const release = event => {
        if (active !== event.pointerId || !start) return;
        if (event.type === 'pointercancel' || epoch !== gestureEpoch || !noteSelecting) { cancel(); return; }
        const p = point(event), r = body.getBoundingClientRect(), layout = laneLayout(lane,true);
        moved = moved || Math.hypot(p.x-start.x,p.y-start.y) >= 4;
        const box = {left:Math.min(start.x,p.x),right:Math.max(start.x,p.x),top:Math.min(start.y,p.y),bottom:Math.max(start.y,p.y)};
        const hits = [];
        for (const note of lane.notes) {
          const rect = noteRect(note,layout,total,r.width,r.height,true);
          const hit = moved ? rect.x <= box.right && rect.x+rect.width >= box.left && rect.y <= box.bottom && rect.y+rect.height >= box.top
            : p.x >= rect.x && p.x <= rect.x+rect.width && p.y >= rect.y && p.y <= rect.y+rect.height;
          if (hit) hits.push({note,distance:Math.abs(p.y-rect.y-rect.height/2)+Math.abs(p.x-rect.x-rect.width/2)/Math.max(1,rect.width)});
        }
        if (!additive) selectionKeys.clear();
        if (moved) for (const hit of hits) selectionKeys.add(noteKey(hit.note));
        else if (hits.length) {
          // Nearest centre wins; on an exact overlap the last painted note wins.
          hits.reverse(); hits.sort((a,b)=>a.distance-b.distance);
          const key = noteKey(hits[0].note);
          if (additive && selectionKeys.has(key)) selectionKeys.delete(key); else selectionKeys.add(key);
        }
        cancel(); redrawSelectedLane();
      };
      body.addEventListener('pointerup',release);
      body.addEventListener('pointercancel',release);
    }


    // One reusable pair per displayed lane. The DOM may be rebuilt, but the pixel buffers survive zoom/mode
    // changes. Scroll callbacks paint the current rows only, never a detached row captured by an older rAF.
    function contextFor(canvas, view) {
      const w = Math.max(1,Math.round(view.visibleWidth*view.dpr)), h = Math.max(1,Math.round(view.height*view.dpr));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      canvas.style.left = view.offset+'px';
      canvas.style.width = view.visibleWidth+'px';
      canvas.style.height = view.height+'px';
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.setTransform(view.dpr,0,0,view.dpr,-view.offset*view.dpr,-view.pitchTop*view.dpr);
      ctx.clearRect(view.offset,view.pitchTop,view.visibleWidth,view.height);
      return ctx;
    }
    function prepareSurface(surface) {
      if (surface.indexedLane === surface.lane && surface.indexedDetail === surface.detailed) return;
      const scope=trackId+':'+surface.lane.runId+':'+surface.lane.laneId;
      if(surface.pitchScope!==scope || surface.indexedDetail!==surface.detailed){surface.pitchTop=null;surface.pitchScope=scope;}
      surface.indexedLane = surface.lane; surface.indexedDetail = surface.detailed;
      surface.layout = laneLayout(surface.lane,surface.detailed);
      // Prefix maximum ends are monotone even for nested sustains. Searching only note starts would lose a
      // note which began before the viewport but is still sounding inside it.
      surface.ends = new Float64Array(surface.lane.notes.length);
      let end = -Infinity;
      surface.lane.notes.forEach((note,i)=>{ end=Math.max(end,note[1]); surface.ends[i]=end; });
      surface.last = null;
    }
    function viewportNotes(surface, view) {
      const notes=surface.lane.notes, scale=view.width/surface.total;
      const from=(view.offset-1.5)/scale, to=(view.offset+view.visibleWidth)/scale;
      let low=0,high=notes.length;
      while(low<high){const mid=(low+high)>>>1;if(surface.ends[mid]<from)low=mid+1;else high=mid;}
      const visible=[];
      for(let i=low;i<notes.length&&notes[i][0]<=to;i++){
        const note=notes[i],rect=noteRect(note,surface.layout,surface.total,view.width,view.height,surface.detailed);
        if(rect.x+rect.width>=view.offset && rect.x<=view.offset+view.visibleWidth && rect.y+rect.height>=view.pitchTop && rect.y<=view.pitchTop+view.height)visible.push({note,rect});
      }
      return visible;
    }
    function drawSelection(surface,view) {
      const ctx=contextFor(surface.overlay,view);
      if(!ctx || !noteSelecting || surface.lane.laneId!==focusStem)return;
      const preview=midiEditor?.preview?.();
      if(preview?.laneId===surface.lane.laneId){
        ctx.globalAlpha=.28;ctx.fillStyle='#ffbb66';
        for(const n of preview.notes){const r=noteRect(n,surface.layout,surface.total,view.width,view.height,surface.detailed);
          ctx.fillRect(r.x,r.y,r.width,r.height);ctx.globalAlpha=1;ctx.fillRect(r.x,r.y,r.width,2);ctx.fillRect(r.x,r.y+r.height-2,r.width,2);
          ctx.fillRect(r.x,r.y,2,r.height);ctx.fillRect(r.x+r.width-2,r.y,2,r.height);ctx.globalAlpha=.28;}
      }
      ctx.globalAlpha=1; ctx.fillStyle='#e7fff5';
      for(const {note,rect} of surface.visible){
        if(!selectionKeys.has(noteKey(note)))continue;
        const {x,y,width:w,height:h}=rect;
        ctx.fillRect(x,y,w,1);ctx.fillRect(x,y+h-1,w,1);ctx.fillRect(x,y,1,h);ctx.fillRect(x+w-1,y,1,h);
      }
    }

    const pitchExtent = surface => (surface.layout?.span || 1)*PITCH_ROW_HEIGHT+12;
    function setPitchTop(surface,value) {
      const max=Math.max(0,pitchExtent(surface)-surface.body.clientHeight);
      const next=Math.max(0,Math.min(max,Number(value)||0));
      if(next===surface.pitchTop)return;
      cancelNoteGesture?.(); // scrolling cannot commit a box anchored in a different pitch viewport
      surface.pitchTop=next;
      if(surface.scroller && surface.scroller.scrollTop!==next)surface.scroller.scrollTop=next;
      queuePaint();
    }
    function attachPitchScroll(surface) {
      const bar=document.createElement('div'),space=document.createElement('div');
      bar.className='tl-pitch-scroll'; bar.tabIndex=0;bar.setAttribute('aria-label',rt('runtime.timeline.pitchScroll'));
      bar.title=rt('runtime.timeline.pitchScroll');space.className='tl-pitch-space';bar.append(space);
      surface.scroller=bar;surface.pitchSpace=space;
      bar.addEventListener('scroll',()=>setPitchTop(surface,bar.scrollTop));
      for(const type of ['pointerdown','pointermove','pointerup','click'])bar.addEventListener(type,event=>event.stopPropagation());
      surface.body.append(bar);
      surface.body.addEventListener('wheel',event=>{
        if(event.ctrlKey || event.metaKey)return;
        const scale=event.deltaMode===1?PITCH_ROW_HEIGHT:event.deltaMode===2?surface.body.clientHeight:1;
        const dx=(event.deltaX||0)*scale,dy=(event.deltaY||0)*scale;
        event.preventDefault();
        if(event.shiftKey || Math.abs(dx)>Math.abs(dy)){
          const host=$('timelineLanes');if(host)host.scrollLeft+=event.shiftKey?(dy||dx):dx;
          queuePaint();
        } else setPitchTop(surface,(surface.pitchTop||0)+dy);
      },{passive:false});
    }

    function paintSurface(surface) {
      const host=$('timelineLanes'), body=surface.body;
      if(!host || !body || !(surface.total>0))return;
      const laneRect=body.getBoundingClientRect(),hostRect=host.getBoundingClientRect();
      const width=body.clientWidth,height=body.clientHeight;
      if(!(width>0 && height>0 && host.clientWidth>0))return;
      const visibleWidth=Math.min(width,host.clientWidth);
      const offset=Math.max(0,Math.min(width-visibleWidth,Math.floor(hostRect.left-laneRect.left)));
      const dpr=Math.min(window.devicePixelRatio||1,MAX_CANVAS/Math.max(visibleWidth,height,1));
      prepareSurface(surface);
      const maxPitch=surface.detailed?Math.max(0,pitchExtent(surface)-height):0;
      surface.pitchTop=Math.max(0,Math.min(maxPitch,surface.pitchTop??Math.round(maxPitch/2)));
      if(surface.scroller){
        const bar=surface.scroller;
        bar.hidden=!surface.detailed || maxPitch===0;
        // The song-wide body can be 128 screens wide: pin the vertical scrollbar to the actual visible edge.
        bar.style.left=Math.max(0,Math.min(width,hostRect.right-laneRect.left-2)-16)+'px';
        surface.pitchSpace.style.height=pitchExtent(surface)+'px';
        if(bar.scrollTop!==surface.pitchTop)bar.scrollTop=surface.pitchTop;
      }
      const view={width,height,visibleWidth,offset,dpr,pitchTop:surface.pitchTop,total:surface.total,spans:surface.spans};
      const changed=!surface.last || Object.keys(view).some(key=>view[key]!==surface.last[key]);
      if(changed){
        surface.visible=viewportNotes(surface,view);
        drawLane(surface,view);
      }
      if(changed || surface.overlayDirty)drawSelection(surface,view);
      surface.last=view; surface.overlayDirty=false;
    }
    function queuePaint() {
      if(paintQueued)return;
      paintQueued=true;
      requestAnimationFrame(()=>{
        paintQueued=false;
        for(const surface of surfaces.values())paintSurface(surface);
      });
    }

    function drawLane(surface, view) {
      const {lane,detailed,spans:roles,layout} = surface, {width,height,offset,visibleWidth,pitchTop} = view;
      const ctx = contextFor(surface.canvas,view);
      if (!ctx) return;
      if(lane.wavOnly&&lane.sourceAudio?.waveform){
        const points=lane.sourceAudio.waveform,step=width/points.length;ctx.fillStyle='#83c9b8';
        for(let i=0;i<points.length;i++){const x=i*step;if(x+step<offset||x>offset+visibleWidth)continue;const h=Math.max(1,points[i]*(height-12));ctx.fillRect(x,(height-h)/2,Math.max(1,step-1),h);}return;
      }
      const rowHeight = detailed?PITCH_ROW_HEIGHT:height/layout.span;
      const firstRow=Math.max(0,Math.floor(pitchTop/rowHeight)),lastRow=Math.min(layout.span,Math.ceil((pitchTop+height)/rowHeight));
      if (detailed && layout.kind === 'pitch') {
        ctx.fillStyle = 'rgba(255,255,255,.05)';
        for (let index = firstRow; index < lastRow; index += 1) {
          if (BLACK_KEYS.has((((Math.round(layout.high - index)) % 12) + 12) % 12)) ctx.fillRect(offset, index * rowHeight, visibleWidth, rowHeight);
        }
      } else {
        ctx.fillStyle = 'rgba(255,255,255,.04)';
        for (let i = firstRow-(firstRow%2); i < lastRow; i += 2) ctx.fillRect(offset, (i * rowHeight), visibleWidth, rowHeight);
      }
      if (detailed) drawGuides(ctx, layout, width, height, rowHeight, offset, visibleWidth, pitchTop);
      const color = STEM_COLORS[lane.stem] || '#9aa0b4';
      // Focused lanes colour each note by how that span is being played, so the strip below and the notes agree.
      let cursor = 0;
      for (const {note,rect} of surface.visible) {
        const [start, end, pitch, velocity] = note;
        const { x, y, width:w, height:h } = rect;
        ctx.globalAlpha = 0.4 + 0.6 * Math.min(1, Math.max(0, velocity / 127));
        let paint = color;
        if (roles) {
          while (cursor < roles.length - 1 && roles[cursor].end <= start) cursor += 1;
          const span = roles[cursor];
          const kind = span && (span.relation ?? span.role);
          const palette = span && (span.relation ? HARMONY_COLORS : ROLE_COLORS);
          if (span && start >= span.start && start < span.end && palette[kind] && kind !== 'rest') paint = palette[kind];
        }
        ctx.fillStyle = paint;
        ctx.fillRect(x, y, w, h);
      }
      ctx.globalAlpha = 1;
    }

    // Labels keep their song-space positions while only those touching the viewport are painted, so pan and
    // zoom never make the pitch guide jump to a different beat.
    function drawGuides(ctx, layout, width, height, rowHeight, offset, visibleWidth, pitchTop) {
      const step = Math.max(320, Math.min(720, width / 4));
      const stops = [];
      const first = Math.max(0,Math.floor((offset-100-6)/step));
      for (let x = 6+first*step; x < Math.min(width,offset+visibleWidth); x += step) stops.push(x);
      ctx.font = `${Math.round(Math.min(11, Math.max(8, rowHeight)))}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      const label = (text, y) => { if(y+rowHeight<pitchTop||y-rowHeight>pitchTop+height)return; ctx.fillStyle = 'rgba(255,255,255,.42)'; for (const x of stops) ctx.fillText(text, x, y); };
      if (layout.kind === 'keys') {
        layout.keys.forEach((pitch, index) => label(GM_DRUM_KEYS[pitch] || String(pitch), index * rowHeight + rowHeight / 2));
        return;
      }
      for (let pitch = Math.ceil(layout.low / 12) * 12; pitch <= layout.high; pitch += 12) {
        const y = (layout.high - pitch) * rowHeight;
        ctx.fillStyle = 'rgba(255,255,255,.14)';
        ctx.fillRect(offset, y + rowHeight, visibleWidth, 1);
        label(`C${Math.round(pitch / 12) - 1}`, y + rowHeight / 2);
      }
    }

    // The share of the track each way of playing accounts for — the one number that says what this part mostly does.
    function roleMix(spans, total) {
      const held = new Map();
      for (const span of spans) {
        const kind = stripKind(span);
        if (kind === 'rest') continue;
        held.set(kind, (held.get(kind) || 0) + (span.end - span.start));
      }
      const ordered = [...held.entries()].sort((a, b) => b[1] - a[1]).filter(([, seconds]) => seconds / Math.max(1, total) >= 0.08);
      return ordered.map(([kind, seconds]) => `${rt('runtime.timeline.' + stripMode + '.' + kind)} ${Math.round((seconds / Math.max(1, total)) * 100)}%`).join(' · ');
    }

    // What the row is called. A stem whose MIDI holds several named instruments says which one this is: the
    // distinction between violin and cello has been sitting in the file all along, unread.
    function laneName(lane) {
      if (!lane) return '';
      const name = lane.instrument?.name?.trim();
      if (!name) return lane.instrument ? `${lane.stem} ${lane.instrument.index + 1}` : lane.stem;
      return `${lane.stem} · ${name}`;
    }
    function laneSubtitle(lane) {
      if (!lane.notes.length) return rt('runtime.timeline.laneEmpty');
      if (lane.stem === 'drums') {
        const keys = [...new Set(lane.notes.map(note => GM_DRUM_KEYS[note[2]] || String(note[2])))];
        return keys.join(' / ');
      }
      const pitches = lane.notes.map(note => note[2]);
      return rt('runtime.timeline.pitchRange', { low: Math.min(...pitches), high: Math.max(...pitches) });
    }

    // --- navigating a zoomed axis ---------------------------------------------------------------
    // Everything below works in seconds and converts through the first lane body, which is the one element that
    // carries the same geometry as every other lane (they are grid cells of one width).
    function viewport() {
      const host = $('timelineLanes');
      const body = host?.querySelector('.tl-row-body');
      const total = duration();
      if (!host || !body || !(total > 0)) return null;
      const lane = body.getBoundingClientRect(), view = host.getBoundingClientRect();
      if (!(lane.width > 0) || !(view.width > 0)) return null;
      return { host, total, lane, view, xOf: seconds => lane.left + (seconds / total) * lane.width };
    }

    const centreTime = () => {
      const v = viewport();
      if (!v) return null;
      return Math.max(0, Math.min(v.total, ((v.view.left + v.view.width / 2 - v.lane.left) / v.lane.width) * v.total));
    };

    function scrollTo(seconds) {
      const v = viewport();
      if (!v) return;
      v.host.scrollLeft += v.xOf(seconds) - (v.view.left + v.view.width / 2);
      queuePaint();
    }

    // Deliberately a single action, not a mode: an automatic scroll that only fires when the playhead drifts out of
    // a band reads as "sometimes it moves, sometimes it does not", which is worse than a button that always does the
    // same thing. Continuous following would have to pin the playhead at a fixed screen position, which is its own job.
    const playing = () => getState().currentTrack?.id && getState().currentTrack.id === getState().selectedTrack?.id;

    function locatePlayhead() {
      const auditioned = timeSource ? timeSource() : null;
      if (!Number.isFinite(auditioned) && !playing()) return false;
      scrollTo(Number.isFinite(auditioned) ? auditioned : Number(audio.currentTime) || 0);
      return true;
    }

    function attachPan(element, { always = false } = {}) {
      let from = null, scrollFrom = 0, active = null;
      element.addEventListener('pointerdown', event => {
        if (!always && event.button !== 1 && !event.shiftKey) return;
        const host = $('timelineLanes');
        if (!host) return;
        event.preventDefault();
        active = event.pointerId;
        from = event.clientX;
        scrollFrom = host.scrollLeft;
        element.classList.toggle('panning', true);
        capture(element, event.pointerId);
      });
      element.addEventListener('pointermove', event => {
        if (active !== event.pointerId || from === null) return;
        const host = $('timelineLanes');
        if (host) { host.scrollLeft = scrollFrom - (event.clientX - from); queuePaint(); }
      });
      const stop = event => {
        if (active !== event.pointerId) return;
        from = null;
        active = null;
        uncapture(element, event.pointerId);
        element.classList.toggle('panning', false);
      };
      element.addEventListener('pointerup', stop);
      element.addEventListener('pointercancel', stop);
    }

    // --- rendering ----------------------------------------------------------------------------
    function render() {
      const host = $('timelineLanes');
      if (!host) return;
      const state = getState(), selected = state.selectedTrack, total = duration();
      $('timelineTitle').textContent = rt('runtime.timeline.title');
      if (!selectable()) { noteSelecting = false; selectionKeys.clear(); }
      renderSelection();
      host.classList.toggle('tl-note-selecting',noteSelecting);
      $('timelineHint').textContent = rt(midiEditor?.active() ? 'runtime.edit.canvasHint' : noteSelecting ? 'runtime.selection.hint' : rangeSelecting ? 'runtime.audition.rangeHint' : annotating ? 'runtime.timeline.annotateHint' : focusStem ? 'runtime.timeline.focusHint' : 'runtime.timeline.hint');
      $('timelineLoopChoose')?.setAttribute('aria-pressed', rangeSelecting ? 'true' : 'false');
      const locate = $('timelineLocate');
      if (locate) {
        locate.textContent = rt('runtime.timeline.locate');
        locate.disabled = !selected || !playing();
        locate.title = rt(locate.disabled ? 'runtime.timeline.locateIdle' : 'runtime.timeline.locateHint');
      }
      const strip = $('timelineStrip');
      if (strip) {
        $('timelineStripLabel').textContent = rt('runtime.timeline.strip');
        for (const option of strip.options) option.textContent = rt('runtime.timeline.strip.' + option.value);
        strip.value = stripMode;
        strip.disabled = !selected;
      }
      const annotate = $('timelineAnnotate');
      if (annotate) {
        annotate.textContent = rt('runtime.timeline.annotate');
        annotate.disabled = !selected;
        annotate.setAttribute('aria-pressed', annotating ? 'true' : 'false');
        annotate.classList.toggle('active', annotating);
      }
      host.classList.toggle('tl-annotating', annotating || rangeSelecting);
      $('noteTimelineZoomLabel').textContent = zoom === 1 ? rt('runtime.timeline.fit') : `${zoom}×`;
      $('timelineZoomIn').disabled = !selected || zoom === MAX_ZOOM;
      $('noteTimelineZoomLabel').title = rt('runtime.timeline.fit');
      $('noteTimelineZoomLabel').disabled = !selected || zoom === 1;
      $('timelineZoomOut').disabled = !selected || zoom === 1;
      const rows = selected ? segmentRows() : [];
      // A focused stem that disappeared (different track, different MIDI) silently falls back to showing every lane.
      if (focusStem && !lookup(focusStem)) focusStem = null;
      const noteLanes = selected ? visibleLanes() : [];
      host.classList.toggle('tl-focused', Boolean(focusStem));
      const exit = $('timelineFocusExit');
      if (exit) { exit.textContent = rt('runtime.timeline.focusExit'); exit.hidden = !focusStem; }
      $('timelineSummary').textContent = !selected ? rt('runtime.timeline.chooseTrack')
        : loading ? rt('runtime.timeline.loading')
          : focusStem ? rt('runtime.timeline.focused', { stem: laneName(lookup(focusStem)) || focusStem, count: lanes.length })
            : rt('runtime.timeline.summary', { sections: rows.filter(r => r.kind === 'section').length, chords: rows.filter(r => r.kind === 'harmony').length, stems: noteLanes.length });
      const reference=$('timelineReference');
      if(reference){
        reference.hidden=!selected||stripMode==='off';
        const ref=referenceChords();
        reference.textContent=ref.name?rt('runtime.timeline.reference',{model:ref.name}):rt('runtime.timeline.referenceNone');
        reference.title=rt('runtime.timeline.referenceHint');
      }
      // Keep buffers only for lanes still displayed. Reattach surviving canvases below instead of allocating
      // a zoom-wide bitmap every time selection mode, locale or the surrounding app renders.
      const visibleIds = new Set(noteLanes.filter(lane=>!lane.groupHeader).map(lane=>lane.laneId));
      for (const [id,surface] of surfaces) if (!visibleIds.has(id)) {
        surface.canvas.width=surface.canvas.height=surface.overlay.width=surface.overlay.height=1;
        surfaces.delete(id);
      }
      const oldScroll = host.scrollLeft;
      host.innerHTML = '';
      if (!selected || !(total > 0) || (!rows.length && !noteLanes.length)) {
        host.innerHTML = `<div class="timeline-empty">${escapeHtml(selected ? rt('runtime.timeline.empty') : rt('runtime.timeline.chooseTrack'))}</div>`;
        return;
      }
      const canvas = document.createElement('div');
      canvas.className = 'tl-canvas';
      canvas.style.width = `${zoom * 100}%`;
      const scale = document.createElement('div');
      scale.className = 'tl-scale';
      // The ruler is the one strip with nothing else to do, so it is the obvious place to grab the axis.
      attachPan(scale, { always: true });
      const ticks = Math.max(4, Math.round(zoom * 4));
      scale.innerHTML = Array.from({ length: ticks + 1 }, (_, index) => {
        const ratio = index / ticks;
        return `<span style="left:${ratio * 100}%">${scaleClock(total * ratio,total/ticks)}</span>`;
      }).join('');
      canvas.append(scale);
      const rootNodes=new Map();
      const collect=(key,element)=>{if(!rootNodes.has(key))rootNodes.set(key,[]);rootNodes.get(key).push(element);};

      for (const row of rows) {
        const result = row.result;
        const element = document.createElement('section');
        element.className = `tl-row tl-${row.kind}`;
        element.dataset.engine = result.engine?.id || row.kind;
        element.dataset.axis = row.axis;
        const head = document.createElement('div');
        head.className = 'tl-row-head';
        head.innerHTML = `<strong>${escapeHtml(result.engine?.name || result.engine?.id || '')}</strong><span>${escapeHtml(rt('runtime.timeline.segments', { count: result.segments.length }))}</span>`;
        const body = document.createElement('div');
        body.className = 'tl-row-body';
        for (const segment of result.segments) {
          const start = Number(segment.start) || 0, end = Number(segment.end) || start;
          const block = document.createElement('div');
          block.className = 'tl-seg';
          block.dataset.start = String(start);
          block.dataset.end = String(end);
          block.segmentStart = start;
          block.segmentEnd = end;
          block.blockAxis = row.axis;
          // Only a manual mark carries an id: clicking a model's block copies its range and label into a new mark.
          block.annotationId = row.kind === 'manual' ? (segment.id || null) : null;
          block.style.left = `${Math.max(0, start / total) * 100}%`;
          block.style.width = `${Math.max(.2, ((end - start) / total) * 100)}%`;
          block.style.background = `${segmentColor(row.kind, result.engine?.id, segment.label)}d0`;
          block.textContent = String(segment.label ?? '?');
          block.title = `${segment.label} · ${clock(start)}–${clock(end)}`;
          body.append(block);
        }
        attachLane(body, total, row.axis);
        attachPan(body);
        addOrderControls(head,element,'analysis:'+result.engine.id);
        element.append(head, body);
        collect('analysis:'+result.engine.id,element);
      }

      for (const lane of noteLanes) {
        const detailed = lane.laneId === focusStem;
        // Percussion has no harmony to relate to and no chord to break up, so it gets no strip either way.
        const spans = lane.groupHeader?null:stripFor(lane);
        const element = document.createElement('section');
        element.className = `tl-row tl-notes-row${detailed ? ' tl-row-focused' : ''}`;
        element.dataset.stem = lane.stem;
        element.dataset.laneId = lane.laneId;
        const head = document.createElement('button');
        head.type = 'button';
        head.className = 'tl-row-head tl-row-toggle';
        head.title = rt(detailed ? 'runtime.timeline.focusExit' : 'runtime.timeline.focus');
        const subtitle = lane.wavOnly ? rt('runtime.hybrid.waveform') : laneSubtitle(lane);
        head.innerHTML = `<strong>${escapeHtml(laneName(lane))} · ${escapeHtml(lane.engine === 'manual-revision' ? rt('runtime.assets.runStatus.manual') : lane.engineName || lane.engine)}${lane.isDraft ? ' *' : ''}</strong>`
          + `<span>${escapeHtml(lane.wavOnly?'WAV':rt('runtime.timeline.notes', { count: lane.noteCount }))}${subtitle ? ' · ' + escapeHtml(subtitle) : ''}`
          + `${detailed && spans ? ' · ' + escapeHtml(roleMix(spans, total)) : ''}</span>`;
        head.addEventListener('click', () => setFocus(detailed ? null : lane.laneId));
        const body = document.createElement('div');
        body.className = 'tl-row-body';
        if(lane.groupHeader){
          element.classList.add('tl-group-row');body.textContent=rt('runtime.layout.parts',{count:partsFor(lane.stem).length});
          element.append(decorateTrack(lane,head,element),body);collect('stem:'+lane.stem,element);continue;
        }
        let surface = surfaces.get(lane.laneId);
        if (!surface) {
          const painted=document.createElement('canvas'),overlay=document.createElement('canvas');
          painted.className='tl-notes'; overlay.className='tl-note-selection';
          surface={canvas:painted,overlay,last:null}; surfaces.set(lane.laneId,surface);
        }
        Object.assign(surface,{body,lane,total,detailed,spans:detailed?spans:null,overlayDirty:true});
        body.append(surface.canvas,surface.overlay);
        if(detailed){
          const layout=laneLayout(lane,true);
          body.style.setProperty('--tl-pitch-height',Math.max(180,layout.span*PITCH_ROW_HEIGHT+12)+'px');
          attachPitchScroll(surface);
        } else { surface.scroller=null; surface.pitchSpace=null; }
        if (spans) {
          const strip = document.createElement('div');
          strip.className = 'tl-roles';
          for (const span of spans) {
            const kind = stripKind(span);
            if (kind === 'rest' || !(span.end > span.start)) continue;
            const mark = document.createElement('i');
            mark.className = `tl-role tl-${stripMode}-${kind}`;
            mark.style.left = `${(span.start / total) * 100}%`;
            mark.style.width = `${Math.max(0.05, ((span.end - span.start) / total) * 100)}%`;
            mark.style.background = (stripMode === 'harmony' ? HARMONY_COLORS : ROLE_COLORS)[kind];
            // The evidence has to be visible: both readings are inherited from the transcription, not measured on audio.
            mark.title = `${clock(span.start)}–${clock(span.end)} · ${rt('runtime.timeline.' + stripMode + '.' + kind)} · `
              + (stripMode === 'harmony'
                ? rt('runtime.timeline.harmonyWhy', { chord: span.label || '—', fit: percent(span.fit), extend: percent(span.extend), clash: percent(span.clash),
                    bass: span.inversion ? rt('runtime.timeline.inversion.' + span.inversion) : '—', notes: span.notes ?? 0 })
                : rt('runtime.timeline.roleWhy', { voices: span.voices ?? 0, chord: span.chordTone === null || span.chordTone === undefined ? '—' : Math.round(span.chordTone * 100), step: Math.round((span.step || 0) * 100), notes: span.notes ?? 0 }));
            strip.append(mark);
          }
          body.append(strip);
        }
        attachNoteSelection(body,lane,total);
        attachLane(body, total, 'section');
        attachPan(body);
        element.append(decorateTrack(lane,head,element), body);
        collect('stem:'+lane.stem,element);

      }
      for(const [key,elements] of layout.ordered([...rootNodes],pair=>pair[0]))for(const element of elements)canvas.append(element);
      host.append(canvas);
      host.scrollLeft = oldScroll;
      queuePaint();
      renderEditor();
      updatePlayhead();
    }

    // One pointer gesture, two meanings: seek while reading, draw an interval while annotating. A press without
    // movement picks the block under the pointer - found by time, not by hit-testing, because a block can be a
    // pixel wide at fit zoom.
    function attachLane(body, total, axis) {
      const playhead = document.createElement('i');
      playhead.className = 'tl-playhead';
      body.append(playhead);
      const timeAt = event => {
        const rect = body.getBoundingClientRect();
        return Math.max(0, Math.min(total, ((event.clientX - rect.left) / Math.max(1, rect.width)) * total));
      };
      const seek = event => {
        const state = getState();
        const target = timeAt(event);
        if (onSeek?.(target)) { updatePlayhead(); return; }
        if (state.currentTrack?.id === state.selectedTrack?.id && Number.isFinite(audio.duration)) {
          audio.currentTime = target;
          updatePlayhead();
        } else if (event.type === 'pointerdown' && state.selectedTrack) {
          playTrack(state.selectedTrack, albumTracks(state.selectedTrack), true, target);
        }
      };
      let anchor = null, moved = false, marker = null, active = null, gesture = null, epoch = 0;
      const place = (from, to) => {
        if (!marker || !(total > 0)) return;
        marker.style.left = `${(from / total) * 100}%`;
        marker.style.width = `${Math.max(0.15, ((to - from) / total) * 100)}%`;
      };
      body.addEventListener('pointerdown', event => {
        if (noteSelecting || event.button === 1 || event.button === 2 || event.shiftKey) return;   // note selection has its own gesture; Shift/middle pan
        event.preventDefault();
        active = event.pointerId;
        capture(body, event.pointerId);
        epoch = gestureEpoch;
        gesture = rangeSelecting ? 'loop' : annotating ? 'mark' : 'seek';
        if (gesture === 'seek') { seeking = true; seek(event); return; }
        anchor = timeAt(event);
        moved = false;
        marker = document.createElement('i');
        marker.className = 'tl-draft';
        body.append(marker);
        place(anchor, anchor);
      });
      body.addEventListener('pointermove', event => {
        if (active !== event.pointerId) return;
        if (epoch !== gestureEpoch) return;
        if (gesture === 'seek') { if (seeking) seek(event); return; }
        if (anchor === null) return;
        const now = timeAt(event);
        if (Math.abs(now - anchor) > total / 400) moved = true;
        place(Math.min(anchor, now), Math.max(anchor, now));
      });
      const release = event => {
        if (active !== event.pointerId) return;
        uncapture(body, event.pointerId);
        active = null;
        seeking = false;
        if (event.type === 'pointercancel' || epoch !== gestureEpoch || gesture === 'seek' || anchor === null) { marker?.remove?.(); marker = null; anchor = null; return; }
        const end = timeAt(event), from = Math.min(anchor, end), to = Math.max(anchor, end);
        marker?.remove?.();
        marker = null;
        anchor = null;
        if (gesture === 'loop') {
          if (onLoop?.(from, to)) setRangeSelecting(false);
          return;
        }
        if (moved || to - from > total / 400) { openDraft({ id: null, axis, start: from, end: to, label: '' }); return; }
        const block = blockAt(body, from);
        if (block) openDraft({ id: block.annotationId || null, axis: block.blockAxis || axis, start: block.segmentStart, end: block.segmentEnd, label: block.textContent });
      };
      body.addEventListener('pointerup', release);
      body.addEventListener('pointercancel', release);
    }

    const capture = (element, pointerId) => { try { element.setPointerCapture(pointerId); } catch (_) { /* synthetic or already-released pointer */ } };
    const uncapture = (element, pointerId) => { try { element.releasePointerCapture(pointerId); } catch (_) { /* never captured */ } };

    function blockAt(body, time) {
      for (const block of body.querySelectorAll('.tl-seg')) {
        if (time >= block.segmentStart && time < block.segmentEnd) return block;
      }
      return null;
    }

    // --- the mark editor ----------------------------------------------------------------------
    function openDraft(next) {
      draft = next;
      renderEditor();
      $('timelineEditorLabel')?.focus?.();
    }

    function renderEditor() {
      const form = $('timelineEditor');
      if (!form) return;
      form.hidden = !draft;
      $('timelineEditorStartLabel').textContent = rt('runtime.timeline.start');
      $('timelineEditorEndLabel').textContent = rt('runtime.timeline.end');
      $('timelineEditorLabelLabel').textContent = rt('runtime.timeline.label');
      $('timelineEditorSave').textContent = rt(draft?.id ? 'runtime.tag.update' : 'runtime.tag.save');
      $('timelineEditorDelete').textContent = rt('runtime.tag.delete');
      $('timelineEditorCancel').textContent = rt('runtime.timeline.cancel');
      $('timelineEditorDelete').hidden = !draft?.id;
      if (!draft) return;
      $('timelineEditorKind').textContent = rt(draft.axis === 'chord' ? 'runtime.timeline.editChord' : 'runtime.timeline.editSection');
      $('timelineEditorStart').value = formatTime(draft.start);
      $('timelineEditorEnd').value = formatTime(draft.end);
      $('timelineEditorLabel').value = draft.label || '';
      $('timelineEditorStatus').textContent = '';
    }

    const EDITOR_ERRORS = { 'tag-label-required': 'runtime.tag.labelRequired', 'tag-range-invalid': 'runtime.tag.rangeInvalid', 'analysis-busy': 'runtime.timeline.busy' };
    const editorError = code => { $('timelineEditorStatus').textContent = rt(EDITOR_ERRORS[code] || 'runtime.timeline.saveFailed', { error: String(code || '') }); };

    async function saveDraft() {
      const state = getState();
      if (!draft || !state.selectedTrack) return;
      const payload = {
        id: draft.id || undefined,
        kind: draft.axis === 'chord' ? 'chord' : 'section',
        start: parseTime($('timelineEditorStart').value),
        end: parseTime($('timelineEditorEnd').value),
        label: $('timelineEditorLabel').value
      };
      let response = null;
      try { response = await bridge.saveAnnotation(state.selectedTrack.id, payload); }
      catch (error) { response = { ok: false, error: error?.message }; }
      if (!response?.ok) return editorError(response?.error);
      onAnnotationsChanged?.(response.document?.tags || []);
      draft = null;
      render();
    }

    async function deleteDraft() {
      const state = getState();
      if (!draft?.id || !state.selectedTrack) return;
      let response = null;
      try { response = await bridge.deleteAnnotation(state.selectedTrack.id, draft.id); }
      catch (error) { response = { ok: false, error: error?.message }; }
      if (!response?.ok) return editorError(response?.error);
      onAnnotationsChanged?.(response.document?.tags || []);
      draft = null;
      render();
    }

    function setAnnotating(value) {
      const next = Boolean(value);
      if (next === annotating) return;
      annotating = next;
      if (next) { cancelNoteGesture?.(); noteSelecting = false; selectionKeys.clear(); rangeSelecting = false; gestureEpoch += 1; }
      draft = null;
      render();
    }

    function setRangeSelecting(value) {
      rangeSelecting = Boolean(value && focusStem);
      gestureEpoch += 1;
      if (rangeSelecting) { cancelNoteGesture?.(); noteSelecting = false; selectionKeys.clear(); annotating = false; draft = null; }
      render();
    }

    // Called on every timeupdate (~4 Hz), so it must not rescan a few hundred segment blocks each time: each row
    // remembers the block the playhead is standing in and only searches again when the playhead leaves it.
    function updatePlayhead() {
      const host = $('timelineLanes');
      if (!host || $('workspaceTimeline')?.hidden) return;
      const state = getState();
      // The audition always sounds the part of the track that is on screen, so while it owns the clock the
      // playhead is meaningful whatever the <audio> element happens to be holding.
      const auditioned = timeSource ? timeSource() : null;
      const sounding = Number.isFinite(auditioned);
      const same = sounding || Boolean(state.currentTrack?.id && state.currentTrack.id === state.selectedTrack?.id);
      const total = duration();
      const current = sounding ? auditioned : (same ? Number(audio.currentTime) || 0 : 0);
      const percent = total > 0 ? Math.max(0, Math.min(100, (current / total) * 100)) : 0;
      for (const playhead of host.querySelectorAll('.tl-playhead')) {
        playhead.style.left = `${percent}%`;
        playhead.classList.toggle('visible', Boolean(same && total));
      }
      const loopRange = getLoop?.();
      for (const body of host.querySelectorAll('.tl-row-body')) {
        let region = body.querySelector('.tl-loop-range');
        if (!loopRange) { region?.remove(); continue; }
        if (!region) { region = document.createElement('i'); region.className = 'tl-loop-range'; body.append(region); }
        region.style.left = (loopRange.start / total * 100) + '%';
        region.style.width = ((loopRange.end - loopRange.start) / total * 100) + '%';
        region.classList.toggle('enabled', loopRange.enabled);
      }
      const details = [];
      for (const row of host.querySelectorAll('.tl-row')) {
        let block = row.activeSegment || null;
        if (block && !(same && current >= block.segmentStart && current < block.segmentEnd)) {
          block.classList.remove('current');
          row.activeSegment = null;
          block = null;
        }
        if (!block && same) {
          for (const candidate of row.querySelectorAll('.tl-seg')) {
            if (current >= candidate.segmentStart && current < candidate.segmentEnd) { block = candidate; break; }
          }
          if (block) { block.classList.add('current'); row.activeSegment = block; }
        }
        if (block) details.push(`${row.querySelector('.tl-row-head strong')?.textContent || ''}: ${block.textContent}`);
      }
      const readout = $('timelineReadout');
      if (readout) readout.textContent = same ? `${clock(current)}${details.length ? '  ·  ' + details.join('   |   ') : ''}` : rt('runtime.timeline.sync');
      const locate = $('timelineLocate');
      if (locate) { locate.disabled = !same; locate.title = rt(same ? 'runtime.timeline.locateHint' : 'runtime.timeline.locateIdle'); }
    }

    async function refresh() {
      const state = getState();
      const selected = state.selectedTrack;
      cancelNoteGesture?.(); selectionKeys.clear(); gestureEpoch += 1;
      const nextTrack = selected?.id || null;
      if (trackId !== nextTrack) {
        mixCatalog=null;mixSelection=null;mixError=null;lanes = []; focusStem = null; noteSelecting = false; rangeSelecting = false; gestureEpoch += 1;
        onLanesChanged?.(null);
      }
      if(trackId!==nextTrack){trackId=nextTrack;loadLayout();}
      trackId = nextTrack;
      midiEditor?.setTrack(trackId);
      const request = ++sequence;
      if (!trackId) { lanes = []; loading = false; render(); return; }
      loading = true; render();
      let payload = null;
      try { payload = await bridge.readMidiNotes(trackId,mixSelection); } catch (_) { payload = null; }
      if (request !== sequence) return;
      if(payload?.ok){mixCatalog=payload.mixCatalog||null;mixError=null;}
      else if(payload?.error){mixError=payload.error;loading=false;onLanesChanged?.(focusStem);render();return false;}
      // A stem with nothing transcribed keeps its row. Dropping it is why an empty part had nowhere to show it
      // was empty — and, later, nowhere to put a first note into.
      //
      // A stem whose MIDI holds several instruments becomes several rows. The split is done here, once, from the
      // instrument index the main process attached to every note, and NOT by slicing the array by position: the
      // sort below reorders it, and notes.json is per-instrument-sorted then concatenated, so positions and
      // instruments stop agreeing the moment it runs.
      lanes = (payload?.ok && Array.isArray(payload.lanes) ? payload.lanes : []).flatMap(lane => {
        const parts = Array.isArray(lane.instruments) ? lane.instruments : [];
        if (!lane.editable || parts.length < 2) return [{ ...lane, laneId: lane.stem, instrument: null }];
        return parts.map(instrument => ({ ...lane, laneId: `${lane.stem}#${instrument.index}`, instrument,
          noteCount: instrument.noteCount, notes: lane.notes.filter(note => note[4] === instrument.index) }));
      });
      for (const lane of lanes) lane.notes.sort((a, b) => a[0] - b[0]);   // role spans walk the notes in order
      if(midiEditor){
        const restored=await midiEditor.hydrate(lanes,trackId);
        if(request!==sequence)return;
        lanes=restored;
      }
      if(request!==sequence)return;
      groupCache.clear();roleCache.clear();harmonyCache.clear();
      loading = false;
      // Every lane object is new, so anything holding one of their note arrays is now holding a stale copy.
      onLanesChanged?.(focusStem);
      render();
    }

    function setStripMode(mode) {
      const next = ['role', 'harmony', 'off'].includes(mode) ? mode : 'role';
      if (next === stripMode) return;
      stripMode = next;
      render();
    }

    function setFocus(stem) {
      if (focusStem === stem) return;
      cancelNoteGesture?.(); selectionKeys.clear(); noteSelecting = false;
      focusStem = stem;
      rangeSelecting = false; gestureEpoch += 1;
      onLanesChanged?.(focusStem);
      render();
    }

    function setZoom(next) {
      const value = Math.max(1, Math.min(MAX_ZOOM, next));
      if (value === zoom) return;
      const anchor = centreTime();
      zoom = value;
      render();
      // Zooming used to drop you back at 0:00; keep whatever was in the middle of the picture in the middle.
      if (anchor !== null && anchor !== undefined) requestAnimationFrame(() => scrollTo(anchor));
    }

    function bind() {
      // Opening the tab re-reads the notes: activating a different MIDI in the transcription lab changes what is
      // active without reloading the analysis, and the derived controller renders too often to hang a fetch on.
      $('workspace-tab-timeline')?.addEventListener('click', () => { refresh(); });
      $('timelineLanes')?.addEventListener('scroll', queuePaint, {passive:true});
      $('timelineZoomIn')?.addEventListener('click', () => setZoom(zoom * 2));
      $('timelineZoomOut')?.addEventListener('click', () => setZoom(zoom / 2));
      $('noteTimelineZoomLabel')?.addEventListener('click', () => setZoom(1));
      $('timelineFocusExit')?.addEventListener('click', () => setFocus(null));
      $('timelineLoopChoose')?.addEventListener('click', () => setRangeSelecting(!rangeSelecting));
      $('timelineSelectNotes')?.addEventListener('click', () => setNoteSelecting(!noteSelecting));
      $('timelineSelectionClear')?.addEventListener('click', clearSelection);
      $('timelineAnnotate')?.addEventListener('click', () => setAnnotating(!annotating));
      $('timelineLocate')?.addEventListener('click', () => locatePlayhead());
      $('timelineStrip')?.addEventListener('change', event => setStripMode(event.target.value));
      $('timelineEditor')?.addEventListener('submit', event => { event.preventDefault(); saveDraft(); });
      $('timelineEditorDelete')?.addEventListener('click', () => deleteDraft());
      $('timelineEditorCancel')?.addEventListener('click', () => { draft = null; renderEditor(); });
      window.addEventListener('resize', () => { if (!$('workspaceTimeline')?.hidden) render(); });
      window.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || $('workspaceTimeline')?.hidden) return;
        if (cancelNoteGesture) { cancelNoteGesture(); return; }
        // Escape clears a choice before leaving its mode or the focused lane.
        if (draft) { draft = null; renderEditor(); return; }
        if (rangeSelecting) { setRangeSelecting(false); return; }
        if (noteSelecting && selectionKeys.size) { clearSelection(); return; }
        if (noteSelecting) { setNoteSelecting(false); return; }
        if (focusStem) setFocus(null);
      });
    }

    function replaceNotes(id,notes,keys,isDraft){
      const at=lanes.findIndex(l=>l.laneId===id);if(at<0)return;
      lanes[at]={...lanes[at],notes:notes.slice().sort((a,b)=>a[0]-b[0]),noteCount:notes.length,isDraft};
      selectionKeys=new Set(keys);groupCache.clear();roleCache.clear();harmonyCache.clear();render();
    }
    return { setCollapsed,collapsed:stem=>layout.collapsed(stem),moveRow,layout:()=>layout.snapshot(),visibleLanes,editLane,setEditInstrument,setEditor:value=>{midiEditor=value;},replaceNotes,
      invalidatePreview:()=>{for(const surface of surfaces.values())surface.overlayDirty=true;queuePaint();},
      playheadTime:()=>{const v=timeSource?.();if(Number.isFinite(v))return v;const state=getState();return state.currentTrack?.id===state.selectedTrack?.id?Number(audio.currentTime)||0:null;},
      selectKeys:keys=>{selectionKeys=new Set(keys);redrawSelectedLane();},
      mixCatalog:()=>mixCatalog,mixError:()=>mixError,
      chooseRefinement:async(parent,id)=>{const before=mixSelection;mixSelection={...(mixCatalog?.selected||{}),[parent]:id||null};
        if(await refresh()===false){mixSelection=before;return false;}return true;},
      refresh, render, updatePlayhead, bind, setNoteSelecting, clearSelection, selection, noteSelecting: () => noteSelecting, setRangeSelecting, setFocus, setAnnotating, saveDraft, deleteDraft, locatePlayhead, scrollTo, centreTime, rolesFor, harmonyFor, roleAt,
      setStripMode, stripMode: () => stripMode,
      zoom: () => zoom, focus: () => focusStem, annotating: () => annotating, draft: () => draft && { ...draft },
      laneCount: () => lanes.length,
      // The audition needs the notes of one lane. It reads them from here rather than fetching them again,
      // because the split into per-instrument lanes and the sort that follows it should exist in one place only.
      laneFor: id => lookup(id),
      allLanes: () => lanes.slice(),
      firstLaneForStem: stem => lanes.find(lane => lane.stem === stem) || null,
      setTimeSource: source => { timeSource = typeof source === 'function' ? source : null; } };
  }

  function segmentColor(kind, engineId, label) {
    if (kind === 'harmony') {
      const root = String(label || 'N').match(/^([A-G](?:#|b)?)/)?.[1] || 'N';
      return { C: '#e76f8f', 'C#': '#ef8a6f', D: '#e9b45f', Eb: '#c6ca62', 'D#': '#c6ca62', E: '#8dcc70', F: '#65c795', 'F#': '#5fc7c0', G: '#63b3e0', Ab: '#7f9fe8', 'G#': '#7f9fe8', A: '#a78be6', Bb: '#cf82d6', 'A#': '#cf82d6', B: '#e57bb0', N: '#4a4f60' }[root] || '#4a4f60';
    }
    if (kind === 'manual') return '#bfb1ff';
    let hash = 0;
    for (const char of `${engineId}:${label}`) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
    return ['#5b8def', '#57b894', '#d98a4a', '#b06fd1', '#d46a7e', '#4aa3c7'][Math.abs(hash) % 6];
  }

  const percent = value => value === null || value === undefined ? '—' : Math.round(value * 100);

  function scaleClock(seconds, step) {
    if(step>=2)return clock(seconds);
    const value=Math.max(0,Math.round((Number(seconds)||0)*1000));
    return Math.floor(value/60000)+':'+String(Math.floor(value%60000/1000)).padStart(2,'0')+'.'+String(value%1000).padStart(3,'0');
  }

  function clock(seconds) {
    const value = Math.max(0, Number(seconds) || 0);
    return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  window.XldTimelineControls = { create, chordTones, chordParts };
})();
