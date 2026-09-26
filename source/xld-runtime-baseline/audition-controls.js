// MIDI audition (R5): hear one transcribed part, synthesised here in the renderer.
//
// Until now the only thing the button labelled 试听 played was the WAV the transcription model was fed. You could
// look at a part but not listen to it, and the question this whole editing plan starts from — "are these three
// fragments one sustained note that got cut up, or were they really separate?" — is not answerable by looking.
//
// The tone is written by hand: oscillators, an envelope and a filter, no sample library. It is enough to judge
// PITCH, ONSET, LENGTH and rough LOUDNESS, and it is not trying to sound like the recording. Two things it cannot
// settle, stated here so nobody later mistakes the output for evidence: whether a drum hit is the right KIND of
// drum, and anything about timbre.
(function (root) {
  'use strict';

  // --- scheduling ---------------------------------------------------------------------------------------------
  // Notes are handed to the audio clock well ahead of time; the tick only decides what to hand over next. Chromium
  // throttles timers in a hidden window (desktop/main.cjs sets backgroundThrottling), so a scheduler that counted
  // on waking up punctually would drop notes the moment you looked at another window. A late tick is harmless as
  // long as what it already handed over reaches further than the delay.
  const TICK_MS = 120;
  const LOOKAHEAD = 1.5;        // seconds of notes given to the audio clock in advance
  const LEAD = 0.06;            // start a moment in the future so the first notes are not already late
  const RELEASE = 0.015;        // every stop ramps down; setting a gain to zero outright clicks
  const MIN_SOUNDING = 0.03;    // see below

  // Multi-part playback shares this limit. Overflow stops with a visible explanation; sustained
  // notes are never silently stolen to make room for a new onset. R14 benchmarks are in the work log.
  const MAX_VOICES = 256;

  // --- drums --------------------------------------------------------------------------------------------------
  // A drum note's pitch is a category, not a frequency, so it never reaches an oscillator's frequency. Its LENGTH
  // carries nothing either: every drum note in this library is exactly 0.100 s, because the adapters write a fixed
  // length from an onset. So each kind sounds for as long as that kind naturally rings, and what you are listening
  // to is the timing.
  const DRUM_KINDS = {
    35: 'kick', 36: 'kick', 37: 'stick', 38: 'snare', 39: 'clap', 40: 'snare',
    41: 'tom', 43: 'tom', 45: 'tom', 47: 'tom', 48: 'tom', 50: 'tom',
    42: 'hihat', 44: 'hihat', 46: 'openHat',
    49: 'crash', 52: 'crash', 55: 'crash', 57: 'crash', 51: 'ride', 53: 'ride', 59: 'ride'
  };
  const DRUM_VOICES = {
    kick:    { length: 0.34, noise: 0.05, tone: { from: 125, to: 42, type: 'sine' }, filter: { type: 'lowpass', frequency: 320 } },
    snare:   { length: 0.20, noise: 1, tone: { from: 195, to: 165, type: 'triangle', level: 0.5 }, filter: { type: 'bandpass', frequency: 1900, Q: 0.7 } },
    stick:   { length: 0.06, noise: 1, tone: null, filter: { type: 'bandpass', frequency: 2600, Q: 1.4 } },
    clap:    { length: 0.16, noise: 1, tone: null, filter: { type: 'bandpass', frequency: 1500, Q: 0.9 } },
    tom:     { length: 0.32, noise: 0.15, tone: { from: 180, to: 95, type: 'sine' }, filter: { type: 'lowpass', frequency: 1200 } },
    hihat:   { length: 0.06, noise: 1, tone: null, filter: { type: 'highpass', frequency: 7000 } },
    openHat: { length: 0.34, noise: 1, tone: null, filter: { type: 'highpass', frequency: 6200 } },
    crash:   { length: 1.10, noise: 1, tone: null, filter: { type: 'highpass', frequency: 4200 } },
    ride:    { length: 0.60, noise: 1, tone: null, filter: { type: 'highpass', frequency: 5200 } }
  };

  // --- pitched voices -----------------------------------------------------------------------------------------
  // One rough family per stem, chosen so the parts are told apart by ear rather than made to sound real. `brightness`
  // multiplies the fundamental to place the filter, so the same setting works across the range.
  const FAMILIES = {
    bass:    { oscillators: [['triangle', 0.9], ['sawtooth', 0.25]], brightness: 6,  attack: 0.010, release: 0.07, sustain: 0.75 },
    piano:   { oscillators: [['triangle', 1.0], ['sine', 0.35, 12]], brightness: 9,  attack: 0.004, release: 0.09, sustain: 0.45 },
    guitar:  { oscillators: [['sawtooth', 0.55], ['triangle', 0.6]], brightness: 8,  attack: 0.006, release: 0.08, sustain: 0.55 },
    strings: { oscillators: [['sawtooth', 0.5], ['triangle', 0.5, -7]], brightness: 7, attack: 0.045, release: 0.14, sustain: 0.9 },
    other:   { oscillators: [['triangle', 0.9], ['sine', 0.3]], brightness: 8, attack: 0.008, release: 0.09, sustain: 0.7 }
  };

  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

  function create({ getLane:readLane, getLanes, getFocus, rt, positionHint, onTick, onStateChange, createContext, now, getTrackKey, loadWav, loopControls, readWavChunk, getCatalog, getMixError, chooseRefinement, onOriginal, isOriginal }) {
    const $ = id => document.getElementById(id);
    const context = createContext || (() => new (root.AudioContext || root.webkitAudioContext)());
    const clock = now || (() => Date.now());

    let ctx = null, bus = null, master = null, masterVolume = 1, noise = null, unavailable = false;
    let laneId = null, notes = [], cursor = 0, timer = null, frame = null;
    let origin = 0;        // audio-clock time that corresponds to `offset`
    let offset = 0;        // position in the part, in seconds
    let held = null;       // position kept while paused
    let voices = [];
    let mode = 'midi', loop = null, loopEnabled = false, loading = false, failure = '';
    let generation = 0, abortLoad = null, cachedWav = null, wavVoice = null, selectedTrack = getTrackKey?.();
    let rangeStart = 0, rangeEnd = 0, cycle = 0, scheduled = [], repeating = false;
    let metrics={scheduledNotes:0,peakConcurrent:0,missedNotes:0,maxTickMs:0};
    const MIN_LOOP = 0.25;
    const loader = loadWav || (async (url, context, signal) => {
      const response = await fetch(url, { signal });
      if (!response.ok) throw Error('wav-load-failed');
      return context.decodeAudioData(await response.arrayBuffer());
    });


    const MIX='@mix', mixState=new Map(), laneBuses=new Map();
    let scope=getLanes?'mix':'single', mixLane=null, mixMembers=[], mixRevision=0, overload=false;
    
    const sourceModes=new Map();let preset=readWavChunk?'hybrid':'midi',stream=null,streamPrepared=false,refinementLayout='';
    function sourceMode(l){
      if(sourceModes.has(l.stem))return sourceModes.get(l.stem);
      const hasMidi=mixMembers.some(p=>p.stem===l.stem&&p.notes?.length);
      return preset==='wav'?(l.sourceAudio?'wav':'off'):preset==='hybrid'?(hasMidi?'midi':l.sourceAudio?'wav':'off'):(hasMidi?'midi':'off');
    }
    function wavGroups(){
      const stems=new Set(),keys=new Set(),out=[];
      for(const l of mixMembers){if(sourceMode(l)!=='wav'||!l.sourceAudio)continue;
        if(stems.has(l.stem))continue;stems.add(l.stem);
        const key=l.sourceAudio.streamKey||l.sourceAudio.key;if(keys.has(key))throw Error('mix-duplicate-source');keys.add(key);out.push(l);
      }return out;
    }
    function wavGain(l){
      const p=setting(parentKey(l.stem)),solo=[...mixState.values()].some(v=>v.solo);
      return !p.mute&&(!solo||p.solo||mixMembers.some(c=>c.stem===l.stem&&setting(childKey(c.laneId)).solo))?p.volume:0;
    }
    function childDirectWav(key){return key.startsWith('lane:')&&sourceMode(mixMembers.find(l=>childKey(l.laneId)===key)||{})==='wav';}
    function wavBus(l){const id='wav:'+l.stem;if(!laneBuses.has(id)){const g=ctx.createGain();g.gain.value=wavGain(l);g.connect(bus);laneBuses.set(id,g);}return laneBuses.get(id);}
    function getStream(){
      if(!stream)stream=root.XldWavStream.create({context:ctx,readChunk:readWavChunk,onFailure:reason=>{
        held=time();failure=reason==='wav-underrun'?'runtime.hybrid.underrun':'runtime.audition.wavFailed';
        cancelLoad();silenceAll();render();onStateChange?.();onTick?.();
      }});return stream;
    }
    async function changeSources(change){
      const active=timer!==null||loading,position=time()??(Number(positionHint?.())||0);
      pause();change();scope='mix';mode='midi';laneId=MIX;held=position;mixRevision++;render();onStateChange?.();
      if(active)return start(MIX,position);
    }
    function setSource(stem,value){
      if(!['midi','wav','off'].includes(value)||!mixMembers.some(l=>l.stem===stem))return false;
      if(value==='wav'&&!mixMembers.some(l=>l.stem===stem&&l.sourceAudio))return false;
      if(value==='midi'&&!mixMembers.some(l=>l.stem===stem&&l.notes?.length))return false;
      return changeSources(()=>sourceModes.set(stem,value));
    }
    function setPreset(value){if(!['midi','wav','hybrid'].includes(value))return false;return changeSources(()=>{preset=value;sourceModes.clear();});}
    function renderRefinements(){
      const host=$('timelineRefinements'),catalog=getCatalog?.();if(!host)return;
      const key=JSON.stringify([catalog,rt('runtime.hybrid.base')]);if(key===refinementLayout)return;refinementLayout=key;host.replaceChildren();
      const groups=catalog?.groups||[];
      for(const parent of [...new Set(groups.map(g=>g.parent))]){
        const select=document.createElement('select');select.dataset.refinementParent=parent;select.setAttribute('aria-label',rt('runtime.hybrid.refinement',{parent}));
        const option=document.createElement('option');option.value='';option.textContent=parent+' · '+rt('runtime.hybrid.base');select.append(option);
        for(const g of groups.filter(g=>g.parent===parent)){const o=document.createElement('option');o.value=g.id;o.textContent=parent+' → '+g.target+' + residual';select.append(o);}
        select.value=catalog.selected?.[parent]||'';
        select.addEventListener('change',async()=>{pause();select.disabled=true;await chooseRefinement?.(parent,select.value);refinementLayout='';render();});host.append(select);
      }
      host.title=rt('runtime.hybrid.refinementHint')+(catalog?.warnings?.length?' · '+rt('runtime.hybrid.unavailable',{count:catalog.warnings.length}):'');
    }

    const members=()=>getLanes?.()||[];
    const setting=key=>{if(!mixState.has(key))mixState.set(key,{mute:false,solo:false,volume:1});return mixState.get(key);};
    const parentKey=stem=>'stem:'+stem, childKey=id=>'lane:'+id;
    function syncMix(){
      const next=members();
      const changed=next.length!==mixMembers.length||next.some((l,i)=>l.laneId!==mixMembers[i]?.laneId||l.notes!==mixMembers[i]?.notes||l.runId!==mixMembers[i]?.runId||l.duration!==mixMembers[i]?.duration||l.sourceAudio?.key!==mixMembers[i]?.sourceAudio?.key);
      if(changed){
        mixMembers=next.map(l=>({...l}));
        const combined=next.flatMap(l=>(l.notes||[]).map(n=>[n[0],n[1],n[2],n[3],n[4],n[5],l.laneId])).sort((a,b)=>a[0]-b[0]);
        mixLane={laneId:MIX,stem:'mix',duration:Math.max(0,...next.map(l=>Number(l.duration)||0)),notes:combined,noteCount:combined.length,isDraft:next.some(l=>l.isDraft)};
        const valid=new Set(next.flatMap(l=>[parentKey(l.stem),childKey(l.laneId)]));
        for(const key of mixState.keys())if(!valid.has(key))mixState.delete(key);
        mixRevision++;
      }
      return changed;
    }
    const getLane=id=>id===MIX?mixLane:readLane(id);
    const selectedId=()=>scope==='mix'?MIX:getFocus();
    function audible(l){
      const p=setting(parentKey(l.stem)),c=setting(childKey(l.laneId));
      const solo=[...mixState.values()].some(v=>v.solo);
      return !p.mute&&!c.mute&&(!solo||p.solo||c.solo);
    }
    function gainFor(l){return audible(l)&&sourceMode(l)==='midi'?setting(parentKey(l.stem)).volume:0;}
    function ramp(param,value){
      if(param.cancelAndHoldAtTime)param.cancelAndHoldAtTime(ctx.currentTime);
      else {param.cancelScheduledValues(ctx.currentTime);param.setValueAtTime(param.value,ctx.currentTime);}
      param.linearRampToValueAtTime(value,ctx.currentTime+RELEASE);
    }
    function laneBus(l){
      if(!laneBuses.has(l.laneId)){const g=ctx.createGain();g.gain.value=gainFor(l);g.connect(bus);laneBuses.set(l.laneId,g);}
      return laneBuses.get(l.laneId);
    }
    function updateMix(){
      mixRevision++;
      for(const l of mixMembers){const g=laneBuses.get(l.laneId);if(g)ramp(g.gain,gainFor(l));}
      for(const l of mixMembers){const g=laneBuses.get('wav:'+l.stem);if(g)ramp(g.gain,wavGain(l));}
      renderMixer();render();onStateChange?.();
    }
    function setMix(key,field,value){
      if(!['mute','solo','volume'].includes(field))return;
      if(!mixMembers.some(l=>key===parentKey(l.stem)||key===childKey(l.laneId)))return;
      setting(key)[field]=field==='volume'?clamp(Number(value)||0,0,1):Boolean(value);
      updateMix();
    }
    function resetMix(){mixState.clear();updateMix();}
    function makeMixButton(key,field){
      const b=document.createElement('button');b.type='button';b.className='quiet-button tl-ms';
      b.textContent=field==='mute'?'M':'S';b.dataset.mixKey=key;b.dataset.mixField=field;
      b.disabled=scope!=='mix'||childDirectWav(key);
      b.title=rt(field==='mute'?'runtime.mix.mute':'runtime.mix.solo');
      b.setAttribute('aria-label',key+' · '+b.title);b.setAttribute('aria-pressed',String(setting(key)[field]));
      b.addEventListener('click',e=>{e.stopPropagation();setMix(key,field,!setting(key)[field]);});
      return b;
    }

    function stemControls(stem){
      const controls=document.createElement('div');controls.className='tl-lane-mix tl-parent-mix';
      const select=document.createElement('select');select.dataset.mixSource=stem;select.setAttribute('aria-label',stem+' WAV / MIDI');
      for(const value of ['midi','wav','off']){const o=document.createElement('option');o.value=value;o.textContent=value==='off'?rt('runtime.hybrid.off'):value.toUpperCase();
        o.disabled=value==='midi'?!mixMembers.some(l=>l.stem===stem&&l.notes?.length):value==='wav'?!mixMembers.some(l=>l.stem===stem&&l.sourceAudio):false;select.append(o);}
      select.value=sourceMode(mixMembers.find(l=>l.stem===stem)||{stem});select.disabled=scope!=='mix';
      select.addEventListener('change',()=>setSource(stem,select.value));controls.append(select,makeMixButton(parentKey(stem),'mute'),makeMixButton(parentKey(stem),'solo'));
      const menu=document.createElement('details');menu.className='tl-track-menu';
      const summary=document.createElement('summary');summary.textContent='···';summary.title=rt('runtime.layout.more');summary.setAttribute('aria-label',summary.title);
      const content=document.createElement('div');content.className='tl-track-options';
      const label=document.createElement('label');label.textContent=rt('runtime.mix.volume',{stem});
      const slider=document.createElement('input');slider.type='range';slider.min='0';slider.max='100';slider.step='1';
      slider.value=String(setting(parentKey(stem)).volume*100);slider.dataset.mixVolume=stem;slider.disabled=scope!=='mix';
      slider.title=label.textContent;slider.setAttribute('aria-label',label.textContent);slider.addEventListener('input',()=>setMix(parentKey(stem),'volume',Number(slider.value)/100));
      label.append(slider);content.append(label);menu.append(summary,content);controls.append(menu);
      return controls;
    }
    function decorateLane(l,head,options={}){
      if(!getLanes)return head;
      const box=document.createElement('div');box.className='tl-row-head tl-mix-head';
      head.className='tl-row-toggle';box.append(head);
      const parent=options.parent??(l.wavOnly||l.grouped||mixMembers.filter(p=>p.stem===l.stem).length===1);
      if(parent)box.append(stemControls(l.stem));
      if(options.child??!parent){
        const controls=document.createElement('div');controls.className='tl-lane-mix tl-child-mix';
        controls.append(makeMixButton(childKey(l.laneId),'mute'),makeMixButton(childKey(l.laneId),'solo'));
        const status=document.createElement('small');status.dataset.mixLane=l.laneId;
        status.textContent=rt(scope!=='mix'?'runtime.mix.direct':sourceMode(l)==='wav'?'runtime.hybrid.sharedWav':sourceMode(l)==='off'?'runtime.hybrid.off':audible(l)?'runtime.mix.audible':'runtime.mix.muted');controls.append(status);box.append(controls);
      }
      return box;
    }
    function renderMixer(){
      const host=$('timelineMixer');if(!host||!getLanes)return;host.hidden=true;
      const reset=$('timelineMixReset');if(reset){reset.textContent=rt('runtime.mix.reset');reset.disabled=!mixMembers.length||scope!=='mix';}
      for(const b of document.querySelectorAll('[data-mix-field]')){b.setAttribute('aria-pressed',String(setting(b.dataset.mixKey)[b.dataset.mixField]));b.disabled=scope!=='mix'||childDirectWav(b.dataset.mixKey);}
      for(const select of document.querySelectorAll('[data-mix-source]')){select.value=sourceMode(mixMembers.find(l=>l.stem===select.dataset.mixSource)||{stem:select.dataset.mixSource});select.disabled=scope!=='mix';}
      for(const slider of document.querySelectorAll('[data-mix-volume]')){slider.value=String(setting(parentKey(slider.dataset.mixVolume)).volume*100);slider.disabled=scope!=='mix';}
      for(const label of document.querySelectorAll('[data-mix-lane]')){const l=mixMembers.find(l=>l.laneId===label.dataset.mixLane);if(l)label.textContent=rt(scope!=='mix'?'runtime.mix.direct':sourceMode(l)==='wav'?'runtime.hybrid.sharedWav':sourceMode(l)==='off'?'runtime.hybrid.off':audible(l)?'runtime.mix.audible':'runtime.mix.muted');}
    }
    async function setScope(value){
      if(!['single','mix'].includes(value)||value===scope)return;
      const active=timer!==null||loading,position=time()??(Number(positionHint?.())||0);
      pause();scope=value;if(scope==='mix')mode='midi';
      laneId=selectedId();notes=getLane(laneId)?.notes||[];held=position;render();onStateChange?.();
      if(active)return start(laneId,position);
    }
    function mixInfo(){
      const active=mixMembers.filter(l=>audible(l)&&setting(parentKey(l.stem)).volume>0&&((sourceMode(l)==='midi'&&l.notes?.length)||(sourceMode(l)==='wav'&&l.sourceAudio)));
      return {scope,wav:mixMembers.some(l=>sourceMode(l)==='wav'),preset,sources:Object.fromEntries(mixMembers.map(l=>[l.stem,sourceMode(l)])),available:Boolean(mixLane?.noteCount||mixMembers.some(l=>l.sourceAudio)),duration:mixLane?.duration||0,lanes:mixMembers.length,audible:active.filter(l=>sourceMode(l)==='midi').length+wavGroups().filter(l=>wavGain(l)>0).length,
        isDraft:mixMembers.some(l=>l.isDraft),overload,states:Object.fromEntries([...mixState].map(([k,v])=>[k,{...v}]))};
    }

    // --- the audio graph ----------------------------------------------------------------------------------------
    function audio() {
      if (ctx || unavailable) return ctx;
      try {
        ctx = context();
        bus = ctx.createGain();
        bus.gain.value = 0.7;
        // Forty-three notes at once through a bare sum would clip. The compressor is there to keep a dense
        // passage from turning into distortion that could be mistaken for something in the transcription.
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -12;
        limiter.ratio.value = 12;
        bus.connect(limiter);
        master = ctx.createGain(); master.gain.value = masterVolume;
        limiter.connect(master); master.connect(ctx.destination);
        const frames = Math.max(1, Math.floor(ctx.sampleRate * 2));
        noise = ctx.createBuffer(1, frames, ctx.sampleRate);
        const data = noise.getChannelData(0);
        for (let at = 0; at < frames; at += 1) data[at] = Math.random() * 2 - 1;
      } catch (error) {
        unavailable = true;
        ctx = null;
      }
      return ctx;
    }

    function envelope(param, at, length, peak, family) {
      const attack = Math.min(family.attack, length * 0.25);
      const release = Math.min(family.release, length * 0.5);
      param.setValueAtTime(0, at);
      param.linearRampToValueAtTime(peak, at + attack);
      param.linearRampToValueAtTime(peak * family.sustain, at + length - release);
      param.linearRampToValueAtTime(0, at + length);
    }

    // Loudness from velocity. The library uses 121 distinct values between 7 and 127, so this is real information
    // and not a constant to be ignored; the curve keeps the quiet end audible.
    const loudness = velocity => 0.05 + 0.32 * Math.pow(clamp(velocity, 0, 127) / 127, 1.4);

    function pitched(note, at, length, family, destination=bus) {
      const frequency = 440 * Math.pow(2, (note[2] - 69) / 12);
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(clamp(frequency * family.brightness, 500, 14000), at);
      const sources = [];
      for (const [type, level, detune] of family.oscillators) {
        const oscillator = ctx.createOscillator();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, at);
        if (detune) oscillator.detune.setValueAtTime(detune, at);
        const mix = ctx.createGain();
        mix.gain.setValueAtTime(level, at);
        oscillator.connect(mix);
        mix.connect(filter);
        sources.push(oscillator);
      }
      filter.connect(gain);
      gain.connect(destination);
      envelope(gain.gain, at, length, loudness(note[3]), family);
      return { gain, sources, length };
    }

    function percussive(note, at, destination=bus) {
      const kind = DRUM_KINDS[note[2]] || 'stick';
      const shape = DRUM_VOICES[kind];
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = shape.filter.type;
      filter.frequency.setValueAtTime(shape.filter.frequency, at);
      if (shape.filter.Q) filter.Q.setValueAtTime(shape.filter.Q, at);
      filter.connect(gain);
      gain.connect(destination);
      const sources = [];
      if (shape.noise) {
        const source = ctx.createBufferSource();
        source.buffer = noise;
        source.loop = true;
        const level = ctx.createGain();
        level.gain.setValueAtTime(shape.noise, at);
        source.connect(level);
        level.connect(filter);
        sources.push(source);
      }
      if (shape.tone) {
        const oscillator = ctx.createOscillator();
        oscillator.type = shape.tone.type;
        oscillator.frequency.setValueAtTime(shape.tone.from, at);
        oscillator.frequency.exponentialRampToValueAtTime(shape.tone.to, at + shape.length * 0.6);
        const level = ctx.createGain();
        level.gain.setValueAtTime(shape.tone.level || 1, at);
        oscillator.connect(level);
        level.connect(filter);
        sources.push(oscillator);
      }
      const peak = loudness(note[3]);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(peak, at + 0.002);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.02), at + shape.length);
      gain.gain.linearRampToValueAtTime(0, at + shape.length + 0.01);
      return { gain, sources, length: shape.length + 0.01 };
    }

    // --- voices -------------------------------------------------------------------------------------------------
    function sound(note, at, drums, family, limit = Infinity, destination=bus) {
      // How many notes are already sounding at the instant this one starts. Counting what is scheduled instead
      // would punish the look-ahead rather than the music.
      // A voice that has been released is still fading out for a few milliseconds, but it is no longer holding a
      // slot — counting it would make the cap steal the same voice over and over and never free anything.
      let concurrent = 0;
      for (const voice of voices) if (!voice.released && voice.startsAt <= at && voice.endsAt > at) concurrent += 1;
      if (concurrent >= MAX_VOICES) {
        overload=true;failure='runtime.mix.overload';held=time();silenceAll();onStateChange?.();render();onTick?.();return false;
      }
      metrics.peakConcurrent=Math.max(metrics.peakConcurrent,concurrent+1);metrics.scheduledNotes++;
      // A note this short is an onset marker rather than a sound — the shortest in the library is 0.6 ms, and
      // 4.2% are under 50 ms. They need a floor to be audible at all, and the floor has to stay small: stretch a
      // 5 ms fragment to 40 ms and two fragments 10 ms apart start sounding joined, which is precisely the
      // judgement this whole feature exists to support.
      const length = drums ? 0 : Math.max(MIN_SOUNDING, note[1] - note[0]);
      const voice = drums ? percussive(note, at, destination) : pitched(note, at, length, family, destination);
      for (const source of voice.sources) source.start(at);
      const endsAt = at + Math.min(voice.length, limit);
      if (voice.length > limit) { voice.gain.gain.cancelScheduledValues(endsAt); voice.gain.gain.setValueAtTime(0, endsAt); }
      for (const source of voice.sources) source.stop(Math.min(endsAt + 0.01, at + limit));
      voices.push({ startsAt: at, endsAt, gain: voice.gain, sources: voice.sources });
      return true;
    }

    // Ramping down rather than stopping outright: an abrupt stop is a click, and a click in the middle of
    // judging onsets is the worst possible artefact.
    function silence(voice, at) {
      const from = Math.max(at, ctx.currentTime);
      try {
        voice.gain.gain.cancelScheduledValues(from);
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, from);
        voice.gain.gain.linearRampToValueAtTime(0, from + RELEASE);
      } catch (error) { /* a context that went away takes its nodes with it */ }
      for (const source of voice.sources) { try { source.stop(from + RELEASE); } catch (error) { /* already stopped */ } }
      voice.endsAt = from + RELEASE;
      voice.released = true;
    }

    // The one way every path stops sound: pause, seek, switching part, switching MIDI version, clearing storage.
    // A hung note is the failure this round is most likely to ship, so there is exactly one place to get it right.
    function silenceAll(keepStream=false) {
      if(!keepStream)stream?.stop();
      if (wavVoice) { try { wavVoice.stop(); } catch (_) {} wavVoice.disconnect?.(); wavVoice = null; }
      if (ctx) for (const voice of voices) silence(voice, ctx.currentTime);
      voices = [];
      if (timer !== null) { clearInterval(timer); timer = null; }
      if (frame !== null) { root.cancelAnimationFrame?.(frame); frame = null; }
    }

    // --- transport ------------------------------------------------------------------------------------------------
    // A split lane knows whether its own instrument is percussion; an unsplit one only has the stem to go on.
    const isDrums = lane => (lane?.instrument ? Boolean(lane.instrument.isDrum) : lane?.stem === 'drums');


    function tick() {
      if (!ctx) return;
      const started=root.performance?.now?.()??clock();
      stream?.tick();
      const position = ctx.currentTime - origin + offset;
      voices = voices.filter(voice => voice.endsAt > ctx.currentTime - 0.1);
      const lane = getLane(laneId), drums = isDrums(lane), family = FAMILIES[lane?.stem] || FAMILIES.other;
      if (mode === 'midi') {
        const length = rangeEnd - rangeStart;
        // Schedule across the seam ahead of time; UI timer delays do not move the loop boundary.
        while (true) {
          if (cursor >= scheduled.length) {
            if (!repeating || !scheduled.length || rangeEnd + cycle * length >= position + LOOKAHEAD) break;
            cycle += 1; cursor = 0;
          }
          const note = scheduled[cursor];
          if (!note || note[0] + cycle * length >= position + LOOKAHEAD) break;
          cursor += 1;
          const end = origin + note[1] + cycle * length - offset;
          if (end <= ctx.currentTime) {metrics.missedNotes++;continue;}
          const at = Math.max(ctx.currentTime, origin, origin + note[0] + cycle * length - offset);
          if (end <= at) continue;
          const part=laneId===MIX?mixMembers.find(l=>l.laneId===note[4]):lane;
          if(laneId===MIX&&isDrums(part)&&note[0]+cycle*length<offset)continue;
          if(sound([0, end - at, note[2], note[3]], at, isDrums(part),FAMILIES[part?.stem]||family,repeating?end-at:Infinity,laneId===MIX?laneBus(part):bus)===false)return;
        }
      }
      metrics.maxTickMs=Math.max(metrics.maxTickMs,(root.performance?.now?.()??clock())-started);
      if (!repeating && position >= rangeEnd && !voices.some(voice => voice.endsAt > ctx.currentTime)) {
        held = rangeEnd; silenceAll(); onStateChange?.(); render(); onTick?.();
      }
    }
    function paint() {
      if (timer === null) return;
      onTick?.();
      frame = root.requestAnimationFrame ? root.requestAnimationFrame(paint) : null;
    }
    function cancelLoad() { generation += 1; abortLoad?.abort(); abortLoad = null; loading = false; }
    function begin(id, from, buffer = null) {
      syncMix();overload=false;metrics={scheduledNotes:0,peakConcurrent:0,missedNotes:0,maxTickMs:0};
      const lane = getLane(id);
      if (!lane || (mode === 'midi' && !lane.notes?.length && !(id===MIX&&wavGroups().length))) return false;
      if (!audio()) { render(); return false; }
      silenceAll(Boolean(buffer?.stream));
      ctx.resume?.()?.catch?.(() => { failure = 'runtime.audition.unavailable'; pause(); render(); });
      laneId = id; notes = lane.notes || []; offset = Math.max(0, Number(from) || 0);
      const total = Number(lane.duration) || Math.max(...notes.map(n => n[1]));
      repeating = Boolean(loopEnabled && loop);
      rangeStart = repeating ? loop.start : 0; rangeEnd = repeating ? loop.end : total;
      if (buffer && !buffer.stream) rangeEnd = Math.min(rangeEnd, buffer.duration);
      if (!(rangeEnd > rangeStart)) { failure = 'runtime.audition.wavFailed'; render(); return false; }
      if (offset >= rangeEnd || offset < rangeStart) offset = rangeStart;
      origin = ctx.currentTime + LEAD; held = null; cursor = 0; cycle = 0;
      const drums = isDrums(lane);
      const noteDrums=n=>id===MIX?isDrums(mixMembers.find(l=>l.laneId===n[6])):drums;
      scheduled = notes.filter(n => (id!==MIX||sourceMode(mixMembers.find(l=>l.laneId===n[6]))==='midi') && n[0] < rangeEnd && (noteDrums(n) ? n[0] >= rangeStart : n[1] > rangeStart))
        .map(n => [Math.max(rangeStart, n[0]), Math.min(rangeEnd, n[1]), n[2], n[3],n[6]]);
      while (cursor < scheduled.length && (drums ? scheduled[cursor][0] < offset : scheduled[cursor][1] <= offset)) cursor += 1;
      if(buffer?.stream)getStream().start(origin);
      if (mode === 'wav' && buffer && !buffer.stream) {
        wavVoice = ctx.createBufferSource(); wavVoice.buffer = buffer;
        wavVoice.loop = repeating; wavVoice.loopStart = rangeStart; wavVoice.loopEnd = rangeEnd;
        wavVoice.connect(bus); wavVoice.start(origin, offset);
        if (!repeating) wavVoice.stop(origin + rangeEnd - offset);
      }
      timer = setInterval(tick, TICK_MS); onStateChange?.(); tick(); if(overload)return false;paint(); render(); return true;
    }
    function play(id, from) { if(readWavChunk&&id===MIX)return start(id,from);scope=id===MIX?'mix':'single';cancelLoad(); failure = ''; mode = 'midi'; return begin(id, from); }
    async function start(id, from) {
      scope=id===MIX?'mix':'single';
      cancelLoad(); failure = '';
      syncMix();
      const streamLanes=id===MIX?wavGroups():mode==='wav'&&getLane(id)?.sourceAudio?.stream?[getLane(id)]:[];
      if(streamLanes.length&&readWavChunk){
        if(!audio())return false;ctx.resume?.()?.catch?.(()=>{});
        silenceAll();laneId=id;held=Number(from)||0;notes=getLane(id)?.notes||[];
        const request=generation;loading=true;render();onStateChange?.();
        const total=getLane(id)?.duration||0,repeats=Boolean(loopEnabled&&loop),end=repeats?loop.end:total,first=repeats?loop.start:0;
        let position=Math.max(0,Number(from)||0);if(position<first||position>=end)position=first;
        try{
          const sources=streamLanes.map(l=>({...l,destination:id===MIX?wavBus(l):bus}));
          const prepared=await getStream().prepare(sources,position,end,repeats,first);
          if(!prepared||request!==generation)return false;
          loading=false;return begin(id,position,{stream:true});
        }catch(error){if(request!==generation)return false;loading=false;failure='runtime.audition.wavFailed';silenceAll();render();onStateChange?.();return false;}
      }
      if (mode === 'midi') return begin(id, from);
      const lane = getLane(id), source = lane?.sourceAudio;
      if (!source?.url) { failure = 'runtime.audition.wavMissing'; render(); return false; }
      if (!audio()) { render(); return false; }
      ctx.resume?.()?.catch?.(() => {});
      laneId = id; notes = lane.notes; held = Number(from) || 0;
      const request = generation;
      loading = true; render(); onStateChange?.();
      try {
        if (cachedWav?.key !== source.key) {
          cachedWav = null;
          abortLoad = typeof AbortController === 'function' ? new AbortController() : null;
          const buffer = await loader(source.url, ctx, abortLoad?.signal);
          if (request !== generation) return false;
          cachedWav = { key: source.key, buffer };
        }
        if (request !== generation) return false;
        loading = false; abortLoad = null;
        return begin(id, from, cachedWav.buffer);
      } catch (_) {
        if (request !== generation) return false;
        loading = false; abortLoad = null; failure = 'runtime.audition.wavFailed'; onStateChange?.(); render(); return false;
      }
    }
    function pause() {
      const position = time(); cancelLoad();
      if (timer === null) { onStateChange?.(); render(); onTick?.(); return; }
      held = position; silenceAll(); onStateChange?.(); render(); onTick?.();
    }
    function stop() {
      const wasPlaying = timer !== null || held !== null;
      cancelLoad(); silenceAll(); laneId = null; notes = []; cursor = 0; held = null;
      if (wasPlaying) { onStateChange?.(); onTick?.(); } render();
    }
    function time() {
      if (timer !== null && ctx) {
        const position = Math.max(offset, ctx.currentTime - origin + offset);
        return repeating ? rangeStart + ((position - rangeStart) % (rangeEnd - rangeStart)) : Math.min(rangeEnd, position);
      }
      return held;
    }
    function toggle() {
      const focused = selectedId();
      if (timer !== null || loading) { pause(); return; }
      return start(focused, held !== null && focused === laneId ? held : Number(positionHint?.()) || 0);
    }
    async function setMode(value) {
      if (!['midi','wav'].includes(value) || value === mode) return;
      const active = timer !== null || loading, position = time() ?? (Number(positionHint?.()) || 0);
      pause(); mode = value; if(mode==='wav')scope='single';failure = ''; render();
      if (active) return start(selectedId(), position);
    }
    function seek(value) {
      if (!selectedId()) return false;
      const active = timer !== null || loading;
      pause(); laneId = selectedId(); notes = getLane(laneId)?.notes || [];
      held = clamp(Number(value) || 0, 0, Number(getLane(laneId)?.duration) || Infinity);
      if (loopEnabled && loop && (held < loop.start || held >= loop.end)) loopEnabled = false;
      if (active) start(laneId, held);
      render(); onTick?.(); return true;
    }
    function setLoop(startAt, endAt, enabled = true) {
      const total = Number(getLane(selectedId())?.duration) || 0;
      const from = clamp(Number(startAt), 0, total), end = clamp(Number(endAt), 0, total);
      if (!Number.isFinite(from + end) || end - from < MIN_LOOP) { failure = 'runtime.audition.rangeInvalid'; render(); return false; }
      const active = timer !== null || loading, position = time();
      pause(); loop = { start: from, end }; loopEnabled = enabled; failure = '';
      held = position != null && position >= from && position < end ? position : from;
      laneId = selectedId(); notes = getLane(laneId)?.notes || [];
      if (active) start(laneId, held);
      render(); onTick?.(); return true;
    }
    function enableLoop(enabled) {
      const active = timer !== null || loading, position = time();
      pause(); loopEnabled = Boolean(enabled && loop);
      if (active) start(selectedId(), position);
      render(); onTick?.();
    }
    function clearLoop() { enableLoop(false); loop = null; render(); onTick?.(); }
    function notesChanged(){
      const position=time();pause();syncMix();notes=getLane(selectedId())?.notes||[];held=position;
      render();onTick?.();
    }
    function lanesChanged() {
      const key = getTrackKey?.();
      if (key !== selectedTrack) { stop(); loop = null; loopEnabled = false; cachedWav = null;stream?.clear();sourceModes.clear();preset=readWavChunk?'hybrid':'midi'; selectedTrack = key;mixState.clear();scope=getLanes?'mix':'single';mode='midi';for(const gain of laneBuses.values())gain.disconnect?.();laneBuses.clear(); }
      syncMix();
      const lane = laneId ? getLane(laneId) : null;
      if (laneId && (!lane || lane.notes !== notes || (laneId!==MIX&&getFocus() !== laneId)) && (timer !== null || held !== null || loading)) stop();
      render();
    }
    function render() {
      renderMixer();renderRefinements();
      const presetControl=$('timelineMixPreset');if(presetControl){presetControl.value=sourceModes.size?'custom':preset;presetControl.hidden=scope!=='mix';
        for(const option of presetControl.options)option.textContent=rt('runtime.hybrid.preset.'+option.value);}
      const original=$('timelineOriginal');if(original){original.textContent=rt(isOriginal?.()?'runtime.hybrid.return':'runtime.hybrid.original');original.disabled=!mixMembers.length;}
      const scopeControl=$('timelineAuditionScope');
      if(scopeControl){scopeControl.value=scope;scopeControl.options[0].textContent=rt('runtime.mix.all');scopeControl.options[1].textContent=rt('runtime.mix.single');}
      const button = $('timelineAudition');
      if (!button) return;
      const focused = selectedId(), lane = focused ? getLane(focused) : null;
      const sounding = timer !== null || loading, ready = Boolean(lane && (mode === 'wav' ? (lane.sourceAudio?.url||lane.sourceAudio?.stream) : (lane.notes?.length||(scope==='mix'&&wavGroups().length)))) && !unavailable;
      button.disabled = !ready;
      button.textContent = rt(loading ? 'runtime.audition.cancelLoad' : sounding ? 'runtime.audition.pause' : scope==='mix'?'runtime.mix.play':'runtime.audition.play');
      button.setAttribute('aria-pressed', sounding ? 'true' : 'false');
      button.title = unavailable ? rt('runtime.audition.unavailable') : !lane ? rt('runtime.audition.idle')
        : !lane.notes?.length ? rt('runtime.audition.empty') : rt('runtime.audition.hint');
      const source = $('timelineAuditionSource');
      if (source) {
        source.hidden=scope==='mix';source.value = mode; source.disabled = !lane || unavailable;
        source.options[0].disabled = !lane?.notes?.length;
        source.options[0].textContent = 'MIDI';
        source.options[1].textContent = rt('runtime.audition.wav', { stem: lane?.stem || '' });
        source.options[1].disabled = !(lane?.sourceAudio?.url||lane?.sourceAudio?.stream);
      }
      const status = $('timelineAuditionStatus');
      if (status) status.textContent = getMixError?.() ? (['mix-parent-overlap','mix-source-unavailable','mix-timebase','mix-duplicate-source'].includes(getMixError())?rt('runtime.hybrid.'+getMixError()):rt('runtime.hybrid.invalid')) : failure ? rt(failure) : scope==='mix'&&mixMembers.length ? rt('runtime.mix.hint',{audible:mixInfo().audible,total:mixMembers.length}) : loading ? rt('runtime.audition.loading')
        : lane ? rt(mode === 'wav' ? 'runtime.audition.wavHint' : 'runtime.audition.hint', { stem: lane.stem }) : rt('runtime.audition.idle');
      const external = loopControls?.state();
      const shownLoop = external ? external.loop : loop;
      const loopReady = external ? external.available : ready;
      for (const [id,key] of [['timelineLoopChoose','choose'],['timelineLoopEnable','loop'],['timelineLoopClear','clear']]) {
        const node = $(id); if (node) { node.textContent = rt('runtime.audition.' + key); node.disabled = !loopReady || (id !== 'timelineLoopChoose' && !shownLoop); }
      }
      $('timelineLoopEnable')?.setAttribute('aria-pressed', (external ? shownLoop?.enabled : loopEnabled) ? 'true' : 'false');
      for (const [id,value,label] of [['timelineLoopStart',shownLoop?.start,'start'],['timelineLoopEnd',shownLoop?.end,'end']]) {
        const node = $(id);
        if (node) {
          if (document.activeElement !== node) node.value = value == null ? '' : value.toFixed(3);
          node.disabled = !loopReady; node.title = rt('runtime.audition.' + label); node.setAttribute('aria-label',node.title);
        }
      }
    }
    function bind() {
      $('timelineMixReset')?.addEventListener('click',resetMix);
      $('timelineMixPreset')?.addEventListener('change',e=>setPreset(e.target.value));
      $('timelineOriginal')?.addEventListener('click',()=>onOriginal?.());
      $('timelineAuditionScope')?.addEventListener('change',e=>setScope(e.target.value));
      $('timelineAudition')?.addEventListener('click', toggle);
      $('timelineAuditionSource')?.addEventListener('change', e => setMode(e.target.value));
      $('timelineLoopEnable')?.addEventListener('click', () => loopControls ? loopControls.enable(!loopControls.state()?.loop?.enabled) : enableLoop(!loopEnabled));
      $('timelineLoopClear')?.addEventListener('click', () => loopControls ? loopControls.clear() : clearLoop());
      for (const id of ['timelineLoopStart','timelineLoopEnd']) $(id)?.addEventListener('change', () => {
        const a = $('timelineLoopStart').value, b = $('timelineLoopEnd').value;
        if (a !== '' && b !== '') (loopControls ? loopControls.set : setLoop)(Number(a),Number(b));
      });
      render();
    }
    function setVolume(value) { masterVolume = clamp(Number(value) || 0, 0, 1); if (master) { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setValueAtTime(masterVolume,ctx.currentTime); } }
    return { bind, render, play, start, setVolume, setScope, setSource, setPreset, mixInfo, setMix, resetMix, decorateLane, pause, stop, toggle, lanesChanged, notesChanged, time, seek, setMode, setLoop, enableLoop, clearLoop,
      mode: () => mode, loading: () => loading, loop: () => loop && { ...loop, enabled: loopEnabled },
      diagnostics:()=>({...metrics,overload,wav:stream?.diagnostics()||null}), playing: () => timer !== null, laneId: () => laneId, voiceCount: () => voices.length };

  }

  const api = { create, MAX_VOICES, MIN_SOUNDING, LOOKAHEAD, DRUM_KINDS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.XldAuditionControls = api;
})(globalThis);
