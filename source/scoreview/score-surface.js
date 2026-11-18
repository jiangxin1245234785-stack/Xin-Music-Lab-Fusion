// Material strokes consume the core's own prepared lanes, contours and geometry.
(function(root){'use strict';const styles=['paper','ember','water'];
// The core's drum kit: the page's XinScoreView, or the module under node.
const coreOf=()=>root.XinScoreView||(typeof require==='function'?require('./score-view.js'):null);
const kitOf=()=>coreOf().drumKit;
function create(target,model,clock,initial,layoutSource){
 let W=1920;
 const H=1080;
 let NEEDLE=672, PPS=120, unit=1.5, top=12, source=null;
 const make=()=>Object.assign(target.ownerDocument.createElement('canvas'),{width:W,height:H});
 const canvas=make(),ctx=canvas.getContext('2d'),hud=make(),backgrounds={};
 let emberInfo=null,waterInfo=null;
 let corePitchY=null,coreContourY=null;
 const contourIntervals=new WeakMap();
 let options=initial,NOW=0,events=[],geometry,cover=null,lyrics=null,last=null;
 const copyCanvas=()=>{const c=make();c.getContext('2d').drawImage(canvas,0,0);return c};
 function pitchY(box,pitch){return top+unit*corePitchY(box,pitch)}
 function contourY(box,pitch){return top+unit*coreContourY(box,pitch)}
 function clipLane(context,event){context.beginPath();context.rect(0,top+unit*event.box.top,W,unit*event.box.height);context.clip()}
// Preserve canonical recorded attacks independently of display simplification.
// Near-simultaneous unisons across model lanes collapse to one visible point;
// later repeated attacks in the same lane remain individually countable.
let attackCache=new WeakMap();
let attacks=[];
function attacksFor(box) {
  if(attackCache.has(box.lane))return attackCache.get(box.lane);
  const members=new Set(box.lane.members||[box.lane.id]);
  const rows=[];
  for(const lane of model.lanes||[]){
    if(!members.has(lane.id)||(options.hidden||[]).includes(lane.id))continue;
    for(const note of lane.notes||[]){
      if(!Number.isFinite(note[0])||!Number.isFinite(note[1])||note[1]<=0)continue;
      rows.push({start:note[0],end:note[0]+note[1],pitch:note[2],velocity:note[3]||80,lane:lane.id,markGroup:box.lane.id,group:box.lane.group});
    }
  }
  const canonical=root.XinScoreView.canonicalOnsets(rows);
  // A release plume is eligible only after a genuine group-wide sounding gap.
  let cluster=null;
  const close=nextStart=>{
    if(cluster&&nextStart-cluster.end>=.35&&cluster.end-cluster.start>.8){
      const ending=cluster.notes.filter(n=>Math.abs(n.end-cluster.end)<.035)
        .sort((a,b)=>b.velocity-a.velocity)[0];
      if(ending&&ending.velocity>=88)ending.smokeEligible=true;
    }
  };
  for(const note of canonical){
    if(!cluster||note.start>cluster.end+.035){close(note.start);cluster={start:note.start,end:note.end,notes:[note]};}
    else {cluster.end=Math.max(cluster.end,note.end);cluster.notes.push(note);}
  }
  close(Infinity);attackCache.set(box.lane,canonical);return canonical;
}
function mixAt(time) {
  return options.fxDynamics==='song'?source.view.swellAt(time):.5;
}
function noteStrength(velocity,time) {
  return (.62+.38*Math.max(0,Math.min(127,velocity||80))/127)*(.76+.48*mixAt(time));
}
function paperBounds(time) {
  const edge=Math.max(24*unit,(geometry?.side||16)*unit+20);
  const left=NEEDLE-.75*Math.max(1,NEEDLE-edge);
  const seconds=(NEEDLE-left)/PPS;
  const expectedHold=time-paperTimeAt(paperBeatAt(time)-1.75);
  return {left,seconds,hold:Math.min(expectedHold,seconds*.7)};
}

 function collect(at) {
  source=layoutSource();
  unit=source.unit; top=source.top;
  const data=source.view.materialFrame(at-(options.offsetSeconds||0),options.scoreStyle);
  const layout=source.view.layoutSnapshot();
  const width=Math.max(1,Math.round(Number.isFinite(layout.width)?layout.width*unit:(target.clientWidth||1280)*1080/(target.clientHeight||720)));
  if(W!==width){
    W=width; canvas.width=W; hud.width=W;
    for(const key of Object.keys(backgrounds))delete backgrounds[key];
    paperMask=null;
  }
  NOW=data.frame.time; NEEDLE=layout.needle*unit; PPS=layout.pixelsPerSecond*unit;
  geometry=data.geometry; corePitchY=data.yAt;coreContourY=data.contourYAt; events=[]; attacks=[];
  // Copy guides before painting onto the ordinary core's own canvas.
  const guide=hud.getContext('2d');
  guide.setTransform(1,0,0,1,0,0); guide.clearRect(0,0,W,H);
  guide.drawImage(source.canvas,0,top,source.canvas.width/source.canvas.height*(H-top-(options.presentationLayout?72:0)),H-top-(options.presentationLayout?72:0));
  const past=options.scoreStyle==='paper'?NOW-paperBounds(NOW).seconds:options.scoreStyle==='ember'?NOW-(NEEDLE-Math.min(NEEDLE*.15,Math.max(24,50*unit)))/PPS:NOW-waterHistory().seconds;
  const future=NOW+(W-NEEDLE)/PPS;
  for(const box of geometry.lanes){
    if(box.lane.kind==='drums'){
      const set=box.lane.hits;
      for(let i=0;i<set.count;i++){
        const t=set.time[i];if(t<past||t>future)continue;
        const row=box.lane.rowIndex.get(set.row[i]);if(!Number.isFinite(row))continue;
        const drum=box.lane.rows[row].name,kit=kitOf();
        events.push({group:'drums',drum,start:t,end:t+.03,velocity:set.vel[i],x:NEEDLE+(t-NOW)*PPS,y:top+unit*(box.top+box.height*kit.center(drum)),size:unit*kit.size(box.height,set.vel[i]),room:set.kitGap?set.kitGap[i]*PPS/2:Infinity,box});
      }
    } else {
      for(const attack of attacksFor(box)){
        if(attack.end<past||attack.start>future)continue;
        attacks.push({...attack,box,x:NEEDLE+(attack.start-NOW)*PPS,y:pitchY(box,attack.pitch)});
      }
      for(const part of data.parts(box)){
      const set=part.set;
      if(part.contour&&options.showContour&&part.voice!=='meteor'){
        // Vocal curves are continuous measured samples, not the quantised MIDI
        // cuts underneath. Held instruments retain the core's sounding spans.
        let spans=part.contourSpans||contourIntervals.get(part.contour);
        if(!spans){
          spans=[];const curve=part.contour,origin=curve.start||0;let start=null;
          for(let i=1;i<curve.midi.length;i++){
            const valid=Number.isFinite(curve.midi[i-1])&&Number.isFinite(curve.midi[i]);
            if(valid&&start===null)start=origin+(i-1)*curve.hop;
            if(start!==null&&(!valid||i===curve.midi.length-1)){
              spans.push([start,origin+(valid?i:i-1)*curve.hop]);start=null;
            }
          }
          contourIntervals.set(part.contour,spans);
        }
        for(const [start,end] of spans){
          if(end<past||start>future)continue;
          const pitch=set.pitch[0]||60;
          events.push({group:box.lane.group,voice:part.voice,start,end,velocity:set.vel[0]||80,pitch,
            x:NEEDLE+(start-NOW)*PPS,x2:NEEDLE+(end-NOW)*PPS,y:pitchY(box,pitch),part,box});
        }
        continue;
      }
      for(let i=0;i<set.count;i++){
        const t=set.start[i],end=t+set.dur[i];if(end<past||t>future)continue;
        events.push({group:box.lane.group,voice:part.voice,start:t,end,velocity:set.vel[i],pitch:set.pitch[i],x:NEEDLE+(t-NOW)*PPS,x2:NEEDLE+(end-NOW)*PPS,y:pitchY(box,set.pitch[i]),part:options.showContour?part:{...part,contour:null},box});
      }
    }
  }
    }
  return {frame:{...data.frame,layout},data};
 }
 const stamp=t=>`${Math.floor(t/60)}:${(t%60).toFixed(2).padStart(5,'0')}`;
 function fit(s,max){s=String(s||'');while(s&&ctx.measureText(s).width>max)s=s.slice(0,-2)+'…';return s}
 function drawHud(mode, data) {
  const guide=hud.getContext('2d');
  guide.globalCompositeOperation='source-in';
  guide.fillStyle=mode==='paper'?'#505b5d':mode==='water'?'#9cabb5':'#aaa9a2';
  guide.fillRect(0,0,W,H);guide.globalCompositeOperation='source-over';
  ctx.drawImage(hud,0,0);
  data?.paintLabels?.(ctx,unit,top);
  last=options.presentationLayout
    ? root.XinScorePresentation.drawFooter(ctx,model,options,lyrics,cover,NOW,W,H,mode)
    : {section:'',lyric:''};
 }

 function random(seed){let v=seed>>>0;return()=>{v^=v<<13;v^=v>>>17;v^=v<<5;return(v>>>0)/4294967296}}
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),smooth=v=>{v=clamp(v,0,1);return v*v*(3-2*v)};
 function ageAlpha(e){const release=Math.max(0,NOW-e.end);return smooth((Math.min(e.x2??e.x,NEEDLE)-(NEEDLE*.4))/(NEEDLE*.6))*(1-smooth(release/3.36))}
 function spatial(x){return smooth((x-(NEEDLE*.4))/(NEEDLE*.6))}
 function pastInk(c,rgb,alpha){const g=c.createLinearGradient((NEEDLE*.4),0,NEEDLE,0);g.addColorStop(0,'rgba('+rgb+',0)');g.addColorStop(.38,'rgba('+rgb+','+alpha*.28+')');g.addColorStop(1,'rgba('+rgb+','+alpha+')');return g}
 function eventSeed(e){return Math.round(e.start*10000)^Math.round(e.y*113)^e.velocity*223}
 function ordinate(e,x){const co=e.part?.contour;if(!co?.midi?.length)return e.y;const t=NOW+(x-NEEDLE)/PPS,at=(t-(co.start||0))/co.hop,i=Math.floor(at),a=co.midi[i],b=co.midi[i+1];return Number.isFinite(a)&&Number.isFinite(b)?contourY(e.box,a+(b-a)*(at-i)):e.y}
 function trace(c,e,left,right,offset=0,wave=0){c.beginPath();const seed=eventSeed(e)%317;c.moveTo(left,ordinate(e,left)+offset);for(let x=left+2;x<right;x+=2)c.lineTo(x,ordinate(e,x)+offset+wave*Math.sin(x*.041+seed)*Math.sin((x-left)/(right-left)*Math.PI));c.lineTo(right,ordinate(e,right)+offset)}
 function ribbon(c,e,left,right,offset,width,wave){const points=[],seed=eventSeed(e)%317;for(let x=left;x<=right;x+=2){const t=(x-left)/(right-left),envelope=Math.sin(Math.PI*t)**.6,y=ordinate(e,x)+offset+wave*Math.sin(x*.041+seed)*Math.sin(t*Math.PI);points.push([x,y,width*.5*envelope])}points.push([right,ordinate(e,right)+offset,0]);c.beginPath();for(let i=0;i<points.length;i++){const [x,y,w]=points[i];if(i)c.lineTo(x,y-w);else c.moveTo(x,y-w)}for(let i=points.length-1;i>=0;i--){const [x,y,w]=points[i];c.lineTo(x,y+w)}c.closePath();c.fill()}
 function grain(c,amplitude,seed){const d=c.getImageData(0,0,W,H),r=random(seed);for(let i=0;i<d.data.length;i+=4){const n=(r()-.5)*amplitude;d.data[i]=clamp(d.data[i]+n,0,255);d.data[i+1]=clamp(d.data[i+1]+n,0,255);d.data[i+2]=clamp(d.data[i+2]+n,0,255)}c.putImageData(d,0,0)}
 function played(e){if(e.start>NOW)return null;const left=Math.max((NEEDLE*.4),e.x),right=Math.min(NEEDLE,e.x2??e.x);return right>left?{left,right,a:ageAlpha(e),held:e.voice==='bow'||e.voice==='wind'}:null}
 function future(e,mode){
  if(e.group==='drums'||e.end<=NOW)return;
  const x=Math.max(NEEDLE,e.x),end=Math.min(W-16,e.x2);if(end<=x)return;
  const color=mode==='paper'?'75,85,87':mode==='cloth'?'160,148,169':'150,158,160';ctx.strokeStyle='rgba('+color+','+(mode==='paper'?.61:.64)+')';ctx.lineWidth=e.voice==='bow'||e.voice==='wind'?1.6:1.3;trace(ctx,e,x,end);ctx.stroke();
  if(e.x>=NEEDLE){ctx.fillStyle='rgba('+color+',.86)';ctx.beginPath();ctx.ellipse(x,e.y,2.2,1.3,0,0,Math.PI*2);ctx.fill();}
 }
 function smallMark(c,e,mode){
  const age=NOW-e.start,past=age>=0;if(past&&age>1.5)return;const a=past?(1-age/1.5)*.8:.52,x=e.x,y=e.y;
  if(mode==='paper'){
   c.fillStyle='rgba(74,85,85,'+a*.65+')';c.beginPath();c.ellipse(x,y,2.4,e.drum==='kick'?1:2,0,0,Math.PI*2);c.fill();c.strokeStyle='rgba(239,240,232,'+a*.75+')';c.lineWidth=.8;c.beginPath();c.ellipse(x+.2,y+.8,2.7,1.8,0,.05,Math.PI);c.stroke();
  }else if(mode==='cloth'){
   c.strokeStyle='rgba(9,9,14,'+a+')';c.lineWidth=3;c.beginPath();c.moveTo(x-2,y);c.lineTo(x+2,y);c.stroke();c.strokeStyle='rgba(144,132,153,'+a*.8+')';c.lineWidth=1;c.beginPath();c.ellipse(x,y,1.7,1.1,.5,0,Math.PI*2);c.stroke();c.beginPath();c.moveTo(x-1.3,y-1);c.lineTo(x+1.3,y+1);c.stroke();
  }else{
   c.fillStyle='rgba(8,11,11,'+a+')';c.beginPath();c.ellipse(x,y,3,2,0,0,Math.PI*2);c.fill();c.fillStyle=past?'rgba(128,62,48,'+a*.85+')':'rgba(146,153,152,.6)';c.beginPath();c.ellipse(x,y,1.2,1.1,0,0,Math.PI*2);c.fill();
  }
 }
// Each note is traced once into a shared ink mask. Age changes opacity only,
// so both sides of the needle retain exactly the same graphite edge.
let paperGrid = null;
let paperMask = null;
let paperInfo = null;

function paperTimeline() {
  if (paperGrid?.model === model) return paperGrid;
  const beats = [...new Set((model.bars?.beats || []).filter(Number.isFinite))]
    .sort((a, b) => a - b);
  const bpm = Number(model.bars?.bpm);
  const validTempo = bpm >= 40 && bpm <= 240;
  paperGrid = {
    model,
    beats,
    step: 60 / (validTempo ? bpm : 120),
    source: beats.length >= 2 ? 'beats' : validTempo ? 'bpm' : 'seconds-120bpm'
  };
  return paperGrid;
}

function paperBeatAt(time) {
  const timeline = paperTimeline();
  const beats = timeline.beats;
  if (beats.length < 2) return time / timeline.step;
  let low = 0;
  let high = beats.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (beats[middle] <= time) low = middle + 1;
    else high = middle;
  }
  const index = clamp(low - 1, 0, beats.length - 2);
  return index + (time - beats[index]) / (beats[index + 1] - beats[index]);
}

function paperTimeAt(beat) {
  const timeline = paperTimeline();
  const beats = timeline.beats;
  if (beats.length < 2) return beat * timeline.step;
  const index = clamp(Math.floor(beat), 0, beats.length - 2);
  return beats[index] + (beat - index) * (beats[index + 1] - beats[index]);
}

function paperPastLimit(time) {
  return paperTimeAt(paperBeatAt(time) - 3.5);
}

function paperTrace(ink,event,left,right) {
  ink.beginPath();let penDown=false;
  for(const point of traceVertices(event,left,right)){
    if(!point){penDown=false;continue;}
    if(penDown)ink.lineTo(point[0],point[1]);
    else {ink.moveTo(point[0],point[1]);penDown=true;}
  }
}

// Real repeated onsets survive simplification of the displayed sounding spans.
// Group by pitch as well as lane: simultaneous chord tones must keep their own ink.
function materialAttacks() {
  const byLane=new Map();
  for(const attack of attacks){
    if(!['guitar','piano','bass'].includes(attack.group))continue;
    let pitches=byLane.get(attack.box.lane);
    if(!pitches){pitches=new Map();byLane.set(attack.box.lane,pitches);}
    let notes=pitches.get(attack.pitch);
    if(!notes){notes=[];pitches.set(attack.pitch,notes);}
    const previous=notes[notes.length-1];
    notes.push({...attack,repeated:!!previous&&attack.start>previous.start+.001&&attack.start-previous.end<=.12});
  }
  return byLane;
}

function paperNoteTrace(ink,event,left,right,notes) {
  let cursor=left;
  // A narrow dry break immediately before a real re-pluck, then its own ink
  // touch. Split this note only; erasing the shared mask would eat chord tones.
  for(const note of notes){
    if(!note.repeated||note.start<event.start-.001||note.start>event.end+.001)continue;
    const edge=note.x-1.8;
    if(edge>cursor){paperTrace(ink,event,cursor,Math.min(right,edge));ink.stroke();}
    cursor=Math.max(cursor,note.x+.65);
    if(cursor>=right)return;
  }
  if(right>cursor){paperTrace(ink,event,cursor,right);ink.stroke();}
}

function paper(data, paintVariation) {
  if (!backgrounds.paper) {
    const texture=make();
    const ctx=texture.getContext('2d',{willReadFrequently:true});
    const paperShade = ctx.createLinearGradient(0, 0, W, H);
    paperShade.addColorStop(0, '#e2e2d8');
    paperShade.addColorStop(.5, '#dfe0d5');
    paperShade.addColorStop(1, '#d9dcd0');
    ctx.fillStyle = paperShade;
    ctx.fillRect(0, 0, W, H);
    grain(ctx, .9, 7528);
    const sample = random(4241);
    for (let index = 0; index < 6000; index++) {
      const x = sample() * W;
      const y = sample() * H;
      const length = .6 + sample() * 3.5;
      const nearEdge = x < 220 || x > 1800 || y < 125 || y > 980;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + length, y + (sample() - .5) * 1.2);
      ctx.strokeStyle = index % 3
        ? 'rgba(91,102,88,' + (nearEdge ? .025 : .008) + ')'
        : 'rgba(251,252,238,' + (nearEdge ? .055 : .014) + ')';
      ctx.lineWidth = .35;
      ctx.stroke();
    }
    backgrounds.paper = texture;
  }
  ctx.drawImage(backgrounds.paper,0,0);

  if (!paperMask) paperMask = make();
  const ink = paperMask.getContext('2d');
  ink.setTransform(1, 0, 0, 1, 0, 0);
  ink.clearRect(0, 0, W, H);
  ink.globalCompositeOperation = 'source-over';
  ink.globalAlpha = 1;
  ink.strokeStyle = '#4e5551';
  ink.fillStyle = '#4e5551';
  ink.lineWidth = 1.55;
  ink.lineCap = 'butt';
  ink.lineJoin = 'round';
  ink.shadowBlur = 0;

  const nowBeat = paperBeatAt(NOW);
  const bounds=paperBounds(NOW);
  const since=NOW-bounds.seconds;
  const leftEdge=bounds.left;
  const onsetMap=materialAttacks();
  const touched=[];
  const touchedSet=new Set();
  for (const event of events) {
    if (event.group === 'drums') {
      if (event.x >= (NEEDLE*.15625) && event.x < W - 16 && event.start >= since) {
        ink.beginPath();
        kitOf().mark(ink, event.drum, event.x, event.y, event.size, event.room);
        ink.fill();
      }
      continue;
    }
    const left = Math.max(leftEdge, event.x);
    const right = Math.min(W - 16, event.x2);
    if (right <= left) continue;
    ink.save();clipLane(ink,event);
    const notes=!event.part?.contour?onsetMap.get(event.box.lane)?.get(event.pitch)||[]:[];
    paperNoteTrace(ink,event,left,right,notes);
    for(const note of notes){
      if(note.x>=leftEdge&&note.x<W-16&&note.start>=event.start-.001&&note.start<event.end-.001&&!touchedSet.has(note)){
        touched.push(note);touchedSet.add(note);
      }
    }
    ink.restore();
  }

  for(const note of touched){
    ink.save();clipLane(ink,note);
    // A small pressure touch, not a notehead symbol or periodic seam.
    ink.beginPath();ink.ellipse(note.x+.85,note.y,note.repeated?1.5:1.25,note.repeated?1.03:.88,-.18,0,Math.PI*2);ink.fill();
    ink.restore();
  }

  // Fresh ink holds for 1.75 beats; older graphite stays legible across 75% of the available history.
  // One colour pass over the union avoids doubled edges at the needle.
  const colour=ink.createLinearGradient(0,0,W,0);
  const stops=new Set([0,bounds.left,NEEDLE,W]);
  for(let i=0;i<=32;i++)stops.add(bounds.left+(NEEDLE-bounds.left)*i/32);
  for(const x of [...stops].sort((a,b)=>a-b)){
    const age=Math.max(0,(NEEDLE-x)/PPS);
    const progress=Math.max(0,(age-bounds.hold)/Math.max(.01,bounds.seconds-bounds.hold));
    const alpha=x<bounds.left?0:.84*(1-Math.min(1,progress)**2.6);
    colour.addColorStop(x/W,'rgba(78,85,81,'+alpha+')');
  }
  ink.globalCompositeOperation = 'source-in';
  ink.fillStyle = colour;
  ink.fillRect(0, 0, W, H);
  ink.globalCompositeOperation = 'source-over';
  const variation = paintVariation?.(ctx, {time:NOW,width:W,height:H,needle:NEEDLE,pixelsPerSecond:PPS,
    geometry,parts:data.parts,yAt:data.yAt,contourYAt:data.contourYAt,unit,top,left:leftEdge,right:W-16});
  ctx.drawImage(paperMask, 0, 0);
  paperInfo = {
    lineWidth: 1.55,
    layers: 1,
    holdBeats: 1.75,
    fadeToFraction:.75,
    source: paperTimeline().source,
    retentionSeconds: NOW - since,
    onsetTouches:touched.length,
    repeatedTouches:touched.filter(note=>note.repeated).length
  };
  drawHud('paper');
  return variation;
}

 function ember(data){
  if(!backgrounds.ember){
  const texture=make(),ctx=texture.getContext('2d',{willReadFrequently:true});
  const g=ctx.createLinearGradient(0,0,W,H);g.addColorStop(0,'#292a28');g.addColorStop(.5,'#202321');g.addColorStop(1,'#171c1d');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);grain(ctx,9,43874);const r=random(4007);
  for(let i=0;i<21000;i++){
   const x=r()*W,y=r()*H,rad=.3+Math.pow(r(),3)*3;ctx.beginPath();ctx.ellipse(x,y,rad*(.8+r()*.8),rad*.58,r()*3,0,Math.PI*2);ctx.fillStyle=i%4?'rgba(6,12,13,.11)':'rgba(161,159,145,.075)';ctx.fill();
  }
  for(let i=0;i<190;i++){const x=r()*W,y=r()*H,len=12+r()*65;ctx.beginPath();ctx.moveTo(x,y);for(let j=1;j<5;j++)ctx.lineTo(x+len*j/4,y+(r()-.5)*2.5);ctx.lineWidth=.5;ctx.strokeStyle='rgba(1,7,9,.18)';ctx.stroke()}
  backgrounds.ember=texture;}
  ctx.drawImage(backgrounds.ember,0,0);
  // Fire and charcoal deliberately use separate clocks. Flames cool locally in
  // under a beat; a continuous pitched coal trace remains readable farther left.
  const inkLeft=Math.min(NEEDLE*.15,Math.max(24,50*unit));
  const span=NEEDLE-inkLeft;
  const charcoal=ctx.createLinearGradient(NEEDLE,0,inkLeft,0);
  const coalLife=span/PPS;
  // Heat belongs to each traversed point, not to the duration of its note.
  // The orange route lasts only a narrow band; most history is dark red coal.
  charcoal.addColorStop(0,'rgba(235,151,79,.85)');
  charcoal.addColorStop(Math.min(.13,.32/coalLife),'rgba(172,68,36,.65)');
  charcoal.addColorStop(Math.min(.30,.85/coalLife),'rgba(139,56,37,.60)');
  charcoal.addColorStop(.60,'rgba(119,48,37,.50)');
  charcoal.addColorStop(.84,'rgba(91,39,33,.28)');
  charcoal.addColorStop(1,'rgba(62,30,28,0)');
  // Sustains carbonise point by point. Only canonical original attacks ignite.
  for(const event of events){
    if(event.group==='drums'){
      const age=NOW-event.start;
      if(age>=0&&age<.26){
        ctx.fillStyle='rgba(208,140,85,'+(.8*(1-age/.26))+')';
        ctx.beginPath();kitOf().mark(ctx,event.drum,event.x,event.y,event.size*1.1,event.room);ctx.fill();
      } else if(age<0){ctx.fillStyle='rgba(146,153,152,.58)';ctx.beginPath();kitOf().mark(ctx,event.drum,event.x,event.y,event.size,event.room);ctx.fill();}
      continue;
    }
    ctx.save();clipLane(ctx,event);
    const futureLeft=Math.max(NEEDLE,event.x),futureRight=Math.min(W-16,event.x2);
    if(futureRight>futureLeft){
      surfacePath(event,futureLeft,futureRight);
      ctx.strokeStyle='rgba(158,167,167,.63)';ctx.lineWidth=1.35;ctx.stroke();
    }
    const pastLeft=Math.max(inkLeft,event.x),pastRight=Math.min(NEEDLE,event.x2);
    if(pastRight>pastLeft){
      surfacePath(event,pastLeft,pastRight);
      ctx.strokeStyle=charcoal;ctx.lineWidth=event.voice==='bow'||event.voice==='wind'?1.85:1.6;ctx.stroke();
    }
    ctx.restore();
  }
  let burning=0,smoke=0;
  for(const attack of attacks){
    const age=NOW-attack.start,x=attack.x,y=attack.y;
    if(x<inkLeft||x>W-12)continue;
    const strength=noteStrength(attack.velocity,attack.start);
    ctx.save();clipLane(ctx,attack);
    if(age<0){
      ctx.fillStyle=age>-.12?'rgba(132,111,94,.52)':'rgba(113,135,145,.48)';
      ctx.beginPath();ctx.ellipse(x,y,2.5,1.8,0,0,Math.PI*2);ctx.fill();
    } else {
      const heat=Math.exp(-age/.20)*Math.max(0,1-age/.48);
      const visibility=smooth((x-inkLeft)/Math.max(20,span*.25));
      const seed=eventSeed(attack),variation=random(seed)();
      const amplitude=(17+26*variation)*strength;
      const height=Math.min(amplitude*heat,Math.max(8,y-(top+unit*attack.box.top)+3));
      const bend=(variation-.5)*14+Math.sin(age*7+variation*9)*2;
      if(heat>.025){
        ctx.beginPath();ctx.moveTo(x-4,y+1.4);
        ctx.bezierCurveTo(x-7,y-height*.16,x+bend+5,y-height*.74,x+bend,y-height);
        ctx.bezierCurveTo(x+bend+3,y-height*.43,x+5,y-height*.1,x+4,y+1.4);
        ctx.closePath();ctx.fillStyle='rgba(188,82,39,'+Math.min(.95,heat*visibility*strength)+')';ctx.fill();
        ctx.beginPath();ctx.moveTo(x-1.7,y);
        ctx.quadraticCurveTo(x+bend*.45,y-height*.7,x+1.8,y);
        ctx.fillStyle='rgba(252,190,111,'+Math.min(.95,heat*visibility*strength)+')';ctx.fill();burning++;
      }
      const coalFade=1-smooth(age/coalLife);
      const hotspot=variation>.78&&age>.45?Math.exp(-(age-.45)/1.25)*.22:0;
      ctx.fillStyle='rgba('+(heat>.12?'223,116,52,':hotspot>.025?'157,57,35,':'104,37,29,')+visibility*coalFade*(.38+.4*heat+hotspot)+')';
      ctx.beginPath();ctx.ellipse(x,y,2.1,1.4,0,0,Math.PI*2);ctx.fill();
    }
    const released=NOW-attack.end;
    if(attack.smokeEligible&&released>0&&released<1.8){
      // No plume while another pitched group still sounds through this release.
      const quiet=!attacks.some(other=>other!==attack&&other.start<attack.end+.16&&other.end>attack.end+.16);
      if(quiet){
        const tail=NEEDLE+(attack.end-NOW)*PPS,fade=Math.sin(released/1.8*Math.PI)*.085;
        ctx.beginPath();ctx.moveTo(tail,y-2);
        ctx.bezierCurveTo(tail+8,y-5-released*8,tail-9,y-12-released*10,tail+4,y-18-released*13);
        ctx.strokeStyle='rgba(200,193,177,'+fade+')';ctx.lineWidth=3+released*3;ctx.stroke();smoke++;
      }
    }
    ctx.restore();
  }
  emberInfo={inkLeft,span,historySeconds:span/PPS,onsetPoints:attacks.length,burning,smoke,
    mixEnabled:options.fxDynamics==='song',mix:mixAt(NOW),canonical:true,vocalOnsets:model.lanes.some(l=>l.group==='vocals'&&(l.notes||[]).length)?'model-midi':'no-midi-contour-only',futureWarmBandSeconds:0,flameSeconds:.48,coalSeconds:coalLife};
  drawHud('ember',data);return;
 }

 function surfaceY(e,x){
  const co=e.part?.contour;
  if(!co?.midi?.length)return e.y;
  const k=(NOW+(x-NEEDLE)/PPS-(co.start||0))/co.hop;
  const closest=Math.round(k);
  if(Math.abs(k-closest)<1e-6){
    const pitch=co.midi[closest];return Number.isFinite(pitch)?contourY(e.box,pitch):null;
  }
  const i=Math.floor(k),a=co.midi[i],b=co.midi[i+1];
  return Number.isFinite(a)&&Number.isFinite(b)?contourY(e.box,a+(b-a)*(k-i)):null;
 }
 function traceVertices(event,left,right){
  const curve=event.part?.contour;
  if(!curve?.midi?.length)return [[left,event.y],[right,event.y]];
  const points=[],origin=curve.start||0,firstTime=NOW+(left-NEEDLE)/PPS,lastTime=NOW+(right-NEEDLE)/PPS;
  const add=(x,y)=>points.push(y===null?null:[x,y]);
  add(left,surfaceY(event,left));
  const first=Math.max(0,Math.floor((firstTime-origin)/curve.hop)+1);
  const last=Math.min(curve.midi.length-1,Math.ceil((lastTime-origin)/curve.hop)-1);
  for(let index=first;index<=last;index++){
    const pitch=curve.midi[index],x=NEEDLE+(origin+index*curve.hop-NOW)*PPS;
    add(x,Number.isFinite(pitch)?contourY(event.box,pitch):null);
  }
  add(right,surfaceY(event,right));return points;
 }
 function surfacePath(event,left,right){
  ctx.beginPath();let penDown=false;
  for(const point of traceVertices(event,left,right)){
    if(!point){penDown=false;continue;}
    const [x,y]=point;
    if(penDown)ctx.lineTo(x,y);else{ctx.moveTo(x,y);penDown=true;}
  }
 }

 function waterHistory(){
  const edge=Math.min(NEEDLE-1,Math.max(geometry?.gutter*unit||0,24*unit,(geometry?.side||16)*unit+20));
  const span=Math.max(1,NEEDLE-edge);
  return {left:NEEDLE-span,span,seconds:span/PPS};
 }
 function waterProfile(age,velocity,sampleTime){
  const lifetime=waterHistory().seconds,fraction=clamp(age/lifetime,0,1);
  const strength=noteStrength(velocity,sampleTime);
  return {width:1.45+25*Math.pow(fraction,.74)*(.75+.35*strength),
    peak:(.20+.20/(1+age*.85))*strength*smooth(age/.32)*(1-smooth((fraction-.65)/.35)),
    core:.66*(1-smooth(age/.43)),lifetime};
 }
 function waterInk(history){
  const core=ctx.createLinearGradient(NEEDLE-.43*PPS,0,NEEDLE,0);
  for(const at of [0,.2,.4,.6,.8,1]){
    core.addColorStop(at,'rgba(148,176,194,'+(.66*smooth(at))+')');
  }
  const bands=[.08,.125,.19,.27,.34].map(alpha=>({
    radius:1-alpha*2.28,alpha,ink:ctx.createLinearGradient(history.left,0,NEEDLE,0)
  }));
  const stops=[0,.12,.24,.35,.5,.65,.8,.9,.94,.96,.98,1];
  for(const at of stops){
    const age=(1-at)*history.seconds,profile=waterProfile(age,90,NOW-age);
    for(const band of bands)band.ink.addColorStop(at,'rgba(128,163,190,'+profile.peak*band.alpha*1.27+')');
  }
  return {core,bands};
 }

 function diffuseWater(event,left,right,notes,ink){
  const runs=[];let run=[];
  const seed=eventSeed(event)%113,held=event.end-event.start;
  const taper=Math.min(18,held*PPS*.41+2);
  const along=(x,y)=>{
    const age=(NEEDLE-x)/PPS,time=NOW-age;
    const profile=waterProfile(age,event.velocity,time);
    const envelope=smooth((x-event.x+1.2)/taper)*smooth((event.x2-x+1.2)/taper);
    let broadening=1;
    for(const note of notes){
      broadening*=1-.56*(1-smooth(Math.abs(x-note.x)/7))*(1-smooth((NOW-note.start)/.48));
    }
    // Only the thickness changes around the original pitch ordinate.
    const texture=1+.085*Math.sin(time*4.5+seed)*smooth(age/.6);
    const width=profile.width*texture*(held<.26?.7:1)*envelope*broadening;
    run.push([x,y,Math.max(.45,width/2)]);
  };
  if(event.part?.contour) {
    for(const point of traceVertices(event,left,right)){
      if(point){along(point[0],point[1]);continue;}
      if(run.length>1)runs.push(run);
      run=[];
    }
  } else {
    along(left,event.y);
    for(let x=Math.floor(left/12)*12+12;x<right;x+=12)along(x,event.y);
    along(right,event.y);
  }
  if(run.length>1)runs.push(run);
  if(!runs.length)return;
  ctx.globalAlpha=clamp(.72+event.velocity*.0034,.75,1);
  for(const band of ink.bands){
    ctx.beginPath();
    for(const points of runs){
      for(let i=0;i<points.length;i++){
        const [x,y,width]=points[i],edge=y-width*band.radius;
        if(i)ctx.lineTo(x,edge);else ctx.moveTo(x,edge);
      }
      for(let i=points.length-1;i>=0;i--){
        const [x,y,width]=points[i];ctx.lineTo(x,y+width*band.radius);
      }
      ctx.closePath();
    }
    ctx.fillStyle=band.ink;ctx.fill();
  }
  ctx.globalAlpha=1;
  const coreLeft=Math.max(left,NEEDLE-.43*PPS);
  if(right>coreLeft){
    ctx.strokeStyle=ink.core;ctx.lineWidth=1.45;
    waterFuture(event,coreLeft,right,notes);
  }
 }


 function waterFuture(event,left,right,notes){
  let cursor=left;
  for(const note of notes){
    if(!note.repeated||note.start<event.start-.001||note.start>event.end+.001)continue;
    const edge=note.x-1.7;
    if(edge>cursor){surfacePath(event,cursor,Math.min(right,edge));ctx.stroke();}
    cursor=Math.max(cursor,note.x+.6);
    if(cursor>=right)return;
  }
  if(right>cursor){surfacePath(event,cursor,right);ctx.stroke();}
 }

 function waterBackdrop(){
  if(!backgrounds.water){
    const texture=make();texture.width=Math.ceil(W/3);texture.height=360;
    const paint=texture.getContext('2d');
    const depth=paint.createLinearGradient(0,0,texture.width*.25,360);
    depth.addColorStop(0,'#060b1c');
    depth.addColorStop(.52,'#0b1226');
    depth.addColorStop(1,'#040916');
    paint.fillStyle=depth;paint.fillRect(0,0,texture.width,360);
    const moon=paint.createRadialGradient(texture.width*.66,30,0,texture.width*.66,30,Math.max(320,texture.width*.74));
    moon.addColorStop(0,'rgba(69,92,139,.18)');
    moon.addColorStop(.55,'rgba(46,61,111,.06)');
    moon.addColorStop(1,'rgba(31,43,94,0)');
    paint.fillStyle=moon;paint.fillRect(0,0,texture.width,360);
    const rand=random(4772),waves=[];
    const ripples=make();ripples.width=Math.ceil(W/2.75);ripples.height=392;
    const ripplePaint=ripples.getContext('2d');
    ripplePaint.setTransform(ripples.width/W,0,0,ripples.height/H,0,0);
    for(let row=0;row<19;row++){
      const y=129+row*row*.8+row*34+rand()*20, phase=rand()*Math.PI*2, light=rand();
      const ink=ripplePaint.createLinearGradient(0,0,W,0);
      const center=.34+rand()*.32;
      ink.addColorStop(0,'rgba(65,91,147,.025)');
      ink.addColorStop(center*.55,'rgba(65,91,147,.05)');
      ink.addColorStop(center,'rgba(72,100,161,'+(.085+.065*light)+')');
      ink.addColorStop(1,'rgba(65,91,147,.034)');
      waves.push({y,phase,light,ink,period:.003+rand()*.0045});
    }
    const gleams=[1,3,5,8,11,14].flatMap((row,i)=>{
      const center=W*(.61+(rand()-.5)*(.09+i*.032));
      const unit=Math.min(W/11,38+i*9);
      return Array.from({length:i%3+2},(_,part)=>({
        wave:waves[row],x:center+(part-1)*unit*1.85,
        width:Math.max(8,unit*(.28+rand()*.58)),light:.12+rand()*.15
      }));
    });
    backgrounds.water={texture,waves,gleams,ripples,ripplePaint};
  }
  const {texture,waves,gleams,ripples,ripplePaint}=backgrounds.water;
  ctx.drawImage(texture,0,0,W,H);
  const phase=NOW*.31;
  function ripple(x,y,local,period){
    return y+Math.sin(x*period+local)*8+Math.sin(x*.017-local*.64)*1.9;
  }
  ripplePaint.clearRect(0,0,W,H);
  for(const wave of waves){
    const y=wave.y+Math.sin(wave.phase+phase*.44)*5;
    const local=wave.phase+phase;
    ripplePaint.beginPath();ripplePaint.moveTo(0,ripple(0,y,local,wave.period));
    for(let x=34;x<=W+34;x+=34)ripplePaint.lineTo(x,ripple(x,y,local,wave.period));
    ripplePaint.strokeStyle=wave.ink;ripplePaint.lineWidth=11+wave.light*8;
    ripplePaint.globalAlpha=.46;ripplePaint.stroke();
    ripplePaint.lineWidth=2.9+wave.light*1.5;ripplePaint.globalAlpha=.80;ripplePaint.stroke();
  }
  ctx.drawImage(ripples,0,0,W,H);
  ctx.save();
  for(const gleam of gleams){
    const {wave}=gleam;
    const local=wave.phase+phase;
    const x=gleam.x+Math.sin(phase*.61+wave.phase)*15;
    const y=wave.y+Math.sin(wave.phase+phase*.44)*5;
    const light=gleam.light*(.72+.28*Math.sin(local+gleam.x*.016));
    const edge=x+gleam.width;
    const reflection=ctx.createLinearGradient(x-gleam.width,y,edge,y);
    reflection.addColorStop(0,'rgba(125,154,199,0)');
    reflection.addColorStop(.38,'rgba(125,154,199,'+light+')');
    reflection.addColorStop(.64,'rgba(151,175,210,'+(light*.64)+')');
    reflection.addColorStop(1,'rgba(125,154,199,0)');
    ctx.strokeStyle=reflection;ctx.lineWidth=1.6;
    ctx.beginPath();ctx.moveTo(x-gleam.width,ripple(x-gleam.width,y,local,wave.period));
    ctx.quadraticCurveTo(x,ripple(x,y,local,wave.period)-.6,edge,ripple(edge,y,local,wave.period));
    ctx.stroke();
  }
  ctx.restore();
 }

 function water(data){
  waterBackdrop();
  const history=waterHistory(),ink=waterInk(history);

  const onsetMap=materialAttacks(),openings=new Set();
  for(const event of events){
    if(event.group==='drums'){
      const age=NOW-event.start;
      if(age<0){ctx.fillStyle='rgba(123,150,170,.5)';ctx.beginPath();kitOf().mark(ctx,event.drum,event.x,event.y,event.size,event.room);ctx.fill();}
      else if(age<.32){ctx.fillStyle='rgba(166,195,210,'+(.6*(1-age/.32))+')';ctx.beginPath();ctx.ellipse(event.x,event.y,2.4+age*6,1.2+age*2,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='rgba(196,219,230,'+(.75*(1-age/.32))+')';ctx.beginPath();kitOf().mark(ctx,event.drum,event.x,event.y,event.size,event.room);ctx.fill();}
      continue;
    }
    ctx.save();clipLane(ctx,event);
    const notes=!event.part?.contour?onsetMap.get(event.box.lane)?.get(event.pitch)||[]:[];
    const recent=notes.filter(note=>note.repeated&&NOW-note.start>=0&&NOW-note.start<.48&&note.start>=event.start-.001&&note.start<=event.end+.001);
    for(const note of notes){
      if(note.repeated&&note.x>=NEEDLE-.48*PPS&&note.x<W-16&&note.start>=event.start-.001&&note.start<=event.end+.001)openings.add(note);
    }
    const futureLeft=Math.max(NEEDLE,event.x),futureRight=Math.min(W-16,event.x2);
    if(futureRight>futureLeft){
      ctx.strokeStyle='rgba(148,176,194,.66)';ctx.lineWidth=1.45;
      waterFuture(event,futureLeft,futureRight,notes);
    }
    const left=Math.max(history.left,event.x),right=Math.min(NEEDLE,event.x2);
    if(right>left)diffuseWater(event,left,right,recent,ink);
    ctx.restore();
  }
  waterInfo={profiles:[.1,.9,1.8,2.7].map(age=>({age,...waterProfile(age,90,NOW-age)})),
    mixEnabled:options.fxDynamics==='song',mix:mixAt(NOW),layers:ink.bands.length,repeatedOpenings:openings.size};
  drawHud('water',data);return;
 }

 function drums(c,mode){
  for(const e of events){if(e.group!=='drums')continue;const past=e.start<=NOW,age=NOW-e.start;if(past&&age>1.5)continue;const a=past?(1-age/1.5)*.75:.52;
   c.save();c.translate(e.x,e.y);c.strokeStyle=mode==='fog'?'rgba(191,207,213,'+a+')':'rgba(172,199,209,'+a+')';c.fillStyle=mode==='fog'?'rgba(12,33,43,'+a+')':'rgba(143,178,196,'+a*.7+')';c.lineWidth=.9;
   if(e.drum==='snare'){c.beginPath();c.moveTo(0,-3.2);c.lineTo(1.4,0);c.lineTo(0,3.2);c.lineTo(-1.4,0);c.closePath();c.fill();c.stroke();}
   else if(e.drum==='kick'){c.beginPath();c.ellipse(0,0,4.2,1.5,0,0,Math.PI*2);c.fill();c.stroke();}
   else{c.beginPath();c.moveTo(-2.1,2);c.lineTo(1.9,-1.8);if(e.drum==='crash'){c.moveTo(-1.9,-1.8);c.lineTo(1.9,2)}c.stroke();}
   if(mode==='water'&&past){c.beginPath();c.ellipse(0,2.4,4.3,1.4,0,.1,3);c.strokeStyle='rgba(89,128,151,'+a*.4+')';c.stroke()}c.restore();
  }
 }

 // A short note's round head (the core's shortHead / SHORT_NOTE), in the look's own ink: played, sounding, to come.
 function shortHeads(style){
  const core=coreOf();if(!core||!core.SHORT_NOTE)return;
  const radius=(Number.isFinite(options.shortHead)?options.shortHead:core.DEFAULTS?.shortHead||0)*unit;if(!(radius>0))return;
  const limit=core.SHORT_NOTE.seconds;
  const ink=style==='paper'?['58,64,66','75,85,87']:style==='ember'?['214,122,72','150,158,160']:['166,195,210','123,150,170'];
  for(const e of events){
   if(e.group==='drums'||e.part?.contour||e.end-e.start>=limit||e.x<NEEDLE*.15625||e.x>W-16)continue;
   const past=e.start<=NOW,a=past?(e.end>NOW?1:Math.max(.18,ageAlpha(e)))*.86:.66;
   ctx.fillStyle='rgba('+(past?ink[0]:ink[1])+','+a+')';ctx.beginPath();ctx.arc(e.x,e.y,radius*(past&&e.end>NOW?1.15:1),0,Math.PI*2);ctx.fill();
  }
 }
 function draw(t,next,paintVariation){
  options=next||options;
  const {frame,data}=collect(Math.max(0,Math.min(model.track.duration||86400,Number(t)||0)));
  const style=options.scoreStyle;
  ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;
  ctx.globalCompositeOperation='source-over';ctx.lineCap='butt';ctx.lineJoin='miter';
  ctx.lineWidth=1;ctx.shadowBlur=0;ctx.shadowOffsetX=ctx.shadowOffsetY=0;
  let variation;
  if(style==='paper')variation=paper(data,paintVariation);else if(style==='ember')ember(data);else water(data);
  shortHeads(style);
  const out=target.getContext('2d');out.setTransform(1,0,0,1,0,0);
  out.clearRect(0,0,target.width,target.height);
  out.drawImage(canvas,0,0,target.width,target.height);
  return {...frame,style,...(style==='paper'?{paper:paperInfo}:{}),...(style==='ember'?{ember:emberInfo}:{}),...(style==='water'?{water:waterInfo}:{}),notes:events.filter(e=>e.group!=='drums').length,
    ...(variation?{variation}:{}),hits:events.filter(e=>e.group==='drums').length,presentation:last,window:[NOW-NEEDLE/PPS,NOW+(W-NEEDLE)/PPS]};
 }

 return {draw,ready:()=>Promise.resolve(),setModel(next){model=next;attackCache=new WeakMap();lyrics=null;cover=null},
  setOptions(next){options=next},setCover(image){cover=image},setLyrics(value){lyrics=value?.trackId===model.track.id?value:null},destroy(){}};
}
root.XinScoreSurface=Object.freeze({create,styles:Object.freeze(styles)});
})(globalThis);
