const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../score-presentation.js');
test('export snapshots reject stale tracks and disabled lyrics; preserve blank cues and manual offsets',()=>{
 const value={trackId:'song',enabled:true,offset:2.31,lines:[{time:40,text:'first'},{time:45,text:''},{time:50,text:'second'}]};
 const snapshot=P.lyricsSnapshot(value,'song');
 assert.equal(P.lyricAt(snapshot,42.30,'Verse 1'),'');assert.equal(P.lyricAt(snapshot,42.31,'Verse 1'),'first');
 assert.equal(P.lyricAt(snapshot,47.31,'Verse 1'),'');assert.equal(P.lyricAt(snapshot,52.31,'Interlude'),'');
 assert.equal(P.lyricAt(P.lyricsSnapshot(value,'other'),43,'Verse 1'),'');
 assert.equal(P.lyricAt(P.lyricsSnapshot({...value,enabled:false},'song'),43,'Verse 1'),'');
 assert.deepEqual(value.lines,[{time:40,text:'first'},{time:45,text:''},{time:50,text:'second'}]);
});
test('section labels use natural English without requiring a model rewrite',()=>{
 assert.equal(P.sectionLabel('主歌 1'),'Verse 1');assert.equal(P.sectionLabel('副歌'),'Chorus');
 assert.equal(P.sectionLabel('间奏'),'Interlude');assert.equal(P.sectionLabel('引子'),'Intro');
 assert.equal(P.sectionLabel('pre-chorus'),'Pre-Chorus');assert.equal(P.sectionLabel('inst'),'Interlude');
});
test('the shared immersive footer keeps lyrics clear of metadata in wide and portrait views',()=>{
 const {mockCanvas}=require('./helpers.cjs');
 const title='0123456789'.repeat(10), lyric='春天的海岸夜色渐深，河流从很远的地方慢慢回到我们身旁。'.repeat(3);
 const model={track:{id:'t',title,artist:'Artist'},sections:[]};
 const lyrics={trackId:'t',enabled:true,offset:0,lines:[{time:5,text:lyric}]};
 for(const [width,height] of [[1440,720],[420,850]]){
   const {canvas,calls}=mockCanvas(width,height),context=canvas.getContext('2d');
   context.measureText=text=>({width:Array.from(text).length*(parseFloat(context.font.split(' ')[1])*.7||10)});
   const frame=P.drawFooter(context,model,{},lyrics,{width:20},59.996,width,height,'paper');
   assert.equal(frame.lyric,lyric);
   assert.equal(frame.lyricLines.length,2);
   const text=calls.filter(call=>call.name==='fillText');
   const [stamp,metadata,...rows]=text;
   const measure=entry=>Array.from(entry.args[0]).length*parseFloat(entry.font.split(' ')[1])*.7;
   assert.equal(stamp.args[0],'1:00.00');
   assert.ok(metadata.args[1]+measure(metadata)<stamp.args[1]-measure(stamp));
   if(width>height) rows.forEach(row=>assert.ok(metadata.args[1]+measure(metadata)<row.args[1]-measure(row)/2));
   else assert.ok(rows.at(-1).args[2]+parseFloat(rows.at(-1).font.split(' ')[1])/2<metadata.args[2]);
 }
});
test('ordinary presentation keeps starry notes for old false presets and keeps independent timing values',()=>{
 const {mockCanvas}=require('./helpers.cjs');const {canvas}=mockCanvas();
 const model={contract:'xin.score-view/1',track:{id:'test',duration:10},audio:{},lanes:[{id:'guitar',group:'guitar',kind:'pitched',notes:[[1,2,60,96]]}]};
 const view=P.create(canvas,model,()=>2,{meteorMotion:false});assert.equal(view.options().meteorMotion,true);
 view.setOptions({meteorMotion:false,fxPreset:'off',pluckReleaseSeconds:2.5,drumDecayScale:3.35,meteorDirectionDegrees:0});
 assert.equal(view.options().meteorMotion,true);assert.equal(view.options().pluckReleaseSeconds,2.5);assert.equal(view.options().drumDecayScale,3.35);assert.equal(view.options().meteorDirectionDegrees,0);assert.ok(view.draw(2).meteors>0);
});

test('leaving immersive restores the ordinary raster at the same paused time and repeated sizes',()=>{
 const {mockCanvas,fullModel}=require('./helpers.cjs');
 const {canvas,calls,reset}=mockCanvas(1320,820);
 canvas.ownerDocument={createElement:()=>mockCanvas().canvas};
 const view=P.create(canvas,fullModel(),()=>32,{albumLayout:true});
 for(let cycle=0;cycle<3;cycle++){
  view.draw(32);
  assert.equal(canvas.width,1320);assert.equal(canvas.height,820);
  canvas.clientWidth=1920;canvas.clientHeight=1080;
  view.setOptions({presentationLayout:true});view.draw(32);
  assert.equal(canvas.width,1920);assert.equal(canvas.height,1080);
  canvas.clientWidth=1320;canvas.clientHeight=820;
  view.setOptions({presentationLayout:false});reset();
  const frame=view.draw(32);
  assert.equal(canvas.width,1320,'ordinary renderer must reclaim the shared canvas backing width');
  assert.equal(canvas.height,820,'ordinary renderer must reclaim the shared canvas backing height');
  assert.equal(frame.time,32);
  const background=calls.find(call=>call.name==='fillRect');
  assert.deepEqual(background.args,[0,0,canvas.width,canvas.height],'first background covers the entire backing raster');
 }
});

test('Flag Workshop follows the same timestamp and coordinates in listening, full screen and export', () => {
  const {mockCanvas,fullModel} = require('./helpers.cjs');
  const prior = {art:globalThis.XinArt, mood:globalThis.XinScoreMood, ratio:globalThis.devicePixelRatio};
  const model = fullModel();
  const frames = [];
  const detail = frame => ({left:40, right:frame.w - 40, playheadX:frame.w * .6,
    pxPerSecond:50, notes:[{}], start:frame.time - 2, end:frame.time + 4, span:6});
  const renderer = {
    draw(ctx, frame) { frames.push(frame); return {detail:detail(frame)}; },
    timeAt(x, y, frame) { return y >= 0 && y < frame.h ? frame.time + (x - detail(frame).playheadX) / 50 : null; }
  };
  const canvasAt = (width, height) => {
    const {canvas} = mockCanvas(width,height);
    canvas.ownerDocument = {createElement:() => mockCanvas().canvas};
    return canvas;
  };
  try {
    globalThis.XinArt = {flag:renderer};
    globalThis.XinScoreMood = require('../score-style.cjs');
    globalThis.devicePixelRatio = 1.5;
    const canvas = canvasAt(960,720);
    const settings = {scoreStyle:'flag', lang:'zh-CN', hidden:['bass'], focusGroup:'guitar', offsetSeconds:-.125};
    const lyric = {trackId:model.track.id, enabled:true, offset:0, lines:[{time:25,text:'当下这一句'}]};
    const cover = {width:80,height:80};
    const live = P.create(canvas, model, () => 32.125, settings);
    live.setLyrics(lyric);
    live.setCover(cover);
    const paused = live.draw(undefined,true);
    assert.equal(paused.style, 'flag');
    assert.equal(paused.time, 32);
    assert.equal(paused.locating, true);
    assert.equal(paused.presentation.lyric, '当下这一句');
    assert.equal(frames.at(-1).section, '主歌 1');
    assert.equal(frames.at(-1).cover, cover);
    assert.equal(frames.at(-1).playing, false);
    assert.deepEqual(frames.at(-1).hidden, ['bass']);
    assert.equal(frames.at(-1).focusGroup, 'guitar');
    assert.equal(live.timeAt(canvas.clientWidth * live.options().playhead), 32);
    assert.deepEqual(live.hit(live.xOf(34),600), {kind:'time',time:34.125});
    assert.equal(live.hit(1,-1), null);

    canvas.clientWidth = 1280;
    live.setOptions({presentationLayout:true,lang:'en-US'});
    assert.equal(live.hit(1,1), null, 'geometry from the old layout is no longer available');
    const fullScreen = live.draw();
    const fullScreenFrame = frames.at(-1);
    assert.equal(fullScreenFrame.section, 'Verse 1');
    assert.equal(fullScreenFrame.playing, true);
    assert.deepEqual([canvas.width,canvas.height], [1920,1080]);

    const output = canvasAt(1920,1080);
    output.clientWidth = output.clientHeight = 0;
    const exportView = P.create(output, model, () => 0, live.options());
    exportView.setLyrics(lyric);
    exportView.setCover(cover);
    assert.deepEqual(exportView.draw(32.125), fullScreen);
    assert.deepEqual(frames.at(-1), fullScreenFrame);
    assert.deepEqual([output.width,output.height], [1920,1080]);

    live.setOptions({scoreStyle:'starry',presentationLayout:false});
    assert.equal(live.draw().style, 'starry');
  } finally {
    globalThis.XinArt = prior.art;
    globalThis.XinScoreMood = prior.mood;
    globalThis.devicePixelRatio = prior.ratio;
  }
});
