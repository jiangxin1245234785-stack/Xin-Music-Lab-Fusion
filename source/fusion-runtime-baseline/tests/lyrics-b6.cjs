'use strict';
// B6 (work/xml-round-20261115/SPEC-B6.md): lyrics on the score. No real network: every lookup goes to a fake fetch.
//   node tests/lyrics-b6.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const core = require(path.join(root, 'lyrics-core.js'));
const {createLyrics, rootFor, LRCLIB} = require(path.join(root, 'desktop', 'lyrics.cjs'));
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const done = [];

// --- reading LRC -------------------------------------------------------------------------------------------------
(() => {
  const {lines, timed} = core.parseLrc([
    '\uFEFF[ti:七里香]', '[ar:周杰伦]', '[length: 04:59]',
    '[00:27.38] 窗外的麻雀', '[00:34.3]在电线杆上多嘴', '[00:41.060]你说这一句', '[00:48:50]很有夏天的感觉',
    '[01:02]', '[01:05.00][02:10.00]副歌这一行', '', '   ', 'no time here', '[00:99.00]bad seconds',
    '[03:00.00]原文', '[03:00.00]translation', '[03:00.00]third at the same time'
  ].join('\r\n'));
  assert.equal(timed, true);
  assert.deepEqual(lines.map(l => [l.time, l.text]), [
    [27.38, '窗外的麻雀'], [34.3, '在电线杆上多嘴'], [41.06, '你说这一句'], [48.5, '很有夏天的感觉'], [62, ''],
    [65, '副歌这一行'], [130, '副歌这一行'], [180, '原文']]);
  assert.equal(lines[7].translation, 'translation', '同一时间的第二行当翻译');
  // [offset:+500] moves every line half a second earlier; never below zero.
  const shifted = core.parseLrc('[offset:+500]\n[00:00.20]a\n[00:10.00]b').lines;
  assert.deepEqual(shifted.map(l => l.time), [0, 9.5]);
  assert.deepEqual(core.parseLrc('[offset:-250]\n[00:10.00]b').lines.map(l => l.time), [10.25]);
  // Plain text, or only tags: not timed.
  assert.equal(core.parseLrc('just words\nmore words').timed, false);
  assert.equal(core.parseLrc('[ar:x]\n[00:01.00]').timed, false);
  assert.equal(core.parseLrc('').timed, false);
  assert.equal(core.parseLrc(null).timed, false);
  done.push('LRC：几种时间写法、一行多个时间、offset、空行、元信息、同一时间多行（第二行当翻译）、纯文本不算');
})();

// --- the line at a time ----------------------------------------------------------------------------------------
(() => {
  const {lines} = core.parseLrc('[00:10.00]one\n[00:20.00]two\n[00:30.00]\n[00:40.00]three');
  let at = core.lineAt(lines, 5);
  assert.equal(at.now, null); assert.equal(at.before, null); assert.equal(at.after.text, 'one');
  at = core.lineAt(lines, 10);
  assert.equal(at.now.text, 'one'); assert.equal(at.after.text, 'two'); assert.equal(at.before, null);
  at = core.lineAt(lines, 25);
  assert.equal(at.now.text, 'two'); assert.equal(at.before.text, 'one'); assert.equal(at.after.text, 'three');
  at = core.lineAt(lines, 35);
  assert.equal(at.now, null, '空行之后什么都不唱'); assert.equal(at.before.text, 'two'); assert.equal(at.after.text, 'three');
  at = core.lineAt(lines, 99);
  assert.equal(at.now.text, 'three'); assert.equal(at.after, null);
  assert.equal(core.lineAt([], 3).now, null);
  done.push('当前行：开始前、行首那一刻、两行之间、空行、最后一行之后');
})();

// --- matching ---------------------------------------------------------------------------------------------------
(() => {
  const want = {title: '七里香', artist: '周杰伦', duration: 299};
  assert.equal(core.sameSong(want, {title: '七里香', artist: '周杰伦', duration: 297}), true, '差 2 秒');
  assert.equal(core.sameSong(want, {title: '七里香', artist: '周杰伦', duration: 302}), true, '差 3 秒');
  assert.equal(core.sameSong(want, {title: '七里香', artist: '周杰伦', duration: 303}), false, '差 4 秒不要');
  assert.equal(core.sameSong(want, {title: '七里香 (Live)', artist: '周杰伦', duration: 299}), true, '括号里的版本说明不算');
  assert.equal(core.sameSong(want, {title: '七里香', artist: '蔡依林', duration: 299}), false, '歌手不同不要');
  assert.equal(core.sameSong(want, {title: '晴天', artist: '周杰伦', duration: 299}), false, '歌名不同不要');
  assert.equal(core.sameSong({title: 'ＭＥＧＵＲＩ', artist: "WORLD'S END GIRLFRIEND", duration: 568}, {title: 'Meguri', artist: "world's end girlfriend", duration: 567}), true, '全半角、大小写、标点');
  assert.equal(core.sameSong({title: 'Song [Remastered 2011]', artist: 'A & B', duration: 0}, {title: 'song', artist: 'B', duration: 200}), true, '合作歌手有一个对上；不知道时长时不比');
  assert.equal(core.sameSong({title: 'Song', artist: 'A feat. C', duration: 100}, {title: 'Song', artist: 'A', duration: 100}), true);
  assert.equal(core.sameSong({title: '', artist: 'A'}, {title: '', artist: 'A'}), false, '空歌名不算对上');
  assert.equal(core.MATCH.durationSeconds, 3);
  // What is asked: an unknown artist is taken from "Artist - Title", and then no album is sent.
  assert.deepEqual(core.query({title: '周杰伦 - 七里香', artist: 'Unknown Artist', album: 'single', duration: 298.6}), {title: '七里香', artist: '周杰伦', album: '', duration: 299});
  assert.deepEqual(core.query({title: 'MEGURI', artist: "world's end girlfriend", album: 'Resistance & The Blessing', duration: 568.2}),
    {title: 'MEGURI', artist: "world's end girlfriend", album: 'Resistance & The Blessing', duration: 568});
  assert.equal(core.query({title: 'no dash here', artist: 'Unknown Artist'}), null, '不知道歌手又拆不出来：不查');
  assert.equal(core.query({title: '', artist: 'A'}), null);
  done.push('匹配：歌名相同、歌手有一个对上、时长差不超过 3 秒；括号、全半角、大小写、标点不算；不知道歌手时从「歌手 - 歌名」拆，拆不出不查');
})();

// --- the lookup: order, cache, misses, timeouts, rate limits -----------------------------------------------------
function fakeFetch(script) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({url, init});
    const step = typeof script === 'function' ? script(url, calls.length) : script.shift();
    if (step === 'hang') return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), {name: 'AbortError'}))));
    if (step === 'throw') throw new TypeError('fetch failed');
    return {status: step.status, ok: step.status >= 200 && step.status < 300, headers: {get: name => (step.headers || {})[name.toLowerCase()] ?? null}, json: async () => step.body};
  };
  return {fetch, calls};
}
const SYNCED = '[00:27.38] 窗外的麻雀 在電線桿上多嘴\n[00:34.33] 妳說這一句 很有夏天的感覺\n';
const record = (over = {}) => ({status: 200, body: {id: 1, trackName: '七里香', artistName: '周杰伦', albumName: '七里香', duration: 297, instrumental: false, plainLyrics: 'x', syncedLyrics: SYNCED, ...over}});

async function lookups() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'b6-lyrics-'));
  const songDir = path.join(base, 'music', 'single'); fs.mkdirSync(songDir, {recursive: true});
  const song = path.join(songDir, '周杰伦 - 七里香.mp3'); fs.writeFileSync(song, '');
  const track = {id: 't1', title: '周杰伦 - 七里香', artist: 'Unknown Artist', album: 'single', duration: 299, filePath: song};
  let clock = 1_000_000;
  const make = (fetch, extra = {}) => createLyrics({root: path.join(base, 'cache'), fetch, now: () => clock, random: () => 0, ...extra});

  // Found online: asked once, the right request, cached; the second time no request.
  let f = fakeFetch([record()]);
  let lyrics = make(f.fetch);
  let answer = await lyrics.get(track);
  assert.equal(answer.ok, true); assert.equal(answer.source, 'lrclib'); assert.equal(answer.lrc, SYNCED);
  assert.equal(f.calls.length, 1);
  const url = new URL(f.calls[0].url);
  assert.equal(url.origin + url.pathname, LRCLIB);
  assert.deepEqual([...url.searchParams.keys()].sort(), ['artist_name', 'duration', 'track_name'], '只发歌名、歌手、时长（专辑这次是文件夹名，不发）');
  assert.equal(url.searchParams.get('track_name'), '七里香'); assert.equal(url.searchParams.get('artist_name'), '周杰伦'); assert.equal(url.searchParams.get('duration'), '299');
  const headers = f.calls[0].init.headers;
  assert.deepEqual(Object.keys(headers).sort(), ['Accept', 'User-Agent']);
  assert.match(headers['User-Agent'], /^XML-score-lyrics\/[\d.]+$/, '通用的客户端名，不带人名、邮箱、路径');
  assert.doesNotMatch(JSON.stringify(f.calls[0]), /Xin|12452|Users|northwestern|Download|bandcamp/i, '请求里没有用户的名字、路径');
  answer = await make(fakeFetch([]).fetch).get(track);
  assert.equal(answer.ok, true); assert.equal(answer.cached, true, '第二次从本机缓存');

  // A .lrc next to the song wins, before cache and network, and is never cached.
  fs.writeFileSync(path.join(songDir, '周杰伦 - 七里香.LRC'), '[00:01.00]本地的词\n');
  f = fakeFetch([]);
  answer = await make(f.fetch).get(track);
  assert.deepEqual([answer.ok, answer.source, f.calls.length], [true, 'file', 0]);
  assert.match(answer.lrc, /本地的词/);
  // A .lrc without times does not count.
  fs.writeFileSync(path.join(songDir, '周杰伦 - 七里香.LRC'), '只是文字\n');
  answer = await make(fakeFetch([]).fetch).get(track);
  assert.equal(answer.source, 'lrclib', '没时间的 .lrc 不算，回到缓存');
  fs.rmSync(path.join(songDir, '周杰伦 - 七里香.LRC'));

  // Not found: cached as a miss, not asked again for 7 days, asked again after.
  const other = {id: 't2', title: 'MEGURI', artist: "world's end girlfriend", album: 'Resistance & The Blessing', duration: 568, filePath: path.join(base, 'music', 'x.flac')};
  f = fakeFetch([{status: 404, body: {name: 'TrackNotFound'}}, {status: 404, body: {}}]);
  lyrics = make(f.fetch);
  assert.deepEqual(await lyrics.get(other), {ok: false, reason: 'none'});
  assert.equal(new URL(f.calls[0].url).searchParams.get('album_name'), 'Resistance & The Blessing', '歌手、专辑都知道时带专辑');
  assert.deepEqual(await lyrics.get(other), {ok: false, reason: 'none', cached: true});
  clock += 6.9 * 86400000;
  await lyrics.get(other); assert.equal(f.calls.length, 1, '7 天内不重查');
  clock += 0.2 * 86400000;
  await lyrics.get(other); assert.equal(f.calls.length, 2, '7 天后重查');

  // Not the song (duration 5 s off, another artist), instrumental, or only plain words: a miss.
  for (const [i, over] of [{duration: 304}, {artistName: '蔡依林'}, {instrumental: true}, {instrumental: true, syncedLyrics: null}, {syncedLyrics: null}, {syncedLyrics: 'no times'}].entries()) {
    const t = {...track, id: 'm' + i, title: `周杰伦 - 歌${i}`};
    f = fakeFetch([record({...over, trackName: `歌${i}`})]);
    assert.deepEqual(await make(f.fetch).get(t), {ok: false, reason: 'none'}, JSON.stringify(over));
  }

  // A timeout: no answer cached, the song left alone for 10 minutes, then asked again. No storm.
  f = fakeFetch(['hang', record({trackName: '晴天', duration: 269})]);
  lyrics = make(f.fetch, {timeoutMs: 30});
  const sunny = {...track, id: 't3', title: '周杰伦 - 晴天', duration: 269};
  assert.deepEqual(await lyrics.get(sunny), {ok: false, reason: 'timeout'});
  assert.deepEqual(await lyrics.get(sunny), {ok: false, reason: 'waiting'});
  assert.equal(f.calls.length, 1, '失败后不马上重试');
  clock += 10 * 60000 + 1;
  assert.equal((await lyrics.get(sunny)).ok, true); assert.equal(f.calls.length, 2);
  // A network error is the same.
  f = fakeFetch(['throw']); lyrics = make(f.fetch);
  assert.deepEqual(await lyrics.get({...track, id: 't4', title: '周杰伦 - 稻香', duration: 223}), {ok: false, reason: 'network'});

  // 429: every request stops for Retry-After (and a little), then goes on.
  f = fakeFetch([{status: 429, headers: {'retry-after': '30'}, body: {}}, record({trackName: '告白气球', duration: 215})]);
  lyrics = make(f.fetch);
  const balloon = {...track, id: 't5', title: '周杰伦 - 告白气球', duration: 215};
  assert.deepEqual(await lyrics.get(balloon), {ok: false, reason: 'rate-limited'});
  assert.deepEqual(await lyrics.get({...track, id: 't6', title: '周杰伦 - 夜曲', duration: 226}), {ok: false, reason: 'rate-limited'}, '限流时别的歌也不发');
  assert.equal(f.calls.length, 1);
  clock += 31000;
  assert.equal((await lyrics.get(balloon)).ok, true);

  // One request per song at a time.
  let release; const gate = new Promise(r => { release = r; });
  f = fakeFetch(() => gate.then(() => record({trackName: '简单爱', duration: 270})));
  const slowFetch = async (...args) => { const r = await f.fetch(...args); return r; };
  lyrics = make(async (url, init) => { f.calls.push({url}); await gate; return {status: 200, ok: true, headers: {get: () => null}, json: async () => record({trackName: '简单爱', duration: 270}).body}; });
  const simple = {...track, id: 't7', title: '周杰伦 - 简单爱', duration: 270};
  const both = [lyrics.get(simple), lyrics.get(simple)];
  release();
  const [a, b] = await Promise.all(both);
  assert.equal(a.ok && b.ok, true); assert.equal(f.calls.length, 1, '同一首同时只问一次');
  void slowFetch;

  // Names the library cannot split: nothing sent.
  f = fakeFetch([]);
  assert.deepEqual(await make(f.fetch).get({...track, id: 't8', title: 'untitled', artist: 'Unknown Artist'}), {ok: false, reason: 'no-names'});
  assert.equal(f.calls.length, 0);

  // The cache lives beside XML's own data, never under an analysis root.
  assert.equal(rootFor('C:/x/XinMusicDevelopment/0.5.0', 'C:/x/XinMusicDevelopment/0.5.0/XML').replace(/\\/g, '/'), 'C:/x/XinMusicDevelopment/Lyrics Cache');
  assert.equal(rootFor('C:/AppData/Roaming', 'C:/AppData/Roaming/XML').replace(/\\/g, '/'), 'C:/AppData/Roaming/XML/Lyrics Cache');
  assert.throws(() => createLyrics({root: 'relative'}), /lyrics-root-invalid/);
  fs.rmSync(base, {recursive: true, force: true});
  done.push('取词：同名 .lrc 最先且不缓存；LRCLIB 只发歌名 / 歌手 / （专辑）/ 时长和通用客户端名；查到的和没查到的都缓存，没查到 7 天后才重查；对不上、纯音乐、只有纯文本都算没查到；超时和断网不缓存、10 分钟内不重试；429 按 Retry-After 全停；同一首同时只问一次');
}

// --- the page: nothing asked while off or off-screen; once per song; words placed above the vocal lane -------------
async function page() {
  const source = read('score-lyrics.js');
  const elements = {};
  const el = tag => {
    const e = {tag, className: '', textContent: '', hidden: false, style: {}, dataset: {}, children: [], attrs: {}, offsetHeight: 40, offsetWidth: 0,
      classList: {set: new Set(), add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); }},
      setAttribute(k, v) { this.attrs[k] = v; }, append(...c) { this.children.push(...c); }, remove() {}, appendChild(c) { this.children.push(c); },
      listeners: {}, addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }};
    return e;
  };
  const toggle = el('input'); toggle.checked = true;
  const doc = {createElement: el, getElementById: id => (id === 'scoreLyrics' ? toggle : null)};
  const canvas = {clientWidth: 1000, clientHeight: 600, offsetLeft: 0, offsetTop: 100, parentNode: {insertBefore(node) { elements.box = node; }}};
  let status = {active: true, status: 'ready', trackId: 'a'};
  const view = {options: () => ({playhead: 0.3}), timeAt: () => clock, lanes: () => [{group: 'vocals', visible: true, shown: true}, {group: 'guitar', visible: true}],
    hit: (x, y) => (y >= 120 && y < 200 ? {kind: 'lane', group: 'guitar'} : y >= 200 && y < 300 ? {kind: 'lane', group: 'vocals'} : y >= 300 ? {kind: 'lane', group: 'piano'} : null)};
  let clock = 25;
  const asked = [];
  const bridge = {lyrics: (id, duration) => { asked.push([id, duration]); return Promise.resolve(id === 'a' ? {ok: true, source: 'lrclib', lrc: '[00:10.00]one\n[00:20.00]two\n[00:40.00]three'} : {ok: false, reason: 'none'}); }};
  const storage = new Map();
  const sandbox = {globalThis: {}, Promise};
  vm.runInNewContext(source, sandbox);
  const api = sandbox.globalThis.XinScoreLyrics;
  const ctl = api.create({bridge, stage: {}, canvas, scene: {status: () => status, viewHandle: () => view}, audio: {duration: 298.7}, core, doc,
    storage: {getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v)}, raf: () => 0, now: () => 1e9, say: (k, f, p) => (p ? f.replace('{source}', p.source) : f)});
  const box = elements.box;
  const flush = () => new Promise(r => setImmediate(r));
  ctl.render(); await flush(); ctl.render();
  assert.deepEqual(asked, [['a', 298.7]]);
  assert.equal(box.hidden, false);
  const [from, before, current, after] = box.children;
  assert.deepEqual([current.textContent, before.textContent, after.textContent], ['two', 'one', 'three']);
  assert.equal(from.textContent, '歌词来自 LRCLIB', '看得出歌词来自哪');
  assert.equal(box.style.top, `${100 + 200 - api.GAP - 40}px`, '字的下沿在人声轨上沿之上（人声轨上面还有一条轨也一样）');
  assert.equal(box.style.left, `${300 - 2}px`, '从播放线开始');
  assert.equal(box.dataset.anchor, 'vocals');
  ctl.render(); ctl.render(); await flush();
  assert.equal(asked.length, 1, '同一首只问一次');
  // No vocal lane: above the first lane.
  view.lanes = () => [{group: 'guitar', visible: true}];
  status = {...status, trackId: 'a2'}; ctl.render(); await flush();
  // (a2 has no lyrics; back to a with a fresh placement)
  status = {...status, trackId: 'a'}; ctl.render();
  assert.equal(box.dataset.anchor, 'top'); assert.equal(box.style.top, `${100 + 120 - api.GAP - 40}px`, '没人声轨：第一条轨上方');
  view.lanes = () => [{group: 'vocals', visible: true, shown: true}];
  // Not found: nothing shown.
  status = {...status, trackId: 'b'}; ctl.render(); await flush(); ctl.render();
  assert.equal(box.hidden, true);
  // Score not on screen, or not ready: nothing asked, nothing shown.
  status = {active: false, status: 'ready', trackId: 'c'}; ctl.render(); await flush();
  status = {active: true, status: 'loading', trackId: 'd'}; ctl.render(); await flush();
  assert.equal(asked.some(([id]) => id === 'c' || id === 'd'), false, '谱面没显示时不查');
  // Switch off: stored, hidden, nothing asked for a new song.
  toggle.checked = false; toggle.listeners.change[0]();
  assert.equal(storage.get(api.KEY), 'off');
  status = {active: true, status: 'ready', trackId: 'e'}; ctl.render(); await flush();
  assert.equal(asked.some(([id]) => id === 'e'), false, '开关关着不查');
  assert.equal(box.hidden, true);
  // Off is remembered on the next start.
  assert.equal(api.storedLyrics('off'), false); assert.equal(api.storedLyrics(null), true); assert.equal(api.storedLyrics('on'), true);
  done.push('页面：开关关着、谱面没显示、谱面没准备好时都不查；同一首只问一次；字在人声轨上方、从播放线开始；没人声轨时在第一条轨上方；没查到什么都不显示；写明来源');
}

// --- markup, words, wiring -------------------------------------------------------------------------------------
(() => {
  const html = read('index.html'), main = read('desktop/main.cjs'), preload = read('desktop/preload.cjs'), css = read('style.css');
  const {MESSAGE_CATALOGS} = require(path.join(root, 'i18n', 'catalogs.js'));
  const tag = /<input id="scoreLyrics"[^>]*>/.exec(html)?.[0];
  assert.ok(tag && /\schecked\b/.test(tag) && /role="switch"/.test(tag), '「显示歌词」开关在，缺省开');
  const group = html.slice(html.indexOf('data-i18n="score.options"'), html.indexOf('class="score-export"'));
  assert.ok(group.includes('id="scoreLyrics"'), '开关在「谱面阅读」组里');
  assert.match(html, /data-i18n="score\.lyricsHint">[^<]*LRCLIB[^<]*</, '小字说明歌名和歌手会发到 LRCLIB');
  for (const key of ['score.lyrics', 'score.lyricsHint', 'score.lyricsFrom', 'score.lyricsFile'])
    assert.ok(MESSAGE_CATALOGS['zh-CN'][key] && MESSAGE_CATALOGS['en-US'][key], key);
  assert.ok(html.indexOf('src="./lyrics-core.js"') > html.indexOf('src="./score-scene.js"') && html.indexOf('src="./score-lyrics.js"') > html.indexOf('src="./lyrics-core.js"') && html.indexOf('src="./fusion.js"') > html.indexOf('src="./score-lyrics.js"'));
  // The page names only a track id; the names sent out come from the main process's own library index.
  assert.match(preload, /lyrics: \(trackId, duration\) => ipcRenderer\.invoke\('fusion:lyrics', \{ trackId, duration \}\),/);
  assert.match(main, /ipcMain\.handle\('fusion:lyrics',async\(_event,payload\)=>\{const track=fusionTrackIndex\.get\(String\(payload\?\.trackId\|\|''\)\);if\(!track\)return \{ok:false,reason:'track-missing'\};/);
  assert.match(main, /lyrics\.get\(\{id:track\.id,title:track\.title,artist:track\.artist,album:track\.album,duration,filePath:track\.filePath\}\)/);
  assert.match(main, /createLyrics\(\{root:lyricsModule\.rootFor\(app\.getPath\('appData'\),app\.getPath\('userData'\)\)\}\)/);
  // A plain layer: no plate, no outline.
  const rule = /\.score-lyrics \{([^}]*)\}/.exec(css)?.[1] || '';
  assert.ok(rule && !/background|border|-webkit-text-stroke/.test(rule), '不加底板、不加描边');
  assert.match(css, /\.stage:not\(\[data-effect="score"\]\) \.score-lyrics \{ display: none; \}/);
  assert.match(css, /\.score-lyrics__now \{ font-size: calc\(14px \* var\(--ui-scale, 1\)\);/, '字号跟着界面缩放');
  // The core is not touched for this: score-scene only lends its view.
  assert.match(read('score-scene.js'), /viewHandle: \(\) => \(view && status === 'ready' \? view : null\),/);
  done.push('设置里「显示歌词」缺省开、在谱面阅读组、小字写明发到 LRCLIB；页面只交歌曲 id，发出去的名字由主进程从曲库取；字没有底板和描边，跟着 140% 缩放');
})();

let clock = 0; void clock;
// A lookup that never settles would let node end quietly with code 0: every group must have run.
process.on('exit', () => { if (done.length !== 6 && !process.exitCode) { console.error(`only ${done.length} of 6 groups ran`); process.exitCode = 1; } });
lookups().then(page).then(() => {
  for (const line of done) console.log('ok  ' + line);
  console.log(`lyrics-b6: ${done.length} groups passed`);
}).catch(error => { console.error(error); process.exitCode = 1; });
