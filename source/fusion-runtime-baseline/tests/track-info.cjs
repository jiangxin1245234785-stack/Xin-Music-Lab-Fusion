'use strict';
// Track facts (2026-11-18): desktop/track-info.cjs with recorded MusicBrainz / NetEase answers - never the network.
// Order of sources, tags winning over the network, what is sent out, the cache, a quiet miss, the menu's four actions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const {createTrackInfo, parseInfoText, fromTags, MB, DEFAULTS, agentFor, CONTACT, NEUTRAL_AGENT} = require(path.join(root, 'desktop', 'track-info.cjs'));

// Recorded answers, cut down to the fields read (shapes as MusicBrainz's JSON web service gives them).
const SEARCH = {recordings: [
  {id: 'rec-live', title: 'Song', length: 240000, 'artist-credit': [{name: 'Artist'}],
    releases: [{id: 'rel-live', title: 'Live at Somewhere', status: 'Official', date: '2009-01-01'}]},
  {id: 'rec-1', title: 'Song', length: 181000, 'artist-credit': [{name: 'Artist'}], releases: [
    {id: 'rel-comp', title: 'Greatest Hits', status: 'Official', date: '2010-05-01', country: 'TW'},
    {id: 'rel-album', title: 'The Album', status: 'Official', date: '2004-08-03', country: 'TW'},
    {id: 'rel-boot', title: 'The Album', status: 'Bootleg', date: '2003-01-01'}]},
  {id: 'rec-other', title: 'Other Song', length: 181000, 'artist-credit': [{name: 'Artist'}], releases: [{id: 'rel-x', title: 'X', status: 'Official'}]}]};
const RECORDING = {id: 'rec-1', title: 'Song', length: 181000, 'artist-credit': [{name: 'Artist'}], genres: [{name: 'mandopop', count: 3}],
  relations: [
    {type: 'producer', artist: {name: 'Producer P'}},
    {type: 'arranger', artist: {name: 'Arranger A'}},
    {type: 'instrument', artist: {name: 'Player Q'}, attributes: ['guitar']},
    {type: 'performance', work: {relations: [{type: 'composer', artist: {name: 'Composer C'}}, {type: 'lyricist', artist: {name: 'Lyricist L'}}]}}]};
const RELEASE = {id: 'rel-album', title: 'The Album', date: '2004-08-03', country: 'TW', 'artist-credit': [{name: 'Artist'}],
  'label-info': [{label: {name: 'Label One'}}], media: [{position: 1, 'track-count': 10, tracks: [{number: '3', position: 3, recording: {id: 'rec-1'}}]}]};
const RELEASE_COMP = {...RELEASE, id: 'rel-comp', title: 'Greatest Hits', date: '2010-05-01', media: [{position: 1, 'track-count': 20, tracks: [{number: '7', position: 7, recording: {id: 'rec-1'}}]}]};

(async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'xml-track-info-'));
  const done = [];
  try {
    const asked = [];
    let mode = 'ok', clock = 1e12;
    const fetch = async (url, options) => {
      asked.push({url: String(url), headers: options?.headers || {}});
      if (mode === 'offline') throw Object.assign(new Error('offline'), {name: 'TypeError'});
      if (mode === 'busy') return {ok: false, status: 503};
      const u = new URL(url);
      const json = body => ({ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(body))});
      if (u.hostname === 'music.163.com') return json({songs: [{id: 555, album: {name: 'NetEase Album', publishTime: Date.UTC(2004, 7, 3)}}]});
      if (u.pathname === '/ws/2/recording') return json(mode === 'empty' ? {recordings: []} : SEARCH);
      if (u.pathname === '/ws/2/recording/rec-1') return json(RECORDING);
      if (u.pathname === '/ws/2/release/rel-album') return json(RELEASE);
      if (u.pathname === '/ws/2/release/rel-comp') return json(RELEASE_COMP);
      return {ok: false, status: 404};
    };
    let tags = {TITLE: 'Song', ARTIST: 'Artist', GENRE: 'Pop (from the tag)'};
    let neteaseId = null;
    const make = () => createTrackInfo({root: path.join(base, 'cache'), fetch, now: () => clock, readTags: async () => tags,
      neteaseIdFor: async () => neteaseId, wait: async () => {}});
    let info = make();
    const lib = path.join(base, 'Private Person', 'My Music');
    fs.mkdirSync(lib, {recursive: true});
    const track = {id: 't1', title: 'Song', artist: 'Artist', album: 'The Album', number: 3, duration: 180, filePath: path.join(lib, 'Song.flac')};

    // Tags + MusicBrainz: the tags win, the network fills the rest, in the fixed order, each item says where it came from.
    const first = await info.get(track);
    assert.ok(first.ok, JSON.stringify(first));
    assert.equal(first.source.kind, 'musicbrainz');
    assert.deepEqual(first.source.ids, {recording: 'rec-1', release: 'rel-album'}, 'the release named like the album, not the earlier compilation or the live take');
    const byKey = Object.fromEntries(first.items.map(i => [i.key, i]));
    assert.deepEqual(first.items.map(i => i.key), ['title', 'artist', 'album', 'date', 'track', 'label', 'country', 'genre', 'composer', 'lyricist', 'arranger', 'producer', 'performer', 'length']);
    assert.equal(byKey.genre.value, 'Pop (from the tag)'); assert.equal(byKey.genre.from, 'tags', 'a tag wins over the network');
    assert.equal(byKey.album.from, 'library', 'the library album name (no ALBUM tag) wins too');
    assert.equal(byKey.track.value, '3', 'the library track number wins');
    assert.deepEqual([byKey.date.value, byKey.label.value, byKey.country.value, byKey.composer.value, byKey.lyricist.value, byKey.arranger.value, byKey.producer.value, byKey.performer.value],
      ['2004-08-03', 'Label One', 'TW', 'Composer C', 'Lyricist L', 'Arranger A', 'Producer P', 'Player Q (guitar)']);
    assert.equal(byKey.date.from, 'musicbrainz');
    // What was sent: title and artist in the search, ids after; a neutral client name; nothing of the machine.
    assert.equal(asked.length, 3, 'one search, one recording, one release');
    const search = new URL(asked[0].url);
    assert.equal(search.origin + search.pathname, MB + '/recording');
    assert.deepEqual([...search.searchParams.keys()].sort(), ['fmt', 'limit', 'query']);
    assert.equal(search.searchParams.get('query'), 'recording:"Song" AND artist:"Artist"');
    for (const a of asked) {
      assert.equal(a.headers['User-Agent'], DEFAULTS.userAgent);
      assert.match(a.headers['User-Agent'], /^XinsMusicLabFusion\/[\w.+-]+ \( https:\/\/github\.com\/[\w.-]+\/Xin-Music-Lab-Fusion \)$/, 'name/version ( the project page ), MusicBrainz\'s form');
      // The client name is checked exactly above (it holds the project's page, which the user chose to send); the rest of
      // the request must hold nothing of the machine or the user.
      const all = a.url + JSON.stringify({...a.headers, 'User-Agent': ''});
      for (const secret of ['Private Person', 'My Music', 'Song.flac', base, os.userInfo().username]) assert.ok(!all.includes(secret), 'nothing of the machine is sent: ' + secret);
    }
    assert.equal(agentFor('0.5.0-dev.x.1'), 'XinsMusicLabFusion/0.5.0-dev.x.1 ( ' + CONTACT + ' )');
    assert.ok(!/\.git$|@|:\/\/[^/]*@/.test(CONTACT), 'the page address carries no credentials');
    // Cached: no second request.
    const again = await info.get(track);
    assert.equal(asked.length, 3); assert.ok(again.source.cached);
    done.push('标签和联网合并（标签、曲库名优先，联网只补缺）、按专辑名挑发行版本、发出去只有歌名和歌手、缓存');

    // A hand-written file beside the song: used alone, read every time, no network.
    const side = path.join(lib, 'Song.info.txt');
    fs.writeFileSync(side, '# 我自己写的\n作曲: 某人\nTitle: 手写的歌名\nrecorded at: Home\n');
    const local = await info.get({...track, id: 't-local'});
    assert.equal(local.source.kind, 'local');
    assert.deepEqual(local.items, [{key: 'title', value: '手写的歌名', from: 'local'}, {key: 'composer', value: '某人', from: 'local'}, {key: 'recorded at', value: 'Home', from: 'local'}]);
    assert.equal(asked.length, 3, 'no request for a song with its own file');
    fs.rmSync(side);
    done.push('歌旁边的 .info.txt：只用它、不联网、中英文项名都认');

    // Not the same song (the length is off): nothing found, quietly the tags; the miss is remembered.
    const off = {...track, id: 't-off', title: 'Song', album: '', duration: 300};
    const miss = await info.get(off);
    assert.ok(miss.ok && miss.source.kind === 'tags' && miss.source.online === 'none', JSON.stringify(miss));
    const n = asked.length;
    await info.get(off);
    assert.equal(asked.length, n, 'a miss is not asked again at once');
    clock += 31 * 86400000;
    await info.get(off);
    assert.equal(asked.length, n + 1, 'asked again after MISS_DAYS');
    done.push('长度对不上当没查到，安静退回标签；「查过、没有」记 30 天');

    // Offline and 503: the tags, nothing cached, the song left alone for a while; 503 stops every request.
    mode = 'offline';
    const cold = {...track, id: 't-cold', title: 'Cold', duration: 100};
    const down = await info.get(cold);
    assert.ok(down.ok && down.source.online === 'network');
    const m = asked.length;
    assert.equal((await info.get(cold)).source.online, 'waiting'); assert.equal(asked.length, m, 'not retried at once');
    mode = 'busy';
    const busy = await info.get({...track, id: 't-busy', title: 'Busy', duration: 100});
    assert.equal(busy.source.online, 'rate-limited');
    const k = asked.length;
    assert.equal((await info.get({...track, id: 't-busy2', title: 'Busy2', duration: 100})).source.online, 'rate-limited');
    assert.equal(asked.length, k, 'a 503 stops every request for a while');
    clock += 120000; mode = 'ok';
    done.push('断网 / 503：退回标签、不缓存失败、不立刻重试，503 时整体停一阵');

    // The menu: 换一份 lists the pairs of this song (no other title), the album first; choosing fetches it once.
    const list = await info.candidates(track);
    assert.ok(list.ok);
    assert.deepEqual(list.candidates.map(c => c.id), ['rec-1:rel-album', 'rec-1:rel-comp'], 'this song only, the bootleg, the live take and another title left out');
    assert.equal((await info.choose(track, 'rec-other:rel-x')).reason, 'not-offered');
    assert.ok((await info.choose(track, 'rec-1:rel-comp')).ok);
    const chosen = await info.get(track);
    assert.ok(chosen.source.chosen && chosen.source.ids.release === 'rel-comp');
    assert.equal(chosen.items.find(i => i.key === 'date').value, '2010-05-01');
    // 用本地文件…: a .txt with items; remembered by path, read each time.
    const mine = path.join(base, 'facts.txt');
    fs.writeFileSync(mine, 'producer: Someone\n');
    assert.equal((await info.chooseFile(track, path.join(base, 'facts.json'))).reason, 'not-txt');
    assert.ok((await info.chooseFile(track, mine)).ok);
    assert.deepEqual((await info.get(track)).items, [{key: 'producer', value: 'Someone', from: 'local'}]);
    // 这首不显示, and back.
    await info.hide(track, true);
    assert.equal((await info.get(track)).reason, 'hidden');
    await info.hide(track, false);
    assert.equal((await info.get(track)).source.kind, 'chosen-file');
    // 重新查找 drops the choice and asks again.
    const before = asked.length;
    const fresh = await info.refresh(track);
    assert.equal(fresh.source.kind, 'musicbrainz'); assert.ok(asked.length > before, 'asked again');
    done.push('菜单：换一份只列同一首、专辑名对上的在前；只能选列出来的；本地 .txt；这首不显示 / 显示；重新查找');

    // NetEase: a song whose lyrics are bound to a NetEase song gets album / date from it when MusicBrainz has none.
    mode = 'empty'; neteaseId = '555'; tags = {};
    info = make();
    const ne = await info.get({id: 't-ne', title: 'Song', artist: 'Artist', album: '', duration: 180, filePath: path.join(lib, 'Song.flac')});
    assert.equal(ne.source.kind, 'netease');
    assert.deepEqual(ne.items.filter(i => i.from === 'netease').map(i => [i.key, i.value]), [['album', 'NetEase Album'], ['date', '2004-08-03']]);
    const nn = asked.length;
    await info.get({id: 't-ne', title: 'Song', artist: 'Artist', album: '', duration: 180, filePath: path.join(lib, 'Song.flac')});
    assert.equal(asked.length, nn, 'the NetEase answer is cached too');
    const toNetEase = asked.filter(a => new URL(a.url).hostname === 'music.163.com');
    assert.ok(toNetEase.length && toNetEase.every(a => a.headers['User-Agent'] === NEUTRAL_AGENT), 'NetEase gets the neutral name, not the MusicBrainz one');
    done.push('网易云：歌词绑了网易云链接的歌，MusicBrainz 没有时补专辑和发行日期，也缓存');

    // Pieces.
    assert.deepEqual(fromTags({TRACKNUMBER: '3', TRACKTOTAL: '10', DISCNUMBER: '1', DISCTOTAL: '2', ORGANIZATION: 'L'}), {track: '3/10', disc: '1/2', label: 'L'});
    assert.deepEqual(parseInfoText('编曲：某人\n\n#x: y\nbad line\n'), [{key: 'arranger', value: '某人', from: 'local'}]);
    // The page side hands the facts over and has the menu page (score-lyrics.js), the bridge is in the preload.
    const page = fs.readFileSync(path.join(root, 'score-lyrics.js'), 'utf8'), preload = fs.readFileSync(path.join(root, 'desktop', 'preload.cjs'), 'utf8');
    assert.ok(page.includes('trackInfo: trackId ? infoOf(trackId) : null') && page.includes('trackInfo: infoOf(id)') && page.includes("menuPage = 'info'"));
    assert.ok(preload.includes("ipcRenderer.invoke('fusion:track-info'") && preload.includes("ipcRenderer.invoke('fusion:track-info-menu'"));
    console.log('track info: PASS (' + done.join('；') + ')');
  } finally { fs.rmSync(base, {recursive: true, force: true}); }
})().catch(error => { console.error(error); process.exit(1); });
