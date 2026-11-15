"""MuScriptor adapter pinned to the user-accepted MEGURI decoding setup."""
from pathlib import Path
import os,sys,hashlib,io,time,importlib.util

def runtime_root():
    return Path(os.environ.get('XLD_MUSCRIPTOR_ROOT',''))

def code_root(profile):
    directory=Path(profile['options'].get('codeDirectory','upstream'))
    if directory.is_absolute() or '..' in directory.parts:
        raise ValueError('MuScriptor 代码目录必须位于模型环境内')
    return runtime_root()/directory

def select_code(profile):
    root=code_root(profile).resolve()
    loaded=sys.modules.get('muscriptor')
    if loaded and not Path(loaded.__file__).resolve().is_relative_to(root):
        raise ValueError('MuScriptor 版本已在此进程加载，请用独立转谱任务切换版本')
    sys.path.insert(0,str(root))

def ready(profile):
    root=runtime_root();weight=root/'models'/profile['checkpoint']['file']
    timing=profile['options'].get('tempoAnalysis')
    if timing and (not (root/timing['checkpoint']).is_file() or not (root/timing['depsDirectory']/'beat_this/inference.py').is_file()):return False
    return bool(os.environ.get('XLD_MUSCRIPTOR_ROOT')) and (code_root(profile)/'muscriptor/__init__.py').is_file() and weight.is_file() and weight.stat().st_size==profile['checkpoint']['size'] and all(importlib.util.find_spec(p) for p in ['torch','einops','safetensors','soundfile','pretty_midi','huggingface_hub'])

def finish_timing(midi,profile):
    """Apply the official gap filler per retained XLD instrument; never merge groups."""
    gap=float(profile['options'].get('gapFillMs',0))
    if not 0 <= gap <= 100:
        raise ValueError('MuScriptor 填空范围必须为0至100毫秒')
    changed=0;extension=0.0
    if gap:
        select_code(profile)
        from muscriptor.tokenizer.notes import Note
        from muscriptor.utils.midi import gaps_filled
        for part in midi.instruments:
            source=[Note(part.is_drum,part.program,n.start,n.end,n.pitch) for n in part.notes]
            filled=gaps_filled(source,gap/1000)
            if len(filled)!=len(source):raise ValueError('弦乐整理改变了音符数量')
            for original,note in zip(part.notes,filled):
                if (original.start,original.pitch)!=(note.onset,note.pitch) or note.offset<original.end:
                    raise ValueError('弦乐整理改变了起音或音高')
                if note.offset>original.end+1e-9:
                    changed+=1;extension+=note.offset-original.end
                original.end=float(note.offset)
    return dict(gapFillMs=gap,gapFillNotesExtended=changed,gapFillTotalMs=round(extension*1000,6),
                timingProcessor='muscriptor.gaps_filled-per-track',noteTimingAdjusted=bool(changed))

def instrument_names(profile, string_target='strings'):
    options = profile['options']
    return options.get('instrumentsByTarget', {}).get(string_target, options['instruments']).split(',')

def predict(audio_path,profile,notify,duration,string_target='strings'):
    if not ready(profile):raise ValueError('MuScriptor 环境或权重未就绪')
    import torch,soundfile as sf,pretty_midi
    root=runtime_root();weight=root/'models'/profile['checkpoint']['file']
    with weight.open('rb') as f:digest=hashlib.file_digest(f,'sha256').hexdigest()
    if digest!=profile['checkpoint']['sha256']:raise ValueError('MuScriptor 权重校验失败')
    select_code(profile)
    from muscriptor import TranscriptionModel
    from muscriptor.events import ProgressEvent
    from muscriptor.utils.beats import BeatGrid
    device='cuda' if torch.cuda.is_available() else 'cpu'
    torch.manual_seed(0)
    if device=='cuda':torch.cuda.reset_peak_memory_stats()
    opts=profile['options']
    weight_dtype=opts.get('weightDtype') if device=='cuda' else None
    # Stage only this profile's checkpoint on CPU, preserving upstream CUDA model
    # construction, precision and autocast. Restore the loader after the call.
    import muscriptor.transcription_model as upstream
    loader=upstream.load_file
    try:
        if device=='cuda' and opts.get('checkpointDevice')=='cpu':
            upstream.load_file=lambda filename,device='cpu':loader(filename,device='cpu')
        model=TranscriptionModel.load_model(weight,device=device,dtype=weight_dtype)
    finally:
        upstream.load_file=loader
    # Release temporary full-precision loading buffers in the lower-memory presets.
    if device=='cuda' and weight_dtype:
        torch.cuda.empty_cache()
    samples,sr=sf.read(str(audio_path),dtype='float32',always_2d=True)
    events=[];started=time.monotonic();opts=profile['options']
    for e in model.transcribe((torch.from_numpy(samples.T.copy()),sr),instruments=instrument_names(profile,string_target),batch_size=opts['batchSize'] if device=='cuda' else 1,prelude_forcing=False,use_sampling=False,cfg_coef=opts['cfg'],no_eos_is_ok=False):
        events.append(e)
        if isinstance(e,ProgressEvent):notify('MuScriptor · 正在识别音符',.08+.80*e.completed/e.total,'transcribe')
    elapsed=time.monotonic()-started
    grid=BeatGrid(bpm=120,beats_per_bar=None,first_downbeat=0,onset_delay=0)
    from muscriptor.utils import midi as midi_utils
    if hasattr(midi_utils,'ExportOptions'):
        # Gap filling is applied by XLD after its group-preserving normalization.
        data=model.events_to_midi_bytes(iter(events),beat_grid=grid,
            export=midi_utils.ExportOptions(quantize=False,fill_gaps=0,trim_leading_bars=False))
    else:
        data=model.events_to_midi_bytes(iter(events),beat_grid=grid,quantize=False)
    midi=pretty_midi.PrettyMIDI(io.BytesIO(data))
    return midi,dict(name='muscriptor',version=opts['codeRevision'],device=device,checkpointSha256=digest,transcribeSeconds=round(elapsed,3),peakGpuMiB=round(torch.cuda.max_memory_allocated()/1048576) if device=='cuda' else None,nativePrograms=[int(p.program) for p in midi.instruments],instruments=instrument_names(profile,string_target),velocityMode='constant-100',weightDtype=weight_dtype or 'float32',preludeForcing=False,officialOverlapTrimming=True,codeDirectory=profile['options'].get('codeDirectory','upstream'),checkpointStaging=opts.get('checkpointDevice','native'))