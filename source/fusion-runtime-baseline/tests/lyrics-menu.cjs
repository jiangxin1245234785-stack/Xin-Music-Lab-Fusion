'use strict';
// The lyrics menu (2026-11-15): 重新查找 / 换一份 / 用本地文件… / 这首不显示歌词, and the source row that only shows for a
// moment and on pointing. Main side (desktop/lyrics.cjs) with a stand-in fetch; page side (score-lyrics.js) with stand-in
// elements.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const core = require(path.join(root, 'lyrics-core.js'));
const {createLyrics, LRCLIB, LRCLIB_SEARCH} = require(path.join(root, 'desktop', 'lyrics.cjs'));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const done = [];
const LRC = '[00:10.00]one\n[00:20.00]two\n[00:30.00]three';
const LRC2 = '[00:12.00]uno\n[00:22.00]dos\n[00:32.00]tres';

async function mainSide() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'xml-lyrics-menu-'));
  try {
    const asked = [];
    let getAnswer = {status: 404};
    const fetch = async url => {
      asked.push(String(url));
      if (String(url).startsWith(LRCLIB_SEARCH)) return {ok: true, status: 200, json: async () => [
        {id: 7, trackName: 'Song', artistName: 'Artist', albumName: 'Album (Live)', duration: 200, syncedLyrics: LRC2},
        {id: 8, trackName: 'Song', artistName: 'Artist', albumName: 'Album', duration: 181, syncedLyrics: LRC},
        {id: 9, trackName: 'Song', artistName: 'Artist', albumName: 'Plain', duration: 180, plainLyrics: 'no timing'},
        {id: 10, trackName: 'Other Song', artistName: 'Artist', duration: 180, syncedLyrics: LRC}]};
      return getAnswer.status === 200 ? {ok: true, status: 200, json: async () => getAnswer.body} : {ok: false, status: getAnswer.status};
    };
    const lyrics = createLyrics({root: path.join(base, 'cache'), fetch});
    const track = {id: 't1', title: 'Song', artist: 'Artist', album: 'Album', duration: 180, filePath: path.join(base, 'lib', 'Song.flac')};
    // Not found, cached as not found; 重新查找 asks again at once (not after 7 days).
    assert.equal((await lyrics.get(track)).reason, 'none');
    assert.equal((await lyrics.get(track)).reason, 'none'); assert.equal(asked.length, 1, 'the miss is cached');
    getAnswer = {status: 200, body: {id: 8, trackName: 'Song', artistName: 'Artist', duration: 181, syncedLyrics: LRC}};
    const again = await lyrics.refresh(track);
    assert.ok(again.ok && again.lrc === LRC && asked.length === 2, '重新查找 ignores the cached miss');
    assert.equal((await lyrics.get(track)).lrc, LRC, 'and the new answer is cached');
    // 换一份: the search sends the same names only, offers the timed records of the same song, nearest length first.
    const list = await lyrics.candidates(track);
    const url = new URL(asked[asked.length - 1]);
    assert.equal(url.origin + url.pathname, LRCLIB_SEARCH);
    assert.deepEqual([...url.searchParams.keys()].sort(), ['album_name', 'artist_name', 'track_name'], 'only title, artist and album are sent');
    assert.deepEqual(list.candidates.map(c => c.id), [8, 7], 'timed records of this song only, nearest in length first');
    assert.equal(list.candidates[0].lines, 3);
    assert.equal((await lyrics.choose(track, 99)).reason, 'not-offered', 'only what was offered can be chosen');
    assert.ok((await lyrics.choose(track, 7)).ok);
    const chosen = await lyrics.get(track);
    assert.ok(chosen.ok && chosen.lrc === LRC2 && chosen.chosen, 'the chosen version is used from now on');
    // 用本地文件…: an .lrc with timing; remembered by path, read every time, never copied.
    const file = path.join(base, 'mine.lrc'); fs.writeFileSync(file, LRC);
    assert.equal((await lyrics.chooseFile(track, path.join(base, 'mine.txt'))).reason, 'not-lrc');
    const plain = path.join(base, 'plain.lrc'); fs.writeFileSync(plain, 'just words');
    assert.equal((await lyrics.chooseFile(track, plain)).reason, 'no-timed-lyrics');
    assert.ok((await lyrics.chooseFile(track, file)).ok);
    let local = await lyrics.get(track);
    assert.ok(local.ok && local.source === 'chosen-file' && local.lrc === LRC && local.file === 'mine.lrc');
    fs.writeFileSync(file, LRC2);
    assert.equal((await lyrics.get(track)).lrc, LRC2, 'read each time, not copied');
    // 这首不显示歌词, and back: the choice of file stays underneath.
    await lyrics.hide(track, true);
    const hidden = await lyrics.get(track);
    assert.ok(!hidden.ok && hidden.hidden, 'hidden');
    await lyrics.hide(track, false);
    local = await lyrics.get(track);
    assert.equal(local.source, 'chosen-file', 'shown again, with the file chosen before');
    // 重新查找 drops a chosen version or file (not a hidden song's hiding).
    await lyrics.refresh(track);
    assert.equal((await lyrics.get(track)).source, 'lrclib');
    assert.equal(fs.readdirSync(path.join(base, 'cache')).includes('choices'), true);
    done.push('主进程：重新查找不看缓存（没查到的也立刻重查）；换一份只发歌名 / 歌手 / 专辑，只列同一首带时间的版本、长度最近的在前；只能选列出来的；本地 .lrc 记路径、每次读、不复制；不显示 / 显示按歌记住；重新查找会放掉选过的版本或文件');
  } finally { fs.rmSync(base, {recursive: true, force: true}); }
}

async function pageSide() {
  const el = tag => {
    const e = {tag, className: '', textContent: '', title: '', type: '', hidden: false, disabled: false, style: {}, dataset: {}, children: [], offsetHeight: 40,
      classList: {set: new Set(), add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); }, toggle(c, on) { if (on) this.set.add(c); else this.set.delete(c); }, contains(c) { return this.set.has(c); }},
      setAttribute() {}, append(...c) { this.children.push(...c); }, replaceChildren(...c) { this.children = c; }, remove() {},
      contains(x) { return x === this || this.children.some(c => c === x || c.contains?.(x)); },
      querySelectorAll(sel) { const out = []; const walk = n => { for (const c of n.children || []) { if (sel === '.score-lyrics__item' && c.className === 'score-lyrics__item') out.push(c); walk(c); } }; walk(this); return out; },
      listeners: {}, addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }};
    return e;
  };
  const doc = {createElement: el, getElementById: () => null, addEventListener() {}};
  const holder = {};
  const canvas = {clientWidth: 1000, clientHeight: 600, offsetLeft: 0, offsetTop: 100, parentNode: {insertBefore(node) { holder.box = node; }}};
  let status = {active: true, status: 'ready', trackId: 'a', health: {}};
  const view = {options: () => ({playhead: 0.3}), timeAt: () => 21, lanes: () => [{group: 'vocals', visible: true, shown: true}], hit: (x, y) => (y >= 200 ? {kind: 'lane', group: 'vocals'} : null)};
  const answers = {a: {ok: true, source: 'lrclib', lrc: LRC}, b: {ok: false, reason: 'none'}, c: {ok: false, reason: 'none'}};
  const menuCalls = [];
  const bridge = {lyrics: id => Promise.resolve(answers[id]), lyricsMenu: (id, action, extra) => { menuCalls.push([id, action, extra?.id ?? null]); return Promise.resolve(action === 'candidates' ? {ok: true, candidates: [{id: 5, title: 'Song', album: 'Live', duration: 200, lines: 30}]} : {ok: true}); }};
  const timers = [];
  const sandbox = {globalThis: {}, Promise};
  vm.runInNewContext(read('score-lyrics.js'), sandbox);
  const api = sandbox.globalThis.XinScoreLyrics;
  const say = (k, f, p) => (p ? Object.entries(p).reduce((s, [a, b]) => s.split(`{${a}}`).join(b), f) : f);
  const ctl = api.create({bridge, stage: {}, canvas, scene: {status: () => status, viewHandle: () => view}, audio: {duration: 60}, core, doc,
    storage: {getItem: () => null, setItem() {}}, raf: () => 0, now: () => 1e9, say, later: (fn, ms) => { timers.push({fn, ms}); return timers.length; }, cancel() {}});
  const flush = () => new Promise(r => setImmediate(r));
  const box = holder.box;
  ctl.render(); await flush(); ctl.render();
  assert.equal(ctl.status().now, 'two');
  assert.equal(ctl.status().rowShown, true, 'the source row shows when lyrics appear');
  assert.equal(timers[timers.length - 1].ms, api.FLASH_MS);
  timers[timers.length - 1].fn();
  assert.equal(ctl.status().rowShown, false, 'and goes after a moment');
  box.listeners.pointerover[0]({});
  assert.equal(ctl.status().rowShown, true, 'pointing at the words shows it');
  box.listeners.pointerout[0]({relatedTarget: null});
  assert.equal(ctl.status().rowShown, false, 'leaving hides it');
  // The words open the menu; four items.
  const current = box.children[2];
  current.listeners.click[0]({stopPropagation() {}});
  assert.equal(ctl.status().menuOpen, true, 'clicking the words opens the menu');
  assert.deepEqual([...ctl.menuItems()], ['重新查找', '换一份', '用本地文件…', '这首不显示歌词']);
  const menu = box.children[4];
  menu.children[1].listeners.click[0]({stopPropagation() {}}); await flush(); await flush();
  assert.deepEqual([...ctl.menuItems()], ['Live · 3:20 · 30 行', '返回'], '换一份 lists the candidates');
  menu.children[0].listeners.click[0]({stopPropagation() {}}); await flush(); await flush();
  assert.deepEqual(menuCalls.map(c => c[1]), ['candidates', 'choose']); assert.equal(menuCalls[1][2], 5);
  assert.equal(ctl.status().menuOpen, false, 'a choice closes the menu and asks again');
  // No lyrics found: the faint row, on the same terms; and its menu.
  status = {...status, trackId: 'b'}; ctl.render(); await flush(); ctl.render();
  assert.equal(ctl.status().from, '没有找到歌词'); assert.equal(ctl.status().shown, true); assert.equal(ctl.status().rowShown, true);
  ctl.openMenu();
  assert.deepEqual([...ctl.menuItems()].slice(0, 3), ['重新查找', '换一份', '用本地文件…']);
  // A song with no singing: no row at all.
  status = {active: true, status: 'ready', trackId: 'c', health: {vocals: {state: 'current'}, contour: {ok: false}}}; ctl.render(); await flush(); ctl.render();
  assert.equal(ctl.status().shown, false, 'no singing, no "没有找到歌词"');
  // Nothing per frame for the row: no timer or class work in render().
  const renderBody = read('score-lyrics.js').split('function render() {')[1].split('function loop()')[0];
  assert.doesNotMatch(renderBody, /later\(|flash\(|classList\.(add|remove)\('is-(flash|hover|menu)/, 'the row\'s showing and hiding is set on events, not per frame');
  assert.match(read('style.css'), /\.score-lyrics__head \{[^}]*opacity: 0; transition: opacity/, 'the fade is CSS');
  done.push('页面：来源那行平时不显示，歌词出来时显示一会儿（CSS 过渡），指着歌词时显示，移开收起；点歌词本身就打开菜单，四项；换一份列候选、点一条就用它；没查到时同一位置留淡淡一行「没有找到歌词」，同样只闪一下和指着时显示；没人声的歌不显示；每帧不做这些事');
}

(() => {
  const main = read('desktop/main.cjs'), preload = read('desktop/preload.cjs');
  const {MESSAGE_CATALOGS} = require(path.join(root, 'i18n', 'catalogs.js'));
  assert.match(preload, /lyricsMenu: \(trackId, action, extra = \{\}\) => ipcRenderer\.invoke\('fusion:lyrics-menu'/);
  assert.match(main, /ipcMain\.handle\('fusion:lyrics-menu'/);
  assert.match(main, /extensions:\['lrc'\]/, 'the file dialog offers .lrc only');
  for (const key of ['score.lyricsRefresh', 'score.lyricsOther', 'score.lyricsFileMenu', 'score.lyricsHide', 'score.lyricsShow', 'score.lyricsNone', 'score.lyricsHidden'])
    assert.ok(MESSAGE_CATALOGS['zh-CN'][key] && MESSAGE_CATALOGS['en-US'][key], key);
  done.push('接线：页面只交歌曲 id 和动作；文件对话框只给 .lrc；中英文案齐');
})();

process.on('exit', () => { if (done.length !== 3 && !process.exitCode) { console.error(`only ${done.length} of 3 groups ran`); process.exitCode = 1; } });
mainSide().then(pageSide).then(() => {
  for (const line of done) console.log('ok  ' + line);
  console.log(`lyrics-menu: ${done.length} groups passed`);
}).catch(error => { console.error(error); process.exitCode = 1; });
