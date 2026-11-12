"""Seed-VC's own speaker encoder, kept as a measuring instrument.

Judge whether a voice changed with this, never with spectral statistics. Average spectral
shape over a clip is dominated by what is being sung, so two conversions of the same
phrase look alike to it whoever sings them: it once rated a female and a male reference
0.969 alike, where campplus put them at 0.392. campplus is the vector the model itself
conditions on, so it measures exactly what a conversion moved.

For scale on the 七里香 test clip: the identity conversion (the singer as his own
reference) scores 0.786 against the original — that is what "unchanged" looks like.
"""
import sys
from functools import lru_cache

import swap


@lru_cache(maxsize=1)
def _model():
    upstream = swap.verify()
    sys.path.insert(0, str(swap.ADDON / 'deps'))
    sys.path.insert(0, str(upstream))
    import torch
    from modules.campplus.DTDNN import CAMPPlus

    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    model = CAMPPlus(feat_dim=80, embedding_size=192)
    model.load_state_dict(torch.load(upstream / 'campplus_cn_common.bin', map_location='cpu'))
    return model.eval().to(device), device


def embed(path):
    """Unit-length 192-d speaker vector, computed the way inference.py conditions on it."""
    import librosa
    import numpy as np
    import torch
    import torchaudio

    model, device = _model()
    audio = librosa.load(str(path), sr=16000)[0]
    feat = torchaudio.compliance.kaldi.fbank(torch.tensor(audio).unsqueeze(0).float().to(device),
                                             num_mel_bins=80, dither=0, sample_frequency=16000)
    feat = feat - feat.mean(dim=0, keepdim=True)
    with torch.no_grad():
        vector = model(feat.unsqueeze(0)).squeeze(0).cpu().numpy()
    return vector / (np.linalg.norm(vector) + 1e-12)
