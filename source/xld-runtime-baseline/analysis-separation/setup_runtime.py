"""Optional explicit local setup; not run by the UI. Uses the existing XLD AI libraries."""
from pathlib import Path
import hashlib, json, shutil, sys, urllib.request, zipfile, subprocess
root=Path('D:/Caches/codex/setup/xld-roformer');root.mkdir(parents=True,exist_ok=True)
models=Path('D:/Caches/codex/models/xld-roformer');models.mkdir(parents=True,exist_ok=True)
def get(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'XLD-development'}),timeout=90) as response:return response.read()
def download(url,target,expected=None):
    if target.exists() and (expected is None or hashlib.sha256(target.read_bytes()).hexdigest()==expected):return
    temporary=target.with_suffix(target.suffix+'.part')
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'XLD-development'}),timeout=90) as response,temporary.open('wb') as output:shutil.copyfileobj(response,output)
    if expected and hashlib.sha256(temporary.read_bytes()).hexdigest()!=expected:raise ValueError('Hash mismatch: '+target.name)
    temporary.replace(target)
repo='openmirlab/bs-roformer-infer'
commit='90346ad4a4db7334f3378054a46adf7280b72f73'
download('https://api.github.com/repos/'+repo+'/zipball/'+commit,root/'upstream.zip','b04f491d2819a729d864954cc3c68fb256f0b974027d4d5a63ab086a8a3e2fe0')
vendor=root/'upstream';vendor.mkdir(exist_ok=True)
with zipfile.ZipFile(root/'upstream.zip','b04f491d2819a729d864954cc3c68fb256f0b974027d4d5a63ab086a8a3e2fe0') as archive:
    for item in archive.infolist():
        if not (vendor/item.filename).resolve().is_relative_to(vendor.resolve()):raise ValueError('Archive path')
    archive.extractall(vendor)
revision='a443a2985534b3bc815ef54a5d446c6a0390f974';expected={'BS-Rofo-SW-Fixed.ckpt':'24e7d35ee9c64415673d3fd33e06a67cac2c103c5df6267ba1576459c775916e','BS-Rofo-SW-Fixed.yaml':'f9fada9f94e5ba2d2e4600196299459294bc5f532b314c209cc156ac63e4329b'}
receipt={'repository':repo,'codeRevision':commit,'weightRepository':'enerjazzer/BS-ROFO-SW-Fixed','weightRevision':revision,'models':{}}
for name,digest in expected.items():
    print('Downloading '+name,flush=True)
    download('https://huggingface.co/enerjazzer/BS-ROFO-SW-Fixed/resolve/'+revision+'/'+name,models/name,digest)
    receipt['models'][name]={'file':name,'sha256':digest,'size':(models/name).stat().st_size}
(root/'runtime-receipt.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
environment=Path('D:/Caches/codex/runtimes/xld-roformer')
subprocess.run([str(Path(sys.base_prefix)/'python.exe'),'-m','venv',str(environment)],check=True)
(environment/'Lib/site-packages/xld-shared-runtime.pth').write_text('D:/Program Files/xin-local-deck-beta/analysis-ai/.venv/Lib/site-packages\n',encoding='utf-8')
package=next(vendor.iterdir())
subprocess.run([str(environment/'Scripts/python.exe'),'-m','pip','install','--no-deps',str(package),'rotary-embedding-torch==0.9.1','ml-collections==1.1.0','absl-py==2.3.1'],check=True)
print('RoFormer runtime prepared',flush=True)
