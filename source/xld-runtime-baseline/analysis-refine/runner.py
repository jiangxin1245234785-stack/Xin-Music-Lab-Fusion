"""Optional other-stem refinement. Independent target/residual previews, never overwrite stems."""
from pathlib import Path
import argparse,hashlib,importlib.util,json,math,os,sys,time,uuid
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
PROFILES=json.loads((HERE/'profiles.json').read_text(encoding='utf-8'))
def emit(message,progress=0,phase='refine'):
    print(json.dumps(dict(message=message,progress=progress,phase=phase),ensure_ascii=False),flush=True)
def model_directory():
    value=os.environ.get('XLD_REFINE_MODELS')
    return Path(value) if value else HERE/'models-not-installed'
def engines():
    from roformer import directory
    result=[]
    for profile in PROFILES:
        modules=['torch','numpy','soundfile','scipy','torchlibrosa' if profile['backend']=='audiosep' else 'bs_roformer']
        folder=model_directory() if profile['backend']=='audiosep' else directory()
        names=['separator.pt','conditions.npz','manifest.json'] if profile['backend']=='audiosep' else ['manifest.json']
        available=all(importlib.util.find_spec(name) is not None for name in modules) and all((folder/name).is_file() for name in names)
        if available and profile['backend']=='roformer':
            try:
                asset=json.loads((folder/'manifest.json').read_text(encoding='utf-8'))['models'][profile['asset']]
                available=all((folder/asset[key]['file']).is_file() for key in ['checkpoint','config'])
            except (OSError,KeyError,ValueError):available=False
        result.append(dict(profile,available=available))
    return result
def load_model(condition,notify,device='auto'):
    import numpy as np,torch
    root=model_directory();manifest=json.loads((root/'manifest.json').read_text(encoding='utf-8'))
    for name in ['separator.pt','conditions.npz']:
        with (root/name).open('rb') as handle:
            if hashlib.file_digest(handle,'sha256').hexdigest()!=manifest['files'][name]['sha256']:raise ValueError('弦乐模型校验失败')
    sys.path.insert(0,str(HERE/'vendor'))
    from models.resunet import ResUNet30
    torch.set_num_threads(4)
    if device=='auto':device='cuda' if torch.cuda.is_available() else 'cpu'
    if device=='cuda' and not torch.cuda.is_available():raise ValueError('GPU 不可用，请选择自动或 CPU')
    notify('加载弦乐提取模型',.08,'model')
    model=ResUNet30(1,1,512)
    model.load_state_dict(torch.load(root/'separator.pt',map_location='cpu',weights_only=True),strict=True)
    model=model.eval().to(device)
    with np.load(root/'conditions.npz',allow_pickle=False) as data:
        query=torch.from_numpy(data[condition].copy()).to(device)
    def predict(samples):
        with torch.inference_mode():
            return model({'mixture':torch.from_numpy(samples[None,None,:]).to(device),'condition':query})['waveform'][0,0].cpu().numpy()
    return predict,dict(name='AudioSep',device=device,prompt=manifest['prompts'][condition],modelSha256=manifest['files']['separator.pt']['sha256'],conditionSha256=manifest['files']['conditions.npz']['sha256'])
def extract(audio,sample_rate,predict,notify=emit):
    import numpy as np
    from scipy.signal import resample_poly
    # Run original mono model on each channel; preserve stereo timing and original rate.
    divisor=math.gcd(sample_rate,32000)
    resampled=resample_poly(audio,32000//divisor,sample_rate//divisor,axis=0).astype(np.float32)
    result=np.zeros_like(resampled)
    central=3*32000;context=32000
    count=math.ceil(len(resampled)/central)*audio.shape[1];step=0
    for channel in range(audio.shape[1]):
        padded=np.pad(resampled[:,channel],(context,context+central))
        for start in range(0,len(resampled),central):
            chunk=padded[start:start+central+2*context]
            estimate=predict(chunk)
            length=min(central,len(resampled)-start)
            result[start:start+length,channel]=estimate[context:context+length]
            step+=1;notify(f'提取弦乐 {step}/{count}',.12+.75*step/count,'refine')
    target=resample_poly(result,sample_rate//divisor,32000//divisor,axis=0)[:len(audio)].astype(np.float32)
    if target.shape!=audio.shape or not np.isfinite(target).all():raise ValueError('弦乐结果无效')
    return target,(audio-target).astype(np.float32)
def run(input_path,output_path,engine,start,duration,run_id,track_id,parent_run,cache_key,notify=emit,target_name='strings',device='auto',scope='preview',source_stem='other'):
    import numpy as np,soundfile as sf
    profile=next((p for p in PROFILES if p['id']==engine),None)
    if not profile or target_name not in profile['targets'] or device not in ['auto','cpu','cuda']:raise ValueError('模型、目标或运行方式无效')
    if scope not in ['preview','full'] or (scope=='full' and engine!='mega-53'):raise ValueError('整曲细分目前仅支持 Mega 53')
    if scope=='preview' and (not math.isfinite(start) or not math.isfinite(duration) or start<0 or not 1<=duration<=30):raise ValueError('请选择有效的 1–30 秒片段')
    if source_stem not in ['mix','other','guitar','piano','bass','drums','vocals'] or (engine!='mega-53' and source_stem!='other'):raise ValueError('refinement-source-invalid')
    run_id=str(uuid.UUID(run_id))
    if source_stem=='mix':parent_run=None
    else:str(uuid.UUID(parent_run))
    if len(cache_key)!=64 or any(c not in '0123456789abcdef' for c in cache_key):raise ValueError('cache-key-invalid')
    input_path=Path(input_path).resolve();output_path=Path(output_path).resolve();before=input_path.stat()
    with sf.SoundFile(input_path) as handle:
        sr=handle.samplerate;first=0 if scope=='full' else round(start*sr)
        if first>=len(handle):raise ValueError('起点已超过音轨长度')
        handle.seek(first);audio=handle.read(-1 if scope=='full' else round(duration*sr),dtype='float32',always_2d=True)
    if audio.shape[1] not in [1,2] or not len(audio) or not np.isfinite(audio).all():raise ValueError('输入音频无效')
    notify('读取 '+source_stem+(' 整曲' if scope=='full' else ' 片段'),.03,'decode')
    if profile['backend']=='roformer':
        from roformer import extract as roformer_extract
        target,residual,backend=roformer_extract(audio,sr,profile,target_name,device,notify)
    else:
        import gc,torch
        from roformer import with_oom_retry
        chosen='cuda' if device=='auto' and torch.cuda.is_available() else 'cpu' if device=='auto' else device
        choices=[(chosen,5)]+([('cpu',5)] if chosen=='cuda' and device=='auto' else [])
        def execute(actual,_seconds):
            started=time.monotonic()
            if actual=='cuda':torch.cuda.reset_peak_memory_stats()
            predict,metadata=load_model(target_name,notify,actual)
            estimate,leftover=extract(audio,sr,predict,notify)
            metadata.update(requestedDevice=device,chunkSeconds=5,elapsedSeconds=round(time.monotonic()-started,2),peakAllocatedMiB=round(torch.cuda.max_memory_allocated()/1024**2,1) if actual=='cuda' else 0)
            return estimate,leftover,metadata
        def cleanup():gc.collect();torch.cuda.empty_cache()
        (target,residual,backend),retries=with_oom_retry(choices,execute,lambda error:isinstance(error,torch.cuda.OutOfMemoryError),cleanup,notify)
        backend['retries']=retries
    if (input_path.stat().st_size,input_path.stat().st_mtime_ns)!=(before.st_size,before.st_mtime_ns):raise ValueError('处理期间源文件发生变化')
    folder=output_path.parent/run_id;folder.mkdir(parents=True,exist_ok=False)
    notify('保存音轨与试听文件',.9,'save')
    waves={'original':audio,'target':target,'residual':residual};peaks={}
    for name,data in waves.items():
        peaks[name]=0.
        for offset in range(0,len(data),sr*10):
            block=data[offset:offset+sr*10]
            if not np.isfinite(block).all():raise ValueError('结果包含无效采样')
            peaks[name]=max(peaks[name],float(np.max(np.abs(block))))
        sf.write(folder/(name+'.wav'),data,sr,subtype='FLOAT')
    gain=min(1.,.95/max(max(peaks.values()),.95));play_files={}
    for name,data in waves.items():
        filename=('listen-' if gain<1 else '')+name+'.wav';play_files[name]=run_id+'/'+filename
        if gain<1:
            with sf.SoundFile(folder/filename,'w',samplerate=sr,channels=audio.shape[1],subtype='FLOAT') as stream:
                for offset in range(0,len(data),sr*10):stream.write(data[offset:offset+sr*10]*gain)
    error=0.
    for offset in range(0,len(audio),sr*10):
        end=offset+sr*10;error=max(error,float(np.max(np.abs(audio[offset:end]-target[offset:end]-residual[offset:end]))))
    (folder/'README.txt').write_text('XLD · '+profile['name']+'\nTarget: '+target_name+'\nSource: '+source_stem+'\nScope: '+scope+'\noriginal / target / residual: raw FLOAT WAV, peaks may exceed 1.0.\nlisten-*: common-gain audition copies; gain='+str(gain)+'\n目标与剩余共同组成输入音轨，不叠加原输入。不同乐器目标可能重叠，不直接相加。原始 FLOAT 文件供编辑，listen- 文件供试听。\n',encoding='utf-8')
    result=dict(schemaVersion=2,kind='refinement',scope=scope,engine=engine,runId=run_id,trackId=track_id,parentRunId=parent_run,cacheKey=cache_key,target=target_name,requestedDevice=device,sourceStem=source_stem,timeOrigin=first/sr,duration=len(audio)/sr,sampleRate=sr,frames=len(audio),channels=audio.shape[1],backend=backend,files={name:run_id+'/'+name+'.wav' for name in ['original','target','residual']},playback=dict(gain=gain,peaks=peaks,files=play_files),reconstructionError=error)
    output_path.write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8')
    notify('整曲细分已生成' if scope=='full' else '细分预览已生成',1,'complete')
    return result
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--engines',action='store_true')
    for key in ['input','output','engine','run-id','track-id','parent-run','cache-key']:parser.add_argument('--'+key)
    parser.add_argument('--start',type=float,default=0);parser.add_argument('--duration',type=float,default=30)
    parser.add_argument('--target',default='strings');parser.add_argument('--device',choices=['auto','cuda','cpu'],default='auto')
    parser.add_argument('--scope',choices=['preview','full'],default='preview')
    parser.add_argument('--source-stem',default='other');parser.add_argument('--probe',action='store_true')
    args=parser.parse_args()
    if args.probe:
        try:
            import soundfile as sf
            info=sf.info(args.input);print(json.dumps(dict(frames=info.frames,sampleRate=info.samplerate,channels=info.channels)))
        except Exception as error:print('无法读取原曲音频：'+str(error),file=sys.stderr);sys.exit(1)
    elif args.engines:print(json.dumps(engines(),ensure_ascii=False))
    else:
        try:run(args.input,args.output,args.engine,args.start,args.duration,args.run_id,args.track_id,args.parent_run,args.cache_key,target_name=args.target,device=args.device,scope=args.scope,source_stem=args.source_stem)
        except Exception as error:print(str(error),file=sys.stderr,flush=True);sys.exit(1)
