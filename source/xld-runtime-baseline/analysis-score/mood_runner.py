"""Frozen three-component listening intensity. The service owns the lock and publishes the staged result."""
import argparse
import hashlib
import json
import math
from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import fft, signal

HERE = Path(__file__).resolve().parent
SCALE_BYTES = (HERE / "mood-scale-1.json").read_bytes()
SCALE = json.loads(SCALE_BYTES)
K_SOS = np.array([[1.53512485958697, -2.69169618940638, 1.19839281085285, 1, -1.69065929318241, .73248077421585],
                  [1, -2, 1, 1, -1.99004745483398, .99007225036621]])
RATE, HOP, BLOCK = 24000, 480, 24
WINDOWS = {n: signal.windows.hann(n, sym=False) for n in (1024, 2048)}
FREQ = fft.rfftfreq(1024, 1/RATE)
BAND = (FREQ >= 2000) & (FREQ < 8000)


def resample(x, source, target):
    if source == target:
        return x
    divisor = math.gcd(source, target)
    return signal.resample_poly(x, target//divisor, source//divisor, axis=0)


def k_cells(x, rate, pad):
    y = signal.sosfilt(K_SOS, resample(x, rate, 48000), axis=0)
    power = np.einsum("ij,ij->i", y, y)
    edges = np.arange(0, len(y), 960)
    sizes = np.diff(np.r_[edges, len(y)])
    # Round 3 used frame starts for the mix and actual cell midpoints for the stem sum.
    return np.add.reduceat(power, edges)/(960 if pad else sizes), (edges+.5*sizes)/48000


def spectral_power(y, n):
    power = None
    for channel in y.T:
        padded = np.pad(channel, n//2)
        frames = np.lib.stride_tricks.sliding_window_view(padded, n)[::HOP]
        spectrum = fft.rfft(frames * WINDOWS[n], axis=-1).astype(np.complex64)
        energy = np.abs(spectrum)**2
        if power is None:
            power = energy
        else:
            power += energy
    return power / y.shape[1]


def mixed_block(x, rate):
    y = resample(x, rate, RATE)
    power = spectral_power(y, 1024)
    band = np.sum(power[:, BAND], axis=1, dtype=np.float64) * (2/(1024**2*.375))
    power = spectral_power(y, 2048)
    # One-sided RMS of the Hann-windowed waveform, calibrated for its energy.
    rms2 = (2*power.sum(axis=1)-power[:,0]-power[:,-1]) / (2048**2*.375)
    active = rms2 > 10**(-7.2)
    bounded = np.maximum(1e-12, power)
    flat = np.where(active, np.exp(np.mean(np.log(bounded), axis=1))/np.mean(bounded,axis=1), np.nan)
    cells, _ = k_cells(x, rate, True)
    below_gate = np.isfinite(rms2) & ~active
    return band, flat, below_gate, np.pad(cells, (0, max(0, len(band)-len(cells))))[:len(band)]


def read_block(stream, base, stop):
    start = base * stream.samplerate
    if start >= stream.frames:
        return None
    stream.seek(start)
    return stream.read(min(stream.frames-start,(stop-base)*stream.samplerate),dtype="float32",always_2d=True)


def pool(values, times, grid, width):
    left = times.searchsorted(grid-width/2)
    right = times.searchsorted(grid+width/2)
    valid = np.isfinite(values)
    count = np.r_[0, np.cumsum(valid)]
    total = np.r_[0., np.cumsum(np.where(valid,values,0.),dtype=np.float64)]
    n = count[right]-count[left]
    return np.divide(total[right]-total[left], n, out=np.full(len(grid),np.nan),where=n>0)


def loudness(values):
    return np.maximum(-100., -.691+10*np.log10(np.maximum(values,1e-12)))


def measure(mix_path, stems, progress):
    frames, bands, flats, gates, powers, acc_times, acc_power = [], [], [], [], [], [], []
    with ExitStack() as stack:
        mix = stack.enter_context(sf.SoundFile(mix_path))
        if mix.frames <= 0 or mix.channels not in (1,2):
            raise ValueError("unsupported-mix-clock-or-channels")
        declared_duration = mix.frames / mix.samplerate
        duration = 0.
        streams = [(stack.enter_context(sf.SoundFile(file)), gain) for file,gain in stems]
        if len({(s.samplerate,s.channels,s.frames) for s,g in streams})>1 or any(s.channels not in (1,2) or s.frames<=0 for s,g in streams):
            raise ValueError("incompatible-stem-clocks-or-channels")
        pool_io = stack.enter_context(ThreadPoolExecutor(max_workers=len(streams))) if streams else None
        for start in range(0, math.ceil(declared_duration), BLOCK):
            base, stop = max(0,start-1), start+BLOCK+1
            samples = read_block(mix,base,stop)
            # VBR headers can count non-audio frames. Only decoded samples establish the last timestamp.
            decoded_end = (base*mix.samplerate+len(samples))/mix.samplerate if samples is not None else base
            if decoded_end <= start:
                break
            duration = decoded_end
            jobs = [pool_io.submit(read_block,s,base,stop) for s,g in streams]
            band, flat, gate, cells = mixed_block(samples,mix.samplerate)
            t = base+np.arange(len(band))/50
            keep = (t>=start)&(t<min(start+BLOCK,duration))
            frames.append(t[keep]); bands.append(band[keep]); flats.append(flat[keep]); gates.append(gate[keep]); powers.append(cells[keep])
            accompaniment = None
            for job, (_,gain) in zip(jobs,streams):
                samples = job.result()
                if samples is None:
                    continue
                samples *= gain
                if accompaniment is None:
                    accompaniment = samples.astype(np.float64)
                else:
                    accompaniment += samples
            if accompaniment is not None:
                values, t = k_cells(accompaniment,streams[0][0].samplerate,False)
                t += base
                keep = (t>=start)&(t<start+BLOCK)
                acc_times.append(t[keep]); acc_power.append(values[keep])
            progress(min(duration,start+BLOCK)/declared_duration,declared_duration)
            if decoded_end <= start+BLOCK:
                break
    if duration <= 0:
        raise ValueError("empty-decoded-audio")
    grid = np.minimum(np.arange(math.ceil(duration*2)+1)*.5,duration)
    t = np.concatenate(frames)
    mix_lufs = np.round(loudness(pool(np.concatenate(powers),t,grid,3)),7)
    band = np.round(10*np.log10(np.maximum(pool(np.concatenate(bands),t,grid,.5),1e-10)),7)
    # The training measurements were rounded to seven decimals before the logarithm.
    flat = np.log10(np.maximum(np.round(pool(np.concatenate(flats),t,grid,.5),7),1e-7))
    if acc_times:
        acc = np.round(loudness(pool(np.concatenate(acc_power),np.concatenate(acc_times),grid,3)),7)
        trunk = (mix_lufs+acc)/2
    else:
        trunk = mix_lufs
    below_gate = pool(np.concatenate(gates),t,grid,.5) == 1
    return grid, trunk, band, flat, below_gate


def smooth(values, grid, seconds):
    duration = grid[-1]
    edges = np.r_[0., (grid[1:]+grid[:-1])/2, duration]
    weights = np.diff(edges)*np.isfinite(values)
    sums = np.r_[0.,np.cumsum(np.nan_to_num(values)*weights)]
    coverage = np.r_[0.,np.cumsum(weights)]
    lo,hi = np.maximum(grid-seconds/2,0.),np.minimum(grid+seconds/2,duration)
    def integral(c):
        return np.interp(hi,edges,c)-np.interp(lo,edges,c)
    support = integral(coverage)
    return np.divide(integral(sums),support,out=np.full(len(grid),np.nan),
                     where=np.isfinite(values)&(support>0)&(support+1e-9>=(hi-lo)/2))


def shape(values):
    finite = values[np.isfinite(values)]
    if not len(finite):
        return values.copy()
    low,high = np.quantile(finite,[.05,.99])
    if high-low < 1e-9:
        return np.where(np.isfinite(values),.5*float(high!=0),np.nan)
    x = np.maximum(0.,(values-low)/(high-low))
    return np.where(x<=.88,x,1-.12*np.exp(-np.maximum(0,x-.88)/.12))


def latent(loud, band, flat, below_gate):
    model = SCALE["model"]
    def contribution(i, value):
        return model["weights"][i]*(value-model["mean"][i])/model["sd"][i]
    # The fitted quiet-frame branch has a fixed contribution. Only a measured level below -72 dBFS
    # selects it. A missing or unreadable measurement remains missing in both the components and score.
    texture = np.where(below_gate,contribution(2,model["fill"][2]),contribution(2,flat))
    return contribution(0,loud)+contribution(1,band)+texture


def percentile(x):
    knots = np.asarray(SCALE["knots"])
    return np.interp(x,knots[:,0],knots[:,1],left=0.,right=1.)


def series(x):
    return [float(v) if np.isfinite(v) else None for v in np.round(x,7)]


def main():
    parser = argparse.ArgumentParser()
    for flag in ("engine","input","output","mood-source"):
        parser.add_argument("--"+flag,required=True)
    args = parser.parse_args()
    source = json.loads(args.mood_source)
    dest = Path(args.output)
    stems = [(dest.parent/item["file"],item["gain"]) for item in source["stems"] if item["name"]!="vocals"]
    def report(fraction,duration):
        print(json.dumps({"phase":"measure","progress":.04+.91*fraction,"durationSeconds":duration}),flush=True)
    grid,loud,band,flat,below_gate = measure(args.input,stems,report)
    score = latent(loud,band,flat,below_gate)
    local = shape(score)
    record = dict(schemaVersion=1,kind="mood-curve",formulaVersion=SCALE["formulaVersion"],scaleVersion=SCALE["scaleVersion"],
                  engineVersion=1,identity={"version":1,"weights":{"scale":hashlib.sha256(SCALE_BYTES).hexdigest()}},source=source,step=.5,duration=float(grid[-1]),
                  loudnessMode="half" if stems else "mix",components={"lufs":series(loud),"band28Dbfs":series(band),"logFlatness":series(flat)})
    record["belowFlatnessGate"] = np.flatnonzero(below_gate).tolist()
    for key,window in [("fast",2),("slow",8)]:
        record[key] = series(percentile(smooth(score,grid,window)))
        record.setdefault("shape",{})[key] = series(smooth(local,grid,window))
    dest.write_text(json.dumps(record,ensure_ascii=False,allow_nan=False,separators=(",",":"))+"\n",encoding="utf-8")


if __name__ == "__main__":
    main()
