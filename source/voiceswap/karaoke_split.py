"""Split a vocal stem into lead and backing with the karaoke BS-RoFormer. Runs on envs/roformer.

    <envs/roformer>/python.exe -X utf8 karaoke_split.py <vocals.wav> <out dir>

Writes `lead.wav` and `backing.wav` at the stem's rate and channel count. The backing is the
stem minus the lead, so the two always sum back to the stem exactly; it holds the harmony,
the doubled takes and whatever lead the model let through (on 七里香 the lead-only frames
sat a median 15.9 dB under the stem).

The model is `becruily/bs-roformer-karaoke` @0d66103c in `runtime/addons/karaoke-v1/becruily/`
(model.ckpt + config.yaml). On 七里香 it put the lead on D#4 and the harmony on D#3 at
「水」, which Mega 53 could not split at all. The demixer is XLD's own
`analysis-refine/roformer.demix`, imported read-only; the `bs_roformer` package installed
in envs/roformer builds this architecture, so nothing else is installed.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
MODEL = REPO / 'runtime' / 'addons' / 'karaoke-v1' / 'becruily'
sys.path.insert(0, str(REPO / 'source' / 'xld-runtime-baseline' / 'analysis-refine'))


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if len(argv) != 2:
        raise SystemExit(__doc__)
    import soundfile as sf
    import torch
    import yaml
    from bs_roformer.inference import SafeLoaderWithTuple
    from bs_roformer.utils import get_model_from_config, load_checkpoint_state
    from ml_collections import ConfigDict

    import roformer

    stem, out = Path(argv[0]), Path(argv[1])
    out.mkdir(parents=True, exist_ok=True)
    audio, rate = sf.read(str(stem), dtype='float32', always_2d=True)
    config = ConfigDict(yaml.load((MODEL / 'config.yaml').read_text(encoding='utf-8'), Loader=SafeLoaderWithTuple))
    model = get_model_from_config('bs_roformer', config)
    model.load_state_dict(load_checkpoint_state(MODEL / 'model.ckpt', map_location='cpu'), strict=True)
    model.eval()
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    lead, run = roformer.demix(model, audio, rate, device, 20, 2, lambda *a: None)    # same shape and rate as audio
    sf.write(str(out / 'lead.wav'), lead, rate, subtype='FLOAT')
    sf.write(str(out / 'backing.wav'), audio - lead, rate, subtype='FLOAT')
    print(f'  分离：{run["device"]}，{len(audio) / rate:.1f} 秒，{audio.shape[1]} 声道 → {out}', flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
