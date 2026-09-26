(async function(){
  'use strict';
  const api=window.XinRelease;if(!api)return;
  const info=await api.info().catch(()=>null);if(!info)return;
  const old=document.querySelector('.beta-tag,.fusion-beta');if(!old)return;
  const group=document.createElement('span');group.className='release-controls';
  const help=document.createElement('button');help.type='button';help.id='releaseHelp';
  const status=document.createElement('button');status.type='button';status.id='releaseStatus';status.textContent='ⓘ';
  const setup=document.createElement('button');setup.type='button';setup.id='releaseSetup';
  function localize(){const english=document.documentElement.lang.startsWith('en');
    help.textContent=(info.interfaceOnly?(english?'Interface · Models not bundled · ':'界面版 · 模型自配 · '):'')+info.version+' · '+(english?'Help':'帮助');
    help.title=english?'Usage guide (F1)':'使用说明（F1）';
    status.title=english?'Version and environment':'版本与环境';status.setAttribute('aria-label',status.title);
    setup.textContent=english?'Setup':'配置';setup.title=english?'Configure model environments':'配置模型运行环境';
  }
  help.addEventListener('click',()=>api.help().catch(()=>{}));
  document.addEventListener('keydown',event=>{if(event.key==='F1'){event.preventDefault();api.help().catch(()=>{});}});
  status.addEventListener('click',()=>api.status(document.documentElement.lang.startsWith('en')?'en-US':'zh-CN').catch(()=>{}));
  group.append(help,status);old.replaceWith(group);localize();
  if(info.interfaceOnly){group.append(setup);setup.addEventListener('click',()=>api.setup(document.documentElement.lang).catch(()=>{}));if(info.setupNeeded)api.setup(document.documentElement.lang).catch(()=>{});}
  new MutationObserver(localize).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
})();
