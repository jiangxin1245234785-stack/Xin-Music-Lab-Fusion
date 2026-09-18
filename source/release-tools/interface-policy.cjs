'use strict';
const path=require('node:path');
// Applied only to application resources: Electron .bin snapshots are required.
function includeAppFile(relative){
 const parts=relative.replaceAll('\\','/').split('/'),name=parts.at(-1).toLowerCase();
 if(parts.some(p=>['vendor','checkpoints','weights','__pycache__','.git'].includes(p.toLowerCase())))return false;
 if(/\.(?:pth|pt|ckpt|onnx|safetensors|h5|hdf5|tflite|pb|npz|npy|bin|wav|flac|mp3|m4a|ogg|opus|mid|midi|pyc)$/i.test(name))return false;
 if(name==='.env'||name.startsWith('.env.')||['token','token.json','settings.json','development-settings.json','runtime.local.json','credentials.json','auth.json'].includes(name))return false;
 return true;
}
module.exports={includeAppFile};
