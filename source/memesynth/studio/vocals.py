"""The 人声 half of the studio (SPEC v2): the voice list, the vocal cache, the conversion queue.

The studio's own Python is envs/basic and must stay free of torch and librosa (SPEC §6), so
everything heavy — folding to mono, resampling to 48 kHz, the conversions themselves — runs
in `source/voiceswap/studio_bridge.py` under envs/highres, one subprocess at a time. This
module only keeps track of it.

A dropped vocal is cached under `work/memesynth-cache/voices/<first 16 of its sha256>/`, so
dropping the same stem again, or reopening the studio, finds every voice already converted.
Nothing here ever writes into XLD's analysis folders.
"""
from __future__ import annotations

import hashlib
import json
import os
import queue
import re
import runpy
import subprocess
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
VOICESWAP = REPO / 'source' / 'voiceswap'
BRIDGE = VOICESWAP / 'studio_bridge.py'
HIGHRES = Path(os.environ.get('XLD_HIGHRES_PYTHON') or REPO / 'runtime' / '0.5.0' / 'envs' / 'highres' / 'python.exe')
RVC_MODELS = Path(os.environ.get('XLD_APPLIO_ROOT') or REPO / 'runtime' / 'addons' / 'applio-v1') / 'models'
CACHE = REPO / 'work' / 'memesynth-cache' / 'voices'
MEMO = CACHE.parent / 'library.json'    # stem path → [size, mtime_ns, vocal id], so a library song is not re-read
ORIGINAL = 'original'
PIPELINE = 2                # studio_bridge.PIPELINE: lead and backing converted apart, harmony kept
VOCAL_ID = re.compile(r'^[0-9a-f]{16}$')
VOICE_NAME = re.compile(r'^[a-z0-9_-]+$')

STATE: dict = {}            # (vocal id, voice) -> {'state', 'progress', 'message', 'started'}
LOCK = threading.Lock()
WORK: queue.Queue = queue.Queue()


def catalog():
    """Every voice the studio can offer, from voiceswap's own two tables.

    Both are plain dicts with no imports, so reading them costs nothing and needs nothing
    from the conversion environment. A voice is offered only if what it needs is on disk.
    """
    if not BRIDGE.is_file() or not HIGHRES.is_file():
        return {'available': False, 'why': f'换声需要 {BRIDGE.name} 和 envs/highres，这台机器上缺一个', 'voices': []}
    tts = runpy.run_path(str(VOICESWAP / 'voices.py'))['VOICES']
    rvc = runpy.run_path(str(VOICESWAP / 'rvc_models.py'))['MODELS']
    split = lambda label: (label.partition(' · ')[0], label.partition(' · ')[2])
    voices = [{'id': ORIGINAL, 'name': '原唱', 'desc': '分离出来的人声，没换', 'group': '参照', 'tags': []}]
    kinds = {'真人歌手': '歌手', '虚拟歌手': '歌手', '动画角色': '角色', '公众人物': '抽象', '乐器': '乐器'}
    for name, recipe in tts.items():
        if (VOICESWAP / 'voices' / name / 'reference.wav').is_file():
            title, desc = split(recipe['label'])
            # A voice made from a recording of a person sits with the singers, not in the folded TTS list.
            group = '用录音学的声音' if recipe.get('clip') else '合成声音（Seed-VC）'
            voices.append({'id': name, 'name': title, 'desc': desc, 'group': group,
                           'tags': ['录音' if recipe.get('clip') else '合成']})
    for name, recipe in rvc.items():
        if (RVC_MODELS / name / 'model.json').is_file():
            title, desc = split(recipe['label'])
            # A trial model is downloaded and measured but not yet judged by ear: listed apart.
            group = '新下载的 RVC 模型（还没听评）' if recipe.get('trial') else '社区 RVC 模型'
            tags = [kinds.get(recipe.get('who'), '歌手')] + (['待听评'] if recipe.get('trial') else [])
            voices.append({'id': name, 'name': title, 'desc': desc, 'group': group, 'tags': tags})
    return {'available': True, 'voices': voices}


def folder_of(vocal_id):
    if not VOCAL_ID.match(vocal_id or ''):
        raise ValueError('人声编号不对')
    return CACHE / vocal_id


def bridge(*arguments, on_progress=None):
    """Run the bridge, passing its PROGRESS lines on; raise with its last words on failure."""
    process = subprocess.Popen([str(HIGHRES), '-X', 'utf8', str(BRIDGE), *arguments],
                               stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                               encoding='utf-8', errors='replace',
                               creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    tail = []
    for line in process.stdout:
        line = line.rstrip()
        if line.startswith('PROGRESS ') and on_progress:
            _, fraction, message = line.split(' ', 2)
            on_progress(float(fraction), message)
        elif line:
            tail = (tail + [line])[-4:]
    if process.wait():
        raise RuntimeError(' / '.join(tail) or f'退出码 {process.returncode}')


def set_state(key, **fields):
    with LOCK:
        STATE.setdefault(key, {}).update(fields)


def store(data: bytes):
    """Cache an uploaded vocal stem and prepare it. Returns its id and what it holds.

    A folder prepared before the bridge kept the harmony (its info.json has no
    `pipeline: 2`) holds whole-vocal conversions; those move to `pipeline1/`, out of the
    voice list, and the stem is prepared again."""
    vocal_id = hashlib.sha256(data).hexdigest()[:16]
    folder = folder_of(vocal_id)
    info = folder / 'info.json'
    if info.is_file() and json.loads(info.read_text(encoding='utf-8')).get('pipeline') != PIPELINE:
        (folder / 'pipeline1').mkdir(exist_ok=True)
        for old in [info, *folder.glob('*.48k.wav')]:
            old.replace(folder / 'pipeline1' / old.name)
    if not info.is_file():
        folder.mkdir(parents=True, exist_ok=True)
        (folder / 'source.wav').write_bytes(data)
        bridge('prepare', str(folder))
    return vocal_id, status(vocal_id)


def known(path):
    """The vocal id this stem file was stored under, if it has not changed since; else None."""
    try:
        size, stamp, vocal_id = json.loads(MEMO.read_text(encoding='utf-8'))[str(path)]
        stat = Path(path).stat()
    except (OSError, ValueError, KeyError):
        return None
    if (size, stamp) != (stat.st_size, stat.st_mtime_ns):
        return None
    info = CACHE / vocal_id / 'info.json'
    try:
        return vocal_id if json.loads(info.read_text(encoding='utf-8')).get('pipeline') == PIPELINE else None
    except (OSError, ValueError):
        return None


def ready_voices(vocal_id):
    """Voices already converted for this vocal (the original is not one)."""
    return sorted(p.name[:-len('.48k.wav')] for p in folder_of(vocal_id).glob('*.48k.wav')
                  if p.name != f'{ORIGINAL}.48k.wav')


def store_file(path):
    """`store` for a stem that is already on this disk (a library song): the page sends no bytes.

    A stem prepared before is recognised by path, size and time, without reading it again."""
    vocal_id = known(path)
    if vocal_id:
        return vocal_id, status(vocal_id)
    path = Path(path)
    stat = path.stat()
    vocal_id, state = store(path.read_bytes())
    with LOCK:
        try:
            memo = json.loads(MEMO.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            memo = {}
        memo[str(path)] = [stat.st_size, stat.st_mtime_ns, vocal_id]
        MEMO.parent.mkdir(parents=True, exist_ok=True)
        MEMO.write_text(json.dumps(memo, ensure_ascii=False, indent=1), encoding='utf-8')
    return vocal_id, state


def status(vocal_id):
    folder = folder_of(vocal_id)
    info = json.loads((folder / 'info.json').read_text(encoding='utf-8'))
    voices = {ORIGINAL: {'state': 'ready'}}
    for path in folder.glob('*.48k.wav'):
        name = path.name[:-len('.48k.wav')]
        voices[name] = {'state': 'ready'}
    with LOCK:
        for (owner, name), entry in STATE.items():
            if owner == vocal_id and voices.get(name, {}).get('state') != 'ready':
                voices[name] = dict(entry, elapsed=round(time.monotonic() - entry.get('started', time.monotonic())))
    return {'id': vocal_id, 'info': info, 'voices': voices}


def request(vocal_id, voice):
    """Queue a conversion unless it is done, queued or running already."""
    folder = folder_of(vocal_id)
    if voice != ORIGINAL and voice not in {v['id'] for v in catalog()['voices']}:
        raise ValueError(f'没有这个声音：{voice}')
    if voice == ORIGINAL or (folder / f'{voice}.48k.wav').is_file():
        return
    with LOCK:
        if STATE.get((vocal_id, voice), {}).get('state') in ('queued', 'running'):
            return
        STATE[(vocal_id, voice)] = {'state': 'queued', 'progress': 0.0, 'message': '排队中',
                                    'started': time.monotonic()}
    WORK.put((vocal_id, voice))


def cancel(vocal_id, voice):
    """Take a conversion out of the queue. One that is already running is left to finish."""
    with LOCK:
        if STATE.get((vocal_id, voice), {}).get('state') == 'queued':
            del STATE[(vocal_id, voice)]
            return True
    return False


def busy():
    """True while any conversion is queued or running (the launcher waits for this before it exits)."""
    with LOCK:
        return any(entry.get('state') in ('queued', 'running') for entry in STATE.values())


def worker():
    while True:
        vocal_id, voice = WORK.get()
        key = (vocal_id, voice)
        with LOCK:
            if STATE.get(key, {}).get('state') != 'queued':    # cancelled while it waited
                continue
        set_state(key, state='running', message='启动中', started=time.monotonic())
        try:
            bridge('convert', str(folder_of(vocal_id)), voice,
                   on_progress=lambda f, m: set_state(key, progress=f, message=m))
            set_state(key, state='ready', progress=1.0, message='就绪')
        except Exception as error:  # noqa: BLE001 — shown on that voice's button, the rest go on
            set_state(key, state='failed', message=str(error)[-300:])


threading.Thread(target=worker, daemon=True).start()


def vocal_audio(vocal_id, voice):
    """The 48 kHz mono file for one voice, for the page to play or the exporter to mix."""
    if not VOICE_NAME.match(voice or ''):
        raise ValueError('声音名不对')
    path = folder_of(vocal_id) / f'{voice}.48k.wav'
    if not path.is_file():
        raise FileNotFoundError(f'{voice} 还没转好')
    return path
