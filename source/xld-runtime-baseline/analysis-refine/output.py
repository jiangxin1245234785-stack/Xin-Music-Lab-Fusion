"""Compact FLOAT results; audition gain is applied by the bounded PCM player."""
def save_waves(folder, waves, sample_rate, keep_original=False):
    import numpy as np
    import soundfile as sf
    peaks = {}
    files = {}
    for name, data in waves.items():
        peaks[name] = 0.
        for offset in range(0, len(data), sample_rate * 10):
            block = data[offset:offset + sample_rate * 10]
            if not np.isfinite(block).all():
                raise ValueError('结果包含无效采样')
            peaks[name] = max(peaks[name], float(np.max(np.abs(block))))
        if name != 'original' or keep_original:
            sf.write(folder / (name + '.wav'), data, sample_rate, subtype='FLOAT')
            files[name] = folder.name + '/' + name + '.wav'
    gain = min(1., .95 / max(max(peaks.values()), .95))
    return files, dict(mode='dynamic', gain=gain, peaks=peaks)
