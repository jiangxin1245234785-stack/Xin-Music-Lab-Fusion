'use strict';
// What the hosts may turn on. Since work/xml-round-20261115/SPEC-B4.md the user's pick from gate15 is on in XML:
// XML's score scene and its video export may pass `showShapes` and `shapeSet`, and the set is only ever 'spindle'
// (struck / plucked notes with a head, strings as a spindle). Each of the two names may appear there only in the
// exact forms below, so a stray `showShapes: true` or another set anywhere else in those files is caught. The video
// engine's own look (export-main / export-render) still turns on nothing: the shapes reach a video only through
// what XML passes. No host passes `shapeLinks`, `pitchWeight`, `coverAdapt`, `textureAdapt` or `showRoles`; the
// core keeps them off. Read-only source guard; it reads the hosts' files and changes nothing. Each path can be
// pointed at a copy (SCOREVIEW_GUARD_*), which is how tests/mutations.cjs checks that this test notices the word put in.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..', '..', '..');
// [name, file, the only forms in which showShapes / shapeSet may appear there, each exactly once]
const HOSTS = [
  ['XML 谱面场景', process.env.SCOREVIEW_GUARD_SCENE || path.join(REPO, 'source', 'fusion-runtime-baseline', 'score-scene.js'),
    ["{showShapes: true, shapeSet: 'spindle'}", '{showShapes: false}']],
  ['XML 导出的 IPC', process.env.SCOREVIEW_GUARD_EXPORT_IPC || path.join(REPO, 'source', 'fusion-runtime-baseline', 'desktop', 'score-export-ipc.cjs'),
    ["look.showShapes = true; look.shapeSet = 'spindle';"]],
  ['导出引擎的缺省样子', process.env.SCOREVIEW_GUARD_EXPORT_MAIN || path.join(REPO, 'source', 'scoreview', 'export', 'export-main.cjs'), []],
  ['导出引擎的绘制页', process.env.SCOREVIEW_GUARD_EXPORT_RENDER || path.join(REPO, 'source', 'scoreview', 'export', 'export-render.js'), []]
];
const NEVER = ['showRoles', 'shapeLinks', 'pitchWeight', 'coverAdapt', 'textureAdapt'];
const SHAPE_NAMES = ['showShapes', 'shapeSet'];

test('the approved text and drum looks are enabled by the XML listening scene only', () => {
  const [scene, ...exports] = HOSTS;
  const sceneCode = fs.readFileSync(scene[1], 'utf8');
  assert.match(sceneCode, /quietText: true/);
  assert.match(sceneCode, /drumNotation: true/);
  assert.equal((sceneCode.match(/\bdrumNotation\b/g) || []).length, 1);
  for (const [name, file] of exports) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /quietText|drumNotation/, name);
  }
});

test('the listening score and video use permanent starry rendering while the independent core stays configurable', () => {
  const [scene, , ...engine] = HOSTS;
  const source = fs.readFileSync(scene[1], 'utf8');
  assert.match(source, /const meteorMotion\s*=\s*true/);
  assert.doesNotMatch(source, /getItem\(METEOR_KEY\)/, 'the retired on/off preference cannot disable the listening score');
  assert.match(source, /meteorMotion,scoreStyle/);
  const main=fs.readFileSync(engine[0][1],'utf8'),render=fs.readFileSync(engine[1][1],'utf8');
  assert.doesNotMatch(main, /\blocalStorage\b/, 'offline export does not read device preferences');
  assert.match(render, /\.\.\.job\.look,\s*meteorMotion:\s*true/);
  assert.doesNotMatch(render, /\blocalStorage\b/);
  const {ScoreView,mockCanvas,fullModel}=require('./helpers.cjs');
  const view=ScoreView.create(mockCanvas().canvas,fullModel(),()=>0);
  assert.equal(view.options().meteorMotion,false);
  view.setOptions({meteorMotion:true});assert.equal(view.options().meteorMotion,true);
  view.setOptions({meteorMotion:false});assert.equal(view.options().meteorMotion,false);
  view.destroy();
});

test('the listening theme is restored, normalized and persisted without reviving the retired meteor switch', () => {
  const vm=require('node:vm'),theme=require('../score-style.cjs');
  const source=fs.readFileSync(HOSTS[0][1],'utf8');
  for(const legacy of [null,'off','on'])for(const saved of [null,'paper','water','ember','theatre','invalid']){
    const storage=new Map([['xin-score-meteor-motion',legacy],['xin-score-style-v1',saved]]),handlers={};
    const element=()=>({hidden:false,style:{},classList:{add(){},contains:()=>false},dataset:{},addEventListener(){},appendChild(){},append(){},
      getBoundingClientRect:()=>({top:0,bottom:0,left:0,height:0,width:0}),querySelectorAll:()=>[],options:[],clientWidth:800,clientHeight:400});
    const select={value:'',addEventListener:(name,fn)=>handlers[name]=fn};
    const env={
      localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value))},
      document:{getElementById:id=>id==='scoreStyle'?select:null,querySelector:()=>null,createElement:element,documentElement:{lang:'zh-CN'}},
      XinScoreMood:theme,XinScoreView:{create(){}},XinMediaClock:{create:()=>({now:()=>0,destroy(){}})},
      MutationObserver:class{observe(){}disconnect(){}},addEventListener(){},removeEventListener(){},dispatchEvent(){},
      CustomEvent:class{},requestAnimationFrame:()=>0,cancelAnimationFrame(){},setTimeout:()=>0,clearTimeout(){},performance:{now:()=>0},devicePixelRatio:1
    };
    vm.runInNewContext(source,env);
    const scene=env.XinScoreScene.create({bridge:{scoreModel:async()=>({ok:false})},audio:element(),stage:element(),canvas:element()});
    assert.equal(scene.status().meteorMotion,true,`legacy ${legacy} must not disable starry rendering`);
    assert.equal(select.value,theme.normalize(saved));
    select.value='paper';handlers.change();assert.equal(storage.get('xin-score-style-v1'),'paper');
    select.value='invalid';handlers.change();assert.equal(storage.get('xin-score-style-v1'),'starry');
    assert.equal(storage.get('xin-score-meteor-motion'),legacy);
    scene.destroy();
  }
});

test('no host passes showRoles, shapeLinks, pitchWeight, coverAdapt or textureAdapt', () => {
  for (const [name, file] of HOSTS) {
    assert.ok(fs.existsSync(file), `${name}：${file} 不在，这条守卫读不到`);
    const text = fs.readFileSync(file, 'utf8');
    for (const option of NEVER) assert.ok(!new RegExp(option).test(text), `${name}（${path.basename(file)}）里出现了 ${option}：XML 和导出都不开它`);
  }
});

test("XML's scene and export pass showShapes / shapeSet only in their allowed forms, and the set only as 'spindle'", () => {
  for (const [name, file, allowed] of HOSTS) {
    let text = fs.readFileSync(file, 'utf8');
    for (const form of allowed) {
      const count = text.split(form).length - 1;
      assert.equal(count, 1, `${name}（${path.basename(file)}）里「${form}」应当正好出现一次，现在 ${count} 次`);
      text = text.split(form).join('');
    }
    for (const option of SHAPE_NAMES) assert.ok(!new RegExp(option).test(text), `${name}（${path.basename(file)}）里在允许的写法之外出现了 ${option}`);
  }
  // Any set named in the hosts is the spindle.
  for (const [name, file] of HOSTS.slice(0, 2)) {
    const sets = fs.readFileSync(file, 'utf8').match(/shapeSet\s*[:=]\s*['"][^'"]*['"]/g) || [];
    for (const set of sets) assert.match(set, /'spindle'$/, `${name} 里的 shapeSet 只能是 'spindle'：${set}`);
  }
});

test('the guard reads the files that really build the options', () => {
  // The scene's options and the export's look are there, and the shapes go into them.
  const scene = fs.readFileSync(HOSTS[0][1], 'utf8');
  assert.match(scene, /showTexture: true/);
  assert.match(scene, /showTexture: true,liveTextureRaster: true,\.\.\.shapeOptions\(shapes\),/);
  assert.match(fs.readFileSync(HOSTS[1][1], 'utf8'), /look\.showTexture = true/);
  assert.match(fs.readFileSync(HOSTS[2][1], 'utf8'), /const LOOK = Object\.freeze\(/);
});
