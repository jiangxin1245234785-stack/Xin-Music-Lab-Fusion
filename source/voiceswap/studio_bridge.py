"""The voice-swap side of memesynth's 音色工作台: everything it cannot do in its own Python.

    python -X utf8 source/voiceswap/studio_bridge.py prepare <dir>
    python -X utf8 source/voiceswap/studio_bridge.py convert <dir> <声音名>

The studio runs on envs/basic (numpy, soundfile, pretty_midi) and stays that way (its SPEC,
v2 §6), so it hands each dropped vocal stem to this script under envs/highres. `<dir>` is
the studio's cache folder for one vocal; it holds the upload as `source.wav`, and this
script adds:

- `vocals-mono.wav` — the conversion input, folded to mono at the stem's own rate;
- `original.48k.wav` — the same, at the studio's 48 kHz, for 「原唱」;
- `<声音名>.48k.wav` — each converted vocal, level-matched to the original, at 48 kHz;
- `info.json` — length, rate and the original's level while singing, which is the level
  every converted vocal is matched to, so the studio can place all of them with one gain.

Conversion keeps the backing vocals (`harmony.py`, as `remix.py --harmony`): `prepare`
splits the stem into lead and backing once, into `<dir>/harmony/`, and each `convert`
converts both parts and places the second voice. `info.json` records `pipeline: 2`; a
folder prepared before that holds whole-vocal conversions and the studio prepares it again.
Without the karaoke model or envs/roformer it falls back to converting the whole vocal.

Conversion is `swap.py` / `rvc.py` as a subprocess, exactly as `remix.py` runs them, and
an RVC voice follows the octaves a Seed-VC voice already settled on when there is one, so
switching voices in the studio never moves a note between octaves.

Progress goes to stdout as `PROGRESS <fraction> <message>` lines for the studio to show.
"""
import json
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import numpy as np
import soundfile as sf

import harmony
from remix import ACTIVE_BELOW_PEAK_DB, active_rms, fit, window_rms_db

STUDIO_RATE = 48000
PIPELINE = 2                # 2: lead and backing converted apart, harmony kept
# Every file is stored this far down and `activeRmsDb` is measured on what is stored, so the
# studio's gain formula lands where it did. A vocal with its harmony back on peaks higher:
# at full level 晓晓 clipped 26 samples (6 places) in 七里香's 30 s test clip, IU 3.
HEADROOM_DB = -6.0


def say(fraction, message):
    print(f'PROGRESS {fraction:.3f} {message}', flush=True)


def to_studio(audio, rate):
    import soxr
    audio = audio if rate == STUDIO_RATE else soxr.resample(audio, rate, STUDIO_RATE, 'VHQ')
    return np.clip(audio * 10 ** (HEADROOM_DB / 20), -1.0, 1.0).astype(np.float32)


def prepare(folder):
    say(0.1, '读人声分轨')
    vocal, rate = sf.read(str(folder / 'source.wav'), dtype='float32', always_2d=True)
    mono = vocal.mean(axis=1)
    sf.write(str(folder / 'vocals-mono.wav'), mono, rate, subtype='FLOAT')
    loudness, hop = window_rms_db(mono, rate)
    active = loudness > loudness.max() - ACTIVE_BELOW_PEAK_DB
    level = active_rms(mono, active, hop)
    say(0.3, '转成 48 kHz')
    sf.write(str(folder / 'original.48k.wav'), to_studio(mono, rate), STUDIO_RATE, subtype='PCM_16')
    kept = harmony.available()
    if kept:
        say(0.5, '分离主唱和和声（约一分钟）')
        harmony.split(folder / 'source.wav', folder / 'harmony')
    info = {'rate': rate, 'frames': len(mono), 'seconds': round(len(mono) / rate, 3),
            'activeRmsDb': round(20 * np.log10(level + 1e-12) + HEADROOM_DB, 2), 'pipeline': PIPELINE, 'harmony': kept,
            'prepared': time.strftime('%Y-%m-%d %H:%M:%S')}
    (folder / 'info.json').write_text(json.dumps(info, ensure_ascii=False, indent=2), encoding='utf-8')
    say(1.0, '就绪')


def convert(folder, name):
    import rvc_models
    import voices

    if name in voices.VOICES:
        script, backend, arguments = 'swap.py', 'seedvc', ['--voice', name]
    elif name in rvc_models.MODELS:
        script, backend, arguments = 'rvc.py', 'rvc', ['--model', name]
        decided = folder / 'vocals-mono.seedvc.f0-repairs.json'
        if decided.is_file():
            arguments += ['--follow-octaves', str(decided)]
    else:
        raise SystemExit(f'未知声音：{name}')
    info = json.loads((folder / 'info.json').read_text(encoding='utf-8'))
    source = folder / 'vocals-mono.wav'
    started = time.monotonic()
    if info.get('harmony'):
        say(0.05, '主唱、和声各转一遍（Seed-VC 约三分钟，RVC 约一分钟）')
        seedvc, rvc = ([name], []) if backend == 'seedvc' else ([], [name])
        converted, _ = harmony.render(folder / 'source.wav', folder / 'harmony', seedvc, rvc,
                                      progress=lambda fraction, message: say(0.05 + 0.8 * fraction, message))[name]
        rate = info['rate']
    else:
        say(0.05, '载入模型、转换整首（Seed-VC 约一分半，RVC 约二十秒）')
        result = subprocess.run([sys.executable, '-X', 'utf8', str(HERE / script), str(source), *arguments,
                                 '--out', str(folder)], capture_output=True, text=True, encoding='utf-8',
                                errors='replace')
        if result.returncode:
            tail = (result.stderr or result.stdout).strip().splitlines()[-3:]
            raise SystemExit('转换失败：' + ' / '.join(tail))
        record = folder / 'vocals-mono.f0-repairs.json'
        if record.is_file():                # each backend keeps its own octave decisions
            record.replace(folder / f'vocals-mono.{backend}.f0-repairs.json')
        converted, rate = sf.read(str(folder / f'vocals-mono__{name}.wav'), dtype='float32')
        if converted.ndim > 1:
            converted = converted.mean(axis=1)
    say(0.85, f'转完（{time.monotonic() - started:.0f} 秒），对齐响度')
    converted = fit(converted, info['frames'])
    original, _ = sf.read(str(source), dtype='float32')
    loudness, hop = window_rms_db(original, info['rate'])
    active = loudness > loudness.max() - ACTIVE_BELOW_PEAK_DB
    gain = active_rms(original, active, hop) / max(1e-9, active_rms(converted, active, hop))
    sf.write(str(folder / f'{name}.48k.wav'), to_studio(converted * gain, rate), STUDIO_RATE, subtype='PCM_16')
    say(1.0, f'就绪（响度 {20 * np.log10(gain):+.1f} dB）')


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if len(argv) >= 2 and argv[0] == 'prepare':
        prepare(Path(argv[1]))
    elif len(argv) >= 3 and argv[0] == 'convert':
        convert(Path(argv[1]), argv[2])
    else:
        raise SystemExit(__doc__)
    return 0


if __name__ == '__main__':
    sys.exit(main())
