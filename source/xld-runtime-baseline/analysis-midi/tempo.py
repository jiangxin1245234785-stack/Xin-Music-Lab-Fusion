"""Optional MuScriptor v0.4 beat analysis and separate score-MIDI export.

The editable MIDI stays in seconds. This file never quantizes or merges groups.
"""
import dataclasses
import hashlib
import math
from pathlib import Path
import sys
import time


#: How close to a doubling the ratio has to be before it is called an octave error, in
#: log2 units. 0.08 is about 5.7%, wide enough for the drift between two estimators on a
#: live take and far narrower than the 2x it is looking for.
OCTAVE_TOLERANCE=0.08
#: Outside this, the two estimators are simply disagreeing about something else.
AGREE_TOLERANCE=0.08


def octave_check(samples,rate,detected_bpm,tolerance=OCTAVE_TOLERANCE):
    """Report when two independent tempo estimators differ by a factor of two.

    It reports the disagreement and names both candidates. It deliberately does NOT say
    which is right, because that is a musical judgement this code cannot make and
    getting it backwards has already happened: R4 (2026-09-18) recorded 七里香 as an
    octave error because Beat This said 71.4 and librosa said 143.6, and on 2026-10-26
    the owner listened to a click track of both and confirmed **71 is the right felt
    tempo** — librosa was the one counting double-time. A check that had "corrected"
    that track would have broken a correct result.

    So a 2x split means the two estimators read the same music at different metrical
    levels, and a person has to pick. Half-time and double-time are both real readings
    of real music; only the listener knows which one the song is in.

    Returns a dict; never raises. A missing librosa degrades to status 'unavailable'
    rather than failing a transcription over a cross-check.
    """
    import math
    import numpy as np
    if not detected_bpm or detected_bpm <= 0:
        return dict(status='unavailable',reason='没有可比对的检测速度')
    try:
        import librosa
    except Exception as error:  # noqa: BLE001 — the check is advisory, the transcription is not
        return dict(status='unavailable',reason=f'这个解释器里没有 librosa：{type(error).__name__}')
    try:
        mono=samples.mean(axis=1) if samples.ndim>1 else samples
        analysis_rate=22050
        if rate!=analysis_rate:
            mono=librosa.resample(np.ascontiguousarray(mono),orig_sr=rate,target_sr=analysis_rate)
        reference,_=librosa.beat.beat_track(y=mono,sr=analysis_rate)
        reference=float(np.atleast_1d(reference)[0])
    except Exception as error:  # noqa: BLE001
        return dict(status='unavailable',reason=f'{type(error).__name__}: {error}')
    if reference<=0:
        return dict(status='unavailable',reason='独立估计没有给出速度')
    ratio=float(detected_bpm)/reference
    octaves=math.log2(ratio)
    if abs(octaves-1)<=tolerance:
        verdict,split='double-of-reference',True
    elif abs(octaves+1)<=tolerance:
        verdict,split='half-of-reference',True
    elif abs(octaves)<=AGREE_TOLERANCE:
        verdict,split='agree',False
    else:
        verdict,split='differs',False
    return dict(status='checked',reference=round(reference,2),
                referenceSource='librosa.beat.beat_track@22050',
                ratio=round(ratio,4),octaves=round(octaves,4),verdict=verdict,
                # Both readings of the same music, neither preferred. No suggested
                # correction: see the docstring — the "wrong" one has already turned out
                # to be the right one once.
                metricalSplit=split,
                candidates=[round(float(detected_bpm),2),round(reference,2)] if split else None,
                needsEar=split,tolerance=tolerance)


def analyze(audio_path,profile,duration,notify=lambda *a:None):
    import muscriptor_backend as backend
    root=backend.runtime_root();settings=profile['options']['tempoAnalysis']
    deps=root/settings['depsDirectory'];checkpoint=root/settings['checkpoint']
    if not deps.is_dir() or not checkpoint.is_file():
        raise ValueError('v0.4节拍试验环境未就绪')
    sys.path.insert(0,str(deps));backend.select_code(profile)
    import torch
    import numpy as np
    import soundfile as sf
    from muscriptor.utils.beats import detect_grid
    path=Path(audio_path).resolve();before=path.stat();info=sf.info(str(path))
    if abs(info.frames/info.samplerate-duration)>.002:
        raise ValueError('原曲与分轨时长不一致，无法进行节拍对照')
    digest=hashlib.sha256(checkpoint.read_bytes()).hexdigest()
    if digest!=settings['sha256']:raise ValueError('节拍权重校验失败')
    samples,sr=sf.read(str(path),dtype='float32',always_2d=True)
    if not np.isfinite(samples).all():raise ValueError('原曲包含无效采样')
    torch.set_num_threads(min(torch.get_num_threads(),4))
    notify('v0.4 · 正在分析原曲拍点',.04,'beats');started=time.monotonic()
    grid=detect_grid(torch.from_numpy(samples.T.copy()),sr,checkpoint=str(checkpoint),device='cpu')
    after=path.stat()
    if (before.st_size,before.st_mtime_ns)!=(after.st_size,after.st_mtime_ns):
        raise ValueError('原曲在节拍分析期间发生变化')
    notify('与独立估计交叉核对速度',.06,'beats')
    octave=octave_check(samples,sr,float(grid.bpm),
                        float(settings.get('octaveTolerance',OCTAVE_TOLERANCE)))
    return dict(schemaVersion=1,status='experimental-unreviewed',bpm=float(grid.bpm),
                beatsPerBar=grid.beats_per_bar,firstDownbeat=float(grid.first_downbeat),steady=bool(grid.steady),
                beats=[float(t) for t in grid.beats if 0<=t<=duration],
                octaveCheck=octave,tempoNeedsEar=bool(octave.get('needsEar')),
                analysisSeconds=round(time.monotonic()-started,3),device='cpu',
                source=dict(path=str(path),size=before.st_size,mtimeMs=before.st_mtime_ns/1e6),
                checkpointSha256=digest,quantized=False)


def write_performance(source_midi,target_midi,timing):
    """Use upstream Timeline; preserve channels, velocities and instrument tracks.

    The score may need a pickup bar. Its explicit playback offset is reported;
    the separate canonical/editable MIDI and its time origin are untouched.
    """
    import mido
    import numpy as np
    import pretty_midi
    from muscriptor.utils.beats import BeatGrid,BAR_OFFSET_MARKER
    from muscriptor.utils.midi import ExportOptions,resolve_grid,timeline_for
    grid=BeatGrid(bpm=timing['bpm'],beats_per_bar=timing['beatsPerBar'],
                  first_downbeat=timing['firstDownbeat'],beats=np.asarray(timing['beats']),
                  onset_delay=0.0,steady=timing['steady'])
    grid=resolve_grid(grid,ExportOptions(quantize=False,fill_gaps=0,trim_leading_bars=False),[])
    clock=timeline_for(grid,earliest=0.0);offset=-float(clock.seconds_at(0.0))
    source=mido.MidiFile(source_midi)
    tempi=[m.tempo for track in source.tracks for m in track if m.type=='set_tempo']
    if tempi!=[500000]:raise ValueError('变速谱面导出需要XLD固定时间基准的原始结果')
    resolution=9600
    result=mido.MidiFile(type=1,ticks_per_beat=resolution)
    events=[(tick,0,mido.MetaMessage('set_tempo',tempo=tempo)) for tick,tempo in clock.tempo_changes(resolution)]
    if grid.beats_per_bar is not None:
        events.append((0,1,mido.MetaMessage('time_signature',numerator=grid.beats_per_bar,denominator=4)))
    events.append((0,2,mido.MetaMessage('marker',text=BAR_OFFSET_MARKER+str(offset))))
    events.append((0,3,mido.MetaMessage('track_name',name='MuScriptor v0.4 performance tempo')))
    meta=mido.MidiTrack();previous=0
    for tick,_,message in sorted(events,key=lambda e:(e[0],e[1])):
        meta.append(message.copy(time=tick-previous));previous=tick
    meta.append(mido.MetaMessage('end_of_track',time=0));result.tracks.append(meta)
    for track in source.tracks[1:]:
        output=mido.MidiTrack();old_tick=0;new_tick=0
        for message in track:
            old_tick+=message.time
            if message.type in ('set_tempo','time_signature'):continue
            # Track identity/program setup belongs before the pickup silence.
            if old_tick==0 and message.type in ('track_name','program_change','key_signature','instrument_name'):
                tick=0
            else:
                seconds=mido.tick2second(old_tick,source.ticks_per_beat,500000)
                tick=max(0,round(float(clock.beats_at(seconds))*resolution))
            if tick<new_tick:raise ValueError('变速谱面事件次序异常')
            output.append(message.copy(time=tick-new_tick));new_tick=tick
        result.tracks.append(output)
    result.save(str(target_midi))
    original=pretty_midi.PrettyMIDI(str(source_midi));reread=pretty_midi.PrettyMIDI(str(target_midi))
    if len(original.instruments)!=len(reread.instruments):raise ValueError('变速谱面丢失了乐器组')
    errors=[]
    for a,b in zip(original.instruments,reread.instruments):
        if (a.name,a.program,a.is_drum,len(a.notes))!=(b.name,b.program,b.is_drum,len(b.notes)):
            raise ValueError('变速谱面改变了乐器或音符数量')
        aa=sorted(a.notes,key=lambda n:(n.start,n.pitch,n.end,n.velocity))
        bb=sorted(b.notes,key=lambda n:(n.start,n.pitch,n.end,n.velocity))
        for x,y in zip(aa,bb):
            if (x.pitch,x.velocity)!=(y.pitch,y.velocity):raise ValueError('变速谱面改变了音高或力度')
            errors.extend([abs(y.start-offset-x.start),abs(y.end-offset-x.end)])
    maximum=max(errors,default=0.0)
    if maximum>.001:raise ValueError('变速谱面播放时序校验失败')
    times,bpms=reread.get_tempo_changes()
    return dict(mode='performance-map' if len(times)>1 else 'constant-detected',tempoCount=len(times),
                playbackOffsetSeconds=offset,maxTimingErrorMs=round(maximum*1000,6),
                tempoChanges=[dict(time=float(t),bpm=float(bpm)) for t,bpm in zip(times,bpms)],
                notesPreserved=True,groupsPreserved=True,quantized=False)
