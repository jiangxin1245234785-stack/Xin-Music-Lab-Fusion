// Self-contained stages use the song's real note events and absolute beat clock.
// Their layout is rebuilt for the available canvas, never letterboxed to a poster.
(function(root) {
  'use strict';
  const styles=['starry','plain','overprint','glass','paper','ember','water','mist','terrain','flag'];
  const assetRoot=new URL('./assets/mood/',root.document.currentScript.src);
  const assets={};
  let theatreAssets;
  function loadTheatreAssets() {
    return theatreAssets ||= Promise.all([
      ['theatre','theatre-paper-material.png'],
      ['performers','performers.png'],
      ['pianist','pianist.png']
    ].map(async([name,file])=>{
      const image=new root.Image();image.src=new URL(file,assetRoot).href;
      try {await image.decode();assets[name]=image;} catch {assets[name]=null;}
    }));
  }
  const normalize=value=>styles.includes(value)?value:'starry';
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const noise=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x)};
  const lower=(array,value,key=x=>x)=>{
    let low=0,high=array.length;
    while(low<high){const middle=(low+high)>>>1;if(key(array[middle])<value)low=middle+1;else high=middle;}
    return low;
  };
  const stamp=time=>Math.floor(time/60)+':'+(time%60).toFixed(2).padStart(5,'0');
  const clean=value=>/^(unknown artist|未知艺术家|—|single|单曲|local library|本地曲库)$/i.test(value||'')?'':value||'';
  const FONT='"Segoe UI","Microsoft YaHei",sans-serif';

function spellPitch(midi,flats=true){
  const pitch=Math.round(midi),pc=((pitch%12)+12)%12;
  const flatLetters=[0,1,1,2,2,3,4,4,5,5,6,6],sharpLetters=[0,0,1,1,2,3,3,4,4,5,5,6];
  const altered=[1,3,6,8,10].includes(pc);
  return {diatonic:(Math.floor(pitch/12)-1)*7+(flats?flatLetters[pc]:sharpLetters[pc]),
    accidental:altered?(flats?'♭':'♯'):'',midi:pitch};
}

  function create(canvas,model,clock,initial={}) {
    const stage=canvas.ownerDocument.createElement('canvas');
    const p=stage.getContext('2d');
    const palette=['#bb3c2a','#2e597f','#aa8a2e','#4c6b57','#384957','#755581','#9c6b46','#548789'];
    const paperCache=new Map(),spriteCache=new Map(),staffCache=new Map();
    let W=1920,H=1080,options=initial,cover=null,lyrics=null,last=null;
    let dbBoundsModel=null,dbBounds=null;
    let names=[],groups=[],sourceGroups=[],scoreEvents=[],events=[],beats=[],downbeats=[],longest=0,now=0,motion=null;
    let viewport={width:1280,height:720,unit:1.5},preparedWindow=[];

    function line(x,y,X,Y,color,width=1) {
      p.beginPath();p.moveTo(x,y);p.lineTo(X,Y);p.strokeStyle=color;p.lineWidth=width;p.stroke();
    }
    function ellipse(x,y,rx,ry,color) {
      p.beginPath();p.ellipse(x,y,rx,ry,0,0,Math.PI*2);p.fillStyle=color;p.fill();
    }
    function polygon(points,color,edge,width=1) {
      p.beginPath();points.forEach(([x,y],i)=>i?p.lineTo(x,y):p.moveTo(x,y));p.closePath();
      p.fillStyle=color;p.fill();if(edge){p.strokeStyle=edge;p.lineWidth=width;p.stroke();}
    }
    function round(x,y,w,h,r,color,edge,width=1) {
      p.beginPath();p.roundRect(x,y,w,h,r);p.fillStyle=color;p.fill();
      if(edge){p.strokeStyle=edge;p.lineWidth=width;p.stroke();}
    }
    function text(value,x,y,size,color,maxWidth,font=FONT,align='left') {
      let valueShown=String(value||'');
      p.font=`${font.includes('Impact')?'900 ':''}${size}px ${font}`;p.fillStyle=color;p.textAlign=align;p.textBaseline='middle';
      while(valueShown&&p.measureText(valueShown).width>Math.max(0,maxWidth))valueShown=valueShown.slice(0,-2)+'…';
      p.fillText(valueShown,x,y);return valueShown;
    }
    function arc(cx,cy,r,a,b,color,width=1) {
      if(b<=a)return;
      p.beginPath();p.arc(cx,cy,r,a,b);p.strokeStyle=color;p.lineWidth=width;p.stroke();
    }
    function paper(color,grain) {
      const key=color+':'+W;
      if(paperCache.has(key)){p.drawImage(paperCache.get(key),0,0);return;}
      p.fillStyle=color;p.fillRect(0,0,W,H);
      for(let i=0;i<W*15;i++){
        p.fillStyle=i%2?grain:'rgba(255,255,255,.08)';
        p.fillRect(noise(i+11)*W,noise(i+12000)*H,.5+noise(i+80)*1.1,.5);
      }
      const cached=canvas.ownerDocument.createElement('canvas');cached.width=W;cached.height=H;
      cached.getContext('2d').drawImage(stage,0,0);
      if(paperCache.size>4)paperCache.clear();paperCache.set(key,cached);
    }
    function rebuild() {
      names=[];groups=[];sourceGroups=[];events=[];scoreEvents=[];longest=0;staffCache.clear();
      const laneMap=new Map();
      for(const lane of model.lanes||[]) {
        if((options.hidden||[]).includes(lane.id))continue;
        const drum=lane.kind==='drums',group=lane.group||'other';
        let notes=drum?lane.hits||[]:lane.notes||[];
        if(!notes.length)continue;
        const key=options.mergeTimbres===false?lane.id:group;
        if(!laneMap.has(key)){
          laneMap.set(key,names.length);sourceGroups.push(group);
          groups.push(root.XinScoreView.isOtherMidi(lane)?'strings':group);
          names.push(String(options.mergeTimbres===false?lane.label||group:lane.groupLabel||group).toUpperCase());
        }
        const band=laneMap.get(key);
        for(const note of notes){
          const duration=drum?.08:note[1];if(!Number.isFinite(note[0])||!(duration>0))continue;
          scoreEvents.push({start:note[0],end:note[0]+duration,pitch:drum?note[1]:note[2],velocity:drum?note[2]:note[3],group,band,markGroup:band,lane:lane.id,drumName:drum?lane.rows?.[note[1]]:null});
        }
        if(!drum&&options.simplify)notes=root.XinScoreView.simplifyNotes(notes,{...root.XinScoreView.SIMPLIFY,struck:root.XinScoreView.STRUCK_GROUPS.includes(group)}).notes;
        for(const note of notes) {
          const duration=drum?.08:note[1];
          if(!Number.isFinite(note[0])||!Number.isFinite(duration)||duration<=0)continue;
          longest=Math.max(longest,duration);
          events.push({time:note[0],duration,pitch:drum?note[1]:note[2],velocity:drum?note[2]:note[3],band,lane:lane.id});
        }
      }
      scoreEvents=root.XinScoreView.canonicalOnsets(scoreEvents).map(e=>({...e,time:e.start,duration:e.end-e.start}));
      if(!names.length){names=['SCORE'];groups=['other'];sourceGroups=['other'];}
      events.sort((a,b)=>a.time-b.time);
      const strokes=new Map();
      for(const event of scoreEvents){
        const old=strokes.get(event.band);
        if(!old||Math.abs(old.time-event.time)>.001)strokes.set(event.band,{time:event.time,count:(old?.count||0)+1});
        event.stroke=strokes.get(event.band).count%2?-1:1;
      }
      const drumHands=new Map();
      for(const event of scoreEvents){
        if(groups[event.band]!=='drums')continue;
        const next=drumHands.get(event.band)||0;
        event.hand=event.drumName==='kick'?null:event.drumName==='snare'?0:['hihat','openhat','crash','ride'].includes(event.drumName)?1:next%2;
        drumHands.set(event.band,next+1);
      }
      beats=[...new Set((model.bars?.beats||[]).filter(Number.isFinite))].sort((a,b)=>a-b);
      downbeats=[...new Set((model.bars?.downbeats||[]).filter(Number.isFinite))].sort((a,b)=>a-b);
    }
    function beatAt(time) {
      if(beats.length<2)return time/beatStep();
      const index=clamp(lower(beats,time)-1,0,beats.length-2);
      return index+(time-beats[index])/(beats[index+1]-beats[index]);
    }
    function timeAtBeat(beat) {
      if(beats.length<2)return beat*beatStep();
      const index=clamp(Math.floor(beat),0,beats.length-2);
      return beats[index]+(beat-index)*(beats[index+1]-beats[index]);
    }
    function beatStep(){const bpm=Number(model.bars?.bpm);return bpm>=40&&bpm<=240?60/bpm:.5;}
    function section(){return root.XinScorePresentation.sectionLabel((model.sections||[]).find(s=>s[0]<=now&&now<s[1])?.[2])||'';}
    function windowEvents(start,end) {
      const result=[];
      for(let i=lower(events,start-longest,e=>e.time);i<events.length&&events[i].time<end;i++){
        if(events[i].time+events[i].duration>start)result.push(events[i]);
      }
      return result;
    }
    function groupActivity(group) {
      let held=0,attack=0,velocity=0,lead=null;
      const hands=[0,0];
      const lookback=now-1.4;
      for(let i=lower(scoreEvents,lookback-longest,e=>e.time);i<scoreEvents.length&&scoreEvents[i].time<=now;i++){
        const event=scoreEvents[i];if(event.band!==group)continue;
        const age=now-event.time,level=(event.velocity||70)/127;
        const impulse=Math.exp(-age/.17)*level;
        attack=Math.max(attack,impulse);
        if(Number.isInteger(event.hand))hands[event.hand]=Math.max(hands[event.hand],impulse);
        if(age<event.duration){held=Math.max(held,level);velocity=Math.max(velocity,level);if(!lead||event.time>lead.time)lead=event;}
      }
      return {held,attack,velocity,level:Math.max(held*.7,attack),hands,phase:lead?clamp((now-lead.time)/lead.duration,0,1):0,note:lead?{time:lead.time,duration:lead.duration,pitch:lead.pitch,stroke:lead.stroke}:null};
    }
    function resize() {
      const ratio=clamp(Number(root.devicePixelRatio)||1,1,2.5);
      const width=canvas.clientWidth||canvas.width/ratio||1280;
      const height=canvas.clientHeight||canvas.height/ratio||720;
      W=Math.max(1,Math.round(width/height*1080));
      viewport={width,height,unit:1080/height};
      if(stage.width!==W)stage.width=W;if(stage.height!==H)stage.height=H;
      if(canvas.width!==Math.round(width*ratio))canvas.width=Math.round(width*ratio);
      if(canvas.height!==Math.round(height*ratio))canvas.height=Math.round(height*ratio);
    }
    function header(theme) {
      if(theme==='overprint'){printHeader();return;}
      const internal=options.presentationLayout||!options.albumLayout;
      const x=38,top=theme==='theatre'?80:76;
      const photo=84;
      const inset=internal&&cover?photo+22:0;
      const titleWidth=W-2*x-inset-(W<900?0:130);
      const title=internal?model.track.title:section();
      const titleX=x+inset;
      if(internal&&cover&&(cover.naturalWidth||cover.width)){
        p.save();p.translate(x+45,top+9);
        p.fillStyle='#ceb47e';p.fillRect(-photo/2-5,-photo/2-5,photo+10,photo+10);
        p.drawImage(cover,-photo/2,-photo/2,photo,photo);p.restore();
      }
      text(title,titleX,top,W<900?32:46,'#ecd6a9',Math.max(60,titleWidth),'"Arial Black","Microsoft YaHei",sans-serif');
      if(internal)text([clean(model.track.artist),clean(model.track.album)].filter(Boolean).join(' · '),titleX,top+(W<900?60:40),19,'#d5ba85',Math.max(60,W-titleX-38));
      text(stamp(now),W-38,top-2,25,'#e0ca9d',110,FONT,'right');
    }
    function lyricLine(theme) {
      if(theme==='glass')return motion?.lyric||'';
      const textValue=options.presentationLayout?root.XinScorePresentation.lyricAt(lyrics,now,section()):'';
      if(!textValue)return '';
      if(theme==='overprint'){printLyric(textValue);return textValue;}
      const x=Math.max(30,W*.13),width=W-2*x;
      round(x,982,width,61,3,'#21483fe8','#a18b5a');
      text(textValue,W/2,1013,25,'#eed4a2',width-24,'"Microsoft YaHei",sans-serif','center');
      return textValue;
    }

    const printRed='#d63527',printBlue='#2445ab',printInk='#242b41',printPurple='#663456';
    const printTitle='900 %dpx "Arial Black","Microsoft YaHei",sans-serif';
    let printSource=null,printBands=[],printCurves=new Map();

    function printLayout(){
      const portrait=W<720,wide=W>=1240;
      const margin=clamp(W*.034,9,52),right=W-margin;
      const top=options.presentationLayout?(portrait?292:wide?250:270):options.albumLayout?150:246;
      return {portrait,wide,margin,right,top,bottom:H-margin,
        left:Math.max(margin+32,Math.min(W*.145,margin+141))};
    }

    function printTextRows(value,width,font,maxRows){
      p.font=font;
      const units=String(value||'').trim().match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}，。、；：！？）】》」』）…,.!?:;\s]|[^\s\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}，。、；：！？）】》」』）…,.!?:;]+/gu)||[];
      const words=[];
      for(const unit of units){
        if(/^[，。、；：！？）】》」』…,.!?:;]$/u.test(unit)&&words.length){
          while(words.length&&/^\s+$/u.test(words.at(-1)))words.pop();
          if(words.length){words[words.length-1]+=unit;continue;}
        }
        words.push(unit);
      }
      const rows=[];let row='';
      for(const word of words){
        if(/^\s+$/u.test(word)){
          if(row&&!row.endsWith(' '))row+=' ';
          continue;
        }
        if(p.measureText(row+word).width>width&&row.trim()){
          rows.push(row.trim());row='';
        }
        if(p.measureText(word).width<=width){row+=word;continue;}
        for(const character of word){
          if(row&&p.measureText(row+character).width>width){rows.push(row.trim());row='';}
          row+=character;
        }
      }
      if(row.trim())rows.push(row.trim());
      if(rows.length<=maxRows)return rows;
      const last=[...rows[maxRows-1]];
      while(last.length&&p.measureText(last.join('')+'…').width>width)last.pop();
      return [...rows.slice(0,maxRows-1),last.join('').trimEnd()+'…'];
    }

    function printFit(value,width,preferred,minSize,fontFor,maxRows){
      let size=preferred,font=fontFor(size),rows=printTextRows(value,width,font,maxRows);
      while(size>minSize&&rows.at(-1)?.endsWith('…')){
        size=Math.max(minSize,size*.92);
        font=fontFor(size);rows=printTextRows(value,width,font,maxRows);
      }
      return {size,font,rows};
    }


    function printHeader(){
      const {margin,right,wide,portrait,top}=printLayout();
      const internal=options.presentationLayout||!options.albumLayout;
      const title=internal?model.track.title:section();
      const hasCover=internal&&cover&&(cover.naturalWidth||cover.width);
      const coverSize=portrait?clamp(W*.195,40,123):wide?154:126;
      const coverY=portrait?37:41;
      const titleX=margin+(hasCover?coverSize+(portrait?14:30):0);
      const split=wide?Math.round(W*.64):right;
      const titleWidth=Math.max(30,split-titleX-(wide?38:6));
      if(hasCover){
        const pw=cover.naturalWidth||cover.width,ph=cover.naturalHeight||cover.height,sq=Math.min(pw,ph);
        p.save();
        p.translate(margin+coverSize/2+1,coverY+coverSize/2);
        p.rotate(-.045);
        p.fillStyle=printBlue;p.fillRect(-coverSize/2+4,-coverSize/2+5,coverSize+6,coverSize+8);
        p.rotate(.057);
        p.fillStyle=printRed;p.fillRect(-coverSize/2-4,-coverSize/2-4,coverSize+8,coverSize+8);
        p.fillStyle='#fff6df';p.fillRect(-coverSize/2-1,-coverSize/2-1,coverSize+2,coverSize+2);
        p.drawImage(cover,(pw-sq)/2,(ph-sq)/2,sq,sq,-coverSize/2+2,-coverSize/2+2,coverSize-4,coverSize-4);
        p.restore();
      }
      const preferred=internal?(portrait?clamp(W*.082,27,57):clamp(titleWidth*.09,44,86)):44;
      const {size,font,rows:lines}=printFit(title,titleWidth,preferred,preferred*.72,
        size=>printTitle.replace('%d',size),2);
      const titleY=internal?(portrait?62:wide?81:70):58;
      p.save();p.font=font;p.textAlign='left';p.textBaseline='middle';
      for(const [i,label] of lines.entries()){
        const y=titleY+i*size*.96;
        p.fillStyle=printBlue;p.fillText(label,titleX+Math.max(2,size*.054),y+size*.047);
        p.fillStyle=printRed;p.fillText(label,titleX,y);
        p.fillStyle=printInk;p.fillText(label,titleX+Math.max(1,size*.028),y+size*.021);
      }
      p.restore();
      const metadata=[clean(model.track.artist),clean(model.track.album)].filter(Boolean).join(' · ');
      if(internal&&metadata){
        const metaSize=portrait?17:22;
        const metaFont='600 '+metaSize+'px '+FONT;
        const meta=printTextRows(metadata,titleWidth,metaFont,1)[0];
        p.font=metaFont;p.textAlign='left';p.textBaseline='middle';p.fillStyle=printInk;
        if(meta)p.fillText(meta,titleX,titleY+(lines.length-.19)*size+8);
      }
      const clockY=wide?60:portrait&&options.presentationLayout?19:top-(options.presentationLayout?51:56);
      const clockSize=portrait?20:25;
      text(stamp(now),right,clockY,clockSize,printBlue,110,'"Consolas",monospace','right');
      line(margin,top-32,right,top-32,printBlue,1.7);
      const markEnd=Math.min(right,margin+Math.max(19,coverSize*.65));
      line(margin,top-29,markEnd,top-29,printRed,2.5);
      for(let x=right-Math.min(38,W*.095);x<right;x+=8)
        line(x,top-31,x+5,top-39,'#d63527b3',1.2);
    }

    function printLyric(value){
      const {margin,right,wide,portrait,top}=printLayout();
      const x=wide?Math.round(W*.64):margin;
      const width=right-x-(wide?2:portrait?8:100);

      const preferred=wide?clamp(width*.057,24,39):portrait?clamp(width*.057,20,31):30;
      const {size,font,rows}=printFit(value,width-32,preferred,Math.max(19,preferred*.79),
        size=>'650 '+size+'px '+FONT,2);
      if(!rows.length)return;
      const w=Math.min(width,Math.max(...rows.map(row=>p.measureText(row).width))+32);
      const h=rows.length*size*1.12+18,y=wide?91:top-48-h;
      const strip=[[x+2,y+1],[x+w-1,y-2],[x+w+2,y+h-3],[x-2,y+h+2]];
      const registration=strip.map(([xx,yy],i)=>[xx+(i===2?7:4),yy+(i<2?3:5)]);
      polygon(registration,printRed);
      polygon(strip,printBlue);
      line(x+3,y+h-3,x+w-4,y+h-5,printPurple,2.3);
      p.font=font;p.fillStyle='#fff7e4';p.textAlign='left';p.textBaseline='middle';
      rows.forEach((row,i)=>p.fillText(row,x+15,y+9+size*(.56+i*1.12)));
    }

    // Measured downbeats keep their own times, including those between beat samples.
    function printTicks(start,end) {
      const result=[];
      const count=Math.max(1,Math.round(model.bars?.beatsPerBar||4));
      const first=Math.max(0,Math.ceil(beatAt(start)));
      const last=beats.length>=2?Math.min(beats.length-1,Math.floor(beatAt(end))):Math.floor(beatAt(end));
      for(let index=first;index<=last;index++){
        const time=timeAtBeat(index),barIndex=lower(downbeats,time-.025);
        if(Math.abs((downbeats[barIndex]??Infinity)-time)<=.025)continue;
        const major=!downbeats.length&&index%count===0;
        result.push({time,index,major,label:major?(beats.length>=2?String(index/count+1):stamp(time)):''});
      }
      for(let index=lower(downbeats,start);index<downbeats.length&&downbeats[index]<=end;index++)
        result.push({time:downbeats[index],index:Math.round(beatAt(downbeats[index])),major:true,label:String(index+1)});
      result.sort((a,b)=>a.time-b.time);
      return result;
    }

    function printPitchRanges(){
      if(printSource===events)return;
      printSource=events;printCurves=new Map();
      printBands=names.map(()=>({pitches:[],drumRows:0}));
      const bandsByLane=new Map();
      for(const event of events){
        bandsByLane.set(event.lane,event.band);
        if(Number.isFinite(event.pitch))printBands[event.band].pitches.push(event.pitch);
      }
      for(const lane of model.lanes||[]){
        const band=bandsByLane.get(lane.id);
        if(band===undefined)continue;
        if(lane.kind==='drums')printBands[band].drumRows=Math.max(printBands[band].drumRows,lane.rows?.length||0);
        const contour=lane.contour;
        if(groups[band]!=='vocals'||!Array.isArray(contour?.midi)||!(contour.hop>0))continue;
        const start=Number.isFinite(contour.start)?contour.start:0;
        const runs=[];let first=null;
        for(let i=0;i<=contour.midi.length;i++){
          const pitch=contour.midi[i];
          if(Number.isFinite(pitch)&&pitch>0&&pitch<=127){
            if(first===null)first=i;
            continue;
          }
          if(first!==null){runs.push({first,last:i-1,start:start+first*contour.hop,end:start+i*contour.hop});first=null;}
        }
        if(runs.length)printCurves.set(lane.id,{band,start,hop:contour.hop,midi:contour.midi,runs});
      }
      printBands=printBands.map(({pitches,drumRows},band)=>{
        pitches.sort((a,b)=>a-b);
        const low=pitches[Math.floor((pitches.length-1)*.07)]??60,high=pitches[Math.ceil((pitches.length-1)*.93)]??60;
        const range=Math.max(groups[band]==='vocals'?5:8,(high-low)/2);
        return {center:(low+high)/2,range,drumRows};
      });
    }

    function markerStroke(points,color,offsetX,offsetY,width){
      p.beginPath();
      for(const [i,[x,y]] of points.entries()){
        if(i)p.lineTo(x+offsetX,y+offsetY);else p.moveTo(x+offsetX,y+offsetY);
      }
      p.strokeStyle=color;p.lineWidth=width;p.stroke();
    }

    function printNib(points,ink,width,side,offset){
      if(points.length<2)return;
      const edges=points.map(([x,y,t,index],i)=>{
        const before=points[Math.max(0,i-1)],after=points[Math.min(points.length-1,i+1)];
        const dx=after[0]-before[0],dy=after[1]-before[1],length=Math.hypot(dx,dy)||1;
        const spread=width*(.53+.45*Math.sin(t*Math.PI)**.52)*(.90+noise(index*.17)*.20);
        const cross=spread*(side?1.10:.85)/2;
        return [[x-dy/length*cross+offset,y+dx/length*cross-offset*.56],
          [x+dy/length*cross+offset,y-dx/length*cross-offset*.56]];
      });
      polygon(edges.map(edge=>edge[0]).concat(edges.slice().reverse().map(edge=>edge[1])),ink);
    }

    function printInkPath(points,inks,width,seed){
      if(points.length<2)return;
      const offset=width*.24;
      printNib(points,inks[1],width,true,-offset);
      printNib(points,inks[0],width,false,offset*.14);
      markerStroke(points,inks[2],-offset*.18,-offset*.22,Math.max(.65,width*.25));
      const [x,y,first]=points[0],end=points[points.length-1];
      if(first===0&&end[0]-x>=width*.91){
        const reverse=noise(seed)>.5?1:-1;
        const tip=[[x,y+width*.57*reverse],[x+width*.41,y-width*.66*reverse],
          [x+width*.92,y-width*.31*reverse],[x+width*.43,y+width*.71*reverse]];
        polygon(tip.map(([tx,ty])=>[tx-width*.21,ty+width*.25]),inks[1]);
        polygon(tip,inks[0]);
        markerStroke([[x+width*.16,y+width*.28*reverse],[x+width*.44,y-width*.32*reverse]],inks[2],0,0,width*.19);
      }
      for(let i=6;i<points.length-5;i+=13){
        const [px,py]=points[i],pt=points[i+Math.min(6,points.length-1-i)];
        if(pt[0]-px<.4)continue;
        const stroke=width*(.31+noise(points[i][3])*.12);
        markerStroke([[px,py+stroke],[pt[0],pt[1]+stroke*.92]],inks[0],0,0,Math.max(.8,width*.067));
      }
    }

    function printHold(x,y,end,inks,width,seed,kind,age){
      const distance=end-x,half=width/2;
      const nib=Math.min(width*.91,distance*.20),tail=.48+noise(seed+1)*.30;
      const bass=kind==='bass',voice=kind==='vocals';
      const press=bass&&age>=0?Math.exp(-age/.22):0;
      const rebound=bass&&age>=0?Math.sin(Math.min(1,age/.49)*Math.PI)*Math.exp(-age/.44):0;
      const head=half*(.81+noise(seed)*.31+press*.75),late=y-half*rebound*.50;
      const outline=[
        [x,y+head*.64],[x+nib,y-head*.96],[x+distance*.24,y-head*1.01],
        [x+distance*.59,y-half*(.61+press*.37)],[end-nib,late-half*tail],
        [end,late-half*(bass?.08:.52)],[end-nib*.57,late+half*(bass?.28:.50)],
        [x+distance*.57,y+half*(.66+press*.40)],[x+distance*.17,y+head*.90]
      ];
      const misalign=bass||voice?Math.max(2,half*.52):Math.max(.6,half*.30);
      const plate=outline.map(([px,py],i)=>[px+(i===0?0:misalign*.53),py+misalign]);
      polygon(plate,inks[1]);
      polygon(outline,inks[0]);
      if(bass||voice){
        const spine=[[x+nib*.56,y+head*.21],[x+distance*.31,y+head*.31],
          [x+distance*.58,y+half*.33],[end-nib*.23,late+half*.13]];
        markerStroke(spine,inks[2],0,misalign*.23,Math.max(.85,half*.31));
        if(distance>width*.90){
          markerStroke([[x+nib*.78,y-head*.58],[x+distance*.22,y-head*.69],[x+distance*.59,y-half*.36]],
            '#fff6d66c',0,0,Math.max(.8,width*.063));
          for(let i=0;i<3;i++){
            const inset=half*(.32+i*.16),begin=x+distance*(.17+i*.065);
            const lift=end-distance*(.04+noise(seed+i)*.22);
            markerStroke([[begin,y-head+inset],[x+distance*.53,y-head*.74+inset],[lift,late-half*.48+inset]],
              i===0?inks[2]:i===1?'#fff5d58c':inks[0],0,0,Math.max(.74,width*.053));
          }
          if(bass&&press>.21){
            const lipX=x+nib*.35,lipY=y+head*.87;
            polygon([[x,lipY],[lipX+width*.44,lipY-width*.26],[lipX+width*.67,lipY-width*.11],[x+width*.22,lipY+width*.16]],inks[2]);
          }
        }
      }
    }

    function printStamp(x,y,size,inks,kind,age,seed){
      const snare=kind==='snare',heavy=snare||kind==='kick',drum=heavy||kind==='drum';
      const bass=kind==='bass',voice=kind==='vocals';
      const impulse=age<0?0:Math.exp(-age/(heavy?.14:.19));
      const w=size*(heavy?1.39:bass?1.09:voice?.92:drum?.48:.37)*(1+impulse*(heavy?.48:.27));
      const h=size*(.55+impulse*(snare?.40:.22));
      const cant=.23+(noise(seed)*.26);
      const nib=heavy?[[x,y-h*.22],[x+w*.72,y-h*1.05],[x+w,y-h*.77],[x+w*.86,y-h*.18],[x+w*.19,y+h*.47]]:
        [[x,y-h*.94],[x+w,y-h*.59],[x+w*(1-cant),y+h*.85],[x,y+h*.60]];
      const shift=snare||bass?size*.19:size*.13;
      polygon(nib.map(([xx,yy])=>[xx+shift,yy+shift*.75]),inks[1]);
      polygon(nib,inks[0]);
      if(heavy||bass||voice)markerStroke([[x+w*.19,y+h*.27],[x+w*.73,y-h*.35]],inks[2],shift*.3,shift*.43,Math.max(.9,shift*.61));
      if(heavy&&impulse>.13){
        p.save();p.globalAlpha*=impulse;
        markerStroke([[x+w*.90,y-h*.74],[x+w*1.16,y-h*1.06]],inks[0],0,0,Math.max(.9,size*.13));
        markerStroke([[x+w*.24,y+h*.63],[x+w*.72,y+h*.01]],inks[1],0,shift*.56,Math.max(1,size*.13));
        markerStroke([[x+w*.37,y+h*.80],[x+w*.72,y+h*.32]],inks[2],0,shift*.57,Math.max(1,size*.084));
        p.restore();
      }
    }

    function printColorRegister(margin,left,right,top,bottom,row){
      const accent=Math.min(32,(left-margin)*.29);
      line(margin,bottom+8,right,bottom+8,printRed,.9);
      const step=Math.max(80,Math.round((right-left)/12));
      for(let x=left;x<=right;x+=step){
        line(x,bottom+3,x,bottom+13,printBlue,x===left?2:1);
        line(x-3,bottom+6,x+3,bottom+6,printRed,.65);
      }
      for(let band=0;band<names.length;band++){
        const middle=top+(band+.50)*row;
        const tall=clamp(row*.14,5,23),w=accent*.79;
        const x=left-w-7;
        polygon([[x,middle+tall*.67],[x+w*.41,middle-tall],[x+w+1,middle-tall*.55],
          [x+w*.81,middle+tall*.57]],'#2448ac60');
        polygon([[x-2,middle+tall*.53],[x+w*.34,middle-tall*.92],[x+w-1,middle-tall*.39],
          [x+w*.71,middle+tall*.72]],groups[band]==='bass'?'#2747a8':['vocals','drums','strings'].includes(groups[band])?'#da3628':'#2848a9a0');
      }
    }


    function imprint() {
      paper('#f7e9ca','rgba(105,55,28,.13)');
      header('overprint');printPitchRanges();
      const {margin,left,right,top,bottom}=printLayout();
      const needle=clamp(W*(options.playhead??.35),left+2,right-2);
      const pps=W/(options.windowSeconds||16),row=(bottom-top)/names.length;
      const start=now+(left-needle)/pps,end=now+(right-needle)/pps;
      const project=time=>needle+(time-now)*pps;
      const pitchY=(band,pitch)=>{
        const {center,range,drumRows}=printBands[band];
        const midpoint=top+(band+.5)*row;
        if(groups[band]==='drums')return midpoint+row*.29-pitch/Math.max(1,drumRows-1)*row*.58;
        const shift=(pitch-center)/range;
        const mapped=Math.abs(shift)<=1?shift*.78:Math.sign(shift)*(.78+.22*(1-1/Math.abs(shift)));
        return midpoint-row*.414*mapped;
      };
      const ticks=printTicks(start,end),focus=band=>!options.focusGroup||sourceGroups[band]===options.focusGroup?1:.32;
      p.fillStyle='#2445ab0a';p.fillRect(margin,top,left-margin,bottom-top);
      printColorRegister(margin,left,right,top,bottom,row);
      for(let band=0;band<names.length;band++){
        const y=top+band*row;
        if(band%2===0){p.fillStyle='#fff5d89e';p.fillRect(left,y,right-left,row);}
        const bass=groups[band]==='bass',voice=groups[band]==='vocals';
        if(bass||voice){
          p.fillStyle=bass?'#2445ab0c':'#d635270b';
          p.fillRect(left,y+row*.12,right-left,row*.76);
        }
        line(margin,y,right,y,'#3046863c',.8);
        if(bass||voice)line(left,y+row*.5,right,y+row*.5,bass?'#2445ab1f':'#d635271e',.67);
        line(left-5,y,left+5,y,'#254ba590',1.2);
        p.save();p.globalAlpha=focus(band);
        const labelX=margin+(left-margin)*.38,labelY=y+row*.50;
        text(names[band],labelX,labelY,Math.min(20,row*.26,Math.max(12,(left-margin)*.285)),printInk,left-margin-7,FONT,'center');
        p.restore();
      }
      line(margin,bottom,right,bottom,'#30468655',1.4);
      line(left,top,left,bottom,'#30468645',1);
      let lastLabel=-Infinity;
      for(const tick of ticks){
        const x=project(tick.time);
        if(tick.major){
          line(x,top-8,x,bottom,'#254ba53c',1);
          const labelX=x+4;
          if(labelX-lastLabel>=45&&labelX+9<right){
            text(tick.label,labelX,top-24,14,printBlue,Math.min(66,right-labelX),'"Consolas",monospace');
            lastLabel=labelX;
          }
        }else{
          line(x,top-5,x,top+6,'#254ba577',1);
          p.beginPath();
          for(let y=top+14;y<bottom;y+=22){p.moveTo(x,y);p.lineTo(x,Math.min(y+2,bottom));}
          p.strokeStyle='#254ba52e';p.lineWidth=1;p.stroke();
        }
      }
      p.save();p.beginPath();p.rect(left,top,right-left,bottom-top);p.clip();
      p.fillStyle='#b94f2709';p.fillRect(left,top,needle-left,bottom-top);
      const chorus=(model.sections||[]).filter(([from,to,label,,kind])=>
        from<end&&to>start&&/chorus|副歌|サビ/i.test(String(kind||label)));
      for(const [from,to] of chorus){
        const x0=Math.max(left,project(from)),x1=Math.min(right,project(to));
        if(x1<=x0)continue;
        line(x0,top+2,x1,top+2,'#2445ab68',3.5);
        line(x0+2,top+3,x1,top+3,'#d6352772',3.5);
        line(x0+2,top+2.5,x1,top+2.5,'#66345688',1.1);
      }
      const makeInk=(past,next,opacity)=>{
        const g=p.createLinearGradient(left,0,right,0),at=(needle-left)/(right-left);
        const then=Math.max(0,at-pps*1.6/(right-left));
        g.addColorStop(0,past+opacity[0]);g.addColorStop(then,past+opacity[0]);
        g.addColorStop(at,past+opacity[1]);
        g.addColorStop(Math.min(1,at+.009),next+opacity[2]);g.addColorStop(1,next+opacity[2]);
        return g;
      };
      const overlap=makeInk(printPurple,'#704679',['24','be','34']);
      const warmInk=[makeInk('#b82f26','#c63e2e',['64','f1','87']),
        makeInk(printBlue,printBlue,['36','a3','40']),overlap];
      const coolInk=[makeInk('#224296','#294ca7',['61','ed','7e']),
        makeInk(printRed,printRed,['30','8a','39']),overlap];
      const printFutureWarm=[printRed+'84',printBlue+'3e',printPurple+'60'];
      const printFutureCool=[printBlue+'85',printRed+'3e',printPurple+'60'];
      const printWarm=[printRed,printBlue+'a9',printPurple];
      const printCool=[printBlue,printRed+'a9',printPurple];
      p.lineCap='butt';p.lineJoin='round';
      const warm=band=>groups[band]==='vocals'||groups[band]==='strings'||groups[band]==='drums';
      const visible=windowEvents(start,end);
      for(const event of visible){
        const {band,pitch,time,duration,velocity}=event;
        if(groups[band]==='drums'||!Number.isFinite(pitch))continue;
        const curve=options.showContour===false?null:printCurves.get(event.lane);
        if(curve&&curve.runs[lower(curve.runs,time+1e-9,r=>r.end)]?.start<time+duration)continue;
        const x=project(time),endX=project(time+duration),y=pitchY(band,pitch);
        const kind=groups[band],anchored=kind==='bass'||kind==='vocals';
        const width=Math.min(row*(anchored?.27:.109),kind==='bass'?29:kind==='vocals'?23:kind==='guitar'?7.3:8.7)*
          (.57+.43*clamp((velocity||66)/127,0,1));
        p.globalAlpha=focus(band);
        printHold(x,y,endX,warm(band)?warmInk:coolInk,width,time+pitch*.31,kind,now-time);
      }
      if(options.showContour!==false){
        for(const curve of printCurves.values()){
          const {band,runs,hop,midi}=curve;
          p.globalAlpha=focus(band);
          for(let i=lower(runs,start,r=>r.end);i<runs.length&&runs[i].start<end;i++){
            const run=runs[i],first=Math.max(run.first,Math.floor((start-curve.start)/hop));
            const last=Math.min(run.last,Math.ceil((end-curve.start)/hop));
            const step=Math.max(1,Math.floor(.72/(pps*hop))),points=[];
            const runLength=Math.max(1,run.last-run.first);
            for(let j=first;j<=last;j+=step)points.push([project(curve.start+j*hop),pitchY(band,midi[j]),(j-run.first)/runLength,j]);
            if(last>=first&&(last===run.last||(last-first)%step)){
              points.push([project(curve.start+last*hop+(last===run.last?hop*.85:0)),pitchY(band,midi[last]),
                (last-run.first)/runLength,last]);
            }
            printInkPath(points,warmInk,Math.min(21,row*.31),run.start);
          }
        }
      }
      for(let i=lower(scoreEvents,start,e=>e.time);i<scoreEvents.length&&scoreEvents[i].time<=end;i++){
        const {band,pitch,time,velocity,lane,drumName}=scoreEvents[i];
        if(!Number.isFinite(pitch))continue;
        const x=project(time),age=now-time,curve=options.showContour===false?null:printCurves.get(lane);
        const sample=curve?.midi[Math.round((time-curve.start)/curve.hop)];
        const y=pitchY(band,Number.isFinite(sample)&&sample>0?sample:pitch);
        const group=groups[band],kind=group==='drums'?(['snare','kick'].includes(drumName)?drumName:'drum'):group;
        const weight=kind==='snare'?1.77:kind==='kick'?1.38:kind==='bass'?1.36:kind==='vocals'?1.17:1;
        const strength=clamp((velocity||66)/127,0,1);
        const size=Math.min(row*.19,(5.5+strength*7.8)*weight);
        const wet=age<0?0:Math.exp(-age/.29);
        p.globalAlpha=focus(band)*(age<0?.72:.32+.68*wet);
        const inks=age<0?(warm(band)?printFutureWarm:printFutureCool):(warm(band)?printWarm:printCool);
        printStamp(x,y,size,inks,kind,age,time+pitch*.35);
      }
      p.restore();
      line(needle+2.3,top-9,needle+2.3,bottom+5,'#2445ab73',1.25);
      line(needle,top-9,needle,bottom+4,printRed,2.2);
      polygon([[needle-5,top-15],[needle+12,top-14],[needle+2,top-1]],printBlue);
      polygon([[needle-9,top-16],[needle+8,top-16],[needle-1,top-1]],printRed);
      polygon([[needle-5,top-14],[needle+7,top-14],[needle+1,top-2]],printPurple);
      motion={kind:'continuous-print',needle,pixelsPerSecond:pps,ticks};
    }

    let theatreEvents=null,theatreCast=[],theatreScenery=null;
    function theatreEase(value){const t=clamp(value,0,1);return t*t*(3-2*t);}
    function theatreLevels(kind){
      const hop=model.levels?.hop,db=model.levels?.groups?.[kind];
      if(!(hop>0)||!Array.isArray(db)||!db.length)return null;
      const voiced=db.filter(value=>Number.isFinite(value)&&value>-55).sort((a,b)=>a-b);
      if(!voiced.length)return null;
      const high=voiced[Math.floor((voiced.length-1)*.9)],low=Math.max(-55,high-22);
      const mean=Float32Array.from(db,(value,index)=>{
        const before=db[Math.max(0,index-1)],after=db[Math.min(db.length-1,index+1)];
        return clamp(((value*.6+before*.2+after*.2)-low)/Math.max(4,high-low),0,1)||0;
      });
      return {hop,mean};
    }
    function theatreLevelAt(levels,time){
      if(!levels)return null;
      const position=clamp(time/levels.hop-.5,0,levels.mean.length-1),left=Math.floor(position);
      return levels.mean[left]+(levels.mean[Math.min(left+1,levels.mean.length-1)]-levels.mean[left])*(position-left);
    }
    function theatreContour(lane){
      const contour=lane.contour,spans=[];
      if(!(contour?.hop>0)||!Array.isArray(contour.midi))return spans;
      const origin=Number.isFinite(contour.start)?contour.start:0;
      let start=-1;
      for(let i=0;i<=contour.midi.length;i++){
        if(Number.isFinite(contour.midi[i])){if(start<0)start=i;continue;}
        if(start>=0&&(i-start)*contour.hop>=.08)spans.push({time:origin+start*contour.hop,end:origin+i*contour.hop});
        start=-1;
      }
      return spans;
    }
    function theatrePrepare(){
      if(theatreEvents===scoreEvents)return;
      theatreEvents=scoreEvents;
      const levelsByGroup=new Map(),contourByLane=new Map();
      for(const lane of model.lanes||[])if(lane.group==='vocals')contourByLane.set(lane.id,theatreContour(lane));
      theatreCast=groups.map((kind,index)=>{
        const source=sourceGroups[index];
        if(!levelsByGroup.has(source))levelsByGroup.set(source,theatreLevels(source));
        return {kind,notes:[],maxEnd:[],phrases:[],levels:levelsByGroup.get(source),laneIds:new Set()};
      });
      for(const event of scoreEvents){const player=theatreCast[event.band];player.notes.push(event);player.laneIds.add(event.lane);}
      for(const player of theatreCast){
        const {kind,notes,maxEnd,phrases,laneIds}=player;
        const spans=notes.map(event=>({time:event.time,end:event.end}));
        for(const id of laneIds)spans.push(...(contourByLane.get(id)||[]));
        spans.sort((a,b)=>a.time-b.time);
        let furthest=0;
        for(const event of notes){furthest=Math.max(furthest,event.end);maxEnd.push(furthest);}
        for(const span of spans){
          const phrase=phrases.at(-1),beat=beatAt(span.time);
          const allowance=kind==='drums'||kind==='bass'?1.32:kind==='vocals'?.58:.84;
          const gap=clamp(span.time-timeAtBeat(beat-allowance),.17,.72);
          if(phrase&&span.time-phrase.end<gap)phrase.end=Math.max(phrase.end,span.end);
          else phrases.push({time:span.time,end:span.end});
        }
      }
    }
    function theatreActivity(player){
      const {kind,notes,maxEnd,phrases,levels}=player;
      const after=lower(phrases,now+.000001,phrase=>phrase.time),previous=phrases[after-1],next=phrases[after];
      const preview=kind==='vocals'?.40:kind==='strings'||kind==='violin'||kind==='winds'?.33:.25;
      const release=kind==='vocals'?.52:kind==='strings'||kind==='violin'||kind==='winds'?.54:.38;
      const up=next?theatreEase((now-next.time+preview)/preview):0;
      let posture=up*.43,phrase=up>0?next:null,state=up>0?'preparing':'rest',light=up*.26;
      if(previous&&now<previous.end){
        const entrance=theatreEase((now-previous.time)/.27);
        const ending=theatreEase((previous.end-now)/.24);
        posture=.43+entrance*.57;light=.26+entrance*.74;
        // A very short phrase still reads as an entrance and a release.
        posture*=1-entrance*(1-ending)*.20;light*=1-entrance*(1-ending)*.28;
        phrase=previous;state=entrance<1?'entrance':'sustain';
      }else if(previous){
        const down=1-theatreEase((now-previous.end)/release);
        const entry=theatreEase((previous.end-previous.time)/.27);
        const closing=(.43+entry*.57)*(1-entry*.20)*down;
        if(closing>posture){posture=closing;phrase=previous;state='release';}
        light=Math.max(light,(.26+entry*.74)*(1-entry*.28)*down);
      }
      let held=0,attack=0,lead=null,pluck=0,lastNote=null;
      const hands=[0,0];
      for(let i=lower(maxEnd,now-.35);i<notes.length&&notes[i].time<=now+.08;i++){
        const note=notes[i],age=now-note.time,weight=clamp((note.velocity||72)/127,0,1);
        const gesture=(age<0?theatreEase((age+.08)/.08):1-theatreEase(age/.23))*weight;
        if(age>=0)attack=Math.max(attack,gesture);
        if(Number.isInteger(note.hand))hands[note.hand]=Math.max(hands[note.hand],gesture);
        if(Math.abs(pluck)<gesture)pluck=gesture*note.stroke;
        if(age>=0&&now<note.end){held=Math.max(held,weight);if(!lead||note.end>=lead.end&&note.time===lead.time)lead=note;}
        if(age>=0&&note.end<=now&&(!lastNote||note.end>lastNote.end))lastNote=note;
      }
      const energy=theatreLevelAt(levels,now);
      const tendency={vocals:1,strings:.88,violin:.88,winds:.92,piano:.75,guitar:.77,bass:.63,drums:.58};
      const level=light*(tendency[kind]||.65)*(energy===null?1:.72+.38*energy);
      const phase=lead?clamp((now-lead.time)/lead.duration,0,1):0;
      const recentBow=lastNote?lastNote.stroke*(1-theatreEase((now-lastNote.end)/.32)):0;
      const nextNote=notes[lower(notes,now+.000001,event=>event.time)];
      const poisedBow=nextNote?-nextNote.stroke*theatreEase((now-nextNote.time+.27)/.27):0;
      const attackBow=lead?-lead.stroke:recentBow+poisedBow*(1-Math.abs(recentBow));
      const bowWeight=lead?theatreEase(phase):0;
      const bowOffset=attackBow*(1-bowWeight)+(lead?.stroke||0)*bowWeight;
      return {state,phase,phrase:phrase&&{start:phrase.time,end:phrase.end},posture,level,held,attack,hands,pluck,energy,
        bowOffset,velocity:held,note:lead?{time:lead.time,duration:lead.duration,pitch:lead.pitch,stroke:lead.stroke}:null};
    }

    // Cut the bow and foreground joints once. The draw loop can move the
    // grip, bow and puppet separately while keeping their contact points.
    function isolatedBow(context){
      const width=context.canvas.width,height=context.canvas.height;
      const original=context.getImageData(0,0,width,height),clean=context.getImageData(0,0,width,height);
      const bowCanvas=canvas.ownerDocument.createElement('canvas');bowCanvas.width=width;bowCanvas.height=height;
      const bowContext=bowCanvas.getContext('2d'),bowPixels=bowContext.createImageData(width,height);
      const start=[width*.735,height*.153],end=[width*.360,height*.852];
      const dx=end[0]-start[0],dy=end[1]-start[1],length=Math.hypot(dx,dy),nx=-dy/length,ny=dx/length;
      const sample=(x,y)=>4*(clamp(Math.round(y),0,height-1)*width+clamp(Math.round(x),0,width-1));
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const t=((x-start[0])*dx+(y-start[1])*dy)/(length*length);
        if(t<-.012||t>1.013||Math.abs((x-start[0])*nx+(y-start[1])*ny)>5.3)continue;
        const at=(y*width+x)*4,left=sample(x+nx*8,y+ny*8),right=sample(x-nx*8,y-ny*8);
        for(let channel=0;channel<4;channel++)bowPixels.data[at+channel]=original.data[at+channel];
        // The palm in front of the frog remains in the forearm cutout.
        if(t>.772&&t<.924){for(let channel=0;channel<4;channel++)bowPixels.data[at+channel]=0;continue;}
        const alphaLeft=original.data[left+3],alphaRight=original.data[right+3];
        for(let channel=0;channel<4;channel++){
          clean.data[at+channel]=alphaLeft>80&&alphaRight>80?(original.data[left+channel]+original.data[right+channel])/2
            :original.data[t<.17?(alphaLeft<alphaRight?left:right):(alphaLeft>alphaRight?left:right)];
        }
      }
      context.putImageData(clean,0,0);bowContext.putImageData(bowPixels,0,0);
      return {image:bowCanvas,axis:[dx/length,dy/length]};
    }
    function healJointUnderlap(context,original,kind){
      const width=context.canvas.width,height=context.canvas.height,current=context.getImageData(0,0,width,height);
      const healed=context.getImageData(0,0,width,height);
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const at=(y*width+x)*4;if(original.data[at+3]<100||current.data[at+3]>30)continue;
        // The singer's lifted hand is free-standing paper. Behind it is the stage,
        // whereas cutout pieces that cross clothes or instruments need underpainting.
        if(kind==='vocals'&&x>width*.69&&y<height*.59)continue;
        let found=-1;
        for(let distance=1;distance<64&&found<0;distance++){
          for(const [xx,yy] of [[x-distance,y],[x+distance,y],[x,y-distance],[x,y+distance]]){
            if(xx<0||xx>=width||yy<0||yy>=height)continue;
            const candidate=(yy*width+xx)*4;if(current.data[candidate+3]>110){found=candidate;break;}
          }
        }
        if(found>=0)for(let channel=0;channel<4;channel++)healed.data[at+channel]=current.data[found+channel];
      }
      context.putImageData(healed,0,0);
    }

    function theatreVocalMouth(body,size){
      const mouth=canvas.ownerDocument.createElement('canvas');mouth.width=mouth.height=size;
      const ctx=mouth.getContext('2d');ctx.scale(size,size);
      // Replace the open cutout with adjacent cheek paper and a closed lip.
      ctx.save();ctx.beginPath();ctx.moveTo(.388,.197);ctx.quadraticCurveTo(.401,.158,.437,.171);
      ctx.quadraticCurveTo(.459,.197,.455,.249);ctx.quadraticCurveTo(.436,.278,.402,.249);ctx.closePath();ctx.clip();
      ctx.drawImage(body,size*.347,size*.174,size*.048,size*.091,.384,.165,.077,.106);
      const glaze=ctx.createLinearGradient(.387,.197,.451,.231);
      glaze.addColorStop(0,'rgba(223,129,89,.16)');glaze.addColorStop(1,'rgba(122,66,35,.17)');
      ctx.fillStyle=glaze;ctx.fillRect(.38,.16,.08,.12);
      ctx.restore();ctx.beginPath();ctx.moveTo(.402,.223);ctx.quadraticCurveTo(.428,.217,.45,.206);
      ctx.strokeStyle='#9c4f36';ctx.lineWidth=.007;ctx.lineCap='round';ctx.stroke();
      return mouth;
    }

    function performerSprite(group) {
      const kind=groups[group],cell=kind==='guitar'?0:kind==='strings'||kind==='violin'?1:kind==='winds'?2:kind==='bass'?3:kind==='drums'?4:kind==='vocals'?5:4;
      const key=kind==='piano'?'piano':String(cell);
      if(spriteCache.has(key))return spriteCache.get(key);
      const image=key==='piano'?assets.pianist:assets.performers;if(!image)return null;
      const size=320,base=canvas.ownerDocument.createElement('canvas');base.width=base.height=size;
      const ctx=base.getContext('2d',{willReadFrequently:true});
      if(key==='piano')ctx.drawImage(image,0,0,image.width,image.height,0,0,size,size);
      else {
        const sw=image.width/3,sh=image.height/2,trim=cell===4?.065:.012;
        ctx.drawImage(image,cell%3*sw+sw*.028,Math.floor(cell/3)*sh+sh*trim,sw*.94,sh*(1-trim),0,0,size,size);
      }
      if(cell===1){
        // This corner of the atlas shares the neighbouring drummer's paper scrap.
        ctx.save();ctx.globalCompositeOperation='destination-out';ctx.beginPath();
        const cut=[[.196,.953],[.232,.924],[.263,.917],[.284,.923],[.305,.936],[.327,.952],[.391,.979],[.425,1.02],[.183,1.02]];
        cut.forEach(([x,y],i)=>i?ctx.lineTo(x*size,y*size):ctx.moveTo(x*size,y*size));ctx.closePath();ctx.fill();ctx.restore();
      }
      const bow=cell===1?isolatedBow(ctx):null;
      const original=ctx.getImageData(0,0,size,size);
      // Normalised polygons stay inside the actual foreground forearm/hand.
      const joints=key==='piano'
        ? [{pivot:[.51,.76],points:[[.28,.61],[.58,.61],[.70,.79],[.56,.88],[.39,.78]]}]
        : cell===0?[{pivot:[.25,.69],points:[[.15,.64],[.34,.64],[.51,.74],[.51,.87],[.28,.85],[.13,.76]]}]
        : cell===1?[{pivot:[.23,.76],points:[[.12,.72],[.28,.69],[.46,.69],[.56,.77],[.48,.87],[.26,.87],[.12,.82]]}]
        : cell===2?[{pivot:[.30,.56],points:[[.18,.48],[.35,.49],[.48,.68],[.40,.79],[.24,.69]]}]
        : cell===3?[{pivot:[.25,.78],points:[[.12,.75],[.30,.74],[.51,.85],[.56,.97],[.41,.99],[.25,.88],[.13,.86]]}]
        : cell===4?[
          {pivot:[.10,.716],points:[[.054,.679],[.137,.677],[.174,.718],[.265,.695],[.466,.598],[.484,.616],[.299,.750],[.244,.786],[.148,.836],[.114,.827],[.149,.779],[.057,.755]]},
          {pivot:[.86,.677],points:[[.762,.625],[.800,.624],[.902,.643],[.889,.722],[.727,.725],[.656,.685],[.603,.770],[.573,.777],[.564,.761],[.617,.642],[.758,.379],[.795,.375],[.805,.406],[.681,.610]]}
        ]:[{pivot:[.755,.66],points:[[.755,.505],[.754,.402],[.779,.262],[.856,.194],[1.01,.191],[1.01,.335],[.917,.397],[.886,.560],[.837,.701],[.769,.766],[.674,.713]]}];
      const pieces=[];
      for(const joint of joints){
        const piece=canvas.ownerDocument.createElement('canvas');piece.width=piece.height=size;
        const clip=piece.getContext('2d');
        clip.beginPath();joint.points.forEach(([x,y],i)=>i?clip.lineTo(x*size,y*size):clip.moveTo(x*size,y*size));clip.closePath();clip.clip();clip.drawImage(base,0,0);
        pieces.push({image:piece,pivot:joint.pivot});
      }
      // Separate sprite parts from the torso once, outside the animation loop.
      ctx.globalCompositeOperation='destination-out';
      for(const joint of joints){ctx.beginPath();joint.points.forEach(([x,y],i)=>i?ctx.lineTo(x*size,y*size):ctx.moveTo(x*size,y*size));ctx.closePath();ctx.fill();}
      ctx.globalCompositeOperation='source-over';
      healJointUnderlap(ctx,original,kind);
      const mouth=cell===5?theatreVocalMouth(base,size):null;
      const sprite={body:base,pieces,bow,mouth};spriteCache.set(key,sprite);return sprite;
    }
    function staffWindow(band,x,y,width,height){
      if(!staffCache.has(band)){
        const pitches=groups[band]==='drums'?[]:theatreCast[band].notes.map(e=>e.pitch).sort((a,b)=>a-b);
        const median=pitches[Math.floor(pitches.length/2)]||60,kind=groups[band];
        const clef=kind==='bass'||(kind==='piano'&&median<60)||(kind==='strings'&&median<55)?'bass':'treble';
        const shift=kind==='guitar'||kind==='bass'?12:0;
        const flatCount=(model.chords||[]).filter(c=>/[A-G]b/.test(c[2]||'')).length;
        const sharpCount=(model.chords||[]).filter(c=>/[A-G]#/.test(c[2]||'')).length;
        const bins=new Map();
        for(const event of theatreCast[band].notes){
          const bin=Math.floor(beatAt(event.time));if(!bins.has(bin))bins.set(bin,new Set());bins.get(bin).add(Math.round(event.time*1000));
        }
        const rates=[...bins.values()].map(set=>set.size).sort((a,b)=>a-b);
        const rate=rates[Math.floor(rates.length*.9)]||1;
        staffCache.set(band,{clef,shift,flats:flatCount>=sharpCount,rate});
      }
      const setup=staffCache.get(band),drum=groups[band]==='drums';
      const currentBeat=beatAt(now),initialSpan=width>=500?4:width>=340?3:2;
      const span=setup.rate*initialSpan>(width-60)/21?2:initialSpan;
      const firstBeat=currentBeat-span*.30,lastBeat=firstBeat+span;
      const start=timeAtBeat(firstBeat),end=timeAtBeat(lastBeat),left=x+42,right=x+width-11,room=right-left;
      const gap=Math.min(8,height*.12),bottom=y+height/2+gap*2,topLine=bottom-gap*4;
      const page=p.createLinearGradient(x,y,x+width,y+height);
      page.addColorStop(0,'#e6d6af');page.addColorStop(.45,'#efdfba');page.addColorStop(1,'#d7c49e');
      round(x,y,width,height,2,page,'#8b704a',1);
      p.save();p.beginPath();p.rect(x+2,y+2,width-4,height-4);p.clip();
      for(let row=0;row<5;row++)line(x+8,topLine+row*gap,right,topLine+row*gap,'rgba(67,76,59,.48)',.65);
      text(drum?'Ⅱ':setup.clef==='bass'?'𝄢':'𝄞',x+20,y+height/2+2,drum?24:42,'#4a5746',36,'"Segoe UI Symbol",serif','center');
      if(setup.shift)text('8',x+21,setup.clef==='bass'?bottom+16:bottom+18,9,'#55604a',14,FONT,'center');
      for(let index=lower(downbeats,start+.00001);index<downbeats.length&&downbeats[index]<end;index++){
        const xx=left+(beatAt(downbeats[index])-firstBeat)/span*room;line(xx,topLine,xx,bottom,'#768064',.8);
      }
      const measureLength=Number(model.bars?.beatsPerBar)||4;
      const measureIndex=time=>downbeats.length?Math.max(0,lower(downbeats,time+.00001)-1):Math.floor(beatAt(time)/measureLength);
      const firstMeasure=measureIndex(start);
      const accidentalStart=downbeats.length?downbeats[firstMeasure]:timeAtBeat(firstMeasure*measureLength);
      const {notes,maxEnd}=theatreCast[band];
      const first=Math.min(lower(notes,accidentalStart,e=>e.time),lower(maxEnd,start));
      const columns=[];
      for(let index=first;index<notes.length&&notes[index].time<end;index++){
        const event=notes[index];
        if(event.time<accidentalStart&&event.end<=start)continue;
        const previous=columns.at(-1);
        if(previous&&Math.abs(previous.time-event.time)<.018)previous.notes.push(event);
        else columns.push({time:event.time,notes:[event]});
      }
      const glyphs=[],octaveMarks=[];let currentMeasure=null;const accidentalState=new Map();
      for(const column of columns){
        const measure=measureIndex(column.time);if(measure!==currentMeasure){currentMeasure=measure;accidentalState.clear();}
        const xx=left+(beatAt(column.time)-firstBeat)/span*room;
        const positions=[];
        for(const event of column.notes){
          const active=event.time<=now&&now<event.time+event.duration,color=active?'#a6422d':'#3b5144';
          const duration=Math.max(.05,beatAt(event.time+event.duration)-beatAt(event.time));
          let written=Math.round(event.pitch)+setup.shift,octaveHint='';
          let spelling=spellPitch(written,setup.flats),base=setup.clef==='bass'?18:30;
          let yy=bottom-(spelling.diatonic-base)*gap/2;
          if(drum){
            const row={kick:0,snare:2,tom:1,hihat:4,openhat:4,crash:5,ride:5}[event.drumName]??2;
            yy=bottom-row*gap;spelling={diatonic:base+row*2,accidental:''};
          } else {
            let octaves=0;
            while(yy<y+8){written-=12;octaves++;spelling=spellPitch(written,setup.flats);yy=bottom-(spelling.diatonic-base)*gap/2;}
            while(yy>y+height-8){written+=12;octaves--;spelling=spellPitch(written,setup.flats);yy=bottom-(spelling.diatonic-base)*gap/2;}
            octaveHint=octaves>0?(octaves>1?'15ma':'8va'):octaves<0?(octaves<-1?'15mb':'8vb'):'';
          }
          const seconds=positions.some(pos=>Math.abs(pos.yy-yy)<=gap/2+1);
          const headX=xx+(seconds?5:0);
          const ledgerStep=spelling.diatonic-base;
          if(!drum&&xx>=left-6){
            for(let step=-2;step>=ledgerStep;step-=2)line(headX-7,bottom-step*gap/2,headX+7,bottom-step*gap/2,color,.75);
            for(let step=10;step<=ledgerStep;step+=2)line(headX-7,bottom-step*gap/2,headX+7,bottom-step*gap/2,color,.75);
          }
          const previousAccidental=accidentalState.get(spelling.diatonic)||'';
          const chromaticSibling=!spelling.accidental&&column.notes.some(other=>{const pitch=spellPitch(Math.round(other.pitch)+setup.shift,setup.flats);return pitch.diatonic%7===spelling.diatonic%7&&pitch.accidental;});
          const shownAccidental=drum?'':chromaticSibling?'♮':spelling.accidental!==previousAccidental?(spelling.accidental||'♮'):'';
          if(!drum)accidentalState.set(spelling.diatonic,spelling.accidental);
          if(xx<left-6&&event.time+event.duration>start){
            const release=left+(beatAt(Math.min(event.time+event.duration,end))-firstBeat)/span*room;
            if(release>left){p.beginPath();p.moveTo(left,yy+6);p.quadraticCurveTo((left+release)/2,yy+13,release,yy+6);p.strokeStyle=color;p.lineWidth=active?1.5:1;p.stroke();}
          }
          if(xx>=left-6){
            if(shownAccidental&&!drum)text(shownAccidental,headX-10,yy,15,color,14,'"Segoe UI Symbol",serif','center');
            const cymbal=drum&&['hihat','openhat','crash','ride'].includes(event.drumName);
            if(cymbal){line(headX-3.5,yy-3.5,headX+3.5,yy+3.5,color,1.3);line(headX-3.5,yy+3.5,headX+3.5,yy-3.5,color,1.3);}
            else {p.beginPath();p.ellipse(headX,yy,4.7,3.2,-.30,0,Math.PI*2);if(duration>=1.75){p.strokeStyle=color;p.lineWidth=1.1;p.stroke();}else{p.fillStyle=color;p.fill();}}
            if(octaveHint)octaveMarks.push({label:octaveHint,x:headX,color});
            const dotted=[.75,1.5,3].some(value=>Math.abs(duration-value)<.10);
            if(dotted)ellipse(headX+9,yy-2,1.1,1.1,color);
          }
          positions.push({headX,yy,event,duration,active,color});
          glyphs.push({time:event.time,pitch:event.pitch,writtenMidi:written,clef:setup.clef,shift:setup.shift,diatonic:spelling.diatonic,accidental:spelling.accidental,shownAccidental,continued:xx<left-6,octaveHint,x:headX,y:yy,active,duration:event.duration});
        }
        if(xx>=left-6&&positions.length){
          const low=Math.max(...positions.map(n=>n.yy)),high=Math.min(...positions.map(n=>n.yy));
          const up=(low+high)/2>(topLine+bottom)/2;
          const shortest=Math.min(...positions.map(n=>n.duration)),color=positions.some(n=>n.active)?'#a6422d':'#3b5144';
          if(shortest<3.5){
            const stemX=xx+(up?4.4:-4.4),from=up?low:high,to=up?high-24:low+24;
            line(stemX,from,stemX,to,color,1.05);
            const flags=shortest<.375?2:shortest<.75?1:0;
            for(let flag=0;flag<flags;flag++){
              const yy=to+(up?flag*5:-flag*5);p.beginPath();p.moveTo(stemX,yy);
              p.quadraticCurveTo(stemX+9,yy+(up?5:-5),stemX+5,yy+(up?12:-12));p.strokeStyle=color;p.lineWidth=1.2;p.stroke();
            }
          }
        }
      }
      for(const label of [...new Set(octaveMarks.map(mark=>mark.label))]){
        const marks=octaveMarks.filter(mark=>mark.label===label).sort((a,b)=>a.x-b.x),runs=[];
        for(const mark of marks){const run=runs.at(-1);if(run&&mark.x-run.end<75)run.end=mark.x;else runs.push({start:mark.x,end:mark.x});}
        for(const run of runs){
          const yy=label.endsWith('va')||label.endsWith('ma')?y+7:y+height-5;
          text(label,Math.max(left,run.start),yy,10,'#536048',label.length>3?35:30,FONT);
          if(run.end-run.start>35){p.save();p.setLineDash([3,3]);line(run.start+27,yy,Math.min(right,run.end+7),yy,'#657054',.7);p.restore();line(Math.min(right,run.end+7),yy,Math.min(right,run.end+7),yy+(yy<y+height/2?4:-4),'#657054',.7);}
        }
      }
      const marker=left+room*.30;line(marker,y+4,marker,y+height-4,'rgba(169,73,43,.65)',1);
      p.restore();return {start,end,spanBeats:span,box:{x,y,width,height},clef:drum?'percussion':setup.clef,glyphs};
    }

    function theatreWood(x,y,width,height,seed){
      const lacquer=p.createLinearGradient(0,y,0,y+height);
      lacquer.addColorStop(0,'#5a352a');lacquer.addColorStop(.2,'#482d24');
      lacquer.addColorStop(.58,'#3f2924');lacquer.addColorStop(1,'#33231f');
      p.fillStyle=lacquer;p.fillRect(x,y,width,height);
      // Long, broken fibres follow the direction of the bookmatched boards.
      p.save();p.beginPath();p.rect(x,y,width,height);p.clip();
      for(let index=0;index<86;index++){
        const at=seed+index,across=noise(at+984),grainY=y+noise(at+123)*height,reach=(.10+noise(at+19)*.42)*width;
        const start=x+across*width-reach*.5;
        p.beginPath();p.moveTo(start,grainY);
        p.bezierCurveTo(start+reach*.3,grainY+noise(at+41)*4,start+reach*.8,grainY-2,start+reach,grainY+1);
        p.lineWidth=.45+noise(at+546)*1.05;
        p.strokeStyle=index%4?'rgba(224,154,86,.10)':'rgba(29,15,16,.29)';p.stroke();
      }
      p.restore();
    }
    function theatreSceneryAt(decks,margin,cellWidth){
      const backdrop=assets.theatre;
      const key=[W,backdrop?.width||0,cellWidth,...decks.map(deck=>deck.windows.length)].join(':');
      if(theatreScenery?.key===key){p.drawImage(theatreScenery.image,0,0);return;}
      p.fillStyle='#42352d';p.fillRect(0,0,W,H);
      if(backdrop){
        const scale=Math.max(W/backdrop.width,H/backdrop.height);
        p.drawImage(backdrop,(W-backdrop.width*scale)/2,(H-backdrop.height*scale)/2,backdrop.width*scale,backdrop.height*scale);
      }
      const wash=p.createLinearGradient(0,0,0,H);
      wash.addColorStop(0,'rgba(42,25,43,.20)');wash.addColorStop(.19,'rgba(38,42,57,.46)');
      wash.addColorStop(.69,'rgba(50,41,57,.36)');wash.addColorStop(1,'rgba(42,22,25,.23)');
      p.fillStyle=wash;p.fillRect(0,0,W,H);
      const corners=p.createRadialGradient(W/2,H*.48,Math.min(W*.23,300),W/2,H*.48,Math.max(W*.56,640));
      corners.addColorStop(0,'rgba(25,15,34,0)');corners.addColorStop(.72,'rgba(25,15,34,.10)');corners.addColorStop(1,'rgba(25,15,34,.44)');
      p.fillStyle=corners;p.fillRect(0,0,W,H);
      for(const [row,deck] of decks.entries()){
        const {lip,base,windows}=deck;
        const left=margin-10,right=W-margin+10,width=right-left;
        const shadow=p.createLinearGradient(0,base,0,base+42);
        shadow.addColorStop(0,'rgba(25,19,24,.62)');shadow.addColorStop(1,'rgba(25,19,24,0)');
        p.fillStyle=shadow;p.fillRect(left-4,base,width+8,42);
        if(row<decks.length-1){
          const next=decks[row+1].lip;
          for(const x of [left+12,right-28]){
            theatreWood(x,base,16,Math.max(1,next-base),144+row);
            line(x+3,base,x+3,next,'rgba(212,152,83,.32)',1.1);
          }
          const stepCount=4,tread=clamp((margin-12)/stepCount,5,14),rise=(next-base)/stepCount;
          if(rise>11)for(let step=0;step<stepCount;step++){
            const x=left+18-step*tread,stepY=base+step*rise;
            polygon([[x-tread,stepY],[x+4,stepY],[x+4,stepY+rise],[x-tread,stepY+rise]],'#503328','#291f21',1);
            polygon([[x-tread,stepY],[x+8,stepY],[x+11,stepY+6],[x-tread+3,stepY+6]],'#8b6142','#b3875a',.7);
          }
        }else{
          const apron=[[left+3,base-4],[right-3,base-4],[right+11,975],[left-11,975]];
          p.save();p.beginPath();apron.forEach(([x,y],index)=>index?p.lineTo(x,y):p.moveTo(x,y));p.closePath();p.clip();
          theatreWood(left-11,base-4,width+22,979-base,921);
          const shadow=p.createLinearGradient(0,base,0,base+52);
          shadow.addColorStop(0,'rgba(21,13,20,.55)');shadow.addColorStop(1,'rgba(21,13,20,0)');
          p.fillStyle=shadow;p.fillRect(left-11,base-2,width+22,54);
          for(const {x} of windows){
            const half=cellWidth*.385;
            round(x-half,Math.max(base+13,942),half*2,Math.max(8,955-Math.max(base+13,942)),4,'rgba(22,16,17,.23)','rgba(198,139,76,.19)');
            ellipse(x,951,3,3,'rgba(194,142,84,.61)');
          }
          p.restore();line(left-11,975,right+11,975,'#8f633d',4);
        }
        theatreWood(left,lip+9,width,base-lip-9,222+row*101);
        const shelf=p.createLinearGradient(0,lip-8,0,lip+15);
        shelf.addColorStop(0,'#7f5a40');shelf.addColorStop(.75,'#9d7149');shelf.addColorStop(1,'#57352a');
        polygon([[left-10,lip-8],[right+10,lip-8],[right,lip+13],[left,lip+13]],shelf,'#b38a5c',1);
        line(left,lip+17,right,lip+17,'rgba(24,16,25,.75)',5);
        line(left,base-3,right,base-3,'#9a6e43',2.3);
        line(left+4,base+1,right-4,base+1,'rgba(28,17,20,.73)',4);
        for(const {x,windowX,windowWidth,y,height} of windows){
          round(windowX-8,y-6,windowWidth+16,height+12,3,'#352720','#936742',1);
          for(const pinX of [x-cellWidth*.466,x+cellWidth*.466]){
            ellipse(pinX,base-10,2.25,2.25,'#956d42');ellipse(pinX-.4,base-10.6,.65,.65,'#dcb486');
          }
        }
      }
      round(24,27,W-48,111,4,'rgba(48,32,32,.79)','#ad8154',1);
      line(33,132,W-33,132,'rgba(214,165,100,.29)',1);
      const image=canvas.ownerDocument.createElement('canvas');image.width=W;image.height=H;
      image.getContext('2d').drawImage(stage,0,0);
      theatreScenery={key,image};
    }

    function theatreFootlight(x,lip,width,size,light){
      p.save();p.translate(x,lip);p.scale(width,size);
      const glow=p.createRadialGradient(0,-.045,0,0,-.21,.79);
      glow.addColorStop(0,`rgba(255,184,107,${.15+light*.34})`);
      glow.addColorStop(.40,`rgba(247,181,110,${.085+light*.24})`);
      glow.addColorStop(1,'rgba(239,163,93,0)');
      p.fillStyle=glow;p.fillRect(-.85,-1.04,1.7,1.08);p.restore();
    }
    function theatrePlayer(sprite,kind,activity,x,lip,size,light,gestureTime){
      const bowing=kind==='strings'||kind==='violin';
      const breath=Math.sin(gestureTime*Math.PI*2/(kind==='vocals'?3.7:4.7));
      const lift=activity.posture;
      const tilt=(kind==='bass'||kind==='strings'||kind==='violin'?-.047:.059)*lift+breath*.009*lift;
      const bowPosition=bowing?activity.bowOffset*.037:0;
      const bowTravel=bowPosition*size;
      const angles=bowing?[0]:kind==='guitar'?[-activity.pluck*.125]:kind==='winds'?[0]:kind==='vocals'?[.55*(1-lift)+.035*breath*lift]:kind==='drums'?[-activity.hands[0]*.28,activity.hands[1]*.25]:kind==='piano'?[-activity.pluck*.10]:[activity.pluck*.10];
      if(!sprite)return {angles,bowTravel,tilt,lift};
      const left=-size/2,top=-size+8;
      p.save();p.translate(x,lip+7);
      p.transform(1,0,-tilt,1+lift*.041,0,0);
      p.filter=`brightness(${(.78+light*.36).toFixed(3)}) saturate(${(.80+light*.25).toFixed(3)})`;
      p.shadowColor='rgba(39,24,29,.56)';p.shadowBlur=7;p.shadowOffsetX=3;p.shadowOffsetY=4;
      p.drawImage(sprite.body,left,top,size,size);
      p.shadowBlur=0;p.shadowOffsetX=0;p.shadowOffsetY=0;
      const dx=sprite.bow?bowTravel*sprite.bow.axis[0]:0,dy=sprite.bow?bowTravel*sprite.bow.axis[1]:0;
      if(sprite.bow)p.drawImage(sprite.bow.image,left+dx,top+dy,size,size);
      for(const [part,piece] of sprite.pieces.entries()){
        const [px,py]=piece.pivot;
        p.save();p.translate(left+px*size+dx,top+py*size+dy);p.rotate(angles[part]||0);
        p.drawImage(piece.image,-px*size,-py*size,size,size);p.restore();
      }
      if(sprite.mouth){
        const phrase=activity.phrase;
        const open=phrase?theatreEase((now-phrase.start+.03)/.15)*theatreEase((phrase.end-now+.10)/.17):0;
        p.globalAlpha=1-open;p.drawImage(sprite.mouth,left,top,size,size);
      }
      p.restore();
      return {angles,bowTravel,tilt,lift};
    }

    function theatre(){
      theatrePrepare();
      const minColumns=Math.max(W>1000?3:2,Math.min(Math.floor(W/165),Math.ceil(names.length/4)));
      const columns=Math.min(minColumns,names.length);
      const rows=Math.ceil(names.length/columns),margin=Math.min(90,W*.05),usable=W-margin*2;
      const cellWidth=usable/columns,rowHeight=735/rows;
      const height=clamp(rowHeight*(rows>2?.25:.33),42,72),labelSpace=rows>2?34:49,deckDepth=labelSpace+height+15;
      const size=Math.min(285,cellWidth*.78,Math.max(30,rowHeight-deckDepth-11),rowHeight*.61);
      const horizontalOrder={piano:0,bass:1,drums:2,winds:3,other:4,guitar:5,vocals:6,strings:7,violin:7};
      const narrowOrder={piano:0,drums:1,bass:2,winds:3,strings:4,violin:4,guitar:5,vocals:6,other:7};
      const ranking=W>1000?horizontalOrder:narrowOrder;
      const order=names.map((_,band)=>band).sort((a,b)=>(ranking[groups[a]]??4)-(ranking[groups[b]]??4)||a-b);
      const actors=[],notation=[],decks=[];
      for(let row=0;row<rows;row++){
        const rowBands=order.slice(row*columns,(row+1)*columns);
        const lip=rows===1?690:178+row*rowHeight+Math.min(rowHeight*.67,220),base=lip+deckDepth;
        const windowWidth=cellWidth*.86;
        const windows=rowBands.map((band,index)=>{
          const x=margin+(index+(columns-rowBands.length)/2+.5)*cellWidth;
          return {band,x,windowX:x-windowWidth/2,windowWidth,y:lip+labelSpace,height};
        });
        decks.push({lip,base,windows});
      }
      theatreSceneryAt(decks,margin,cellWidth);header('theatre');
      const activities=theatreCast.map(theatreActivity);
      const centre=Math.max(.56,...activities.map(activity=>activity.level));
      const lights=activities.map(({level})=>clamp(level*(.67+.33*level/centre),0,1));
      for(const [row,deck] of decks.entries()){
        const {lip,windows}=deck,top=row?decks[row-1].base+2:140;
        p.save();p.beginPath();p.rect(margin-15,top,usable+30,Math.max(1,lip+13-top));p.clip();
        for(const {band,x} of windows){
          const activity=activities[band],light=lights[band];
          theatreFootlight(x,lip,Math.min(cellWidth*.48,size*1.20),size,light);
          ellipse(x+size*.025,lip+9,size*.44,5,'rgba(41,24,26,.38)');
          const pose=theatrePlayer(performerSprite(band),groups[band],activity,x,lip,size,light,now);
          actors.push({band,group:groups[band],x,y:lip+13,...pose,activity,level:activity.level,light,routeNeedle:x});
        }
        p.restore();
        // The rail occludes the waist cuts while leaving the silhouettes and instruments above it.
        line(margin-11,lip+13,W-margin+11,lip+13,'#b78b58',2);
        for(const {band,x,windowX,windowWidth,y,height} of windows){
          const light=lights[band];
          const fixtureY=lip+8;
          round(x-16,fixtureY-3,32,6,2,'#46332b','#a77b50',.9);
          line(x-11,fixtureY,x+11,fixtureY,`rgba(255,203,137,${.26+.56*light})`,1.1);
          const scroll=staffWindow(band,windowX,y,windowWidth,height);
          notation.push({band,group:groups[band],...scroll});
          if(windowWidth>28)text(names[band],windowX+5,y-(rows>2?12:17),Math.min(rows>2?14:18,cellWidth*.08),'#e0c999',windowWidth-10,FONT);
        }
      }
      motion={kind:'terraced-half-body-ensemble',actors,notation};
    }

    // The radar look is the echo post (score-radar.js, 0.32.0): one instrument panel on the song's own data.
    let echoPost=null,echoFrame=null;
    function radarEnv(){
      const base = {model,events:scoreEvents,beats,downbeats,beatsPerBar:Number(model.bars?.beatsPerBar)>0?Number(model.bars.beatsPerBar):4,
        beatAt,timeAtBeat,now,W,H,options,lyrics};
      return globalThis.XinLocalBarTrial?.radar(base) || base;
    }
    function radar(){
      if(!root.XinScoreRadar){p.fillStyle='#0b0c0a';p.fillRect(0,0,W,H);motion={kind:'radar-echo-post',missing:true};return;}
      echoPost||=root.XinScoreRadar.create();
      echoFrame=echoPost.paint(p,radarEnv());
      motion={...echoFrame,lyric:''};
    }

    function draw(at,next) {
      options=next||options;resize();now=clamp(Number.isFinite(at)?at:clock(),0,model.track.duration||86400);
      preparedWindow=windowEvents(now-(options.windowSeconds||16)*.4,now+(options.windowSeconds||16)*.8);
      p.setTransform(1,0,0,1,0,0);p.globalAlpha=1;p.globalCompositeOperation='source-over';p.shadowBlur=0;
      const style=options.scoreStyle==='theatre'?'theatre':normalize(options.scoreStyle);
      if(style==='theatre')loadTheatreAssets();
      if(style==='glass')radar();else if(style==='theatre')theatre();else imprint();
      const lyric=lyricLine(style);
      const out=canvas.getContext('2d');out.setTransform(1,0,0,1,0,0);out.clearRect(0,0,canvas.width,canvas.height);
      out.drawImage(stage,0,0,canvas.width,canvas.height);
      last={time:now,style,motion,notes:preparedWindow.filter(e=>groups[e.band]!=='drums').length,
        hits:preparedWindow.filter(e=>groups[e.band]==='drums').length,
        active:preparedWindow.filter(e=>e.time<=now&&e.time+e.duration>=now).length,
        section:section(),window:[now-5.6,now+10.4],beatSource:beats.length>=2?'model':'seconds',
        viewport:{width:W,height:H,letterbox:false},presentation:{lyric,section:section()}};
      return last;
    }
    function hit(x,y) {
      x*=viewport.unit;y*=viewport.unit;if(!motion)return null;
      let time;
      if(options.scoreStyle==='glass'){
        const under=echoPost&&echoFrame?echoPost.hit(x,y,echoFrame,radarEnv()):null;
        if(!under||under.kind!=='time')return under;
        time=under.time;
      } else if(options.scoreStyle==='theatre'){
        const window=motion.notation.reduce((best,item)=>Math.abs(item.box.y+item.box.height/2-y)<Math.abs(best.box.y+best.box.height/2-y)?item:best,motion.notation[0]);
        const fraction=clamp((x-window.box.x-10)/(window.box.width-20),0,1);
        time=timeAtBeat(beatAt(window.start)+fraction*(beatAt(window.end)-beatAt(window.start)));
      } else time=now+(x-motion.needle)/motion.pixelsPerSecond;
      return {kind:'time',time:clamp(time-(options.offsetSeconds||0),0,model.track.duration||86400)};
    }
    rebuild();
    return {draw,hit,ready:()=>options.scoreStyle==='theatre'?loadTheatreAssets():options.scoreStyle==='glass'&&root.XinScoreRadar?.ready?root.XinScoreRadar.ready():Promise.resolve(),setModel(next){model=next;cover=null;lyrics=null;echoPost=null;echoFrame=null;rebuild()},
      setOptions(next){const changed=['hidden','mergeTimbres','simplify'].some(key=>JSON.stringify(options[key])!==JSON.stringify(next[key]));options=next;if(changed)rebuild()},
      setCover(image){cover=image},setLyrics(value){lyrics=value?.trackId===model.track.id?value:null},lastFrame:()=>last};
  }
  root.XinScoreMood=Object.freeze({create,normalize,spellPitch,styles:Object.freeze(styles)});
})(globalThis);
