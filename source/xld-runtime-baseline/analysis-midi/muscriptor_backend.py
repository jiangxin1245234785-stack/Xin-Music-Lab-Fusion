"""MuScriptor adapter pinned to the user-accepted MEGURI decoding setup."""
from pathlib import Path
import os,sys,hashlib,io,time,importlib.util

def runtime_root():
    return Path(os.environ.get('XLD_MUSCRIPTOR_ROOT',''))

def ready(profile):
    root=runtime_root();weight=root/'models'/profile['checkpoint']['file']
    return bool(os.environ.get('XLD_MUSCRIPTOR_ROOT')) and (root/'upstream/muscriptor/__init__.py').is_file() and weight.is_file() and weight.stat().st_size==profile['checkpoint']['size'] and all(importlib.util.find_spec(p) for p in ['torch','einops','safetensors','soundfile','pretty_midi','huggingface_hub'])

def instrument_names(profile, string_target='strings'):
    options = profile['options']
    return options.get('instrumentsByTarget', {}).get(string_target, options['instruments']).split(',')

def predict(audio_path,profile,notify,duration,string_target='strings'):
    if not ready(profile):raise ValueError('MuScriptor 环境或权重未就绪')
    import torch,soundfile as sf,pretty_midi
    root=runtime_root();weight=root/'models'/profile['checkpoint']['file']
    with weight.open('rb') as f:digest=hashlib.file_digest(f,'sha256').hexdigest()
    if digest!=profile['checkpoint']['sha256']:raise ValueError('MuScriptor 权重校验失败')
    sys.path.insert(0,str(root/'upstream'))
    from muscriptor import TranscriptionModel
    from muscriptor.events import ProgressEvent
    from muscriptor.utils.beats import BeatGrid
    device='cuda' if torch.cuda.is_available() else 'cpu'
    torch.manual_seed(0)
    if device=='cuda':torch.cuda.reset_peak_memory_stats()
    opts=profile['options']
    weight_dtype=opts.get('weightDtype') if device=='cuda' else None
    model=TranscriptionModel.load_model(weight,device=device,dtype=weight_dtype)
    # Release temporary full-precision loading buffers in the lower-memory presets.
    if device=='cuda' and weight_dtype:
        torch.cuda.empty_cache()
    samples,sr=sf.read(str(audio_path),dtype='float32',always_2d=True)
    events=[];started=time.monotonic();opts=profile['options']
    for e in model.transcribe((torch.from_numpy(samples.T.copy()),sr),instruments=instrument_names(profile,string_target),batch_size=opts['batchSize'] if device=='cuda' else 1,prelude_forcing=False,use_sampling=False,cfg_coef=opts['cfg'],no_eos_is_ok=False):
        events.append(e)
        if isinstance(e,ProgressEvent):notify('MuScriptor · 正在识别音符',.08+.80*e.completed/e.total,'transcribe')
    elapsed=time.monotonic()-started
    data=model.events_to_midi_bytes(iter(events),beat_grid=BeatGrid(bpm=120,beats_per_bar=None,first_downbeat=0,onset_delay=0),quantize=False)
    midi=pretty_midi.PrettyMIDI(io.BytesIO(data))
    return midi,dict(name='muscriptor',version=opts['codeRevision'],device=device,checkpointSha256=digest,transcribeSeconds=round(elapsed,3),peakGpuMiB=round(torch.cuda.max_memory_allocated()/1048576) if device=='cuda' else None,nativePrograms=[int(p.program) for p in midi.instruments],instruments=instrument_names(profile,string_target),velocityMode='constant-100',weightDtype=weight_dtype or 'float32',preludeForcing=False,officialOverlapTrimming=True)