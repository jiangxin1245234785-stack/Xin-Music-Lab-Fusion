(function(root){
  'use strict';
  function create({show,getState}){
    const $=id=>document.getElementById(id), overview=$('workspaceOverview');
    const hub=document.createElement('div');hub.id='workbenchResultsHub';
    hub.innerHTML='<section class="result-tools"><h3 data-result-copy="manage"></h3><div id="resultTools"></div></section><section id="resultDraftArea"><h3 data-result-copy="drafts"></h3><p id="resultDraftEmpty" class="derived-hint" data-result-copy="noDrafts"></p></section><section id="resultExportArea"><h3 data-result-copy="export"></h3><p class="derived-hint" data-result-copy="exportHint"></p><button id="resultExportStem" class="secondary-button" type="button"></button><p id="resultExportScope" class="derived-hint"></p></section>';
    overview.append(hub);
    $('resultDraftArea').append($('midiDrafts'));
    $('resultExportArea').append(document.querySelector('.midi-merge-card'),document.querySelector('.workspace-export'));
    const labels={
      manage:['结果操作','Manage results'],drafts:['人工草稿','Manual drafts'],noDrafts:['本曲暂无草稿。选择时间轴声部后可编辑音符。','No drafts for this track. Select a timeline part to edit notes.'],
      export:['导出','Export'],exportHint:['导出使用已保存的完整声部；监听的 M/S 和音量不改变导出范围。','Exports use complete saved parts. Listening mute, solo and volume do not change the export scope.'],
      versions:['MIDI 版本 / 回退','MIDI versions / rollback'],batch:['一键 MIDI / 本曲目录','One-click MIDI / song folder'],refine:['细分 / 对照试听','Refine / compare audio'],section:['段落结果 / 标注','Sections / annotations'],harmony:['和弦结果 / 标注','Chords / annotations'],
      analysis:['分析结果清理','Manage analysis results'],storage:['WAV 存储管理','WAV storage'],sweep:['全库结果清理','Library result cleanup'],logs:['任务日志','Task log'],merge:['融合 / 导出','Merge / export'],draftLink:['草稿 / 修订','Drafts / revisions']
    };
    const buttons=[];let routeEpoch=0;
    function scrollTo(node){const panel=$('workbenchPanelBody');if(!node)return;panel.scrollTop+=node.getBoundingClientRect().top-panel.getBoundingClientRect().top-8;}
    function navigate(view,target,open=false){const token=++routeEpoch;show(view);const node=typeof target==='string'?$(target):target;if(open&&node)node.open=true;requestAnimationFrame(()=>{if(token!==routeEpoch||$('workbenchPanel').hidden||$('workbenchPanelBody').dataset.view!==view)return;scrollTo(node);node?.querySelector('summary,button,select')?.focus({preventScroll:true});});}
    function action(key,fn,needsTrack=true,parent=$('resultTools')){const b=document.createElement('button');b.type='button';b.className='quiet-button';b.dataset.resultAction=key;b.addEventListener('click',fn);parent.append(b);buttons.push({b,key,needsTrack});return b;}
    action('versions',()=>navigate('midi','derivedMidiVersionsBlock',true));
    action('batch',()=>navigate('midi',document.querySelector('.midi-batch-card')));
    action('refine',()=>navigate('stems','refinementPanel'));
    action('section',()=>navigate('section',document.querySelector('.comparison-card')));
    action('harmony',()=>navigate('harmony',document.querySelector('.comparison-card')));
    action('analysis',()=>navigate(getState().activeLab==='harmony'?'harmony':'section',document.querySelector('#workspaceLab .workspace-details'),true));
    action('storage',()=>$('storageManageButton').click(),false);
    action('sweep',()=>$('resultSweepButton').click(),false);
    action('logs',()=>navigate('overview','workspaceLogs',true),false);
    const exportsButton=action('export',()=>navigate('overview','resultExportArea'),false,document.querySelector('.workbench-actions'));exportsButton.id='workbenchExport';
    const midiLinks=document.createElement('div');midiLinks.className='result-module-links';document.querySelector('.midi-song-stack').append(midiLinks);
    action('merge',()=>navigate('overview','resultExportArea'),true,midiLinks);
    action('draftLink',()=>navigate('overview','resultDraftArea'),true,midiLinks);
    $('resultExportStem').onclick=()=>$('midiExport').click();
    function render(){
      const en=document.documentElement.lang.startsWith('en')?1:0;
      for(const el of hub.querySelectorAll('[data-result-copy]'))el.textContent=labels[el.dataset.resultCopy][en];
      for(const {b,key,needsTrack}of buttons){b.textContent=labels[key][en];b.disabled=needsTrack&&!getState().selectedTrack;}
      $('resultDraftEmpty').hidden=!$('midiDrafts').hidden;$('midiDrafts').open=true;
      const original=$('midiExport'),button=$('resultExportStem');button.textContent=original.textContent;button.disabled=original.disabled;button.title=original.title;$('resultExportScope').textContent=original.title;
    }
    const observer=new MutationObserver(render);observer.observe($('midiExport'),{attributes:true,attributeFilter:['disabled','title'],childList:true});observer.observe($('midiDrafts'),{attributes:true,attributeFilter:['hidden']});
    render();return {render};
  }
  root.XldWorkbenchResults={create};
})(globalThis);
