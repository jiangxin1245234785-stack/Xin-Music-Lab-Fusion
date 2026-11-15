"""Exercise the real save path without GPU inference or downloadable models."""
import importlib.util, json, pathlib, sys, tempfile, types, uuid
import numpy as np
import soundfile as sf
folder = pathlib.Path(__file__).resolve().parents[1] / 'analysis-refine'
sys.path.insert(0, str(folder.parent / 'analysis-midi'))
import stem_audio  # since 2026-11-15 results are marked 24-bit FLAC at half level, read back within 2^-23
spec = importlib.util.spec_from_file_location('refine_runner', folder / 'runner.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
sys.modules['roformer'] = types.SimpleNamespace(extract=lambda a, sr, *args: (a * np.float32(.25), a * np.float32(.75), {'fixture': True}))
with tempfile.TemporaryDirectory(prefix='xld-compact-') as scratch:
    root = pathlib.Path(scratch)
    audio = np.linspace(-1.5, 1.5, 16000, dtype=np.float32).reshape(-1, 1)
    audio[0] = -0.0
    sf.write(root / '源 other.wav', audio, 8000, subtype='FLOAT')
    for source, scope in [('other', 'full'), ('other', 'preview'), ('mix', 'full')]:
        run_id = str(uuid.uuid4())
        result = runner.run(root / '源 other.wav', root / (run_id + '.json'), 'mega-53', .25, 1, run_id, 'fixture', str(uuid.uuid4()), 'a' * 64, notify=lambda *a: None, scope=scope, source_stem=source)
        expected = audio if scope == 'full' else audio[2000:10000]
        assert result['schemaVersion'] == 3
        assert len(list((root / run_id).glob('*.flac'))) == (3 if source == 'mix' else 2) and not list((root / run_id).glob('*.wav'))
        assert result['playback']['mode'] == 'dynamic' and result['playback']['gain'] <= 1
        for name, scale in [('target', .25), ('residual', .75)]:
            assert result['files'][name].endswith('.flac') and stem_audio.check_written(root / result['files'][name], len(expected), 1, 8000)
            samples, sr = stem_audio.read(root / result['files'][name], dtype='float32', always_2d=True)
            assert sr == 8000 and float(np.abs(samples - expected * np.float32(scale)).max()) <= stem_audio.LIMIT
        if source == 'mix':
            assert float(np.abs(stem_audio.read(root / result['files']['original'], dtype='float32', always_2d=True)[0] - expected).max()) <= stem_audio.LIMIT
        else:
            assert result['originalSource']['startFrame'] == (0 if scope == 'full' else 2000)
print('Compact runner PASS: full/preview/mix; marked 24-bit FLAC within 2^-23 of the float samples (peaks to 1.5); no audition copies')
