'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
function diagnose(root,out,{check=require('./check-runtime.cjs').check,log=console.log}={}) {
 fs.mkdirSync(out,{recursive:true});
 let report={version:'unknown',createdAt:new Date().toISOString(),platform:process.platform,windows:os.release(),arch:process.arch,root,scope:'paths-and-model-availability',complete:false,ok:false};
 try {
  report.version=JSON.parse(fs.readFileSync(path.join(root,'resources/app/package.json'),'utf8')).version;
  report={...report,...check(path.join(root,'runtime.json'),path.join(root,'resources/apps'),{
   onProgress:({name,index,total})=>log(`[${index}/${total}] ${name} ...`)
  }),complete:true};
 } catch(error) {report.error=error.message;}
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
 const lines=[`Xin Music ${report.version}`,report.ok?'检查通过：路径与模型可用性正常。':'检查未通过：请查看下方缺失项或错误。',
  '此检查不执行歌曲推理，不代表音质或全流程验收通过。',`Windows: ${report.windows} (${report.arch})`,`程序目录: ${root}`,
  ...(report.paths?.missing||[]).map(item=>`缺失路径: ${item.key}: ${item.path}`),
  ...(report.probes||[]).flatMap(item=>[`${item.ok?'通过':'失败'}: ${item.name}`,item.error||'',
   ...item.required.filter(id=>!item.engines.some(engine=>engine.id===id&&engine.available)).map(id=>`  模型未就绪: ${id}`)]).filter(Boolean),
  report.error||'',`报告目录: ${out}`];
 fs.writeFileSync(path.join(out,'检查结果.txt'),'\ufeff'+lines.join('\r\n'),'utf8');
 log(lines.join('\n'));return report;
}
if(require.main===module){
 const root=path.resolve(__dirname,'../..');
 const out=path.join(process.env.LOCALAPPDATA||os.tmpdir(),'XinMusicDiagnostics',new Date().toISOString().replaceAll(':','-')+'-'+process.pid);
 try{if(!diagnose(root,out).ok)process.exitCode=1;}catch(error){console.error('无法写入检查报告: '+error.message);process.exitCode=1;}
}
module.exports={diagnose};
