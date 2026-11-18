'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const core = require('../lyrics-core.js');
const {createLyrics, LRCLIB, LRCLIB_SEARCH} = require('../desktop/lyrics.cjs');
const {parseShare} = require('../desktop/netease-lyrics.cjs');
const track = {id:'toe-album', title:'グッドバイ Goodbye　Album Version feat. Toki Asako 土岐麻子', artist:'toe',
  album:'For Long Tomorrow', duration:425.533};
const timed = '[01:55.20]a lyric in this fixture';
const row = {id:20, trackName:'グッドバイ', artistName:'toe', albumName:track.album, duration:425.55, syncedLyrics:timed};
const reply = (body,status=200) => ({ok:status===200,status,json:async()=>body,headers:{get:()=>null}});
async function isolated(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'xml-lyrics-sources-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  return root;
}

test('a fresh exact-only miss can recover once by checking the album, artists, rendition and duration', async t => {
  const root = await isolated(t), q = core.query(track);
  assert.deepEqual(core.titleAliases(track.title).slice(0,2),['グッドバイ','Goodbye']);
  const key = crypto.createHash('sha1').update([core.normalize(q.title),core.normalize(q.artist),q.duration].join('|')).digest('hex');
  await fs.writeFile(path.join(root,key+'.json'),JSON.stringify({schemaVersion:1,asked:q,at:Date.now(),miss:true}));
  const calls = [], entries = [
    {...row, id:1, duration:425.533, albumName:'New Sentimentality'},
    {...row, id:2, duration:454}, {...row,id:3,artistName:'Another Band'},
    {...row, id:4, duration:425.533, trackName:'グッドバイ (Live)'},
    {...row, id:5, duration:425.533, trackName:'グッドバイ (feat. Another Singer)'},
    {...row, id:6, duration:425.533, artistName:'toe feat. Another Singer'}, row
  ];
  const service = createLyrics({root, fetch:async url=>{calls.push(new URL(url));return reply(entries);}});
  assert.ok((await service.get(track)).ok);
  assert.equal(calls.length,1);
  assert.equal(calls[0].pathname,'/api/search');
  assert.equal(calls[0].searchParams.get('track_name'),'グッドバイ');
  assert.equal(JSON.parse(await fs.readFile(path.join(root,key+'.json'))).found.id,row.id);
  assert.equal((await service.get(track)).cached,true);
  assert.equal(calls.length,1);
});
test('manual titles work without complete tag data; non-matching recordings cannot be auto-selected', async t => {
  const root=await isolated(t), loc={...track,id:'wrong'};
  const fetch=async url=>url.startsWith(LRCLIB_SEARCH) ? reply([{...row,duration:454,albumName:'New Sentimentality'}]) : reply(null,404);
  const service=createLyrics({root,fetch});
  assert.deepEqual(await service.get(loc),{ok:false,reason:'none'});
  const unknown={id:'untitled',title:'01',artist:'Unknown Artist',duration:454};
  const found=await service.candidates(unknown,{query:'グッドバイ',artist:'toe'});
  assert.equal(found.candidates[0].id,row.id);
  assert.equal((await service.choose(track,row.id)).ok,false);
  assert.equal((await service.choose(unknown,row.id)).ok,true);
  assert.equal((await service.get(unknown)).lrc,timed);
  assert.equal((await service.setInstrumental(unknown,true)).instrumental,true);
  assert.deepEqual(await service.get(unknown),{ok:false,reason:'instrumental',instrumental:true});
  await service.setInstrumental(unknown,false);
  assert.equal((await service.get(unknown)).lrc,timed);
  assert.equal(LRCLIB,'https://lrclib.net/api/get');
});
test('song links and short links are restricted to the intended music service', () => {
  for (const link of ['https://music.163.com/song?id=22664748','http://music.163.com/#/song?id=22664748&userid=1',
    '分享新歌 https://y.music.163.com/m/song?id=22664748 (来自云音乐)', 'https://music.163.com/song/22664748/']) {
    assert.deepEqual(parseShare(link),{id:'22664748'});
  }
  for(const link of ['https://music.163.com.invalid/song?id=22664748','https://music.163.com:8080/song?id=22664748',
    'https://test:pass@music.163.com/song?id=22664748','https://music.163.com/album?id=22664748','https://example.org/']) {
    assert.equal(parseShare(link),null);
  }
  assert.deepEqual(parseShare('https://163cn.tv/aB12?user=private'),{short:'https://163cn.tv/aB12'});
});
test('NetEase preview offers metadata; only the confirmed version is persisted and available offline', async t => {
  const root=await isolated(t), requests=[], blockedTarget='https://unrelated.example/song?id=22664748';
  let shortTarget=blockedTarget;
  const fetch=async(url, options)=>{
    requests.push(url);
    assert.equal(options.redirect,'manual');
    if(url.startsWith('https://163cn.tv/'))return {status:302,headers:{get:()=>shortTarget}};
    if(url.startsWith('https://music.163.com/api/song/detail/'))return reply({songs:[{id:22664748,name:'グッドバイ -album version-',
      artists:[{name:'toe'},{name:'土岐麻子'}],album:{name:track.album},duration:425533}]});
    if(url.startsWith('https://music.163.com/api/song/lyric'))return reply({code:200,lrc:{lyric:'[00:00.00]作词 : Someone\n[00:07.00]\n'+timed}});
    return reply(null,404);
  };
  const service=createLyrics({root,fetch});
  assert.equal((await service.neteasePreview(track,'https://163cn.tv/aB12')).reason,'need-song-link');
  assert.deepEqual(requests,['https://163cn.tv/aB12']);
  shortTarget='https://music.163.com/#/song?id=22664748';
  const p=await service.neteasePreview(track,'https://163cn.tv/aB12');
  assert.equal(p.candidate.recordingMismatch,false);
  const different = await service.neteasePreview({...track,id:'other-guest',title:'グッドバイ feat. Other'},'https://music.163.com/song?id=22664748');
  assert.equal(different.candidate.recordingMismatch,true);
  assert.equal(p.candidate.lines,1);
  assert.equal(p.candidate.firstLyricTime,115.2);
  assert.equal(p.candidate.durationDifference,0);
  assert.ok(!('lrc' in p) && !('originalLrc' in p));
  assert.equal((await service.neteaseChoose(track,123)).ok,false);
  assert.equal((await service.neteaseChoose({...track,id:'another'},22664748)).ok,false);
  assert.equal((await service.neteaseChoose(track,22664748)).ok,true);
  const restored=createLyrics({root,fetch:()=>{throw Error('must stay offline');}});
  const saved=await restored.get(track);
  assert.equal(saved.source,'netease'); assert.equal(saved.chosen,true);
  assert.ok(!saved.lrc.includes('作词')); assert.ok(saved.lrc.includes(timed));
  assert.equal((await restored.neteasePreview(track,'invalid')).reason,'invalid-link');
  assert.equal((await restored.get(track)).lrc,saved.lrc);
});
