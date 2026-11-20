// One canvas composition for XML's immersive mode and recorded score videos.
// Ordinary listening delegates directly to the existing score core. No source model is mutated.
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./score-view.js'):root.XinScoreView,root);if(typeof module==='object'&&module.exports)module.exports=api;else root.XinScorePresentation=api;})(globalThis,function(Core,root){
  'use strict';
  const FONT='"Segoe UI", "Microsoft YaHei", sans-serif';
  function sectionLabel(name){
    const s=String(name||'').trim();
    const match=s.match(/^(主歌|副歌|导歌|前副歌|间奏|引子|前奏|尾奏|桥段|过门|尾声)\s*(\d*)$/);
    if(match)return ({主歌:'Verse',副歌:'Chorus',导歌:'Pre-Chorus',前副歌:'Pre-Chorus',间奏:'Interlude',引子:'Intro',前奏:'Intro',尾奏:'Outro',桥段:'Bridge',过门:'Transition',尾声:'Outro'}[match[1]])+(match[2]?' '+match[2]:'');
    return s.replace(/\bpre[- ]chorus\b/gi,'Pre-Chorus').replace(/\b(instrumental|inst)\b/gi,'Interlude').replace(/\b(intro|verse|chorus|interlude|bridge|outro)\b/gi,t=>t[0].toUpperCase()+t.slice(1).toLowerCase());
  }
  function lyricsSnapshot(value,trackId,useAlignment=false){
    const align = useAlignment && value?.alignment === true;
    if(!value||value.trackId!==trackId||value.hidden||(value.enabled!==true&&!align))return {trackId,enabled:false,offset:0,lines:[]};
    const lines=(Array.isArray(value.lines)?value.lines:[]).slice(0,20000).filter(l=>Number.isFinite(l?.time)&&l.time>=0&&typeof l.text==='string').map(l=>({time:l.time,text:l.text.slice(0,1000)})).sort((a,b)=>a.time-b.time);
    return {trackId,enabled:value.enabled===true,...(align&&lines.length?{alignment:true}:{}),offset:Number.isFinite(value.offset)?Math.max(-86400,Math.min(86400,value.offset)):0,lines};
  }
  function variationSnapshot(value, trackId) {
    const id = /^section-\d+-\d+$/;
    if (!trackId || value?.trackId !== trackId || typeof value.aId !== 'string' || typeof value.bId !== 'string' ||
        value.aId.length > 60 || value.bId.length > 60 || !id.test(value.aId) || !id.test(value.bId) || value.aId === value.bId) return null;
    return {trackId, aId: value.aId, bId: value.bId};
  }
  function lyricAt(snapshot,time,section){
    if(!snapshot?.enabled||/^(intro|interlude|outro|引子|前奏|间奏|尾奏|尾声)(\s|$)/i.test(section||''))return '';
    const t=time-(snapshot.offset||0),rows=snapshot.lines||[];
    let lo=0,hi=rows.length;
    while(lo<hi){const mid=(lo+hi)>>>1;if(rows[mid].time<=t)lo=mid+1;else hi=mid;}
    return lo?rows[lo-1].text:'';
  }
  // 车窗地貌's sill line (2026-11-19, batch 4): the line being sung and how far into it the song is (0-1: from its own
  // time to the next line's, or to the end of its section for the last one), for scrolling a line too long for the sill.
  // Dark where lyricAt is dark, and also before the first section row, after the last one, and in sections whose kind or
  // name says nobody sings (器乐段 too, which lyricAt lets through).
  const QUIET_KIND=/^(intro|inst|interlude|instrumental|outro|solo)$/i;
  function sillLyric(snapshot,time,sections){
    const none={line:'',progress:null};
    if(!snapshot?.enabled)return none;
    const rows=(Array.isArray(sections)?sections:[]).filter(r=>Array.isArray(r)&&Number.isFinite(r[0])&&Number.isFinite(r[1]));
    if(rows.length){
      if(time<Math.min(...rows.map(r=>r[0]))||time>=Math.max(...rows.map(r=>r[1])))return none;
      const row=rows.find(r=>r[0]<=time&&time<r[1]);
      if(row&&(QUIET_KIND.test(String(row[4]||''))||/^(intro|interlude|outro|引子|前奏|间奏|尾奏|尾声|器乐段?|独奏)(\s|\d|$)/i.test(String(row[2]||'').trim())))return none;
    }
    const t=time-(snapshot.offset||0),lines=snapshot.lines||[];
    let lo=0,hi=lines.length;
    while(lo<hi){const mid=(lo+hi)>>>1;if(lines[mid].time<=t)lo=mid+1;else hi=mid;}
    const at=lines[lo-1];
    if(!at||!at.text)return none;
    const own=rows.find(r=>r[0]<=time&&time<r[1]);
    let end=lo<lines.length?lines[lo].time:own?own[1]-(snapshot.offset||0):NaN;
    if(!(end>at.time))end=at.time+6;
    return {line:at.text,progress:Math.max(0,Math.min(1,(t-at.time)/(end-at.time)))};
  }
  function fitFooterText(context, text, width, continuation = false) {
    const glyphs = Array.from(String(text || ''));
    if (!glyphs.length || width <= 0) return {line: '', rest: ''};
    if (context.measureText(text).width <= width) return {line: text, rest: ''};
    const mark = continuation ? '' : '…';
    let lo = 0, hi = glyphs.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (context.measureText(glyphs.slice(0, mid).join('') + mark).width <= width) lo = mid;
      else hi = mid - 1;
    }
    if (!lo) return {line: '', rest: text};
    let cut = lo;
    if (continuation && /[A-Za-z0-9]/.test(glyphs[lo - 1]) && /[A-Za-z0-9]/.test(glyphs[lo] || '')) {
      let word = lo;
      while (word > 0 && /[A-Za-z0-9]/.test(glyphs[word - 1])) word--;
      if (word >= lo * .72) cut = word;
    }
    return {line: glyphs.slice(0, cut).join('').trimEnd() + mark, rest: glyphs.slice(cut).join('').trimStart()};
  }
  function drawFooter(context, model, options, lyrics, cover, time, width, height, theme) {
    const scale=height/1080, compact=width/height<.9, opening=time<4;
    const ink={paper:'#46524e',ember:'#d7cabe',water:'#d0dce8',mist:'#ccd4e0'}[theme] || '#c7d4dc';
    const artist=/^(unknown artist|未知艺术家|—)$/i.test(model.track.artist||'')?'':model.track.artist||'';
    const album=/^(local library|本地曲库|单曲|single|—)$/i.test(model.track.album||'')?'':model.track.album||'';
    const title=opening?model.track.title:[model.track.title,artist].filter(Boolean).join(' · ');
    const section=sectionLabel((model.sections||[]).find(s=>s[0]<=time&&time<s[1])?.[2]);
    const lyric=lyricAt(lyrics,time,section);
    const size=(compact?28:opening?56:38)*scale;
    const x=32*scale, baseline=height-(compact?17:35)*scale;
    const hasCover=Boolean(cover&&(cover.naturalWidth||cover.width));
    context.save();context.textBaseline='middle';context.fillStyle=ink;
    if(hasCover)context.drawImage(cover,x,baseline-size/2,size,size);
    const textX=x+(hasCover?size+12*scale:0);
    const tick=Math.round(time*100);
    const stamp=Math.floor(tick/6000)+':'+String(Math.floor(tick/100)%60).padStart(2,'0')+'.'+String(tick%100).padStart(2,'0');
    context.textAlign='right';context.font='400 '+18*scale+'px '+FONT;
    const clockLeft=width-x-context.measureText(stamp).width;
    context.fillText(stamp,width-x,baseline);

    const gap=22*scale;
    const titleRight=compact?clockLeft-gap:Math.min(clockLeft-gap,width*(lyric?.246:.57));
    const titleRoom=Math.max(0,titleRight-textX);
    context.textAlign='left';context.font='400 '+20*scale+'px '+FONT;
    context.fillText(fitFooterText(context,title,titleRoom).line,textX,baseline-(opening&&!compact?10*scale:0));
    if(opening&&!compact){
      context.font='400 '+16*scale+'px '+FONT;
      context.fillText(fitFooterText(context,[artist,album].filter(Boolean).join(' · '),titleRoom).line,textX,baseline+16*scale);
    }

    const lyricLines=[];
    if(lyric){
      context.textAlign='center';context.font='400 '+(compact?22:25)*scale+'px '+FONT;
      const edge=compact?x:Math.max(titleRight+gap,width-clockLeft+gap);
      const room=Math.max(0,width-2*edge);
      const measure=context.measureText(lyric).width;
      const balanced=measure>room&&measure<room*1.88?Math.min(room,measure*.55):room;
      let first=fitFooterText(context,lyric,balanced,true);
      if(balanced<room&&context.measureText(first.rest).width>room)first=fitFooterText(context,lyric,room,true);
      const next=fitFooterText(context,first.rest,room);
      if(first.line)lyricLines.push(first.line);
      if(next.line)lyricLines.push(next.line);
      const row=height-(compact?(lyricLines.length>1?66:55):(lyricLines.length>1?48:35))*scale;
      lyricLines.forEach((line,index)=>context.fillText(line,width/2,row+index*23*scale));
    }
    context.restore();return {bottom:48,coverSize:hasCover?size:0,opening,lyric,lyricLines,section};
  }
  const translated=model=>({...model,sections:(model.sections||[]).map(row=>[row[0],row[1],sectionLabel(row[2]),...row.slice(3)])});
  // Previously saved film jobs may still explicitly request the archived stage.
  const renderStyle=value=>value==='theatre'?'theatre':root.XinScoreMood?.normalize(value)||'starry';
  function create(canvas,model,clock,initial={}){
    // 星空 is the night sky (the core's nightSky); 「原样」 ('plain') is the same core with it off, as 星空 drew until 0.30.0.
    const normal=Core.create(canvas,translated(model),clock,{...initial,meteorMotion:true,nightSky:renderStyle(initial.scoreStyle)==='starry'}),ctx=canvas.getContext('2d');
    let options={...normal.options(),scoreStyle:renderStyle(initial.scoreStyle),presentationLayout:initial.presentationLayout===true,lang:initial.lang},movie=null,filmCanvas=null,cover=null,lyrics=null,last=null,raf=null;
    let surface=null;const surfaceStyle=()=>root.XinScoreSurface?.styles.includes(options.scoreStyle);const ensureSurface=()=>surface||(surface=root.XinScoreSurface.create(canvas,model,clock,options,layoutSource));
    let mist = null;
    const mistStyle = () => options.scoreStyle === 'mist' && root.XinScoreMist;
    const ensureMist = () => mist || (mist = root.XinScoreMist.create(canvas, model, clock, options, layoutSource));
    let mood=null;const ensureMood=()=>mood||(mood=root.XinScoreMood.create(canvas,model,clock,options));
    const moodStyle = () => ['glass','overprint','theatre'].includes(options.scoreStyle) && root.XinScoreMood;
    const artRenderer = () => root.XinArt?.[options.scoreStyle];
    let artFrame = null, artScene = null;
    let variation = null, variationEnabled = initial.variationEnabled === true;
    let variationSelection = variationSnapshot(initial.variation, model.track.id);
    let variationLang = initial.variationLang;
    let comparisonLyrics = null;
    const comparisonStyle = () => options.scoreStyle === 'starry' || options.scoreStyle === 'paper';
    function variationController() {
      if (!comparisonStyle() || !(variationEnabled || variationSelection) || !root.XinScoreVariation) return null;
      if (!variation) {
        variation = root.XinScoreVariation.create(model);
        if (variationSelection && !variation.setPair(variationSelection.aId, variationSelection.bId) && !variationEnabled) {
          variationSelection = null;
          variation = null;
          return null;
        }
        comparisonLyrics = null;
      }
      const lines = (lyrics?.enabled || lyrics?.alignment) && lyrics.lines?.length ? lyrics.lines : null;
      if (comparisonLyrics?.lines !== lines || comparisonLyrics?.offset !== (lyrics?.offset || 0)) {
        comparisonLyrics = {lines, offset: lyrics?.offset || 0};
        variation.setLyrics(lines ? {trackId: lyrics.trackId, lines, offset: comparisonLyrics.offset} : null);
      }
      return variation;
    }
    function paintVariation(context, frame) {
      return variationController()?.draw(context, frame, {style: options.scoreStyle, lang: variationLang,
        showContour: options.showContour, focusGroup: options.focusGroup});
    }
    function presentationOptions() {
      const pair = variationController()?.pair;
      // The live lyric overlay asks for timeAt(width * playhead).
      const detail = artRenderer() && artScene?.detail;
      const reading = detail ? {
        playhead:options.scoreStyle === 'flag' ? detail.playheadX / artFrame.w : (detail.playheadX-detail.left)/(detail.right-detail.left),
        windowSeconds:detail.span
      } : {};
      return {...options, ...reading, hidden:options.hidden.slice(),
        variation: pair ? {trackId:model.track.id,aId:pair.a.id,bId:pair.b.id} : null};
    }
    let metrics={width:1280,height:720,scale:1,ratio:1};
    const movieOptions=()=>({...options,albumLayout:true,albumSidebarGap:0,quietText:true,showCaptions:false,liveTextureRaster:false,backdrop:'section'});
    function ensureMovie(){
      if(movie)return;
      filmCanvas=canvas.ownerDocument.createElement('canvas');
      // Stable logical geometry; only its backing raster follows the output density.
      Object.defineProperties(filmCanvas,{clientWidth:{get:()=>metrics.width},clientHeight:{get:()=>metrics.height-56},scoreRenderRatio:{get:()=>metrics.scale*metrics.ratio}});
      movie=Core.create(filmCanvas,translated(model),clock,movieOptions());
      if(cover)movie.setCover(cover);
    }
    function resize(){
      if(!options.presentationLayout){normal.resize();return;}
      const ratio=Math.max(1,Math.min(2.5,Number(root.devicePixelRatio)||1));
      const width=canvas.clientWidth||canvas.width/ratio||1280,height=canvas.clientHeight||canvas.height/ratio||720;
      metrics={width:width/height*720,height:720,scale:height/720,ratio};
      const pw=Math.round(width*ratio),ph=Math.round(height*ratio);
      if(canvas.width!==pw)canvas.width=pw;if(canvas.height!==ph)canvas.height=ph;
      ensureMovie();movie.resize();
    }
    function footer(time) {
      return drawFooter(ctx,model,options,lyrics,cover,time,metrics.width,720,'starry');
    }
    // Materials read the exact core that starry draws, including its live lane options.
    function layoutSource() {
      resize();
      return options.presentationLayout
        ? {view:movie, canvas:filmCanvas, unit:1.5, top:12}
        : {view:normal, canvas, unit:1080/(canvas.clientHeight||720), top:0};
    }
    function artTime(at) {
      return Math.max(0, Math.min(model.track.duration, (Number.isFinite(at) ? at : clock()) + (options.offsetSeconds || 0)));
    }
    function drawArt(renderer, at, locating) {
      resize();
      const ratio = Math.max(1, Math.min(2.5, Number(root.devicePixelRatio) || 1));
      // World-space grain and type use the same composition in immersive playback and export.
      const w = options.presentationLayout ? metrics.width : canvas.clientWidth || canvas.width / ratio;
      const h = options.presentationLayout ? metrics.height : canvas.clientHeight || canvas.height / ratio;
      const time = artTime(at);
      const sectionName = (model.sections || []).find(row => row[0] <= time && time < row[1])?.[2];
      const flag = options.scoreStyle === 'flag';
      const section = flag && /^zh\b/i.test(options.lang) ? String(sectionName || '') : sectionLabel(sectionName);
      // 车窗地貌 shows title, sections and words only on its carriage displays: the sill gets its own line and progress,
      // and the roadside option rides with the frame.
      const terrain = options.scoreStyle === 'terrain', sill = terrain ? sillLyric(lyrics, time, model.sections) : null;
      const lyric = terrain ? sill.line : lyricAt(lyrics, time, section);
      artFrame = {w, h, song:model, key:model.track.id, time, duration:model.track.duration, playing:!locating,
        section, lyric, cover, presentationLayout:options.presentationLayout, albumLayout:options.albumLayout,
        ...(flag ? {lang:options.lang, hidden:options.hidden, focusGroup:options.focusGroup} : {}),
        ...(terrain ? {terrainRoadside:options.terrainRoadside || 'all', ...(sill.line ? {lyricProgress:sill.progress} : {})} : {})};
      ctx.save();
      try {
        ctx.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);
        artScene = renderer.draw(ctx, artFrame);
      } finally { ctx.restore(); }
      const detail = artScene?.detail;
      last = {time, style:options.scoreStyle, notes:detail?.notes?.length || 0, section, window:detail ? [detail.start,detail.end] : [time,time],
        presentation:{section,lyric}, overview:artScene?.overview, locating:Boolean(locating)};
      return last;
    }
    function draw(at, locating = false){
      const renderer = artRenderer();
      if (renderer) return drawArt(renderer, at, locating);
      const painter = variationController() ? paintVariation : undefined;
      if (mistStyle() || surfaceStyle() || moodStyle()) {
        const renderer = mistStyle() ? ensureMist() : surfaceStyle() ? ensureSurface() : ensureMood();
        renderer.setCover(cover);
        renderer.setLyrics(lyrics);
        const time = (Number.isFinite(at) ? at : clock()) + (options.offsetSeconds || 0);
        last = renderer.draw(time, options, painter);
        return last;
      }
      if(!options.presentationLayout){last={...normal.draw(at,painter),style:'starry',layout:normal.layoutSnapshot?.()};return last;}
      resize();const frame=movie.draw(at,painter),r=metrics.scale*metrics.ratio;
      ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#1a1d21';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(filmCanvas,0,8*r,canvas.width,(metrics.height-56)*r);
      ctx.setTransform(r,0,0,r,0,0);last={...frame,style:'starry',layout:movie.layoutSnapshot?.(),presentation:footer(frame.time)};
      ctx.setTransform(1,0,0,1,0,0);return last;
    }
    function setOptions(patch = {}) {
      const priorStyle = options.scoreStyle, priorLayout = options.presentationLayout;
      normal.setOptions({...patch,meteorMotion:true,nightSky:renderStyle(patch.scoreStyle??options.scoreStyle)==='starry'});
      options = {...normal.options(),scoreStyle:renderStyle(patch.scoreStyle??options.scoreStyle),
        presentationLayout:typeof patch.presentationLayout==='boolean'?patch.presentationLayout:options.presentationLayout,
        lang:typeof patch.lang==='string'?patch.lang:options.lang};
      if (options.scoreStyle !== priorStyle || options.presentationLayout !== priorLayout) {
        artFrame = null;
        artScene = null;
      }
      if (typeof patch.variationEnabled === 'boolean') variationEnabled = patch.variationEnabled;
      if (Object.hasOwn(patch, 'variation')) {
        variationSelection = variationSnapshot(patch.variation, model.track.id);
        if (variation && variationSelection) variation.setPair(variationSelection.aId, variationSelection.bId);
      }
      if (typeof patch.variationLang === 'string') variationLang = patch.variationLang;
      if(movie)movie.setOptions(movieOptions());
      mood?.setOptions(options);surface?.setOptions(options);mist?.setOptions(options);
      resize();return {...options};
    }
    function setModel(next) {
      model=next;lyrics=null;variation=null;variationSelection=null;comparisonLyrics=null;
      artFrame=null;artScene=null;
      mood?.setModel(next);surface?.setModel(next);mist?.setModel(next);
      normal.setModel(translated(next));if(movie)movie.setModel(translated(next));
    }
    function setCover(image,measure){cover=image;const ok=normal.setCover(image,measure);if(movie)movie.setCover(image,measure);return ok;}
    const active=()=>options.presentationLayout?(ensureMovie(),movie):normal;
    const artScale=()=>options.presentationLayout?metrics.scale:1;
    function timeAt(x,at) {
      if (artRenderer() && artScene?.detail) {
        const {playheadX,pxPerSecond}=artScene.detail;
        return artTime(at)+(x/artScale()-playheadX)/pxPerSecond;
      }
      return active().timeAt(options.presentationLayout?x/metrics.scale:x,at);
    }
    function xOf(time,at) {
      if (artRenderer() && artScene?.detail) {
        const {playheadX,pxPerSecond}=artScene.detail;
        return (playheadX+(time-artTime(at))*pxPerSecond)*artScale();
      }
      return active().xOf(time,at)*(options.presentationLayout?metrics.scale:1);
    }
    function stop(){if(raf!==null)root.cancelAnimationFrame?.(raf);raf=null;normal.stop();movie?.stop();}
    const api={...normal,draw,resize,ready:()=>mistStyle()?ensureMist().ready():surfaceStyle()?ensureSurface().ready():moodStyle()?ensureMood().ready():Promise.resolve(),
      setOptions,setModel,setCover,variationController,options:presentationOptions,
      setLyrics:value=>{lyrics=value?.trackId===model.track.id&&!value?.hidden?value:null},lastFrame:()=>last?{...last}:normal.lastFrame(),
      timeAt,xOf,
      hit:(x,y)=>{
        const renderer = artRenderer();
        if (renderer) {
          if (!artFrame) return null;
          const scale=artScale();
          const time = renderer.timeAt(x/scale,y/scale,artFrame);
          return Number.isFinite(time) ? {kind:'time',time:Math.max(0,Math.min(model.track.duration,time-(options.offsetSeconds || 0)))} : null;
        }
        return moodStyle()?ensureMood().hit(x,y):active().hit(options.presentationLayout?x/metrics.scale:x,options.presentationLayout?y/metrics.scale-8:y);
      },
      start:()=>{if(raf!==null)return;const tick=()=>{raf=root.requestAnimationFrame(tick);draw()};raf=root.requestAnimationFrame(tick)},stop,destroy:()=>{stop();mist?.destroy();surface?.destroy();mood?.destroy?.()}};
    resize();return api;
  }
  return Object.freeze({create,sectionLabel,lyricsSnapshot,variationSnapshot,lyricAt,sillLyric,drawFooter});
});
