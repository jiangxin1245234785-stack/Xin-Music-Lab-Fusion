'use strict';
// 车窗地貌 batch 6, item 5: the route board in English, and the distance run instead of the song's time.
const assert = require('node:assert/strict');
const test = require('node:test');
const Led = require('../score-terrain-led.js');

test('station names to upper-case English, numbers kept; names it does not know stay as they are', () => {
  const cases = {'引子': 'INTRO', '主歌 1': 'VERSE 1', '导歌': 'PRE', '副歌 2': 'CHORUS 2', '间奏': 'BREAK', '器乐段': 'INST', '独奏': 'SOLO', '桥段': 'BRIDGE',
    '尾奏': 'OUTRO', 'Chorus 3': 'CHORUS 3', 'pre-chorus': 'PRE', 'Interlude': 'BREAK', 'instrumental 2': 'INST 2', '过门': '过门', 'Section A': 'Section A', '': ''};
  for (const [zh, en] of Object.entries(cases)) assert.equal(Led.englishSection(zh), en, zh);
});

test('full names for trackside signs and the sill retain their section kind or ordinal fallback', () => {
  assert.equal(Led.stationName('副歌 1', 'chorus', 3), 'CHORUS 1');
  assert.equal(Led.stationName('Main theme', 'chorus', 3), 'MAIN THEME');
  assert.equal(Led.stationName('重复 2', 'chorus', 3), 'CHORUS 2');
  assert.equal(Led.stationName('', '', 3), 'SECTION 4');
});

test('the distance readout uses the speed of the scene and rounds miles down to tenths', () => {
  const speedMps = 5 / .316;
  const d = {readout: 'miles', speedMps};
  assert.deepEqual(Led.readout(d, 104.4, 304), {now: '1.0', total: ' / 2.9 MI'});
  assert.deepEqual(Led.readout(d, 0, 60), {now: '0.0', total: ' / 0.5 MI'});
  assert.deepEqual(Led.readout({}, 104.4, 304), {now: '1:44', total: ' / 5:04'});
  assert.ok(Math.abs(Led.milesOf(1609.344 / speedMps, speedMps) - 1) < 1e-12);
});

const sections = names => names.map((name, i) => [30*i, 30*(i+1), name]);
const route = names => Led.prepareRoute(sections(names));
test('R2 codes, unnumbered and numbered, including aliases and numbered PRE', () => {
  const en = ['INTRO','VERSE','pre-chorus','chorus','interlude','bridge','solo','instrumental','outro'];
  const codes = ['IN','V','PR','C','BK','BR','S','IS','OUT'];
  assert.deepEqual(route(en).labels,codes);
  assert.deepEqual(route(en.map(s => s+' 12')).labels,codes.map(s => s+'12'));
  assert.deepEqual(route(['前奏','主歌 2','導歌３','副歌','間奏','橋段','獨奏','器樂段','尾聲']).labels,
    ['IN','V2','PR3','C','BK','BR','S','IS','OUT']);
});
test('only BREAK changes above 18 stops, for the whole route independent of width or current stop', () => {
  for (const count of [7,13,18,19,22]) {
    const names = Array.from({length:count},(_,i)=>['Break 1','Bridge','Break','PRE 2'][i%4]);
    const r = route(names), expected = names.map((_,i)=>[count>18?'B1':'BK1','BR',count>18?'B':'BK','PR2'][i%4]);
    for (const cols of [414,465]) for (const time of [0,90,30*(count-1)]) {
      const m = Led.headerModel({route:r,time},cols,50,16,12);
      assert.deepEqual(m.labels,expected);
      assert.equal(m.plan.step,(cols-4)/count);
    }
  }
});
test('unknown station labels keep two Latin letters and a suffix, with deterministic ordinals for missing names', () => {
  const names = ['', '００７', '夜行 3','こもれび','Æther storm 2','Moonlight'.repeat(64)+' 27','Écho ２','---','節奏 １２３４５','SECTION 3'];
  assert.deepEqual(route(names).labels,['X1','X007','X3','X4','ÆT2','MO27','EC2','X8','X9','SE3']);
});
test('actual 7, 9, 13 and 22-stop patterns keep a visible gap and complete glyphs at each station', () => {
  const names = {I:'Intro',V:'Verse',K:'Break',P:'Pre',C:'Chorus',R:'Bridge',O:'Outro'};
  for (const pattern of ['I V1 K1 V2 K2 V3 K3','I V1 P C1 K C2 V2 C3 O',
    'I V1 K1 C1 V2 C2 R K2 C3 K3 C4 K4 O','I V1 K1 V2 C1 V3 C2 K2 V4 C3 V5 C4 V6 C5 K3 V7 C6 K4 V8 C7 K5 V9']) {
    const r = route(pattern.split(' ').map(s=>names[s[0]]+s.slice(1)));
    for(const cols of [414,465]) {
      let priorX;
      for (let k=0;k<r.stops.length;k++) {
        const m=Led.headerModel({route:r,time:k*30+.25},cols,50,16,12), rebuilt=Led.dotMap(cols,12);
        let previousEnd=-10;
        assert.deepEqual(m.labelX,priorX || m.labelX); priorX=m.labelX;
        m.labels.forEach((s,i)=>{
          const x=m.labelX[i], ink=Led.dotMap(Led.width(s,12),12);
          ink.text(s,12,0,0,4);
          const used=Array.from(ink.a,(v,j)=>v?j%ink.cols:null).filter(v=>v!==null);
          assert.ok(used.length && x>=0 && x+ink.cols<=cols,'whole '+s);
          assert.ok(x+Math.min(...used)-previousEnd-1>=2,'gap before '+s);
          previousEnd=x+Math.max(...used);
          rebuilt.text(s,12,x,0,i<k?2:i===k?4:i===k+1?3:1);
        });
        assert.deepEqual(m.map.a.slice((m.routeY+3)*cols),rebuilt.a);
      }
    }
  }
});
