// Reversible comparison in the song's measured beat grid. This layer only draws
// a second transcription; the selected source audio remains on the host clock.
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XinScoreVariation = api;
})(globalThis, function() {
  'use strict';

  const finite = Number.isFinite;
  const epsilon = 1e-7;
  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
  const lexicon = {
    intro: ['引子', 'Intro'], verse: ['主歌', 'Verse'], 'pre-chorus': ['导歌', 'Pre-Chorus'],
    chorus: ['副歌', 'Chorus'], inst: ['间奏', 'Interlude'], bridge: ['桥段', 'Bridge'], outro: ['尾奏', 'Outro']
  };
  const stemNames = {
    vocals: ['人声', 'Vocals'], guitar: ['吉他', 'Guitar'], piano: ['钢琴', 'Piano'], strings: ['弦乐', 'Strings'],
    winds: ['管乐', 'Winds'], bass: ['贝斯', 'Bass'], drums: ['鼓', 'Drums'], other: ['其它', 'Other']
  };
  const colours = {
    starry: {a: '#d5abec', b: '#80c9d6', front: '#e7e6ed', back: 'rgba(27,30,38,.91)'},
    paper: {a: '#775078', b: '#99623c', front: '#393f3b', back: 'rgba(225,226,216,.94)'}
  };

  function bound(rows, value) {
    let lo = 0, hi = rows.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (rows[mid] < value) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function gridOf(bars) {
    const times = [...new Set((bars?.beats || []).filter(finite))].sort((a,b) => a-b);
    const intervals = times.slice(1).map((time, i) => time - times[i]);
    const steady = intervals.slice().sort((a,b) => a-b);
    const typical = steady[Math.floor(steady.length / 2)];
    const indexes = [0], gaps = [];
    for (let i = 0; i < intervals.length; i++) {
      const nearby = intervals.slice(Math.max(0, i-5), i).concat(intervals.slice(i+1,i+6)).sort((a,b) => a-b);
      const local = nearby.length >= 3 ? nearby[Math.floor(nearby.length / 2)] : typical;
      const ratio = intervals[i] / local;
      const step = ratio >= 1.68 ? Math.max(2, Math.round(ratio)) : 1;
      indexes[i+1] = indexes[i] + step;
      if (step > 1) gaps.push([indexes[i], indexes[i+1]]);
    }

    // Fractional positions are expressed in recorded beat intervals rather than
    // in elapsed song seconds. Gaps retain their index span for later beats.
    function at(time) {
      if (times.length < 2) return null;
      const n = clamp(bound(times, time), 1, times.length - 1);
      const fraction = (time - times[n-1]) / (times[n] - times[n-1]);
      return indexes[n-1] + fraction * (indexes[n] - indexes[n-1]);
    }
    function timeAt(beat) {
      const n = clamp(bound(indexes, beat), 1, times.length - 1);
      const fraction = (beat - indexes[n-1]) / (indexes[n] - indexes[n-1]);
      return times[n-1] + fraction * (times[n] - times[n-1]);
    }
    const first = indexes[0], last = indexes[times.length-1];
    const playable = times.length >= 2;
    const valid = beat => playable && beat >= first-epsilon && beat <= last+epsilon &&
      !gaps.some(([start,end]) => beat > start+epsilon && beat < end-epsilon);
    return {at, timeAt, first, last, gaps, playable, valid};
  }

  function sectionList(model) {
    const entries = [];
    for (const [index, row] of (model.sections || []).entries()) {
      if (!Array.isArray(row) || !finite(row[0]) || !finite(row[1]) || row[1] <= row[0] || row[0] < 0) continue;
      const label = String(row[2] || '').trim();
      const guessed = Object.keys(lexicon).sort((a,b) => b.length-a.length).find(kind =>
        lexicon[kind].some(name => label.toLowerCase().startsWith(name.toLowerCase())));
      const kind = typeof row[4] === 'string' && row[4] ? row[4].toLowerCase() : guessed || '';
      entries.push(Object.freeze({id:'section-'+index+'-'+Math.round(row[0]*1000), label:label || '§ '+(index+1),
        start:row[0], end:row[1], kind, index}));
    }
    return Object.freeze(entries.sort((a,b) => a.start-b.start));
  }

  const nonOverlapping = (a,b) => a && b && (a.end <= b.start || b.end <= a.start);

  function defaultPair(sections) {
    let best = null, priority = -1;
    for (let i = 0; i < sections.length; i++) {
      for (let j = i+1; j < sections.length; j++) {
        const a = sections[i], b = sections[j];
        if (!nonOverlapping(a,b)) continue;
        const same = a.kind && a.kind === b.kind;
        const candidate = same && a.kind === 'chorus' ? 4 : same && a.kind === 'verse' ? 3 : same ? 2 : 1;
        if (candidate > priority) {
          priority = candidate;
          best = Object.freeze({a,b});
        }
      }
    }
    return best;
  }

  function lyricAnchor(points, a, b) {
    const inSection = section => points.filter(point => point.time >= section.start && point.time < section.end);
    const as = inSection(a), bs = inSection(b);
    const proposals = new Map();
    for (const x of as) {
      for (const y of bs) {
        if (x.text !== y.text) continue;
        const delta = y.beat-x.beat, shift = Math.round(delta), residual = Math.abs(delta-shift);
        if (residual > .34) continue;
        const byText = proposals.get(shift) || new Map();
        const previous = byText.get(x.text);
        if (!previous || previous.residual > residual) byText.set(x.text,{x,y,residual});
        proposals.set(shift, byText);
      }
    }
    const candidates = [];
    for (const [shift, texts] of proposals) {
      const ordered = Array.from(texts.values()).sort((p,q) => p.x.beat-q.x.beat);
      const increasing = ordered.every(({y},i) => !i || y.beat > ordered[i-1].y.beat);
      if (increasing && ordered.length >= 2 && ordered.at(-1).x.beat-ordered[0].x.beat >= 2) {
        candidates.push({shift,count:ordered.length,anchors:ordered});
      }
    }
    candidates.sort((p,q) => q.count-p.count);
    // More than one equally supported pairing can happen with repeated lines.
    // Leave the measured start-beat pairing in place when that is ambiguous.
    const best = candidates[0];
    return best && best.count !== candidates[1]?.count ? best : null;
  }

  function comparison(grid, pair, points) {
    if (!pair || !grid.playable) return null;
    const {a,b} = pair;
    const aStart = grid.at(a.start), bStart = grid.at(b.start);
    const aEnd = grid.at(a.end), bEnd = grid.at(b.end);
    const anchor = lyricAnchor(points, a,b);
    const shift = anchor?.shift ?? Math.round(bStart)-Math.round(aStart);
    const start = Math.max(aStart, bStart-shift, grid.first, grid.first-shift);
    const end = Math.min(aEnd, bEnd-shift, grid.last, grid.last-shift);
    const gaps = grid.gaps.concat(grid.gaps.map(([from,to]) => [from-shift,to-shift]))
      .filter(([from,to]) => from < end && to > start).sort((p,q) => p[0]-q[0]);
    let cursor = start;
    const runs = [];
    for (const [from,to] of gaps) {
      if (from > cursor+epsilon) runs.push([cursor,from]);
      cursor = Math.max(cursor,to);
    }
    if (end > cursor+epsilon) runs.push([cursor,end]);
    return {shift, runs, basis:anchor?'lyric':'beat', anchors:anchor?.anchors || []};
  }

  function levelFor(values, hop, ranges) {
    let samples = 0, energy = 0, expected = 0;
    for (const [start,end] of ranges) {
      expected += end-start;
      const last = Math.min(values.length, Math.ceil(end/hop));
      for (let i = Math.max(0, Math.floor(start/hop)); i < last; i++) {
        const db = values[i], weight = Math.min(end, (i+1)*hop) - Math.max(start,i*hop);
        if (finite(db) && db >= -160 && db <= 30 && weight > 0) {
          energy += weight * 10**(db/10);
          samples += weight;
        }
      }
    }
    return expected >= 2*hop && samples >= expected*.9 ? 10*Math.log10(energy/samples) : null;
  }

  function dynamicFor(levels, grid, alignment) {
    if (!levels || !finite(levels.hop) || levels.hop <= 0 || !alignment?.runs.length) return null;
    const aRanges = alignment.runs.map(([from,to]) => [grid.timeAt(from),grid.timeAt(to)]);
    const bRanges = alignment.runs.map(([from,to]) => [grid.timeAt(from+alignment.shift),grid.timeAt(to+alignment.shift)]);
    let best = null;
    for (const [group, values] of Object.entries(levels.groups || {})) {
      if (!values?.length) continue;
      const a = levelFor(values,levels.hop,aRanges), b = levelFor(values,levels.hop,bRanges);
      if (a === null || b === null || Math.max(a,b) < -48 || Math.abs(b-a) < 2.5) continue;
      // Prefer audible shifts. Near-silent floors would otherwise claim the
      // largest number even when the measured change is barely perceptible.
      const relevance = Math.min(15,Math.abs(b-a)) + (Math.max(a,b)+48)*.18;
      if (!best || relevance > best.relevance) best = {group,a,b,delta:b-a,relevance};
    }
    return best && Object.freeze({group:best.group,a:best.a,b:best.b,delta:best.delta,scope:'common-beats'});
  }

  function create(model) {
    const sections = sectionList(model), grid = gridOf(model.bars);
    const score = globalThis.XinScoreView || (typeof require === 'function' ? require('./score-view.js') : null);
    const otherMidi = (model.lanes || []).some(lane => score?.isOtherMidi(lane));
    const sourceId = model.track?.id;
    let pair = defaultPair(sections), alignment, dynamic, points = [];
    let sourceLines, lyricsOffset;
    const index = new WeakMap();
    const reset = () => {
      alignment = comparison(grid,pair,points);
      dynamic = dynamicFor(model.levels,grid,alignment);
    };
    reset();
    function setPair(aId,bId) {
      const a = sections.find(item => item.id === aId), b = sections.find(item => item.id === bId);
      if (!nonOverlapping(a,b)) return false;
      if (pair?.a !== a || pair?.b !== b) {
        pair = Object.freeze({a,b});
        reset();
      }
      return true;
    }
    function setLyrics(value) {
      const lines = (value?.trackId && sourceId && value.trackId !== sourceId) ||
        value?.enabled === false || value?.timed === false ? null : value?.lines || null;
      const offset = finite(value?.offset) ? value.offset
        : (Number(value?.offset?.auto)||0)+(Number(value?.offset?.manual)||0);
      if (sourceLines === lines && lyricsOffset === offset) return;
      sourceLines = lines;
      lyricsOffset = offset;
      points = [];
      if (Array.isArray(lines) && grid.playable) {
        for (const row of lines) {
          if (!finite(row.time) || typeof row.text !== 'string') continue;
          const text = row.text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
          const time = row.time+offset, beat = grid.at(time);
          if (text.length >= 6 && grid.valid(beat)) points.push({time,text,beat});
        }
      }
      reset();
    }
    function state(time) {
      const active = !pair || !finite(time) ? null : time >= pair.a.start && time < pair.a.end ? 'a'
        : time >= pair.b.start && time < pair.b.end ? 'b' : null;
      const reference = active === 'a' ? 'b' : active === 'b' ? 'a' : null;
      const snapshot = {active,reference,alternateTime:null,basis:alignment?.basis || null,
        reason:!pair?'pick-pair':!active?'outside':null,anchorCount:alignment?.anchors.length || 0,common:null,dynamic};
      if (!active) return snapshot;
      if (!alignment) return {...snapshot,reason:'missing-beats'};
      const shift = active === 'a' ? 0 : alignment.shift;
      const beat = grid.at(time)-shift;
      const otherShift = alignment.shift-shift;
      const alt = grid.timeAt(beat+otherShift);
      if (alt < pair[reference].start-epsilon || alt >= pair[reference].end-epsilon) {
        return {...snapshot,reason:'outside-common'};
      }
      if (!grid.valid(beat+shift) || !grid.valid(beat+otherShift)) return {...snapshot,reason:'missing-beats'};
      const run = alignment.runs.find(([start,end]) => beat >= start-epsilon && beat <= end+epsilon);
      if (!run) return {...snapshot,reason:'outside-common'};
      return {...snapshot,alternateTime:Math.max(pair[reference].start,alt),
        common:run.map(value => grid.timeAt(value+shift))};
    }
    function endIndexes(set) {
      if (!index.has(set)) {
        const end = new Float64Array(set.count);
        let last = -Infinity;
        for (let i = 0; i < set.count; i++) end[i] = last = Math.max(last,set.start[i]+set.dur[i]);
        index.set(set,end);
      }
      return index.get(set);
    }

    function draw(target, frame, options = {}) {
      const value = state(frame.time), result = {...value,marks:0,trimmed:0};
      const palette = colours[options.style];
      const ctx = target?.getContext ? target.getContext('2d') : target;
      if (!value.active || !palette || !ctx || !frame.geometry) return result;
      const unit = frame.unit || 1, top = frame.top || 0;
      const left = Math.max(0,frame.left || 0, frame.labelProtectedLeft ?? (frame.geometry.side || 0)*unit);
      const right = frame.right ?? frame.width;
      ctx.save();
      if (value.alternateTime !== null && frame.pixelsPerSecond > 0 && right > left) {
        const before = frame.time+(left-frame.needle)/frame.pixelsPerSecond;
        const after = frame.time+(right-frame.needle)/frame.pixelsPerSecond;
        const shift = value.active === 'a' ? 0 : alignment.shift, otherShift = alignment.shift-shift;
        const xAt = time => frame.needle+(time-frame.time)*frame.pixelsPerSecond;
        const toOther = time => grid.timeAt(grid.at(time)-shift+otherShift);
        const xOther = time => xAt(grid.timeAt(grid.at(time)-otherShift+shift));
        const lo = Math.max(before,value.common[0]), hi = Math.min(after,value.common[1]);
        if (hi > lo) {
          const range = {from:toOther(lo),to:toOther(hi),xOther,toOther,left,right,xAt,lo,hi};
          result.marks = drawLanes(ctx,frame,options,range,palette[value.reference],endIndexes,result);
          const energy = drawEnergy(ctx,frame,options,range,value,palette,model.levels);
          if (energy) result.energy = energy;
        }
      }
      if (options.legend !== false) drawLegend(ctx,frame,options,pair,value,palette,otherMidi);
      ctx.restore();
      return result;
    }
    return Object.freeze({
      sections, get pair() { return pair; }, setPair, setLyrics, state, draw,
      clearPair() { pair = null; reset(); },
      alternateTime(time) { return state(time).alternateTime; }
    });
  }

  function strokeBatches(ctx, rows, paper, unit) {
    for (const [which,list] of rows.entries()) {
      if (!list.length) continue;
      const preview = which % 2 === 1, dense = which >= 2;
      ctx.setLineDash(preview ? [2.2*unit, 2*unit] : []);
      ctx.beginPath();
      for (const [x,y,x2,y2] of list) {
        ctx.moveTo(x,y);
        ctx.lineTo(x2,y2);
      }
      if (!dense) {
        ctx.globalAlpha = preview ? .06 : paper ? .11 : .15;
        ctx.lineWidth = (paper ? 1.9 : 2.3)*unit;
        ctx.stroke();
      }
      ctx.globalAlpha = paper ? (preview ? (dense ? .41 : .65) : (dense ? .42 : .66))
        : (preview ? (dense ? .31 : .58) : (dense ? .39 : .71));
      ctx.lineWidth = (dense ? .70 : .88)*unit;
      ctx.stroke();
    }
  }

  function drawLanes(ctx, frame, options, range, colour, endIndexes, result) {
    const {from,to,xOther,xAt,lo,hi} = range;
    const {needle, geometry} = frame;
    const unit = frame.unit || 1, top = frame.top || 0;
    const paper = options.style === 'paper';
    const bounds = [xAt(lo), xAt(hi)];
    const yOf = (fn,box,pitch) => top+unit*fn(box,pitch);
    const dense = geometry.lanes.length > 14;
    const compact = frame.width/unit < 680;
    const cell = (compact ? 8 : 7)*unit;
    const xOrigin = xOther(0);
    let count = 0;
    ctx.strokeStyle = colour;
    ctx.lineCap = 'round';
    for (const box of geometry.lanes) {
      const lane = box.lane;
      if (options.focusGroup && lane.group !== options.focusGroup) continue;
      const rowTop = top+unit*box.top, rowHeight = unit*box.height;
      if (rowHeight < 2.2*unit) continue;
      const offset = (paper ? 1.85 : 2.05)*unit;
      const marks = new Map(), exact = [];
      const add = (x,y,x2,y2,strength=1) => {
        // Stable per-track pixel cells keep a chord of near-overlapping strokes
        // from obscuring the foreground. Cells move with the notes on a scrub.
        if (![x,y,x2,y2].every(finite)) return;
        const safeY = clamp(y,rowTop+.5*unit,rowTop+rowHeight-.5*unit);
        const safeY2 = clamp(y2,rowTop+.5*unit,rowTop+rowHeight-.5*unit);
        const key = Math.floor((x-xOrigin)/cell)+'/'+Math.floor((safeY-rowTop)/(dense||compact?4*unit:2.5*unit));
        const thisMark = [x,safeY,x2,safeY2,strength];
        const previous = marks.get(key);
        if (previous) result.trimmed++;
        if (!previous || strength > previous[4]) marks.set(key,thisMark);
      };

      if (lane.kind === 'drums') {
        const hits = lane.hits;
        for (let i = bound(hits.time, from); i < hits.count && hits.time[i] < to; i++) {
          const row = hits.row[i], mapped = lane.rowIndex.get(row);
          if (!finite(mapped)) continue;
          const y = frame.drumYAt ? yOf(frame.drumYAt,box,row)
            : rowTop+(mapped+.5)*rowHeight/lane.rows.length;
          const x = xOther(hits.time[i]);
          add(x-1.5*unit,y-offset,x+1.5*unit,y-offset,hits.vel[i]);
        }
      } else {
        for (const part of frame.parts?.(box) || []) {
          const set = part.set;
          const voiceCurve = part.contour && part.voice !== 'meteor' && options.showContour !== false;
          if (voiceCurve) {
            const curve = part.contour, origin = curve.start || 0;
            const first = Math.max(0,Math.floor((from-origin)/curve.hop));
            const stride = Math.max(1, Math.floor((to-from)/curve.hop/(compact?125:230)));
            let prev = null;
            for (let i = first; i < curve.midi.length && origin+i*curve.hop <= to; i++) {
              const p = curve.midi[i];
              if (!finite(p)) { prev = null; continue; }
              if (i % stride) continue;
              const x = xOther(origin+i*curve.hop), y = yOf(frame.contourYAt || frame.yAt,box,p)-offset;
              if (prev && Math.abs(y-prev[1]) < rowHeight*.35) {
                exact.push([prev[0],clamp(prev[1],rowTop+.5*unit,rowTop+rowHeight-.5*unit),
                  x,clamp(y,rowTop+.5*unit,rowTop+rowHeight-.5*unit)]);
              }
              prev = [x,y];
            }
            continue;
          }
          for (let i = bound(endIndexes(set),from+epsilon); i < set.count && set.start[i] < to; i++) {
            const start = set.start[i], end = Math.min(set.start[i]+set.dur[i],to);
            if (end <= from) continue;
            const x = xOther(Math.max(start,from)), x2 = xOther(end);
            const y = yOf(frame.yAt,box,set.pitch[i])-offset;
            add(x,y,Math.max(x+.75*unit,x2),y,(set.vel[i]||64)+clamp((x2-x)/unit,0,70));
          }
        }
      }
      const limit = Math.max(10,Math.min(dense?46:86,Math.floor(frame.width/unit/(compact?12:9))));
      const notes = Array.from(marks.values());
      result.trimmed += Math.max(0,notes.length-limit);
      if (notes.length > limit) notes.sort((a,b) => b[4]-a[4]);
      const buckets = [[],[],[],[]];
      for (const row of notes.slice(0,limit).concat(exact)) {
        const [x,y,x2,y2] = row, slot = dense && row.length === 5 ? 2 : 0;
        if (x < needle && x2 > needle) {
          const split = y+(y2-y)*(needle-x)/(x2-x);
          buckets[slot].push([x,y,needle,split]);
          buckets[slot+1].push([needle,split,x2,y2]);
        } else buckets[slot+(x>=needle?1:0)].push(row);
        count++;
      }
      if (!buckets.some(list => list.length)) continue;
      ctx.save();
      ctx.beginPath();
      ctx.rect(bounds[0],rowTop,bounds[1]-bounds[0],rowHeight);
      ctx.clip();
      strokeBatches(ctx,buckets,paper,unit);
      ctx.restore();
    }
    return count;
  }

  function drawEnergy(ctx, frame, options, range, value, palette, levels) {
    const group = value.dynamic?.group;
    const db = group ? levels?.groups?.[group] : null;
    if (!db || options.focusGroup && options.focusGroup !== group) return null;
    const {geometry,needle,pixelsPerSecond:pps} = frame;
    const unit = frame.unit || 1, top = frame.top || 0;
    const {lanes} = geometry;
    let track = null;
    for (let i = 0; i < lanes.length; i++) {
      const box = lanes[i];
      if (box.lane.group !== group) continue;
      const next = lanes[i+1];
      // Use the outside edge of the group, in the existing gutter between lanes.
      if (next?.lane.group === group) continue;
      const lastEdge = geometry.texture?.top ?? geometry.bar?.top;
      const gap = (next?.top ?? lastEdge ?? box.bottom)-box.bottom;
      if (gap >= 3.5 && (!track || gap >= track.gap)) track = {box,gap};
    }
    if (!track) return null;

    const narrow = frame.width/unit < 580;
    const radius = Math.min(3.8,(range.right-range.left)*(narrow ? .42 : .31)/pps);
    const since = Math.max(range.lo,frame.time-radius), until = Math.min(range.hi,frame.time+radius);
    if (until-since < .3) return null;
    const first = range.xAt(since), last = range.xAt(until);
    const {hop} = levels;
    const firstRef = range.toOther(since), lastRef = range.toOther(until);
    const boundaries = [first,last];
    for (const [start,end,xAt] of [[since,until,range.xAt],[firstRef,lastRef,range.xOther]]) {
      // Each edge comes from the recorded sampling grid. Cap very fine input
      // grids so a small ribbon never sends a large number of strokes to Canvas.
      const stride = Math.max(1,Math.ceil((end-start)/(hop*24)));
      for (let i = Math.floor(start/hop)+1; i*hop < end; i+=stride) boundaries.push(xAt(i*hop));
    }
    boundaries.sort((a,b)=>a-b);
    const samples = [];
    let peak = -Infinity;
    for (let i = 1; i < boundaries.length; i++) {
      const x = boundaries[i-1], end = boundaries[i];
      if (end-x < .75*unit) continue;
      const time = frame.time+((x+end)/2-needle)/pps;
      const here = db[Math.floor(time/hop)], other = db[Math.floor(range.toOther(time)/hop)];
      if (![here,other].every(n=>finite(n) && n >= -160 && n <= 30) || Math.max(here,other) < -52) continue;
      peak = Math.max(peak,here,other);
      const [a,b] = value.active === 'a' ? [here,other] : [other,here];
      samples.push({x,end,a,b});
    }
    if (samples.length < 2) return null;

    const height = Math.min(10,track.gap-1.2)*unit;
    const edge = top+track.box.bottom*unit;
    const bottom = edge+(track.gap*unit+height)*.5;
    const floor = Math.max(-62,peak-26);
    const span = Math.max(12,peak-floor);
    const amplitude = level => clamp((level-floor)/span,0,1);
    const colors = {a:palette.a,b:palette.b};
    const yAt = (level,key) => bottom-(1.05+(.54*(key==='a')))*unit-(height-1.7*unit)*amplitude(level);
    const measure = frame.width/unit > 650 ? 8.5 : 8;
    ctx.save();
    ctx.setLineDash([]);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = '600 '+measure*unit+'px "Segoe UI",sans-serif';
    let marks = 0;
    for (const key of ['a','b']) {
      const active = value.active === key;
      ctx.strokeStyle = ctx.fillStyle = colors[key];
      ctx.lineWidth = (active ? 1.10 : .92)*unit;
      for (const quiet of [false,true]) {
        // At the display floor, use a quieter stroke. A padded quiet value
        // gives no evidence about finer variation at that level.
        ctx.globalAlpha = quiet ? .38 : active ? .97 : .86;
        ctx.setLineDash(quiet && !narrow ? [2*unit,2.6*unit] : []);
        let lastSample = null;
        ctx.beginPath();
        for (const s of samples) {
          if ((s[key] <= floor) !== quiet) continue;
          const y = yAt(s[key],key);
          if (narrow) {
            const mid = (s.x+s.end)/2+(key==='a'?-1.65:1.65)*unit;
            const len = Math.min(1.18,(s.end-s.x)/(7*unit))*unit;
            ctx.moveTo(mid-len,y);
            ctx.lineTo(mid+len,y);
          } else {
            if (!lastSample || s.x-lastSample.end > .8*unit) ctx.moveTo(s.x,y);
            else ctx.lineTo(s.x,y);
            ctx.lineTo(s.end,y);
          }
          lastSample = s;
          marks++;
        }
        if (lastSample) ctx.stroke();
      }
      if (first > 28*unit && track.gap >= 5) {
        const labelX = first-(key==='a'?13:4)*unit;
        ctx.globalAlpha = active ? .97 : .86;
        ctx.fillText(key.toUpperCase(),labelX,bottom-height*.5);
      }
    }
    ctx.restore();
    return {group,marks,span:[since,until],narrow,lane:track.box.lane.id};
  }

  function displayLabel(section, en) {
    if (!en) return section.label;
    const label = lexicon[section.kind]?.[1];
    if (!label || /^[a-z]/i.test(section.label)) return section.label;
    const n = section.label.match(/\d+$/)?.[0];
    return label+(n?' '+n:'');
  }

  function drawLegend(ctx, frame, options, pair, value, palette, otherMidi) {
    const part = frame.geometry.info;
    // Keep this in the central part of the section/chord band. Score labels
    // anchor at the sides here; lyrics and the section timeline use other bands.
    if (!part) return;
    const unit = frame.unit || 1, top = frame.top || 0, width = frame.width;
    if (width/unit < 205 || (part.bottom-part.top) < 22) return;
    const en = String(options.lang || '').startsWith('en');
    const ref = value.reference, active = value.active;
    const basis = value.reason === 'missing-beats' ? (en?'Beat data gap':'该处缺拍点')
      : value.reason === 'outside-common' ? (en?'Outside shared beats':'超出共同拍位')
      : value.basis === 'lyric' ? (en?'Beat grid · matched lyrics':'同句歌词校正拍位') : (en?'Beat grid':'按实测拍位');
    const max = Math.min(width*.57,370*unit);
    const full = width/unit > 525;
    let playing = active.toUpperCase()+' '+displayLabel(pair[active],en);
    let other = ref.toUpperCase()+' '+displayLabel(pair[ref],en);
    const gloss = en?'playing':'实响';
    const trace = en?'trace':'重影';
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = '600 '+(full?12:10)*unit+'px "Segoe UI","Microsoft YaHei",sans-serif';
    const divider = '   /   ';
    const size = text => ctx.measureText(text).width;
    const lineWidth = () => size(playing+' '+gloss+divider+other+' '+trace);
    if (lineWidth() > max-13*unit) { playing = active.toUpperCase(); other = ref.toUpperCase(); }
    const measured = lineWidth();
    const pad = 7*unit, h = Math.min((part.bottom-part.top)*unit-2*unit,(full?31:26)*unit);
    const level = value.dynamic, gap = level?.delta;
    const db = finite(gap) ? (gap < 0 ? '−' : '+')+Math.abs(gap).toFixed(1)+' dB' : '';
    const group = level?.group === 'other' && otherMidi ? (en ? 'Synth' : '合成')
      : level ? (stemNames[level.group]?.[en?1:0] || level.group) : '';
    const detail = !value.reason && group ? basis+' · '+group+' B−A '+db : basis;
    const detailFont = '400 '+(full?10:9)*unit+'px "Segoe UI","Microsoft YaHei",sans-serif';
    const mainFont = ctx.font;
    ctx.font = detailFont;
    const chosenDetail = size(detail) > max-2*pad ? basis : detail;
    const w = Math.min(max, Math.max(measured,size(chosenDetail))+2*pad);
    ctx.font = mainFont;
    const x = (width-w)/2, y = top+unit*(part.bottom-2)-h;
    ctx.fillStyle = palette.back;
    ctx.fillRect(x,y,w,h);
    ctx.fillStyle = palette.front;
    const xText = (width-measured)/2, yText = y+h*.30;
    const current = playing+' '+gloss+divider;
    ctx.fillText(current,xText,yText,Math.max(1,w-pad));
    ctx.fillStyle = palette[ref];
    ctx.fillText(other+' '+trace,xText+size(current),yText,Math.max(1,w-pad-size(current)));
    ctx.font = detailFont;
    ctx.fillStyle = palette.front;
    ctx.globalAlpha = .78;
    ctx.textAlign = 'center';
    ctx.fillText(chosenDetail,width/2,y+h*.73,w-2*pad);
  }

  return Object.freeze({create});
});
