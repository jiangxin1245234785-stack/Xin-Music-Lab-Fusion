"""Adapter for published RoFormer weights, using the installed upstream implementation.

Only the selected independent mask head is moved to the device. The shared trunk
and that head are unchanged; this is output selection, not a newly trained model.
Overlap-add follows the existing XLD RoFormer adapter and accumulates on CPU.
"""
from pathlib import Path
import gc,hashlib,json,math,os,time
ROOT=Path(__file__).resolve().parent
REVISION='90346ad4a4db7334f3378054a46adf7280b72f73'

def directory():return Path(os.environ.get('XLD_REFINE_ROFORMER_MODELS',str(ROOT/'models-not-installed')))

def attempts(requested,cuda,seconds):
    if requested=='cuda' and not cuda:raise ValueError('GPU 不可用，请选择自动或 CPU')
    if requested=='cpu' or not cuda:return [('cpu',min(seconds,5))]
    values=[('cuda',seconds),('cuda',5),('cuda',2)]
    if requested=='auto':values.append(('cpu',5))
    return list(dict.fromkeys(values))

def with_oom_retry(choices,execute,is_oom,cleanup,notify):
    retries=[]
    for index,(device,seconds) in enumerate(choices):
        try:return execute(device,seconds),retries
        except Exception as error:
            if not is_oom(error) or device!='cuda' or index==len(choices)-1:raise
            retries.append(dict(device=device,chunkSeconds=seconds,reason='CUDA out of memory'))
        # Leave the except block first so failed activation tensors are released.
        cleanup();next_device,next_seconds=choices[index+1]
        notify(f'显存不足，改用 {"GPU" if next_device=="cuda" else "CPU"} · {next_seconds} 秒分块',.1,'fallback')

def selected_head(model,index):
    import torch
    if not 0<=index<len(model.mask_estimators):raise ValueError('目标输出层不存在')
    model.mask_estimators=torch.nn.ModuleList([model.mask_estimators[index]])
    model.num_stems=1
    return model

def load(profile,target,notify):
    import torch,yaml
    from ml_collections import ConfigDict
    from bs_roformer.inference import SafeLoaderWithTuple
    from bs_roformer.utils import get_model_from_config,load_checkpoint_state
    root=directory();manifest=json.loads((root/'manifest.json').read_text(encoding='utf-8'));asset=manifest['models'][profile['asset']]
    for key in ['checkpoint','config']:
        item=asset[key]
        with (root/item['file']).open('rb') as handle:
            if hashlib.file_digest(handle,'sha256').hexdigest()!=item['sha256']:raise ValueError('模型校验失败：'+item['file'])
    config=ConfigDict(yaml.load((root/asset['config']['file']).read_text(encoding='utf-8'),Loader=SafeLoaderWithTuple))
    stem=profile.get('targetMap',{}).get(target,target)
    names=list(config.training.instruments)
    if stem not in names:raise ValueError('模型不支持该目标')
    notify('加载 '+profile['name']+'，仅启用所选乐器输出',.08,'model')
    model=get_model_from_config('bs_roformer',config)
    model.load_state_dict(load_checkpoint_state(root/asset['checkpoint']['file'],map_location='cpu'),strict=True)
    selected_head(model,names.index(stem));gc.collect()
    return model.eval(),dict(name=profile['name'],modelSha256=asset['checkpoint']['sha256'],configSha256=asset['config']['sha256'],codeRevision=REVISION,sourceStemIndex=names.index(stem),sourceStem=stem,selectedHead=True,originalHeadCount=len(names),accumulation='cpu'),config

def demix(model,audio,sample_rate,device,seconds,overlap,notify):
    import numpy as np,torch
    from contextlib import nullcontext
    from scipy.signal import resample_poly
    divisor=math.gcd(sample_rate,44100)
    converted=resample_poly(audio,44100//divisor,sample_rate//divisor,axis=0).astype(np.float32) if sample_rate!=44100 else audio
    if converted.shape[1]==1:converted=np.repeat(converted,2,axis=1)
    mix=torch.from_numpy(converted.T.copy());frames=mix.shape[-1]
    # Upstream istft omits an explicit length: align input to its hop so it
    # reconstructs every sample instead of truncating the last partial hop.
    hop=model.stft_kwargs['hop_length'];chunk=math.ceil(seconds*44100/hop)*hop
    step=chunk//overlap;fade=chunk//10;border=chunk-step
    padded=frames>2*border and border>0
    if padded:mix=torch.nn.functional.pad(mix,(border,border),mode='reflect')
    total=mix.shape[-1];result=np.zeros((2,total),np.float32);counter=np.zeros(total,np.float32)
    window=np.ones(chunk,np.float32);window[:fade]=np.linspace(0,1,fade);window[-fade:]=np.linspace(1,0,fade)
    model.to(device);count=math.ceil(total/step)
    if device=='cuda':torch.cuda.reset_peak_memory_stats()
    with torch.inference_mode():
        for i,start in enumerate(range(0,total,step)):
            part=mix[:,start:start+chunk];length=part.shape[-1]
            if length<chunk:part=torch.nn.functional.pad(part,(0,chunk-length),mode='reflect' if length>chunk//2+1 else 'constant')
            with torch.autocast('cuda') if device=='cuda' else nullcontext():prediction=model(part[None].to(device))[0]
            values=prediction[...,:length].float().cpu().numpy()
            if not np.isfinite(values).all():raise ValueError('模型输出包含无效采样')
            weights=window.copy()
            if start==0:weights[:fade]=1
            if start+chunk>=total:weights[-fade:]=1
            result[:,start:start+length]+=values*weights[:length];counter[start:start+length]+=weights[:length]
            del prediction,values
            notify(f'{"GPU" if device=="cuda" else "CPU"} · {seconds} 秒分块 · {i+1}/{count}',.12+.74*(i+1)/count,'refine')
    if np.any(counter<=0):raise ValueError('分块边界不完整')
    result/=counter
    if padded:result=result[:,border:-border]
    target=result.T
    if audio.shape[1]==1:target=target.mean(axis=1,keepdims=True)
    if sample_rate!=44100:target=resample_poly(target,sample_rate//divisor,44100//divisor,axis=0)
    target=target[:len(audio)].astype(np.float32)
    if target.shape!=audio.shape:raise ValueError('结果时长不匹配')
    return target,dict(device=device,chunkSeconds=round(chunk/44100,4),chunkFrames=chunk,overlap=overlap,peakAllocatedMiB=round(torch.cuda.max_memory_allocated()/1024**2,1) if device=='cuda' else 0)

def extract(audio,sample_rate,profile,target,requested,notify):
    import numpy as np,torch
    torch.set_num_threads(min(8,os.cpu_count() or 1));started=time.monotonic()
    model,metadata,config=load(profile,target,notify)
    seconds=20 if profile['asset']=='bowed' else 10
    overlap=4 if profile['asset']=='bowed' else 2
    def execute(device,chunk):return demix(model,audio,sample_rate,device,chunk,overlap,notify)
    def cleanup():model.cpu();gc.collect();torch.cuda.empty_cache()
    (estimate,execution),retries=with_oom_retry(attempts(requested,torch.cuda.is_available(),seconds),execute,lambda error:isinstance(error,torch.cuda.OutOfMemoryError),cleanup,notify)
    metadata.update(execution,requestedDevice=requested,retries=retries,elapsedSeconds=round(time.monotonic()-started,2))
    return estimate,(audio-estimate).astype(np.float32),metadata
