'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {readMidiTracks} = require('../../xld-runtime-baseline/core/midi-read.cjs');
const {CONTRACT, DRUM_ROWS, DRUM_CLASS} = require('../../scoreview/adapter/track-model.cjs');

const MAX_BYTES = 4 * 1024 * 1024;
const GROUPS = ['vocals', 'guitar', 'piano', 'strings', 'winds', 'bass', 'drums', 'synth', 'unassigned'];
const ms = seconds => Math.round(seconds * 1000) / 1000;

function instrument(name, program, channel) {
  if (channel === 9) return 'drums';
  if (/\b(?:vocals?|voice|singer|choir)\b|人声/i.test(name) || [52,53,54].includes(program)) return 'vocals';
  if (/\bbass\b|贝斯/i.test(name) || (program >= 32 && program <= 39)) return 'bass';
  if (/\bguitar\b|吉他/i.test(name) || (program >= 24 && program <= 31)) return 'guitar';
  if ((program >= 40 && program <= 51) || /\b(?:string|strings|violin|cello)\b/i.test(name)) return 'strings';
  if ((program >= 56 && program <= 79) || /\b(?:sax|flute|clarinet|winds)\b/i.test(name)) return 'winds';
  if (program >= 80 && program <= 103) return 'synth';
  if ((program !== null && program <= 23) || /\b(?:piano|keys|organ)\b/i.test(name)) return 'piano';
  return 'unassigned';
}

function tickClock(division, tempoMap) {
  const tempos = [...tempoMap].sort((a,b)=>a[0]-b[0]);
  const points = [];
  let tick = 0, time = 0, rate = 500000 / (1e6 * division);
  for (const [next, tempo] of tempos) {
    time += (next - tick) * rate;
    tick = next;
    rate = tempo / (1e6 * division);
    points.push({tick,time,rate});
  }
  return value => {
    let lo = 0, hi = points.length;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >>> 1;
      if (points[mid].tick <= value) lo = mid; else hi = mid;
    }
    const at = points[lo];
    return at.time + (value - at.tick) * at.rate;
  };
}

function parse(buffer) {
  if (!buffer.length || buffer.length > MAX_BYTES) throw Error('midi-too-large');
  const {format, division, tracks, declaredTracks} = readMidiTracks(buffer, 300000);
  if (![0,1].includes(format) || !division || declaredTracks !== tracks.length || (format === 0 && tracks.length !== 1)) throw Error('midi-format');
  const tempos = new Map([[0,500000]]), meters = new Map();
  for (const {events} of tracks) for (const event of events) {
    if (event.kind === 'set-tempo' && event.value > 0) tempos.set(event.ticks,event.value);
    if (event.kind === 'time-signature' && event.numerator > 0 && event.numerator <= 32 && event.denominator <= 64)
      meters.set(event.ticks, [event.numerator,event.denominator]);
  }
  const seconds = tickClock(division, tempos), parts = [];
  let end = 0;
  for (const [index, track] of tracks.entries()) {
    const programs = Array(16).fill(null), active = new Map(), byVoice = new Map();
    for (const event of track.events) {
      const {channel,pitch,ticks,kind} = event;
      if (kind === 'program-change') { programs[channel] = event.program; continue; }
      if (kind !== 'note-on' && kind !== 'note-off') continue;
      const key = channel * 128 + pitch;
      if (kind === 'note-on') {
        const program = programs[channel], voice = channel + '/' + program;
        if (!byVoice.has(voice)) {
          if (parts.length >= 256) throw Error('midi-too-large');
          const name = (track.name || '').trim().slice(0,100);
          const part = {id:index+'/'+voice, name, channel, program, group:instrument(name,program,channel), notes:[]};
          parts.push(part); byVoice.set(voice,part);
        }
        if (!active.has(key)) active.set(key,[]);
        active.get(key).push({ticks,velocity:event.velocity,part:byVoice.get(voice)});
      } else {
        const pending = active.get(key);
        if (!pending?.length) continue;
        // Match held onsets on their original instrument, even across a program change.
        for (const on of pending) {
          if (ticks <= on.ticks) continue;
          const start = ms(seconds(on.ticks)), stop = ms(seconds(ticks));
          if (stop <= start) continue;
          if (stop > 86400) throw Error('midi-too-long');
          on.part.notes.push([start,ms(stop-start),pitch,on.velocity]);
          end = Math.max(end,stop);
        }
        const sameTick = pending.filter(on=>on.ticks===ticks);
        if (sameTick.length) active.set(key,sameTick); else active.delete(key);
      }
    }
  }
  const played = parts.filter(p=>p.notes.length);
  if (!played.length) throw Error('midi-empty');
  for (const part of played) part.notes.sort((a,b)=>a[0]-b[0] || a[2]-b[2]);
  return {parts:played,division,tempos:[...tempos],meters:[...meters].sort((a,b)=>a[0]-b[0]),end};
}

function barGrid(midi, duration, delta) {
  if (!midi.meters.length) return null;
  const seconds = tickClock(midi.division, midi.tempos);
  const beats = [], downbeats = [];
  let maxPerBar = 0;
  for (const [i,[first,[count,denom]]] of midi.meters.entries()) {
    maxPerBar = Math.max(maxPerBar,count);
    const limit = midi.meters[i+1]?.[0] ?? Infinity;
    const step = midi.division * 4 / denom;
    for (let n=0; first+n*step < limit; n++) {
      const time = seconds(first+n*step)+delta;
      if (time > duration) break;
      if (n > 200000 || beats.length > 200000) throw Error('midi-grid-too-dense');
      if (time < 0) continue;
      beats.push(ms(time));
      if (n % count === 0) downbeats.push(ms(time));
    }
  }
  return beats.length >= 2 ? {beats,downbeats,beatsPerBar:maxPerBar,steady:downbeats.length>=2} : null;
}

function build(record, track, audioUrl, coverUrl) {
  const {midi,offsetMs,grid} = record, delta = offsetMs/1000;
  const duration = record.duration || track.duration || Math.max(0.001,midi.end+delta);
  const lanes = [];
  for (const part of midi.parts) {
    const group = part.group, isDrum = group==='drums', items = [];
    for (const [time,length,pitch,velocity] of part.notes) {
      const start = Math.max(0,ms(time+delta)), stop = Math.min(duration,ms(time+length+delta));
      if (stop<=start) continue;
      if (isDrum) {const row = DRUM_ROWS.indexOf(DRUM_CLASS[pitch]); if(row>=0) items.push([start,row,velocity]);}
      else items.push([start,ms(stop-start),pitch,velocity]);
    }
    if (!items.length) continue;
    const meta={engine:'external-midi',program:part.program,instrumentName:part.name,velocity:new Set(items.map(n=>n.at(-1))).size===1?'flat':'recorded'};
    lanes.push({id:group+'/'+part.id,group,label:part.name || 'Ch. '+(part.channel+1),kind:isDrum?'drums':group==='vocals'?'melody':'pitched',meta,
      ...(isDrum?{rows:DRUM_ROWS.slice(),hits:items}:{notes:items})});
  }
  if (!lanes.length) throw Error('midi-no-visible-notes');
  const model = {contract:CONTRACT, track:{id:track.id,title:track.title,artist:track.artist,album:track.album,duration},
    audio:{src:audioUrl,offset:0},lanes};
  if (coverUrl) model.cover={src:coverUrl};
  if (grid) {const bars=barGrid(midi,duration,delta); if(bars)model.bars=bars;}
  return {ok:true,model,health:{externalMidi:true}};
}

function summary(record) {
  if (!record) return null;
  return {revision:record.revision,name:record.name,offsetMs:record.offsetMs,grid:record.grid,hasMeter:!!record.midi.meters.length,
    parts:record.midi.parts.map(({notes,...p})=>({...p,count:notes.length}))};
}

function createStore(root) {
  const queues=new Map();
  function file(id) {
    if (!/^[a-f0-9]{40}$/i.test(id)) throw Error('track-missing');
    return path.join(root,id+'.json');
  }
  async function read(id) {
    try {return JSON.parse(await fs.readFile(file(id),'utf8'));}
    catch(e){if(e.code==='ENOENT')return null;throw e;}
  }
  async function edit(id, change) {
    const target=file(id), previous=queues.get(id)||Promise.resolve();
    const task=previous.catch(()=>{}).then(async()=>{
      const next=await change(await read(id));
      if (!next) {await fs.rm(target,{force:true});return null;}
      await fs.mkdir(root,{recursive:true});
      const tmp=target+'.'+randomUUID()+'.tmp';
      try {await fs.writeFile(tmp,JSON.stringify(next));await fs.rename(tmp,target);}
      finally{await fs.rm(tmp,{force:true}).catch(()=>{});}
      return summary(next);
    });
    queues.set(id,task);
    try{return await task;}finally{if(queues.get(id)===task)queues.delete(id);}
  }
  async function action(track, p) {
    if (p.action==='read') return summary(await read(track.id));
    return edit(track.id, old=>{
      let next;
      if(p.action==='import'){
        if (!(p.bytes instanceof Uint8Array) || p.bytes.byteLength>MAX_BYTES) throw Error('midi-too-large');
        const midi=parse(Buffer.from(p.bytes));
        const duration=Number(p.duration);
        next={midi,name:path.basename(String(p.name||'score.mid')).slice(0,160),offsetMs:0,grid:false,
          duration:Number.isFinite(duration)&&duration>0&&duration<=86400?duration:0};
      }else{
        if (!old || old.revision!==p.revision) throw Error('midi-changed');
        if(p.action==='restore') return null;
        if(p.action!=='apply'||!Number.isInteger(p.offsetMs)||Math.abs(p.offsetMs)>60000||
          !Array.isArray(p.groups)||p.groups.length!==old.midi.parts.length||p.groups.some(g=>!GROUPS.includes(g)))throw Error('midi-settings');
        next={...old,offsetMs:p.offsetMs,grid:!!p.grid&&!!old.midi.meters.length};
        next.midi.parts.forEach((part,index)=>part.group=p.groups[index]);
      }
      build(next,track,'',''); // Validate playback before replacing a previous working import.
      next.revision=randomUUID();
      return next;
    });
  }
  return {read,action};
}
module.exports={createStore,parse,build,barGrid,MAX_BYTES};
