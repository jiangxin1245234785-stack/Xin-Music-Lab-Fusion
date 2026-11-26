'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const debug = require('../score-mood-debug.js');
const weather = require('../../scoreview/score-terrain-weather.js');
const terrain = require('../../scoreview/score-terrain.js');
const reader = require('../../shared-analysis/mood-curve.js');
const catalogs = require('../i18n/catalogs.js');

function fixture() {
  const duration = 96.25, step = .5, n = Math.ceil(duration / step) + 1;
  const values = fn => Array.from({length:n}, (_, i) => fn(Math.min(duration, i * step)));
  const slow = values(t => t < 20 ? .24 : t < 80 ? .96 : .45);
  const curve = {kind:'mood-curve', schemaVersion:1, engineVersion:1,
    formulaVersion:'mood-direct-1', scaleVersion:'mood-scale-1', loudnessMode:'mix', belowFlatnessGate:[],
    duration, step, slow, fast:values(() => .84), shape:{slow, fast:slow},
    components:{lufs:values(t => -t), band28Dbfs:values(t => -2*t), logFlatness:values(t => t === 25 ? null : -1.25)}};
  return {track:{id:'a', title:'A', duration}, moodCurve:curve, energy:{hop:step, db:values(t => t < 20 || t > 80 ? -80 : -9)},
    sections:[[0,31,'Intro'],[31,75,'Bridge'],[75,94,'Outro']],
    lanes:[{id:'piano', group:'piano', notes:[[8, 2, 60, 100], [81, 4, 65, 100]]}]};
}

test('input ranges, gaps, shortened last sample and zoom seek share the record timeline', () => {
  const rec = fixture().moodCurve;
  assert.ok(reader.valid(rec));
  for (const t of [0, .5, 12.26, 96.1, 96.25]) assert.equal(debug.rawAt(rec, 'lufs', t), -t);
  assert.equal(debug.rawAt(rec, 'logFlatness', 24.75), null);
  assert.equal(debug.rawAt(rec, 'logFlatness', 25.25), null);
  assert.equal(debug.rawAt(rec, 'logFlatness', 25.5), -1.25);
  assert.equal(debug.rawAt(rec, 'lufs', 97), null);
  assert.deepEqual(debug.range([null, -3, 0, -6, null]), [-6, 0]);
  assert.equal(debug.range([null, null]), null);
  assert.equal(debug.linePath([0, null, 1], {step:.5,duration:.75}), 'M0.000 100.00M0.750 0.00');
  assert.deepEqual(debug.zoomBounds(4, 100), [0,34]);
  assert.deepEqual(debug.zoomBounds(50, 100), [20,80]);
  assert.deepEqual(debug.zoomBounds(98, 100), [68,100]);
  assert.equal(debug.targetAt([20,80], .75), 65);
  assert.equal(debug.targetAt([68,100], 2), 100);
});

test('readouts use the terrain source window, engine timelines and exact flash boundaries', () => {
  const model = fixture(), {window, original, mood} = debug.weatherComparison(model, weather, terrain);
  assert.ok(window.plainStart > 0 && window.plainEnd < model.track.duration);
  const frame = terrain.inspect({song:model, time:50, w:1200, h:700, duration:model.track.duration});
  assert.deepEqual(window, {plainStart:frame.detail.plain.start, plainEnd:frame.detail.plain.end});
  for (const t of [0,12.1,25.83,47.5,82,96.25]) for (const [driver, series] of [['mood',mood],['original',original]]) {
    const actual = weather.sample(model, t, {...window, terrainWeather:'rain', terrainWeatherDriver:driver});
    assert.equal(series.rainAt(t), actual.intensity);
  }
  assert.ok(mood.flashes.length);
  const event = mood.flashes[0].time;
  assert.deepEqual(debug.flashesAround(mood.flashes, event-.001), [undefined, event]);
  assert.deepEqual(debug.flashesAround(mood.flashes, event), [event, mood.flashes[1]?.time]);
  assert.deepEqual([.26,.260001,.52,.70,.90].map(weather.moodTier), ['none','light','moderate','heavy','storm']);
  assert.equal(weather.moodThresholds.lightning,.92);
});

// Minimal renderer harness. It only emulates the browser operations the inspector uses.
function page(kept = new Map()) {
  class Node {
    constructor() {
      this.events = new Map(); this.attrs = {}; this.children = []; this.dataset = {};
      this.style = {setProperty() {}}; this.classes = new Set(); this.textContent = '';
      this.classList = {contains:k => this.classes.has(k), add:k => this.classes.add(k), remove:k => this.classes.delete(k)};
    }
    addEventListener(key, fn) { this.events.set(key, fn); }
    removeEventListener(key) { this.events.delete(key); }
    dispatchEvent(event) { this.events.get(event.type)?.(event); }
    append(...nodes) { this.children.push(...nodes); for (const node of nodes) if (typeof node === 'object') node.parent = this; }
    after(...nodes) {
      const p=this.parent;
      p.children.splice(p.children.indexOf(this)+1,0,...nodes);
      for (const node of nodes) node.parent=p;
    }
    replaceChildren(...children) { this.children = children; }
    setAttribute(key, value) { this.attrs[key] = value; }
    focus() {}
    setPointerCapture() {}
    getBoundingClientRect() { return {left:0, width:200, height:120}; }
    find(fn) {
      if (fn(this)) return this;
      for (const child of this.children) { const result = child.find?.(fn); if (result) return result; }
      return null;
    }
  }
  const host = new Node(), doc = new Node(), ids = new Map();
  const get = id => { if (!ids.has(id)) ids.set(id, new Node()); return ids.get(id); };
  get('welcome').classList.add('is-gone');
  const stage = new Node(), audio = new Node();
  stage.dataset.effect = 'score';
  audio.paused = true;
  const model = fixture(), sampler = {count:0}, timers = new Map();
  const state = {model, curve:model.moodCurve, scoreStyle:'terrain', title:'A', status:'ready',
    terrain:{terrainWeather:'rain', terrainWeatherDriver:'mood', terrainLightning:true}};
  const current = {time:56.5, held:false};
  Object.assign(doc, {getElementById:get, createElement:() => new Node(), createElementNS:() => new Node(),
    documentElement:{lang:'en-US'}});
  const observer = class { observe() {} disconnect() {} };
  Object.assign(host, {document:doc, localStorage:{getItem:k => kept.get(k), setItem:(k,v) => kept.set(k,v)},
    Event:class { constructor(type, args) { this.type=type; Object.assign(this,args); } },
    MutationObserver:observer, ResizeObserver:observer, matchMedia:() => ({matches:true}), clearTimeout:id => timers.delete(id),
    setTimeout:fn => { timers.set(1,fn); return 1; }, requestAnimationFrame:() => 1, cancelAnimationFrame() {},
    XinMusicLabDynamicUi:{t:key => catalogs.MESSAGE_CATALOGS[doc.documentElement.lang][key]},
    XinMoodCurve:reader, XinArt:{terrain}, XinTerrainWeather:{...weather,sample(...args) { sampler.count++; return weather.sample(...args); }}});
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../score-mood-debug.js'),'utf8'),host);
  const api = host.XinScoreMoodDebug.attach({stage, audio, canvas:new Node(), held:() => current.held,
    time:() => current.time, context:() => state, seek:t => { current.time=t; }});
  return {api, audio, stage, host, state, sampler, timers, current, get, kept, doc,
    press:(args={}) => host.dispatchEvent({type:'keydown', key:'m', preventDefault(){}, ...args}),
    node:(type,key) => get('scoreMoodDebugBody').find(n => n.dataset[type] === key)};
}

test('closed is dormant, live values match the engine, all six chart domains seek, and the choice persists', () => {
  const p=page(), panel=p.get('scoreMoodDebug'), t=p.current.time;
  assert.equal(p.sampler.count,0); assert.equal(p.audio.events.size,0);
  p.press({target:{closest:() => ({})}}); p.press({ctrlKey:true}); assert.equal(p.sampler.count,0);
  p.press();
  assert.equal(panel.hidden,false);
  const actual=weather.sample(p.state.model,t,{...terrain.weatherWindow(p.state.model),...p.state.terrain});
  assert.equal(p.node('debugValue','intensity').textContent,actual.intensity.toFixed(3));
  assert.equal(p.node('debugValue','tier').textContent,'Downpour');
  assert.equal(p.node('debugValue','cloud').textContent,'No reading');
  assert.equal(p.node('debugValue','slow').textContent,reader.at(p.state.curve,t).slow.toFixed(3));
  assert.equal(p.node('debugValue','section').textContent,'Bridge');
  for(const kind of ['overview','zoom','lufs','band28Dbfs','logFlatness','compare']) {
    const area=p.node('debugPlot',kind), domain=[+area.attrs['aria-valuemin'],+area.attrs['aria-valuemax']];
    const event={isPrimary:true,button:0,pointerId:1,clientX:140};
    area.dispatchEvent({...event,type:'pointerdown'}); area.dispatchEvent({...event,type:'pointerup'});
    assert.equal(p.current.time,debug.targetAt(domain,.7),kind);
  }
  p.state.terrain.terrainLightning=false; p.api.refresh();
  assert.equal(p.node('debugValue','next').textContent,'Off');
  p.state.terrain.terrainWeatherDriver='original'; p.api.refresh();
  assert.equal(p.node('debugValue','original').textContent,p.node('debugValue','intensity').textContent);
  p.state.terrain.terrainWeather='clear'; p.api.refresh();
  assert.equal(p.node('debugValue','cloud').textContent,'No reading');
  p.state.terrain.terrainWeatherDriver='mood'; p.api.refresh();
  assert.equal(p.node('debugValue','cloud').textContent,weather.sample(p.state.model,p.current.time,p.state.terrain).cloudOpacity.toFixed(3));
  p.audio.paused=false; p.audio.dispatchEvent({type:'play'}); assert.equal(p.timers.size,1);
  for (const name of ['ui-hidden','is-immersive']) {
    p.stage.classList.add(name); p.api.sync(); assert.equal(panel.hidden,true); assert.equal(p.timers.size,0);
    p.stage.classList.remove(name); p.api.sync(); assert.equal(panel.hidden,false);
  }
  p.current.held=true; p.api.sync(); assert.equal(panel.hidden,true);
  p.current.held=false; p.api.sync();
  p.stage.dataset.effect='sandbox'; p.api.sync(); assert.equal(panel.hidden,true);
  p.stage.dataset.effect='score'; p.api.sync(); assert.equal(panel.hidden,false);
  const restored=page(p.kept); assert.equal(restored.get('scoreMoodDebug').hidden,false);
  p.get('scoreMoodDebugClose').dispatchEvent({type:'click'});
  assert.equal(panel.hidden,true); assert.equal(p.audio.events.size,0); assert.equal(p.timers.size,0);
  const count=p.sampler.count; p.api.refresh(); assert.equal(p.sampler.count,count);
  p.api.destroy(); restored.api.destroy();
});

test('other styles and tracks without notes, curves, or active selections cannot leak weather or previous data', () => {
  const p=page();
  p.state.scoreStyle='starry'; p.press();
  assert.ok(p.node('debugPlot','lufs')); assert.equal(p.node('debugPlot','compare'),null);
  assert.equal(p.sampler.count,0);
  Object.assign(p.state,{scoreStyle:'terrain',model:null,status:'empty'});
  p.api.refresh(); assert.ok(p.node('debugPlot','overview')); assert.equal(p.node('debugValue','intensity'),null);
  assert.equal(p.node('debugValue','section').textContent,'No section data');
  p.state.curve=null; p.doc.documentElement.lang='zh-CN'; p.api.refresh();
  assert.equal(p.node('debugPlot','overview'),null);
  assert.equal(p.get('scoreMoodDebugBody').children[0].textContent,'这首歌还没有情绪曲线，去 XLD 计算。');
  for(const status of ['loading','idle','failed']) {
    p.state.status=status; p.api.refresh(); assert.equal(p.node('debugValue','slow'),null);
  }
  p.api.destroy();
});
