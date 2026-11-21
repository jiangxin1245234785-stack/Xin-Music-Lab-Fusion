(() => {
  'use strict';
  const W = 1920, H = 1080;
  const left = 107, join = 747, needleX = 1252, right = 1781, pps = 133;
  const tau = Math.PI * 2;
  const clamp = value => Math.max(0, Math.min(1, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const materials = {
    vocals: { body: ['#a05547', '#743232', '#502630'], silk: ['#f89171', '#ffc295', '#7d302d'], threads: ['#e47861'], range: [47, 72], width: 75 },
    piano: { body: ['#8e7861', '#5b5042', '#3f3739'], silk: ['#e9c980', '#fff0c4', '#5f4628'], threads: ['#e8c67e', '#f0b369', '#e4d0a8'], range: [54, 96], width: 70 },
    strings: { body: ['#aa5447', '#7c3d36', '#482b31'], silk: ['#f1995f', '#ffd3aa', '#602d29'], threads: ['#eea487', '#de977a', '#e69b81', '#dc836e', '#c67560'], range: [47, 86], width: 99 },
    winds: { body: ['#586d83', '#33475e', '#263443'], silk: ['#97c3ed', '#d2e6ff', '#2b4a66'], threads: ['#89c7df', '#8eb9e4', '#aaa8da', '#aaa4c7', '#9ed8d8'], range: [48, 81], width: 77 },
    guitar: { body: ['#496880', '#344a63', '#29333f'], silk: ['#90ccbd', '#d1eee0', '#245858'], threads: ['#92b3c9', '#8bcbc1', '#7da6b8'], range: [46, 81], width: 92 },
    other: { body: ['#718174', '#48564d', '#2f3d38'], silk: ['#add6ad', '#def2ce', '#355544'], threads: ['#a5c498', '#c2d6a7'], range: [45, 82], width: 70 },
    bass: { body: ['#6c698f', '#4b4562', '#363344'], silk: ['#b9b2e1', '#e2daef', '#4a3a66'], threads: ['#a69acf', '#c8acda'], range: [25, 53], width: 71 },
    drums: { body: ['#997045', '#6e4a32', '#493633'], silk: ['#eebb70', '#ffe2ad', '#683f24'], threads: ['#e9ab5f'], range: [34, 51], width: 63 }
  };
  const drums = { kick: 36, snare: 38, hihat: 42, openhat: 46, tom: 45, crash: 49, ride: 51 };
  const songs = new WeakMap();
  const scenes = new WeakMap();
  const backdrops = new Map();
  const fabricTiles = new Map();
  const fabricPatterns = new WeakMap();
  let grainTile;
  const grainPatterns = new WeakMap();
  const centers = [316, 423, 534, 658, 771, 872];
  const joints = [-58, 13, -26, 34, -8, 55];
  const visualWeights = [1, 2, 4, 7, 9, 7, 4, 2, 1];

  function lowerBound(items, time, timeOf) {
    let low = 0, high = items.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (timeOf(items[middle]) < time) low = middle + 1;
      else high = middle;
    }
    return low;
  }
  const eventTime = event => event.start;
  const scoreApi = () => globalThis.XinScoreView || (typeof require === 'function' ? require('./score-view.js') : null);
  const bandKey = lane => {
    if (lane.kind === 'drums') return 'drums';
    const group = lane.group || String(lane.id || '').split('/')[0];
    if (group === 'violin' || scoreApi()?.isOtherMidi(lane)) return 'strings';
    return Object.hasOwn(materials, group) ? group : 'other';
  };
  function copyEvents(lanes) {
    return lanes.flatMap((lane, laneIndex) => {
      const percussive = lane.kind === 'drums';
      const list = percussive ? lane.hits : lane.notes;
      return (Array.isArray(list) ? list : []).flatMap((event, index) => {
        if (!Array.isArray(event)) return [];
        const [start, value, third, fourth] = event;
        const length = percussive ? 0 : value;
        // Score View's drum event contains a row index, whose name determines the stitch.
        const row = percussive ? lane.rows?.[value] : undefined;
        const pitch = percussive ? drums[row] ?? value : third;
        const velocity = percussive ? third : fourth;
        const end = start + length;
        if (!Number.isFinite(start) || start < 0 || !Number.isFinite(end) ||
            (!percussive && !(length > 0)) || !Number.isFinite(pitch) || pitch < 0 || pitch > 127) return [];
        return [{ id: `${lane.id}:${index}`, lane: lane.id, group: lane.group || bandKey(lane), label: lane.label || lane.id,
          laneIndex, start, end, length, pitch, velocity, percussive, row }];
      });
    }).sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  }
  function recordedLevel(song, key, texture) {
    const db = song.levels?.groups?.[key] ?? (key === 'strings' ? song.levels?.groups?.violin : null);
    if (song.levels?.hop > 0 && Array.isArray(db) && db.some(value => Number.isFinite(value) && value > -85)) {
      return {hop: song.levels.hop, db};
    }
    return texture?.level;
  }
  function levelSource(recording, events, duration) {
    const {db: levels, hop} = recording || {};
    const powers = hop > 0 && Array.isArray(levels) && levels.some(value => Number.isFinite(value) && value > -85)
      ? Float64Array.from(levels, value => Number.isFinite(value) ? 10 ** (value / 10) : NaN) : null;
    const step = Math.max(.06, duration / 12000);
    const count = Math.ceil(duration / step) + 1;
    const activity = new Float32Array(count);
    const deltas = new Float64Array(count + 1);
    for (const event of events) {
      if (event.start >= duration) break;
      const energy = (.35 + .65 * clamp((event.velocity ?? 80) / 127)) ** 2;
      const last = event.percussive ? event.start + .085 : event.end;
      deltas[Math.floor(event.start / step)] += energy;
      deltas[Math.min(count, Math.ceil(last / step))] -= energy;
    }
    let density = 0;
    for (let i = 0; i < count; i++) {
      density += deltas[i];
      activity[i] = clamp(Math.log1p(Math.max(0, density)) / 1.62);
    }
    return {
      basis: powers ? 'stems' : 'score',
      read(time) {
        if (time < 0 || time > duration) return { activity: 0, dB: null };
        if (powers && time < powers.length * hop) {
          const index = Math.max(0, time / hop - .5);
          const before = Math.floor(index), after = Math.min(before + 1, powers.length - 1);
          const power = lerp(powers[before], powers[after], ease(index - before));
          if (Number.isFinite(power)) {
            const dB = 10 * Math.log10(Math.max(1e-12, power));
            return { activity: ease((dB + 47) / 32), dB };
          }
        }
        const index = time / step, before = Math.floor(index);
        return { activity: lerp(activity[before], activity[Math.min(before + 1, count - 1)], ease(index - before)), dB: null };
      }
    };
  }
  function prepare(song, duration) {
    const cached = songs.get(song);
    if (cached?.duration === duration) return cached.bands;
    const grouped = new Map();
    const textures = new Map();
    for (const lane of Array.isArray(song.lanes) ? song.lanes : []) {
      if (!lane) continue;
      const key = bandKey(lane);
      if (lane.kind === 'texture' && lane.level?.hop > 0 && Array.isArray(lane.level.db)) {
        if (!textures.has(key)) textures.set(key,lane);
        continue;
      }
      if (!['pitched', 'melody', 'drums'].includes(lane.kind)) continue;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(lane);
    }
    const bands = Object.keys(materials).flatMap(key => {
      const lanes = grouped.get(key) || [];
      const other = key === 'strings' && lanes.some(lane => scoreApi()?.isOtherMidi(lane));
      const events = copyEvents(lanes);
      const texture = textures.get(key);
      const recording = recordedLevel(song,other ? 'other' : key,texture);
      // A named audible stem can supply the cloth width even when its transcription is absent.
      // The residual mix stays out of a score with individual parts.
      const audible = recording && (key !== 'other' || grouped.size === 0) &&
        recording.db.filter(value => Number.isFinite(value) && value > -50).length * recording.hop >=
          Math.min(8, Math.max(.35, duration * .06));
      const namedTexture = texture && key !== 'other' && recording?.db.some(value => Number.isFinite(value) && value > -65);
      if (!events.length && !lanes.length && !audible && !namedTexture) return [];
      const colors = materials[key];
      const pitches = events.filter(event => !event.percussive).map(event => event.pitch).sort((a, b) => a - b);
      const range = pitches.length ? [Math.min(colors.range[0], pitches[Math.floor((pitches.length - 1) * .03)]),
        Math.max(colors.range[1], pitches[Math.floor((pitches.length - 1) * .97)])] : colors.range;
      const contour = lanes.find(lane => lane.kind === 'melody' && lane.contour?.hop > 0 &&
        Number.isFinite(lane.contour.start) && Array.isArray(lane.contour.midi))?.contour;
      let latestEnd = 0;
      const ends = events.map(event => (latestEnd = Math.max(latestEnd, event.end)));
      return [{ key, group: other ? 'other' : key, colors, events, ends, range, contour, source: levelSource(recording, events, duration) }];
    });
    songs.set(song, { duration, bands });
    return bands;
  }

  function hash(x, y) {
    let h = Math.imul(x, 0x1e35a7bd) ^ Math.imul(y, 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 15), 0x45d9f3b);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  function canvas(w, h, ctx) {
    const surface = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : ctx.canvas.ownerDocument.createElement('canvas');
    surface.width = w; surface.height = h;
    return surface;
  }
  function workshopLayout(frame) {
    const sx = Math.min(frame.w / W, frame.h / H * 1.22);
    const portrait = frame.w / frame.h < .90;
    const sy = portrait ? Math.max(sx,Math.min(frame.h * .85 / H,sx*2.85)) : Math.min(frame.h / H,sx*1.60);
    return { sx, sy, portrait, x: (frame.w - W * sx) / 2, y: (frame.h - H * sy) / 2 };
  }
  function render(output, frame) {
  if (!(frame?.song && typeof frame.song === 'object' && Number.isFinite(frame.w) && frame.w > 0 &&
      Number.isFinite(frame.h) && frame.h > 0)) return {detail: null};
  const rawDuration = frame.duration ?? frame.song.track?.duration;
  const duration = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 0;
  const time = clamp((Number.isFinite(frame.time) ? frame.time : 0) / (duration || 1)) * duration;
  const layout = workshopLayout(frame);
  const armClearance = layout.portrait ? 32 : 40;
  const allBands = prepare(frame.song, duration);
  const bands = allBands.map((band, index) => {
    const portion = allBands.length <= 1 ? 2.5 : index * 5 / (allBands.length - 1);
    const shiftIndex = Math.floor(portion), mix = portion - shiftIndex;
    const between = values => lerp(values[shiftIndex], values[Math.min(5, shiftIndex + 1)], mix);
    return { ...band, index, laneCenter: between(centers), joint: join + between(joints),
      a: left + between([4, 1, -3, -3, 0, 8]), z: right + between([-18, -1, 15, 17, 4, -22]) };
  });
  let c = output;
  function line(points, color, width = 1) {
    if (points.length < 2) return;
    c.beginPath(); c.moveTo(...points[0]);
    for (const point of points.slice(1)) c.lineTo(...point);
    c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke();
  }
  function strokes(lines, color, width = 1) {
    if (!lines.length) return;
    c.beginPath();
    for (const points of lines) {
      c.moveTo(...points[0]);
      for (let i = 1; i < points.length; i++) c.lineTo(...points[i]);
    }
    c.strokeStyle = color;
    c.lineWidth = width;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.stroke();
  }
  function path(points) {
    c.beginPath(); c.moveTo(...points[0]);
    for (const point of points.slice(1)) c.lineTo(...point);
    c.closePath();
  }
  function poly(points, fill, stroke, width=1) {
    path(points); c.fillStyle=fill; c.fill();
    if (stroke) { c.strokeStyle=stroke; c.lineWidth=width; c.lineJoin='round'; c.stroke(); }
  }
  function oval(x,y,rx,ry,fill,stroke,rotation=0) {
    c.beginPath(); c.ellipse(x,y,rx,ry,rotation,0,tau);
    c.fillStyle=fill; c.fill();
    if (stroke) { c.strokeStyle=stroke; c.lineWidth=1; c.stroke(); }
  }
  function gradient(x1,y1,x2,y2,colors) {
    const g = c.createLinearGradient(x1,y1,x2,y2);
    colors.forEach(([p,color])=>g.addColorStop(p,color)); return g;
  }
  function samples(a,b,step,fn) {
    const count = Math.max(1,Math.ceil((b-a)/step));
    return Array.from({length:count+1},(_,i)=>fn(lerp(a,b,i/count)));
  }
  function label(value,x,y,font,color,width) {
    c.font=font; c.fillStyle=color; c.fillText(value,x,y,width);
  }
  function paintAtmosphere() {
    c.fillStyle='#13161b'; c.fillRect(0,0,W,H);
    const light=c.createRadialGradient(431,491,55,721,490,1440);
    light.addColorStop(0,'#423a36'); light.addColorStop(.5,'#26282b'); light.addColorStop(1,'#13171d');
    c.fillStyle=light; c.fillRect(0,0,W,H);
    const wall = gradient(0,38,0,275,[[0,'#211f23'],[1,'#32302c']]);
    poly([[0,0],[W,0],[W,216],[0,253]],wall);
    c.save(); c.globalAlpha=.80;
    line([[0,215],[1920,175]],'#141519',22);
    line([[0,205],[1920,166]],'#514643',2);
    for (let i=0;i<9;i++) {
      const x=960 + 104*i, y=62 - .7*i;
      line([[x,y],[x+1,y+99]],'#18191b',5);
      line([[x+5,y],[x+6,y+98]],'#554941',1);
    }
    c.restore();
    const vignette=c.createRadialGradient(570,530,280,863,541,1240);
    vignette.addColorStop(0,'#05091100'); vignette.addColorStop(1,'#03050b83');
    c.fillStyle=vignette; c.fillRect(0,0,W,H);
  }
  function table() {
    const outline = [[12,286],[1654,194],[1880,220],[1918,789],[1622,920],[75,980],[10,958]];
    poly(outline,gradient(0,180,0,1050,[[0,'#454442'],[.42,'#433c3e'],[1,'#342e35']]),'#645457');
    c.save(); path(outline); c.clip();
    for(let i=0;i<74;i++) {
      const y=203+i*11.2;
      line(samples(0,W,22,x=>[x,y-(x/W)*94+3*Math.sin(x/97+i)+5*hash(i,17)]),
        i%7===0?'#20192255':i%3===0?'#82674f47':'#a0896722',i%7===0?1.2:.7);
    }
    c.restore();
    poly([[13,958],[76,980],[1622,920],[1918,789],[1918,808],[1622,940],[75,1010],[13,990]],
      gradient(0,875,0,1050,[[0,'#362a28'],[1,'#201b20']]));
    line([[12,958],[76,980],[1622,920],[1918,789]],'#a07b574e',2);
    const top = [[109,299],[171,259],[465,259],[644,273],[841,315],[920,802],[743,856],[144,914],[88,878]];
    c.save();c.shadowColor='#0e0b139e';c.shadowBlur=29;c.shadowOffsetY=27;
    poly([[88,878],[144,914],[743,856],[920,802],[923,849],[751,917],[146,974],[90,936]],
      gradient(0,840,0,1010,[[0,'#5f5552'],[.28,'#423039'],[.63,'#2c242d'],[1,'#251f26']]),'#785a5752');
    c.restore();
    poly(top,gradient(15,278,1030,946,[[0,'#77665a'],[.37,'#635349'],[.81,'#4c3e3d'],[1,'#46393a']]),'#a58a7359',1.5);
    c.save(); path(top); c.clip();
    for(let i=0;i<144;i++){
      let y=252+5.1*i;
      line(samples(10,1090,18,x=>[x,y-.06*x+3*Math.sin(x/(19+i)+i*.76)+2*hash(i,7)]),
        i%9===0?'#201b254e':i%2?'#d8af7e18':'#2c1f2542',i%9===0?1.1:.61);
    }
    c.restore();
    line([[88,878],[144,914],[743,856],[920,802]],'#cba58778',1.8);
    line([[92,927],[146,962],[751,906],[921,840]],'#66534e95',1.34);
    for (const [x,y] of [[107,910],[145,939],[623,899],[784,872],[909,833],[1737,830],[1889,785]]) {
      oval(x,y,4.2,2.5,'#291e22','#b58c6382');
      line([[x-2,y],[x+2,y-1]],'#b58c6379',.9);
    }
  }
  function rod(x,y,w,h,metal='brass') {
    const colors=metal==='brass'?[[0,'#201d20'],[.24,'#907456'],[.44,'#c1a379'],[.6,'#66513d'],[1,'#2d2426']]:
      [[0,'#15181c'],[.18,'#747972'],[.32,'#aaa08c'],[.55,'#585956'],[1,'#23252b']];
    const g=gradient(x,y,x,y+h,colors);
    poly([[x,y],[x+w,y],[x+w,y+h],[x,y+h]],g);
    oval(x+w,y+h*.5,h*.21,h*.5,colors[3][1],colors[1][1]);
  }
  function ringSpool(x,y,r,h,colors,angle=0) {
    c.save();c.translate(x,y);c.rotate(angle);
    if (layout.portrait) c.scale(1,Math.max(.52,layout.sx/layout.sy));
    oval(7,h+8,r+10,8,'#110f185c');
    rod(-r,-h,r*2,h+7);
    const roll=gradient(-r,0,r,0,[[0,colors[2]],[.25,colors[0]],[.52,colors[1]],[1,colors[2]]]);
    c.fillStyle=roll; c.fillRect(-r+3,-h+3,r*2-6,h-4);
    for(let i=-h+4;i<0;i+=2) line([[-r+4,i],[r-4,i-1]],i%4?'#241c243e':'#ffe7b03c',.62);
    oval(0,-h,r,6,'#695549','#b29268a0'); oval(0,-h,r*.37,3,'#2b2529','#a0825d');
    oval(0,1,r+1,5,'#52423b','#94745c');
    c.restore();
  }
  const timeAt = x => time+(x-needleX)/pps;
  const xAt = t => needleX+(t-time)*pps;
  const fabricOrigin = time * pps;
  const projectX = x => layout.x + x * layout.sx;
  const projectY = y => layout.y + y * layout.sy;
  const grid = 5;
  for (const b of bands) {
    const first = lowerBound(b.ends, timeAt(b.a), value => value);
    const after = lowerBound(b.events, Math.min(duration + Number.EPSILON * duration, timeAt(b.z)), eventTime);
    b.visible = b.events.slice(first, after).filter(note => note.end >= timeAt(b.a));
    b.levelField = Array.from({ length: Math.ceil(W / grid) + 2 }, (_, index) => {
      const x = index * grid;
      const materialTime = timeAt(x);
      const direct = b.source.read(materialTime);
      const blur = 1 - ease((x - 566) / 496);
      const smooth = blur > 0 ? visualWeights.reduce((sum, weight, j) => sum +
        weight * b.source.read(materialTime + (j - 4) * 49 / pps).activity, 0) / 37 : direct.activity;
      // Both inputs follow material time. The final join relaxes the width transitions.
      return { dB: direct.dB, activity: lerp(direct.activity, smooth, blur) };
    });
  }
  function level(band,x) {
    const ix=Math.max(0,Math.min(W/grid,Math.floor(x/grid))), fraction=clamp(x/grid-ix);
    const a=band.levelField[ix], b=band.levelField[ix+1];
    return {dB:a.dB === null || b.dB === null ? null : lerp(a.dB,b.dB,fraction),activity:lerp(a.activity,b.activity,fraction)};
  }
  function sectionWidth(band,x) {
    const i=band.index, lane=band.laneCenter;
    const xNorm=clamp((x-left)/(right-left));
    const joined=1-ease((x-band.joint+100)/193);
    const entry=ease((x-needleX)/500);
    const perspective = 1-.30*xNorm;
    const {dB,activity}=level(band,x);
    const spacing = Math.min(1, 5 / Math.max(1, bands.length - 1));
    const width=(band.colors.width*(.38+.62*activity)*perspective*(1-.52*entry) + joined*(30+9*(i%3)))*
      spacing*(layout.portrait ? .83 : 1);
    return {lane,xNorm,entry,joined,dB,perspective,width};
  }
  function jointGap(band,x) {
    const next=bands[band.index+1];
    if(!next)return 0;
    const silence=(1-level(band,x).activity)*(1-level(next,x).activity);
    // The wide openings follow small, irregular pockets. Adjacent cloth stays edge to edge elsewhere.
    const world=x+fabricOrigin;
    const pocket=Math.max(0,Math.sin(world/69+band.index*2.6))*Math.max(0,Math.sin(world/129+band.index*.58));
    return Math.max(-1.45,silence*pocket*24-1.45);
  }
  function projectBody(band,x) {
    const i=band.index;
    const {lane,xNorm,entry,joined,dB,perspective,width}=sectionWidth(band,x);
    const ramp=ease((x-590)/480);
    const curl = Math.sin(x*.0066+i*.64)*lerp(8.8,1.8,ramp) + Math.sin(x*.011+i)*2.9;
    const workY=603 + (lane-563)*(1-.43*xNorm) - 73*xNorm + 53*entry*entry + curl +
      (-29*(1-ramp)) + (12+i%3*3)*Math.sin(entry*3.9+i*.45)*entry;
    if (x>860) return {y:workY,half:width/2,dB,perspective};
    const rows=bands.map(row=>sectionWidth(row,x).width+jointGap(row,x));
    const hemLift = -12 * Math.sin(.75 * Math.PI * ease(1 - (x-left)/103));
    const drape = 7.3*Math.sin(x*.0084+i*.51) + hemLift + Math.sin(i*.83+x*.008)*2.1*(1-xNorm);
    const stackY = 561-28*xNorm-rows.reduce((sum,row)=>sum+row,0)*.5+
      rows.slice(0,i).reduce((sum,row)=>sum+row,0)+width*.5 + drape;
    const merge = 1-ease((x-565)/295);
    return {y:lerp(workY,stackY,merge),half:width/2,dB,perspective,joined};
  }
  for (const band of bands) {
    band.bodyField = Array.from({ length: Math.ceil(W / grid) + 2 }, (_, index) => projectBody(band, index * grid));
  }
  function body(band,x) {
    const index = Math.max(0, Math.min(W / grid, Math.floor(x/grid)));
    const t = clamp(x/grid-index);
    const a = band.bodyField[index], b = band.bodyField[index+1];
    return { y: lerp(a.y,b.y,t), half: lerp(a.half,b.half,t) };
  }
  function edge(b,x,d) { const v=body(b,x); return v.y+v.half*d; }
  function ribbonPath(b,a,z) {
    return [...samples(a,z,7,x=>[x,edge(b,x,-1)]),...samples(a,z,7,x=>[x,edge(b,x,1)]).reverse()];
  }
  function bandEnds(b) {
    return [b.a, b.z];
  }
  function fabricTile(b) {
    let patterns = fabricPatterns.get(c);
    if (!patterns) fabricPatterns.set(c, patterns = new Map());
    if (patterns.has(b.key)) return patterns.get(b.key);
    const n=164;
    if (fabricTiles.has(b.key)) {
      const pattern = c.createPattern(fabricTiles.get(b.key),'repeat');
      patterns.set(b.key, pattern);
      return pattern;
    }
    const tile=canvas(n,n,c), ctx=tile.getContext('2d');
    const img=ctx.createImageData(n,n), [lit,base,dark]=b.colors.body.map(rgb);
    for(let y=0;y<n;y++) for(let x=0;x<n;x++) {
      const u=(x+y*.022)/4.9, v=(y-x*.036)/4.45;
      const warp=Math.sin(Math.PI*(u-Math.floor(u))), weft=Math.sin(Math.PI*(v-Math.floor(v)));
      const top=(Math.floor(u)+Math.floor(v))%2===0?warp:weft;
      const underneath=(Math.floor(u)+Math.floor(v))%2===0?weft:warp;
      const s=clamp(top*1.26+underneath*.29);
      const variance = .94+.16*hash(x,y)+.16*(hash(Math.floor(u),Math.floor(v))-.5);
      const rim=(.49+.51*Math.cos(top*Math.PI-1.09))*12;
      const f = (y*n+x)*4;
      for(let j=0;j<3;j++) img.data[f+j]=(lerp(dark[j]*.60,lerp(base[j],lit[j],.60),.42+.58*s)+rim)*variance;
      img.data[f+3]=255;
    }
    ctx.putImageData(img,0,0);
    fabricTiles.set(b.key, tile);
    const pattern = c.createPattern(tile,'repeat');
    patterns.set(b.key, pattern);
    return pattern;
  }
  function laceBetween(b, next) {
    const [a0]=bandEnds(b),[n0]=bandEnds(next);
    const a=Math.max(a0,n0)-9, z=(b.joint+next.joint)*.5;
    const looseEdge=x=>ease((z-x)/68);
    const top=x=>edge(b,x,1)-2;
    const bottom=x=>lerp(top(x)+3,edge(next,x,-1)+1,looseEdge(x));
    const outline=[...samples(a,z,7,x=>[x,top(x)]),...samples(a,z,7,x=>[x,bottom(x)]).reverse()];
    poly(outline, '#d7a39220');
    c.save();path(outline);c.clip();
    for(let i=0;i<11;i++) {
      const f=i/10;
      line(samples(a,z,9,x=>[x,lerp(top(x),bottom(x),f)+Math.sin(x*.033+i*.29)*1.15]),
        i%5===0?'#ead2ac75':i%2===0?'#b38d6b5a':'#e8c7ad48',i%5===0?.87:.58);
    }
    const warp=[];
    for(let x=a+3-fabricOrigin%4.8;x<z+8;x+=4.8){
      const drift=1.8*Math.sin((x+fabricOrigin)/15.1);
      warp.push([[x,top(x)-3],[x+drift+5,bottom(x)+2]]);
    }
    strokes(warp,'#201a2548',.62);
    c.restore();
    const upper=[], lower=[];
    for(let x=a+13-fabricOrigin%10.9;x<z-8;x+=10.9){
      const h=hash(Math.floor(x+fabricOrigin),b.index), edgeX=x+1.9*h;
      upper.push([[edgeX,top(x)-2],[edgeX+2,top(x)+3.4],[edgeX+4,top(x)+4]]);
      lower.push([[edgeX+1,bottom(x)+2],[edgeX+3,bottom(x)-3]]);
    }
    strokes(upper,'#f0ba7799',1.04);
    strokes(lower,'#eeb5788d',.95);
  }
  function cloth(b) {
    const [a,z]=bandEnds(b), outline=ribbonPath(b,a,z);
    c.save(); c.shadowColor='#120c19b8'; c.shadowBlur=13; c.shadowOffsetY=8;
    poly(outline,b.colors.body[2]);c.restore();
    c.save();path(outline);c.clip();
    c.save();
    const pattern = fabricTile(b);
    const phase = fabricOrigin % 164;
    c.translate(-phase, 0);
    c.fillStyle = pattern || b.colors.body[1];
    c.fillRect(a + phase, 0, z - a, H);
    c.restore();
    c.fillStyle=gradient(a,0,z,0,[[0,'#ffc49f2c'],[.15,'#f4a76d18'],[.30,'#ffe0a523'],[.46,'#a9654910'],[.68,'#26314b12'],[1,'#15182463']]);
    c.fillRect(a,0,z-a,H);
    for(let i=-4;i<=4;i++) {
      const q=i*.21;
      line(samples(a,z,7,x=>[x,edge(b,x,q)+Math.sin(x/39+i)*1.1]),i%3===0?'#efc59625':'#291c2839',.72);
    }
    const upper=[], lower=[];
    for(let x=a+8-fabricOrigin%5.8;x<z;x+=5.8) {
      const n=hash(Math.round(x+fabricOrigin),b.index);
      if(n<.39)continue;
      upper.push([[x,edge(b,x,1)-1.5],[x+1.8,edge(b,x,1)+2.8+n*4]]);
      lower.push([[x+2,edge(b,x,-1)+1.1],[x-.7,edge(b,x,-1)-.9-n*2.6]]);
    }
    strokes(upper,b.colors.silk[0]+'61',.70);
    strokes(lower,b.colors.silk[0]+'50',.65);
    c.restore();
    for(const d of [-1,1]) {
      line(samples(a,z,5,x=>[x,edge(b,x,d)-d*.2]),b.colors.body[2],2.4);
      line(samples(a,z,5,x=>[x,edge(b,x,d)-d*1.44]),b.colors.silk[0]+'77',.91);
      line(samples(a,z,8,x=>[x,edge(b,x,d)-d*3.1]),b.colors.silk[1]+'28',.78);
    }
    for(let i=0;i<21;i++) {
      const f=i/20, xx=a-3+4*hash(i,b.index);
      line([[xx-3,edge(b,a,-1+2*f)-.6],[a+3,edge(b,a,-1+2*f)]],b.colors.silk[0]+'60',.80);
    }
  }
  function furnitureBack() {
    rod(1490,204,220,13,'steel');
    poly([[1554,104],[1880,100],[1865,123],[1541,128]],'#473e38','#7b68535e');
    poly([[1541,128],[1865,123],[1865,130],[1540,135]],'#201e24');
    for (let i=0;i<bands.length;i++) {
      const x=1589+i*245/Math.max(5,bands.length-1), b=bands[i];
      ringSpool(x,110-i*.55,12,27+i%3*4,b.colors.silk,-.04+i*.016);
    }
    for(const [x,y] of [[1739,323],[1800,583],[1786,789]]) {
      oval(x,y,20,7,'#17151a60');
      poly([[x-9,y],[x+13,y-2],[x+9,y+9],[x-15,y+12]],'#3e3a39','#9e83604d');
    }
  }
  function feed() {
    for(const b of bands) {
      const [,z]=bandEnds(b), y=edge(b,z,0), hw=sectionWidth(b,z).width*.45;
      const x=z-16;
      poly([[x-7,y-hw-4],[z+3,y-hw-8],[z+10,y-hw-4],[x+1,y-hw+1]],'#55504c','#897f6d9a');
      poly([[x-7,y+hw+2],[z+3,y+hw-3],[z+10,y+hw],[x+1,y+hw+5]],'#3c3938','#867763a8');
      line([[z+1,y-hw-4],[z+7,y+hw-.5]],'#211d25a8',4.0);
      line([[z,y-hw-5],[z+6,y+hw-1.6]],'#b0a2919e',2.15);
      line([[z-1,y-hw-5.5],[z+5,y+hw-2.1]],'#d3b79b82',.65);
      for(const s of [-1,1]) oval(x+2,y+s*(hw+2),2.5,1.25,'#222026','#8c7667');
    }
  }
  function flagHem() {
    if (!bands.length) return;
    const first=bands[0], last=bands.at(-1);
    for(const [b,d] of [[first,-1],[last,1]]) {
      const [a]=bandEnds(b), z=b.joint-33;
      const weave=x=>edge(b,x,d);
      line(samples(a,z,4,x=>[x,weave(x)+d*.5]),b.colors.body[2],6.0);
      line(samples(a,z,4,x=>[x,weave(x)]),gradient(a,0,z,0,[[0,'#d9a989'],[.21,'#c88a65'],[.65,'#d3ad7f'],[1,'#80534200']]),3.8);
      const stitches=[];
      for(let x=a+8-fabricOrigin%7.35;x<z-8;x+=7.35)stitches.push([[x-1.7,weave(x)+d*1.8],[x+1.9,weave(x)-d*2.4]]);
      strokes(stitches,'#f7c7968f',1.01);
    }
    // The cut flies off the little raised platform, wrapped by one edge binding.
    const points=bands.flatMap((b,i)=>{
      const [x]=bandEnds(b);
      return [[x-2,edge(b,x,-1)],[x-3.5-6*hash(i,31),body(b,x).y],[x-2,edge(b,x,1)]];
    });
    line(points.map(([x,y])=>[x+1,y+3]),'#2c1f2ad6',6.3);
    line(points,'#e0ad84ae',3.4);
    line(points.map(([x,y])=>[x-.8,y-.3]),'#f5c8a47d',1.20);
  }
  function joiningGuides() {
    for (let i=0;i<bands.length-1;i++) {
      const b=bands[i], next=bands[i+1], x=(b.joint+next.joint)*.5 + 1;
      const ya=edge(b,x,1), yb=edge(next,x,-1);
      c.save(); c.translate(x,(ya+yb)*.5); c.rotate(-.20);
      poly([[-15,-2],[10,-4],[16,0],[11,4],[-10,5]],'#211f25c3','#b9997c72');
      line([[-9,-1],[11,-2]],'#b6947389',1.15);
      oval(10,0,2.15,1.0,'#121219','#c1a48779');
      c.restore();
    }
  }
  function projectedPitch(b,note,x) {
    const v=body(b,x);
    const [a,z]=b.range;
    const pitch=clamp((note.pitch-a)/(z-a));
    const offset=note.percussive ? (note.pitch===36?.54:note.pitch===38?.13:-.40) : .73-1.46*pitch+(note.laneIndex%3-1)*.06;
    return v.y+v.half*offset;
  }
  function trace(b, note, x) {
    const offset=x-xAt(note.start), pitch=note.pitch;
    return projectedPitch(b,note,x)+.36*Math.sin(offset*.12+pitch)+.49*Math.sin(offset*.051-pitch);
  }
  function looseLift(b, note, x) {
    if (x <= needleX || note.percussive) return 0;
    const start = Math.max(xAt(note.start), needleX);
    const end = xAt(Math.min(duration, note.end));
    const pending = Math.max(.01, end - start);
    return Math.sin(Math.PI * clamp((x-start)/pending)) *
      Math.min(pending*.15, b.key === 'strings' && note.length >= 1.8 ? 17 : 7.9);
  }
  function spindleColor(b,note,prominent) {
    if (prominent) return ['#eab481','#ffe0aa','#724232'];
    return [b.colors.threads[note.laneIndex%b.colors.threads.length],b.colors.silk[1],b.colors.silk[2]];
  }
  function stitchLayer() {
    const layers=Array.from({length:6},()=>new Map());
    return {
      line(layer,points,color,width,alpha) {
        const size=Math.round(width*4)/4;
        const key=color+'|'+size+'|'+alpha;
        const styles=layers[layer];
        if(!styles.has(key)) styles.set(key,{color,size,alpha,paths:[]});
        styles.get(key).paths.push(points);
      },
      paint() {
        for(const styles of layers) for(const {color,size,alpha,paths} of styles.values()) {
          c.globalAlpha=alpha;
          strokes(paths,color,size);
        }
        c.globalAlpha=1;
      }
    };
  }
  function stitchNote(b,note,layer,alpha) {
    const [l,r]=bandEnds(b), n1=xAt(note.start), n2=xAt(note.end);
    const prominent=b.key==='strings' && note.length >= 1.8;
    const [base,light,dark]=spindleColor(b,note,prominent);
    const pitch=note.pitch;
    const strength=.58+.45*clamp((note.velocity||70)/120);
    const fiber=b.key==='strings'?3.25:b.key==='bass'?4:b.key==='vocals'?2.4:b.key==='piano'?3.35:2.8;
    const start=Math.max(l,n1), end=Math.min(r,n2,xAt(duration));
    if(end-start<.75)return;
    for(const [lo,hi,loose] of [[start,Math.min(end,needleX),false],[Math.max(needleX,start),end,true]]) {
      if(hi-lo<.7)continue;
      const radius=(prominent?5.1:fiber)*strength;
      const step=2.6;
      const route=samples(lo,hi,step,x=>[x,trace(b,note,x),loose?looseLift(b,note,x):0]);
      const pathAt=off=>route.map(([x,y,lift])=>[x,y-lift+off(x)]);
      layer.line(0,route.map(([x,y,lift])=>[x+(loose?2.4:1),y+1.5+lift*.22]),'#1f12238c',radius+(loose?1.5:.8),alpha);
      layer.line(1,pathAt(()=>1),dark,radius+1,alpha);
      const taper = b.key==='piano' ? .55:1;
      layer.line(2,pathAt(()=>0),b.key==='strings'&&!prominent?base+'b4':base,radius*taper,alpha);
      if (b.key==='piano'){
        for(let i=-2;i<=2;i++)layer.line(3,pathAt(x=>i*.69*(1-.60*clamp((x-n1)/(n2-n1)))),
          i%2===0?light+'b0':base,.58,alpha);
      } else {
        const period=b.key==='bass'?12.4:b.key==='strings'?9.8:6.5;
        for(const phase of [0,Math.PI]) layer.line(3,pathAt(x=>
          Math.sin((x-n1)*tau/period+phase)*radius*.24-.35),phase?base:light+(b.key==='strings'&&!prominent?'61':'95'),b.key==='bass'?1.16:.83,alpha);
      }
      if (!loose && b.key!=='vocals') {
        const step=b.key==='strings'?12.3:b.key==='piano'?8.2:b.key==='bass'?14:6.2;
        const origin=n1+.5+(pitch%6)*.3;
        for(let xx=origin+Math.max(0,Math.ceil((lo-origin)/step))*step;xx<hi;xx+=step){
          const y=trace(b,note,xx), shift=b.key==='guitar'?2.3:1;
          layer.line(4,[[xx-shift,y-radius*.47],[xx+shift,y+radius*.49]],dark+'dd',.86,alpha);
          layer.line(5,[[xx-shift-.45,y-radius*.41],[xx+shift-.45,y+radius*.46]],light+'83',.56,alpha);
        }
      }
    }
  }
  function drum(b,event) {
    const x=xAt(event.start),[a,z]=bandEnds(b);
    if(x<a || x>z || event.start>duration)return;
    const future=x>needleX, y=projectedPitch(b,event,x), scale=clamp((event.velocity||65)/100)*.7+.7;
    const [col,lit,dark]=b.colors.silk;
    if(future) {
      line(samples(-3,3,1,t=>[x+t*scale,y-2*Math.sin((t+3)*Math.PI/6)]),col+'bc',1.35);
      return;
    }
    if(event.pitch===36) {
      const radius=3.6*scale;
      oval(x+1,y+1.8,radius+1,radius*.67+1,'#261c29a0');
      line(samples(0,2.7*tau,.24,t=>[x+radius*Math.cos(t)*t/(2.7*tau),y+.64*radius*Math.sin(t)*t/(2.7*tau)]),dark,2.7);
      line(samples(0,2.7*tau,.24,t=>[x-.4+radius*Math.cos(t)*t/(2.7*tau),y-.45+.64*radius*Math.sin(t)*t/(2.7*tau)]),lit+'ca',1.25);
    } else if (event.pitch===38) {
      for(let i=-1;i<=1;i++){
        line([[x-3*scale+i,y-3*scale],[x+2*scale+i,y+2*scale]],dark,2.1);
        line([[x-3*scale+i,y-3*scale],[x+2*scale+i,y+2*scale]],col,1.05);
        line([[x-2*scale+i,y+3*scale],[x+3*scale+i,y-2*scale]],lit+'c4',1.02);
      }
    } else {
      for(let i=0;i<5;i++)line([[x-4*scale,y+1.6],[x+(3.5-i*.64)*scale,y+(i-2)*scale]],i%2?col:lit+'cc',.94);
    }
  }
  function vocalContour(b) {
    const contour=b.contour;
    if (!contour || contour.hop > .05) return;
    const [left, right] = bandEnds(b);
    const from=Math.max(0, Math.ceil((timeAt(left)-contour.start)/contour.hop));
    const to=Math.min(contour.midi.length-2, Math.floor((Math.min(duration,timeAt(right))-contour.start)/contour.hop)-1);
    const shadow=[], pressed=[], loose=[];
    let eventIndex=0;
    for(let i=from;i<=to;i++) {
      const ta=contour.start+i*contour.hop, tb=ta+contour.hop;
      const pa=contour.midi[i], pb=contour.midi[i+1];
      if(!Number.isFinite(pa)||!Number.isFinite(pb))continue;
      while (eventIndex < b.visible.length && b.visible[eventIndex].end < ta) eventIndex++;
      const note=b.visible[eventIndex];
      if (!note || note.start > ta || note.end < tb) continue;
      const a=xAt(ta),z=xAt(tb);
      const ya=projectedPitch(b,{pitch:pa,laneIndex:0},a), yb=projectedPitch(b,{pitch:pb,laneIndex:0},z);
      shadow.push([[a,ya+1],[z,yb+1]]);
      (a>needleX ? loose : pressed).push([[a,ya-looseLift(b,note,a)],[z,yb-looseLift(b,note,z)]]);
    }
    strokes(shadow,'#2818299e',2.35);
    strokes(pressed,'#ed9d80b6',1.49);
    strokes(loose,'#e895786b',1.49);
  }
  function hardware(active) {
    if (!bands.length) return;
    const needleRow=bands.map(b=>body(b,needleX).y);
    const railX=1488, topY=needleRow[0]-92, footY=needleRow.at(-1)+60;
    const steel = gradient(railX-9,0,railX+16,0,[[0,'#6d7876'],[.17,'#8b9284'],[.38,'#5b6869'],[.74,'#424c51'],[1,'#626970']]);
    const housing=gradient(needleX-13,0,needleX+42,0,[[0,'#878a79'],[.07,'#707e75'],[.33,'#505d5e'],[1,'#3a444a']]);
    const cap=gradient(0,topY,0,topY+35,[[0,'#69665b'],[1,'#383b3d']]);
    line([[railX+15,topY+32],[railX+24,footY+7]],'#18192137',14.9);
    for(const [y,size] of [[topY+8,.72],[footY,1]]) {
      poly([[railX-33*size,y+14],[railX+54*size,y+2],[railX+74*size,y+16],[railX-22*size,y+31]],'#534f4d','#8d806e9e');
      poly([[railX-22*size,y+31],[railX+74*size,y+16],[railX+74*size,y+22],[railX-22*size,y+38]],'#2c2831');
      for(const x of [railX-18*size,railX+48*size]) oval(x,y+20-x*.004,4*size,2.15*size,'#2d2b2e','#9e8e77');
      poly([[railX+6,y-26],[railX+25*size,y-32],[railX+59*size,y+12],[railX+13,y+19]],'#465053','#8a81757d');
      poly([[railX-11,y-35],[railX+5,y-43],[railX+17,y+19],[railX-11,y+25]],steel,'#9a8d789a');
    }
    poly([[railX-8,topY],[railX+7,topY-9],[railX+15,footY-24],[railX-7,footY-13]],steel,'#8c806350');
    poly([[railX+7,topY-9],[railX+14,topY-1],[railX+22,footY-17],[railX+15,footY-24]],'#414b51','#6b6a62');
    line([[railX-5,topY+5],[railX-4,footY-17]],'#c5b99c80',1.30);
    for(let j=0;j<bands.length;j++) {
      const b=bands[j], y=needleRow[j], armY=y-armClearance, x=needleX;
      const held=active.filter(n=>n.b===b).sort((a,b)=>a.y-b.y);
      const endY=armY-13-j*.27;
      poly([[x+19,armY+5],[railX-2,endY+1],[railX+4,endY+4],[x+27,armY+10]],'#65706a','#a79c8563');
      poly([[x+27,armY+10],[railX+4,endY+4],[railX+4,endY+10],[x+27,armY+16]],'#3c4649');
      line([[x+37,armY+5],[x+65,armY-10],[railX-8,endY-9],[railX+1,endY+4]],'#505b5e',3.3);
      line([[x+39,armY+3],[x+65,armY-11],[railX-10,endY-10]],'#a49c7d8c',1.15);
      poly([[x-13,armY-2],[x+34,armY-6],[x+44,armY+3],[x-5,armY+8]],cap,'#96907a');
      poly([[x-5,armY+8],[x+44,armY+3],[x+44,armY+18],[x-5,armY+23]],housing,'#b6a4897c');
      poly([[x-13,armY-2],[x-5,armY+8],[x-5,armY+23],[x-13,armY+15]],'#5d6968','#a99f83');
      poly([[x+9,armY+10],[x+35,armY+7],[x+35,armY+15],[x+9,armY+18]],'#30393c','#b0a48a61');
      for(let kk=0;kk<6;kk++) {
        const kx=x+12+kk*3.6, y0=armY+11-kk*.35;
        line([[kx,y0],[kx,y0+4]],'#181c239e',1.5);
        line([[kx+.68,y0],[kx+.68,y0+4]],'#a49a817e',.66);
      }
      oval(railX,endY+5,3.5,3,'#363644','#a498798e');
      oval(x-6,armY+8,3,2.6,'#393833','#a2987f9e');
      for(let k=0;k<Math.max(1,held.length);k++) {
        const item=held[k], tip=item?.y ?? y;
        const slack=item?0:7;
        const sx=x-7-k*.82, sy=Math.min(tip-8,armY+20);
        // Each fork is connected to the feed head, and its needle terminates at the exact cloth strike.
        line([[x+4,armY+13],[sx+4,sy-3],[sx,sy]],'#302a2b',4.8);
        line([[x+5,armY+11],[sx+4,sy-5],[sx,sy-1]],'#ac987d',1.55);
        if(item)oval(x,tip,3.25,1.87,'#34231fea','#e5b08f9e');
        line([[sx,sy],[x,tip-slack]],'#2f282a',3.25);
        line([[sx+.45,sy-.4],[x+.29,tip-slack]],item?'#e5c6a0':'#9f9987',1.44);
        oval(sx,sy,2.6,2.1,'#4c4a44','#b7a98b94');
        if(item && b.key==='strings' && item.length>=1.8) {
          line([[sx+1.1,sy],[x+.2,tip]],'#f9d5ad',1.7);
          oval(x,tip,1.45,1.27,'#f0ba7c');
        }
      }
    }
    poly([[railX-8,topY-1],[railX+7,topY-9],[railX+15,topY-1],[railX+3,topY+8]],'#7b786b','#9a8b7094');
    for(const y of [topY+12,footY-12]) {
      const x=railX-1;
      oval(x,y,3.3,2.8,'#2c2d30','#a0947b');
      line([[x-2,y+1],[x+2,y-1]],'#ab9679',1);
    }
  }
  function foregroundObjects() {
    // Small off-axis tools anchor scale and keep all three cloth stations clear.
    c.save();c.translate(1591,916);c.rotate(-.19);
    oval(0,7,99,21,'#20172265');
    poly([[-67,-8],[63,-11],[81,5],[-58,12]],gradient(0,-11,0,13,[[0,'#9d7960'],[.6,'#765a48'],[1,'#4f3934']]),'#aa8a627c');
    for(let i=-58;i<72;i+=6) line([[i,2],[i,7-(i%12?1:2)]],'#302426b6',.71);
    line([[-72,-3],[44,-4]],'#d5b0895b',.8);
    c.restore();
    ringSpool(1741,929,15,32,(bands[2]?.colors || materials.strings).silk,.12);
    ringSpool(1777,919,11,23,(bands[3]?.colors || materials.guitar).silk,-.12);
    line(samples(0,118,2,t=>[1778+t*.6+11*Math.sin(t/17),926+t*.23+13*Math.sin(t/16)]),'#bf927173',1);
    c.save();c.translate(445,1001);c.rotate(-.071);
    line([[-108,6],[79,5]],'#20192484',5.4);
    rod(-107,0,187,5);
    for(const x of [-99,-57,-15,27,69])line([[x,0],[x,5]],'#392a29ad',.8);
    c.restore();
  }
  function grain() {
    if (!grainTile) {
      const tile=canvas(233,229,c), texture=tile.getContext('2d');
      const data=texture.createImageData(tile.width,tile.height);
      for(let y=0;y<tile.height;y++)for(let x=0;x<tile.width;x++){
        const value=hash(x,y), i=(y*tile.width+x)*4;
        data.data[i]=data.data[i+1]=data.data[i+2]=value<.47?13:237;
        data.data[i+3]=Math.round(Math.abs(value-.5)*43);
      }
      texture.putImageData(data,0,0);
      grainTile = tile;
    }
    if (!grainPatterns.has(c)) grainPatterns.set(c,c.createPattern(grainTile,'repeat'));
    const pattern=grainPatterns.get(c);
    if (pattern) {
      c.fillStyle=pattern;
      c.fillRect(-layout.x/layout.sx,-layout.y/layout.sy,frame.w/layout.sx,frame.h/layout.sy);
    }
  }
  function clock(time) {
    const cs=Math.round(time*100);
    return Math.floor(cs/6000)+':'+String(Math.floor(cs/100)%60).padStart(2,'0')+'.'+String(cs%100).padStart(2,'0');
  }
  const hidden = new Set(Array.isArray(frame.hidden) ? frame.hidden : []);
  const shown = (band, note) => !hidden.has(band.key) && !hidden.has(band.group) && (!note || (!hidden.has(note.group) && !hidden.has(note.lane)));
  const focused = (band, note) => !frame.focusGroup || frame.focusGroup === band.key || frame.focusGroup === band.group ||
    frame.focusGroup === note?.group || frame.focusGroup === note?.lane;
  const progress = note => note.percussive ? Number(time >= note.start) : clamp((time - note.start) / note.length);
  const active = bands.flatMap(b => b.visible.filter(note => shown(b,note) && (note.percussive
    ? Math.abs(time-note.start) <= .0001 : note.start <= time && time < Math.min(note.end,duration))).map(note => ({
    ...note, b, y: note.percussive ? projectedPitch(b,note,needleX) : trace(b,note,needleX), progress: progress(note)
  })));
  const strike = bands.flatMap(b => b.visible.filter(note => shown(b,note) && note.percussive &&
    note.start <= time && time - note.start < .045).map(note => ({...note, b, y: projectedPitch(b,note,needleX)})));
  const hitNotes = bands.flatMap(b => b.visible.filter(note => shown(b,note)).map(note => {
    const x0 = xAt(note.start), x1 = xAt(note.end);
    const x = Math.max(b.a,Math.min(b.z,x0)), y = note.percussive
      ? projectedPitch(b,note,x) : trace(b,note,x)-looseLift(b,note,x);
    return { b, note, x0, x1, projected: { ...note, time: note.start,
      x0: projectX(x0), x1: projectX(x1), y: projectY(y), progress: progress(note),
      wovenThrough: time < note.start ? null : Math.min(note.end,time,duration),
      stage: x0 > needleX ? 'loose' : x1 > needleX ? 'at-needle' : x1 > b.joint ? 'strip' : 'flag' } };
  }));
  const windowLeft = Math.min(left,...bands.map(b => b.a));
  const windowRight = Math.max(right,...bands.map(b => b.z));
  const start = timeAt(windowLeft), end = timeAt(windowRight);
  const detail = { time, left: projectX(windowLeft), right: projectX(windowRight), top: projectY(195), bottom: projectY(951),
    playheadX: projectX(needleX), pxPerSecond: pps * layout.sx, start, end, span: end-start,
    notes: hitNotes.map(({projected}) => projected),
    active: active.map(({b,y,...note}) => ({...note, x: projectX(needleX), y: projectY(y), headY: projectY(body(b,needleX).y-armClearance)})),
    bands: bands.map(b => ({ key: b.key, basis: b.source.basis, jointX: projectX(b.joint),
      stations: [921,needleX,1620].map(x => ({ x: projectX(x), y: projectY(body(b,x).y),
        time: timeAt(x), dB: level(b,x).dB, activity: level(b,x).activity, width: 2*body(b,x).half*layout.sy })) })) };
  const adjacentTime = (x,y) => {
    if (x < detail.left || x > detail.right || y < detail.top || y > detail.bottom) return null;
    const at = timeAt((x-layout.x)/layout.sx);
    return at >= 0 && at <= duration ? at : null;
  };
  const nearestNote = (x,y) => {
    if (adjacentTime(x,y) === null) return null;
    const localX = (x-layout.x)/layout.sx, localY = (y-layout.y)/layout.sy;
    let closest = null, distance = Math.max(6,3/layout.sy);
    for (const {b,note,x0,x1,projected} of hitNotes) {
      const lo = Math.max(b.a,x0), hi = Math.min(b.z,x1,xAt(duration));
      const at = Math.max(lo,Math.min(hi,localX));
      const targetY = note.percussive ? projectedPitch(b,note,at) : trace(b,note,at)-looseLift(b,note,at);
      const d = Math.hypot((at-localX)*layout.sx/layout.sy,targetY-localY);
      if (d < distance) { distance = d; closest = projected; }
    }
    return closest;
  };
  const scene = { detail, adjacentTime, nearestNote };
  scenes.set(frame,scene);
  if (!output) return scene;

  c.save();
  try {
    const backgroundKey = bands.map(b => b.key).join(',');
    if (!backdrops.has(backgroundKey)) {
      const surface = canvas(W,H,c);
      c = surface.getContext('2d');
      paintAtmosphere();
      table();
      furnitureBack();
      c = output;
      if (backdrops.size >= 5) backdrops.delete(backdrops.keys().next().value);
      backdrops.set(backgroundKey,surface);
    }
    const backdrop=backdrops.get(backgroundKey);
    c.fillStyle='#16181d';
    c.fillRect(0,0,frame.w,frame.h);
    if (layout.y > 1) {
      c.drawImage(backdrop,0,0,W,2,layout.x,0,W*layout.sx,layout.y+1);
      c.drawImage(backdrop,0,H-2,W,2,layout.x,layout.y+H*layout.sy-1,W*layout.sx,layout.y+2);
    }
    c.translate(layout.x,layout.y);
    c.scale(layout.sx,layout.sy);
    c.drawImage(backdrop,0,0);
    joiningGuides();
    for(let i=0;i<bands.length-1;i++)laceBetween(bands[i],bands[i+1]);
    for(const b of bands)cloth(b);
    flagHem();
    feed();
    for(const b of bands) {
      if (!shown(b)) continue;
      c.save();
      if (focused(b) && b.key==='vocals') vocalContour(b);
      const threads=stitchLayer();
      const longThreads=stitchLayer();
      for(const note of b.visible) {
        if (!shown(b,note)) continue;
        const alpha=focused(b,note) ? 1 : .35;
        if(note.percussive) {
          c.globalAlpha=alpha;
          drum(b,note);
        } else stitchNote(b,note,b.key==='strings'&&note.length>=1.8 ? longThreads : threads,alpha);
      }
      threads.paint();
      longThreads.paint();
      c.restore();
    }
    hardware([...active.filter(note => !note.percussive),...strike]);
    foregroundObjects();
    grain();
    const title = String(frame.song.track?.title || '');
    const english = frame.lang === 'en' || /^en-/i.test(frame.lang || '');
    const workshop = english ? 'Tour Flag / Workshop' : '巡演旗帜  /  工坊';
    if (layout.portrait) {
      // Set type in viewport pixels, independently of the steeper view of the workbench.
      c.scale(1/layout.sx,1/layout.sy);
      c.translate(-layout.x,-layout.y);
      const margin=frame.w*.055, header=Math.max(32,layout.y*.64), footer=frame.h-Math.max(21,layout.y*.50);
      label(title,margin,header,'26px SimSun, Songti SC, Georgia, serif','#eed5b8',frame.w-margin*2);
      label(workshop,margin,header+20,'12px "Microsoft YaHei UI", sans-serif','#cdb096',frame.w-margin*2);
      label(clock(time),margin,footer,'14px Consolas, monospace','#f0d0a7',84);
      if (frame.section) label(frame.section,margin+92,footer,'12px "Microsoft YaHei UI", sans-serif','#d7b697',frame.w-margin*2-92);
      if (frame.lyric) label(frame.lyric,margin,footer-22,'16px "Microsoft YaHei UI", sans-serif','#f0d0a7',frame.w-margin*2);
    } else {
      label(title,105,108,'60px SimSun, Songti SC, Georgia, serif','#eed5b8',1260);
      label(workshop,109,149,'20px "Microsoft YaHei UI", sans-serif','#cdb096',650);
      label(clock(time),105,1049,'25px Consolas, monospace','#f0d0a7',136);
      if (frame.section) label(frame.section,253,1049,'22px "Microsoft YaHei UI", sans-serif','#d7b697',380);
      if (frame.lyric) label(frame.lyric,frame.section ? 680 : 253,1049,'25px "Microsoft YaHei UI", sans-serif','#f0d0a7',1100);
    }
  } finally { output.restore(); }
  return scene;
  }

  const sceneFor = frame => scenes.get(frame) || render(null,frame);
  const api = Object.freeze({
    draw: (ctx,frame) => ({ detail: render(ctx,frame).detail }),
    inspect: frame => ({ detail: sceneFor(frame).detail }),
    timeAt: (x,y,frame) => sceneFor(frame).adjacentTime?.(x,y) ?? null,
    noteAt: (x,y,frame) => sceneFor(frame).nearestNote?.(x,y) ?? null,
    invalidate(song) { if (song) songs.delete(song); }
  });
  if (typeof module==='object' && module.exports) module.exports = api;
  else (globalThis.XinArt ||= {}).flag = api;
})();

