'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {ScoreView, mockCanvas, fullModel, BENCH} = require('./helpers.cjs');

const options = {...BENCH, windowSeconds:16, playhead:.35, quietText:true, showBackdrop:false};
function track(group, notes) {
  return {contract:'xin.score-view/1', track:{id:'flight', title:'Flight', duration:50}, audio:{src:'test', offset:0},
    lanes:[{kind:'pitched', id:group, group, label:group, notes:[...notes, [38,.1,60,90]]}]};
}
function scene(model, extra = {}) {
  const surface = mockCanvas();
  const view = ScoreView.create(surface.canvas, model, () => 0, {...options, ...extra});
  function at(time) {
    surface.reset();
    const stats = view.draw(time);
    // The mock records gradient geometry and colour stops as data plus a fresh addColorStop method.
    // Compare every recorded value; method identity is never painted.
    const calls = JSON.parse(JSON.stringify(surface.calls));
    return {stats, calls, heads:surface.calls.filter(c => c.name === 'ellipse').map(c => c.args),
      previews:surface.strokes().filter(s => /,0\.56\)$/.test(s.style)).flatMap(s => s.points)};
  }
  at(0);
  return {at, view};
}

test('a sounding note crosses progressively, keeping the unplayed length at the needle until release', () => {
  for (const group of ['guitar', 'piano', 'bass']) {
    const model = track(group, [[5,4,60,96]]), original = JSON.stringify(model);
    const base = scene(model), meteor = scene(model, {meteorMotion:true,pluckReleaseSeconds:0}), empty = scene(track(group, []), {meteorMotion:true,pluckReleaseSeconds:0});
    const before = meteor.at(4.8);
    assert.equal(before.heads.length, 0);
    assert.equal(before.previews.length, 2);
    assert.ok(before.previews[0].x > 280 && before.previews[1].x - before.previews[0].x > 185);
    for (const time of [5, 5.4, 5.8, 6.6, 8.5, 9, 9.2, 10.5, 12.4]) {
      const frame = meteor.at(time);
      assert.equal(frame.previews.length, time<9 ? 2 : 0);
      assert.equal(frame.heads.length, time<8.36 ? 1 : 0);
      assert.equal(frame.stats.meteors || 0, time<12.36 ? 1 : 0);
      const normal = base.at(time).stats;
      assert.equal(frame.stats.notes, normal.notes);
      assert.equal(frame.stats.active, normal.active);
      if (time >= 12.36) assert.deepEqual(frame.calls, empty.at(time).calls);
      if (time<9) {
        assert.equal(frame.previews[0].x,280);
        if(frame.heads.length) assert.ok(Math.abs(frame.previews[1].x-frame.heads[0][0]-200)<1e-5);
      }
      if(time>5 && time<12.36) {
        const body=frame.calls.find(c=>c.name==='quadraticCurveTo' && c.args[2]>5);
        assert.ok(body);
        assert.ok(Math.abs(body.args[2]-(280-Math.max(0,time-9)*50))<1e-5);
      }
    }
    assert.equal(JSON.stringify(model), original);
  }
});

test('repeated attacks and chords each fly once, even when the song is paused or scrubbed', () => {
  const model = track('piano', [[5,.06,60,96], [5,.08,65,91], [5.25,.4,60,84]]);
  const meteor = scene(model, {meteorMotion:true, fxPreset:'strong', showShapes:true, shapeSet:'spindle',
    shapeLinks:true, showRoles:true, pitchWeight:true, focusGroup:'piano'});
  const atAttack = meteor.at(5);
  assert.equal(atAttack.heads.length, 2);
  assert.equal(atAttack.previews.length, 6); // both chord remainders and the next attack
  assert.notEqual(atAttack.heads[0][1], atAttack.heads[1][1]);
  const airborne = meteor.at(5.5);
  assert.equal(airborne.heads.length, 3);
  assert.equal(airborne.stats.active, 1);
  assert.equal(airborne.stats.shaped, undefined);
  assert.equal(airborne.previews.length, 2);
  assert.deepEqual(meteor.at(5.5).calls, airborne.calls);
  assert.equal(meteor.at(10).heads.length, 0);
  assert.deepEqual(meteor.at(5.5).calls, airborne.calls);
  assert.deepEqual(meteor.at(5).calls, atAttack.calls);
});

test('toggle restores the regular score exactly, and applies the matching ink to the other families', () => {
  assert.equal(ScoreView.DEFAULTS.meteorMotion, false);
  const model = track('guitar', [[5,4,60,96]]);
  const base = scene(model), active = scene(model);
  assert.equal(active.view.options().meteorMotion, false);
  active.view.setOptions({meteorMotion:'yes'});
  assert.equal(active.view.options().meteorMotion, false);
  active.view.setOptions({meteorMotion:true});
  const forFlight = active.at(5.4);
  assert.equal(forFlight.heads.length, 1);
  active.view.setOptions({meteorMotion:false});
  assert.deepEqual(active.at(5.4), base.at(5.4));
  active.view.setOptions({meteorMotion:true});
  assert.deepEqual(active.at(5.4), forFlight);

  const others = fullModel();
  others.lanes = others.lanes.filter(lane => !ScoreView.STRUCK_GROUPS.includes(lane.group));
  others.lanes.push(...['winds','strings'].map(group => track(group, [[5,4,60,96]]).lanes[0]));
  const normal = scene(others), enabled = scene(others, {meteorMotion:true});
  for (const t of [4.8,5,5.4,9,10]) {
    const current=enabled.at(t), plain=normal.at(t);
    assert.equal(current.heads.length,0);
    assert.equal(current.stats.notes,plain.stats.notes);
    assert.equal(current.stats.fx,null);
    assert.deepEqual(enabled.at(t),current);
  }
});

test('each enabled lane reuses its two gradients through redrawing, seeking and switching', () => {
  const surface = mockCanvas(), context = surface.canvas.getContext('2d');
  let brushes = 0;
  for (const [method,expected] of [['createLinearGradient',[0,0,1,0]],['createRadialGradient',[0,0,0,0,0,1]]]) {
    const original = context[method];
    context[method] = (...args) => {
      if (args.length === expected.length && args.every((value,i)=>value===expected[i])) brushes++;
      return original(...args);
    };
  }
  const model = track('guitar', [[5,.1,60,96], [5.1,.1,63,89]]);
  const view = ScoreView.create(surface.canvas,model,()=>0,options);
  view.draw(5.4);
  assert.equal(brushes,0);
  view.setOptions({meteorMotion:true});
  for (const t of [5,5.2,5.4,6.8,9.6,5.4]) view.draw(t);
  assert.equal(brushes,2);
  view.setOptions({meteorMotion:false}); view.draw(5.2);
  view.setOptions({meteorMotion:true}); view.draw(5.2);
  assert.equal(brushes,2);
});

test('a named harp or pizzicato stays plucked with the bowed notes merged, split, or hidden', () => {
  const m=track('strings',[[5,2,60,90]]);
  m.lanes.push({...track('strings',[[5,2,69,81]]).lanes[0],id:'strings/harp',meta:{program:46}});
  for(const mergeTimbres of [false,true]){
    const view=scene(m,{meteorMotion:true,mergeTimbres});
    assert.equal(view.at(5.4).heads.length,1);
    view.view.setOptions({hidden:['strings/harp']});
    assert.equal(view.at(5.4).heads.length,0);
    view.view.setOptions({hidden:['strings']});
    assert.equal(view.at(5.4).heads.length,1);
  }
});

test('held tracks use the original time of the stem dynamics; absent dynamics produce steady ink', () => {
  const m=track('winds',[[5,4,60,84]]);
  const levels=Array.from({length:50},(_,i)=>i===7?-8:-39);
  // Give the stem a real dynamic range over the entire piece.
  levels.fill(-8,19,29);
  m.levels={hop:1,groups:{winds:levels}};
  const view=scene(m,{meteorMotion:true}), first=view.at(8.4);
  const region=first.calls.filter(c=>c.name==='lineTo' && c.args[0]>=110 && c.args[0]<280);
  const at=x=>region.filter(c=>Math.abs(c.args[0]-x)<1).map(c=>c.args[1]);
  // The sample at song second 7 stays at its true horizontal position.
  const bandWidth=x=>Math.max(...at(x))-Math.min(...at(x));
  assert.ok(bandWidth(210)>bandWidth(160));
  view.at(11);assert.deepEqual(view.at(8.4),first);
  const flat=track('winds',[[5,4,60,84]]);
  view.view.setModel(flat);
  assert.deepEqual(view.at(8.4),scene(flat,{meteorMotion:true}).at(8.4));
});

// All historical marks share a five-stop horizontal fade anchored to the needle.
function historyPaths(frame) {
  let points = [];
  const drawn = [];
  for (const call of frame.calls) {
    if (call.name === 'beginPath') points = [];
    if (call.name === 'moveTo' || call.name === 'lineTo') points.push(call.args[0]);
    const ink = call.name === 'fill' ? call.fillStyle : call.name === 'stroke' ? call.strokeStyle : null;
    if (points.length && ink && ink.line && ink.stops.length === 5) drawn.push({points, ink, op:call.name, alpha:call.alpha});
  }
  return drawn;
}

test('strings and winds write fresh light until release across sixty percent of the left span', () => {
  for (const group of ['strings','violin','winds']) {
    const m = track(group, [[5,4,60,96]]);
    const live = scene(m,{meteorMotion:true});
    assert.equal(historyPaths(live.at(4.9)).length,0);
    const spans = [[5.2,270,280], [7.5,155,280], [8.6,112,280], [9,112,280], [9.2,112,270], [11.8,112,140]];
    for (const [t,left,right] of spans) {
      const frame = live.at(t), paths = historyPaths(frame);
      assert.deepEqual(paths.map(p=>p.op), ['fill','fill','stroke']);
      for (const {points,ink} of paths) {
        assert.ok(Math.abs(Math.min(...points)-left)<1e-5);
        assert.ok(Math.abs(Math.max(...points)-right)<1e-5);
        assert.deepEqual(ink.line,[112,0,280,0]);
        const alpha=ink.stops.map(([,color])=>Number(color.slice(color.lastIndexOf(',')+1,-1)));
        assert.equal(alpha[0],0);
        assert.ok(alpha.slice(1).every((v,i)=>v>alpha[i]));
      }
      if(t<9) assert.equal(frame.previews[0].x,280);
    }
    const released=live.at(12.4);
    assert.deepEqual(released.calls,scene(track(group,[]),{meteorMotion:true}).at(12.4).calls);
    live.at(11);live.at(6.5);
    assert.deepEqual(live.at(12.4),released);
    live.view.setOptions({windowSeconds:8,albumLayout:true,albumSidebarGap:10});
    const zoomed = live.at(7.5), stroke=historyPaths(zoomed).at(-1);
    assert.deepEqual(stroke.ink.line,[106,0,280,0]);
    assert.ok(Math.abs(stroke.points[0]-106)<1e-9 && stroke.points[1]===280);
    assert.equal(zoomed.stats.skyHistory.seconds,1.74);
  }
});

test('overlapping bows stay lit until their own ends, measured contours respect rests and the same fade', () => {
  const m = track('strings',[[5,2,60,96],[6,2,60,80],[8.8,.2,65,90]]);
  // A pitch estimate can extend across a scored rest.
  m.lanes[0].contour={start:4.8,hop:.1,midi:Array(80).fill(60)};
  for(const mergeTimbres of [false,true]){
    const live=scene(m,{meteorMotion:true,mergeTimbres,windowSeconds:3}), held=live.at(7.7);
    assert.equal(historyPaths(held).filter(p=>p.op==='fill').length,2);
    assert.ok(historyPaths(held).some(p=>p.op==='stroke'&&p.alpha===.93&&p.points.includes(280)));
    const after=live.at(8.3);
    assert.ok(historyPaths(after).every(p=>Math.max(...p.points)<=200.00001));
    assert.deepEqual(historyPaths(live.at(8.64)),[]);
    const next=live.at(8.92);
    assert.ok(historyPaths(next).every(p=>Math.min(...p.points)>247.9));
    assert.deepEqual(historyPaths(live.at(9.64)),[]);
    assert.deepEqual(live.at(7.7),held);
  }
});

test('each drum strike keeps just its local symbol until the shared boundary, including dense cymbals', () => {
  const rows=['kick','snare','hihat','openhat','ride','crash','tom'];
  for(const [i,name] of rows.entries()){
    const drum={contract:'xin.score-view/1',track:{duration:20},audio:{},lanes:[
      {id:'drums',group:'drums',label:'Kit',kind:'drums',rows,hits:[[5,i,110],[12,i,80]]}]};
    const view=scene(drum,{meteorMotion:true,drumNotation:true,drumDecayScale:0});
    const frame=view.at(5.4), x=280-.4*50;
    const start=frame.calls.findIndex((c,j)=>c.name==='clip' && frame.calls[j-1]?.args[0]===112);
    assert.ok(start>=0);
    const end=frame.calls.findIndex((c,j)=>j>start && c.name==='restore');
    const marks=frame.calls.slice(start+1,end).filter(c=>
      ['lineTo','moveTo','quadraticCurveTo','rect','arc'].includes(c.name));
    assert.ok(marks.length,name);
    const next=280+(12-5.4)*50;
    assert.ok(marks.every(c=>Math.min(Math.abs(c.args[0]-x),Math.abs(c.args[0]-next))<12),name+' has a trailing mark');
    assert.equal(view.at(8.35).stats.hits,2);
    assert.equal(view.at(8.37).stats.hits,1);
  }
});

test('a vocal contour, unclassified pitched track and the bottom texture fade to zero at the common boundary', () => {
  const m=track('synth',[[1,12,60,100]]);
  m.lanes.push({...m.lanes[0],id:'vocals',group:'vocals',kind:'melody',
    contour:{start:0,hop:.1,midi:Array(240).fill(60)}});
  m.lanes.push({id:'other',group:'other',label:'Other',kind:'texture',level:{hop:.5,db:Array.from({length:80},(_,i)=>i>1?-10:-45)}});
  const live=scene(m,{meteorMotion:true,showTexture:true});
  const frame=live.at(8), all=historyPaths(frame);
  assert.ok(all.some(p=>p.alpha===.93));
  assert.ok(all.some(p=>p.alpha===.78));
  assert.ok(all.every(p=>Math.min(...p.points)>=112-1e-6));
  assert.ok(frame.calls.some(c=>c.name==='stroke' && typeof c.strokeStyle==='string' && c.strokeStyle.endsWith(',0.65)')));
  assert.ok(frame.previews.length);
  const band=frame.calls.find(c=>c.name==='fill' && c.fillStyle?.line?.[2]===800 && c.fillStyle.stops.length>10);
  assert.ok(band && frame.stats.texture.drawn>0);
  const leftStops=band.fillStyle.stops.filter(([u])=>u<=112/800+1e-9);
  assert.ok(leftStops.length>=2 && leftStops.every(([,color])=>Number(color.slice(color.lastIndexOf(',')+1,-1))<1e-12));
  const mid=band.fillStyle.stops.find(([u])=>Math.abs(u-196/800)<1e-8);
  assert.ok(mid && !mid[1].endsWith(',0)'));
});

test('a pluck loses its attack first, keeps sounding at the needle and fades from its own release', () => {
  for(const group of ['guitar','piano','bass','strings']) {
    const m=track(group,[[5,2,60,96]]);
    if(group==='strings') m.lanes[0].meta={program:45};
    const v=scene(m,{meteorMotion:true});
    const head=t=>v.at(t).calls.find(c=>c.name==='ellipse');
    assert.ok(head(5.04).alpha>head(5.35).alpha);
    assert.equal(v.at(6.8).previews[0].x,280);
    assert.ok(head(7.1).alpha>head(7.35).alpha && head(7.35).alpha>head(7.65).alpha);
    assert.equal(v.at(7.7).stats.meteors||0,0);
    v.view.setOptions({pluckReleaseSeconds:1.1});
    assert.equal(v.at(7.8).stats.meteors,1);
    assert.equal(v.at(8.11).stats.meteors||0,0);
    const frame=v.at(7.6);v.at(9);assert.deepEqual(v.at(7.6),frame);
  }
});

test('local drum marks fade with independent lifetimes from each strike and accept a custom multiplier', () => {
  const rows=['hihat','snare','kick','openhat','ride','crash','tom'];
  const seconds=[.20,.35,.45,.50,.50,.50,.40];
  for(let i=0;i<rows.length;i++){
    const m={contract:'xin.score-view/1',track:{duration:20},audio:{},lanes:[
      {id:'drums',group:'drums',kind:'drums',rows,hits:[[5,i,100],[5.1,i,94]]}]};
    const v=scene(m,{meteorMotion:true});
    assert.equal(v.at(5+seconds[i]-.01).stats.hits,2);
    assert.equal(v.at(5+seconds[i]+.01).stats.hits,1);
    assert.equal(v.at(5.1+seconds[i]+.01).stats.hits,0);
    v.view.setOptions({drumDecayScale:1.5});
    assert.equal(v.at(5+seconds[i]*1.5+.01).stats.hits,1);
    v.view.setOptions({drumDecayScale:0});
    assert.equal(v.at(7).stats.hits,2);
  }
});

test('measured pitch connects to the needle, with gaps in a voice and bends only on isolated plucks', () => {
  const data=track('guitar',[[5,2,60,92]]);
  data.lanes[0].contour={start:5,hop:.1,midi:[60,60,61,62,62,61,60,null,60]};
  const withBend=scene(data,{meteorMotion:true}).at(5.5);
  const points=withBend.calls.filter(c=>c.name==='lineTo'&&c.args[0]>=255&&c.args[0]<=280);
  assert.ok(new Set(points.map(c=>Math.round(c.args[1]))).size>1);
  const vocal={...data,lanes:[{...data.lanes[0],kind:'melody',id:'vocals',group:'vocals'}]};
  const sampled=scene(vocal,{meteorMotion:true}).at(5.25);
  const crossings=sampled.calls.filter(c=>['moveTo','lineTo'].includes(c.name)&&c.args[0]===280);
  assert.ok(crossings.length>=2);
  assert.ok(sampled.stats.contour>0);assert.equal(sampled.heads.length,0);
});

test('the two manual limits are usable throughout their extended range', () => {
  const raw={pluckReleaseSeconds:20,drumDecayScale:9,meteorDirectionDegrees:17,meteorBassDirection:false};
  assert.deepEqual(ScoreView.transientTiming(raw),{pluckReleaseSeconds:3,drumDecayScale:4,meteorDirectionDegrees:12,meteorBassDirection:false});
  const v=scene(track('guitar',[[5,.1,60,96]]),{meteorMotion:true,pluckReleaseSeconds:3});
  assert.equal(v.at(8.08).stats.meteors,1);
  assert.equal(v.at(8.11).stats.meteors||0,0);
  const drum={contract:'xin.score-view/1',track:{duration:20},audio:{},lanes:[
    {id:'drums',group:'drums',kind:'drums',rows:['hihat','crash'],hits:[[5,0,90],[5,1,100]]}]};
  const d=scene(drum,{meteorMotion:true,drumDecayScale:4});
  assert.equal(d.at(5.79).stats.hits,2);
  assert.equal(d.at(5.81).stats.hits,1);
  assert.equal(d.at(6.99).stats.hits,1);
  assert.equal(d.at(7.01).stats.hits,0);
});

test('twelve degrees visibly doubles six on the same strum without moving its pitch or its head', () => {
  const v=scene(track('guitar',[[5,1,55,96],[5.011,1,62,96],[5.024,1,67,96],[5.15,1,60,96]]),{meteorMotion:true});
  const wake=c=>c.name==='setTransform' && c.args[4]>0 && c.args[3]>0 && c.args[3]<=1.001 && c.args[0]>.4;
  const at=degrees=>{v.view.setOptions({meteorDirectionDegrees:degrees});return v.at(5.11).calls;};
  const flat=at(0),mid=at(6),high=at(12);
  const angles=frame=>{
    assert.deepEqual(frame.filter(c=>!wake(c)),flat.filter(c=>!wake(c)));
    return frame.filter(wake).map((c,i)=>{
      const [x,y]=flat.filter(wake)[i].args;
      assert.equal(c.args[0],x);assert.ok(Math.abs(c.args[1]-y)<=4);
      return Math.atan((c.args[1]-y)/x)*180/Math.PI;
    });
  };
  const six=angles(mid),twelve=angles(high);assert.equal(six.length,3);
  for(let i=0;i<six.length;i++){
    assert.ok(Math.abs(six[i])>.01);
    assert.ok(Math.abs(twelve[i]-six[i]*2)<1e-8);
    assert.ok(Math.abs(twelve[i]-twelve[0])<1e-8);
  }
  v.at(20);assert.deepEqual(at(12),high);assert.deepEqual(at(0),flat);
  const bass=scene(track('bass',[[5,1,48,90]]),{meteorMotion:true,meteorDirectionDegrees:12,meteorBassDirection:false});
  const off=bass.at(5.11);bass.view.setOptions({meteorBassDirection:true});
  assert.notDeepEqual(bass.at(5.11).calls,off.calls);
  bass.view.setOptions({meteorBassDirection:false});assert.deepEqual(bass.at(5.11),off);
});
