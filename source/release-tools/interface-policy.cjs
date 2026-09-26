'use strict';
// Keep reviewed visual dependencies; exclude unreviewed AI vendor code.
function includeAppFile(relative){
 const normalized=relative.replaceAll('\\','/'),parts=normalized.split('/'),name=parts.at(-1).toLowerCase();
 if(normalized==='README.md')return false; // Old app-level developer notes contain local-machine paths.
 if(normalized==='analysis-harmony/btc'||normalized.startsWith('analysis-harmony/btc/'))return false;
 if(parts.some(p=>['checkpoints','weights','__pycache__','.git'].includes(p.toLowerCase())))return false;
 if(parts.some(p=>p.toLowerCase()==='vendor')){
  const allowed=['vendor/butterchurn-2.6.7.min.js','vendor/butterchurn-presets-2.4.7.min.js','vendor/LICENSE-butterchurn.txt','vendor/LICENSE-butterchurn-presets.txt','vendor/glitch-generator/6.6.1-integration-v.3'];
  if(!allowed.some(p=>normalized===p || p.startsWith(normalized+'/') || (p.endsWith('6.6.1-integration-v.3')&&normalized.startsWith(p+'/'))))return false;
 }
 if(/\.(?:pth|pt|ckpt|onnx|safetensors|h5|hdf5|tflite|pb|npz|npy|bin|wav|flac|mp3|m4a|ogg|opus|mid|midi|pyc)$/i.test(name))return false;
 if(name==='.env'||name.startsWith('.env.')||['token','token.json','settings.json','development-settings.json','runtime.local.json','credentials.json','auth.json'].includes(name))return false;
 return true;
}
module.exports={includeAppFile};
