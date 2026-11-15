"""Assemble the listening page: one HTML file with the render core, the clock and both pilot models inlined.

    <envs/basic>/python.exe -X utf8 source/scoreview/tools/build_page.py

Reads `audition/page.html` (the host), `score-view.js`, `media-clock.js`, `audition/page.json`
(the gate the page is at, what earlier gates decided, what it says about each pilot) and each
pilot's `bundle.json` + `health.json` (+ `msaf.json`, the sections that have no names). Writes
`work/scoreview-20261110/page/index.html`; the audio next to it (`audio/<pilot>.mp3`) was
put there by `make_layers.py audio`. The page is published as it is, so what goes in is
checked on the way: the placeholders are each there exactly once, no inlined script can
close its own tag, the models carry no local path, and every file fits the Artifact limits.

`page/build.json` records the sha256 of every input and output, so a published version can
be matched to the sources it was built from.
"""
import datetime
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
from make_layers import load_config  # noqa: E402
from build_bundle import name_sections  # noqa: E402

PAGE_BYTES_CAP = 16_000_000
AUDIO_BYTES_CAP = 15_000_000


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


# Lead / accompaniment in each pitched lane (adapter/roles.cjs through track-model.cjs rolesInto), the way XML's
# models get them; the pilots' bundle.json files themselves are left as they are.
ROLES_JS = ("const {rolesInto}=require(process.argv[1]);let s='';process.stdin.setEncoding('utf8');"
            "process.stdin.on('data',d=>{s+=d;}).on('end',()=>{const m=JSON.parse(s),h={};rolesInto(m,h);"
            "if(!h.roles||!h.roles.ok){console.error(JSON.stringify(h.roles));process.exit(2);}"
            "process.stdout.write(JSON.stringify({health:h.roles,lanes:m.lanes.map(l=>l.roles?{roles:l.roles,leadLines:l.leadLines}:null)}));});")


def with_roles(model):
    done = subprocess.run(['node', '-e', ROLES_JS, str(ROOT / 'adapter' / 'track-model.cjs')], input=json.dumps(model),
                          capture_output=True, text=True, encoding='utf-8')
    if done.returncode != 0:
        raise SystemExit('主 / 伴判断失败：' + (done.stderr or '').strip()[-400:])
    made = json.loads(done.stdout)
    for lane, extra in zip(model['lanes'], made['lanes']):
        if extra:
            lane.update(extra)
    return made['health']


def slot(template, marker, value):
    if template.count(marker) != 1:
        raise SystemExit(f'page.html 里的占位符 {marker} 不是恰好一个')
    return template.replace(marker, value)


def script(path):
    source = Path(path).read_text(encoding='utf-8')
    if re.search(r'</script', source, re.IGNORECASE):
        raise SystemExit(f'{path.name} 里出现了 </script，内联后会提前结束标签')
    return source


def main(argv=None):
    config = load_config()
    gate = json.loads((ROOT / 'audition' / 'page.json').read_text(encoding='utf-8'))
    page_root = config['pageRoot']
    inputs = {'page.html': ROOT / 'audition' / 'page.html', 'score-view.js': ROOT / 'score-view.js',
              'adapter/roles.cjs': ROOT / 'adapter' / 'roles.cjs', 'adapter/track-model.cjs': ROOT / 'adapter' / 'track-model.cjs',
              'media-clock.js': ROOT / 'media-clock.js', 'page.json': ROOT / 'audition' / 'page.json'}
    songs = []
    for name in config['pilots']:
        data = config['dataRoot'] / name
        bundle_path, health_path = data / 'bundle.json', data / 'health.json'
        if not bundle_path.is_file():
            raise SystemExit(f'{name} 还没有 bundle.json，先跑 build_bundle.py {name}')
        text = bundle_path.read_text(encoding='utf-8')
        if re.search(r'[A-Za-z]:\\\\|/Users/|\\\\Users\\\\', text):
            raise SystemExit(f'{name} 的模型里带着本机路径，不能发布')
        model = json.loads(text)
        audio = page_root / model['audio']['src']
        if not audio.is_file():
            raise SystemExit(f'找不到 {audio}，先跑 make_layers.py {name} audio')
        if audio.stat().st_size > AUDIO_BYTES_CAP:
            raise SystemExit(f'{audio.name} 有 {audio.stat().st_size / 1e6:.1f} MB，超过单个文件 15 MB 的上限')
        about = gate['songs'][name]
        for spot in about['spots']:
            if not 0 <= spot['at'] < model['track']['duration']:
                raise SystemExit(f'{name} 的建议时间点 {spot["at"]} 不在曲子里')
        lane_ids = {lane['id'] for lane in model['lanes']}
        unknown = [lane for lane in about.get('hidden', []) if lane not in lane_ids]
        if unknown:
            raise SystemExit(f'{name} 的 hidden 里有模型里不存在的轨：{unknown}')
        # The same song with sections that only have a cluster letter, for the page's
        # "what does a song without a naming engine look like" switch.
        plain = None
        if (data / 'msaf.json').is_file():
            plain = name_sections(json.loads((data / 'msaf.json').read_text(encoding='utf-8'))['segments'],
                                  'msaf', model['track']['duration'])
            inputs[f'{name}/msaf.json'] = data / 'msaf.json'
        # The "object · event" marks (adapter/cues.cjs, written by work/score-cues-20261113/make-tables.cjs).
        # The stems without notes as one texture lane (work/score-dynamics-20261114/SPEC-REST.md), when the
        # pilot has one: made by the adapter from a levels layer that carries 'other' (the bundles' does not).
        texture_path = data / 'texture.json'
        if texture_path.is_file():
            model['lanes'].append(json.loads(texture_path.read_text(encoding='utf-8'))['lane'])
            inputs[f'{name}/texture.json'] = texture_path
        roles = with_roles(model)
        print(f'  {name}：主 / 伴 {roles["lanes"]} 条轨，{roles["lead"]} / {roles["notes"]} 个音符判成主')
        marks_path = data / 'marks.json'
        if not marks_path.is_file():
            raise SystemExit(f'{name} 还没有 marks.json，先跑 node work/score-cues-20261113/make-tables.cjs')
        marks = json.loads(marks_path.read_text(encoding='utf-8'))
        if marks.get('hidden', []) != about.get('hidden', []):
            raise SystemExit(f'{name} 的 marks.json 不是按现在隐藏的轨生成的，重跑 make-tables.cjs')
        inputs[f'{name}/marks.json'] = marks_path
        songs.append({'id': name, 'blurb': about['blurb'], 'spots': about['spots'], 'hidden': about.get('hidden', []),
                      'model': model, 'plainSections': plain, 'marks': marks['zh'],
                      'health': json.loads(health_path.read_text(encoding='utf-8'))['table']})
        inputs[f'{name}/bundle.json'] = bundle_path
        inputs[f'{name}/audio'] = audio

    manifest = {'version': gate['version'], 'gate': gate['gate'], 'decided': gate.get('decided', []),
                'gateTitle': gate['gateTitle'], 'about': gate['about'], 'questions': gate['questions'],
                'earlierGates': gate.get('earlierGates', []),
                'generated': datetime.datetime.now().strftime('%Y-%m-%d %H:%M'), 'songs': songs}
    html = (ROOT / 'audition' / 'page.html').read_text(encoding='utf-8')
    html = slot(html, '/*@CORE@*/', script(ROOT / 'score-view.js'))
    html = slot(html, '/*@CLOCK@*/', script(ROOT / 'media-clock.js'))
    html = slot(html, '/*@MANIFEST@*/null', json.dumps(manifest, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/'))
    out = page_root / 'index.html'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding='utf-8')
    size = out.stat().st_size
    if size > PAGE_BYTES_CAP:
        raise SystemExit(f'页面有 {size / 1e6:.1f} MB，超过 16 MB 的上限')
    record = {'version': gate['version'], 'generated': manifest['generated'],
              'inputs': {name: sha256(path) for name, path in inputs.items()},
              'outputs': {'index.html': sha256(out)}, 'bytes': {'index.html': size,
                          **{song['model']['audio']['src']: (page_root / song['model']['audio']['src']).stat().st_size for song in songs}}}
    (page_root / 'build.json').write_text(json.dumps(record, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'  第 {gate["version"]} 版 → {out}（{size / 1024:.0f} KB）')
    for song in songs:
        src = song['model']['audio']['src']
        print(f'    {song["model"]["track"]["title"]}：{len(song["model"]["lanes"])} 条轨，{src} {record["bytes"][src] / 1e6:.2f} MB')
    return 0


if __name__ == '__main__':
    sys.exit(main())
