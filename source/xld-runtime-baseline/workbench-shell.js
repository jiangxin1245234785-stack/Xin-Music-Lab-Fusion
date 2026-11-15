(function(root){
  'use strict';
  function create({show,copy,getTimeline}) {
    const $=id=>document.getElementById(id), shell=document.querySelector('.workspace-shell');
    const content=$('workspaceContent'), library=document.querySelector('.workspace-library');
    const body=document.createElement('div');body.className='workbench-body';
    content.before(body);body.append(content);
    const aside=document.createElement('aside');aside.id='workbenchPanel';aside.hidden=true;
    aside.innerHTML='<div class="workbench-panel-head"><strong id="workbenchPanelTitle"></strong><button type="button" id="workbenchExpand" aria-pressed="false"></button><button type="button" id="workbenchClose"></button></div><div id="workbenchPanelBody" tabindex="0" role="tabpanel"></div>';
    body.append(aside);const panel=$('workbenchPanelBody');
    aside.querySelector('.workbench-panel-head').after(document.querySelector('.workspace-tabs'));
    for(const id of ['workspaceOverview','workspaceLab','workspaceDerived','workspaceLogs'])panel.append($(id));
    const actions=document.createElement('nav');actions.className='workbench-actions';
    actions.innerHTML='<button type="button" id="workbenchLibrary" aria-controls="workbenchLibraryPane" aria-expanded="true"></button><button type="button" id="workbenchAnalysis"></button><button type="button" id="workbenchResults"></button>';
    document.querySelector('.workspace-topline').append(actions);library.id='workbenchLibraryPane';
    let current='section',expanded=false,lastAnalysis='section',libraryHidden=false;
    let opened=false;
    try{const saved=JSON.parse(localStorage.getItem('xld.workbench.panel')||'null');
      if(saved&&['overview','section','harmony','stems','midi','properties'].includes(saved.current)){
        current=saved.current;expanded=saved.expanded===true;opened=saved.opened===true;
        if(['section','harmony','stems','midi'].includes(saved.lastAnalysis))lastAnalysis=saved.lastAnalysis;
      }
    }catch(_){}
    const initial={current,opened};
    function save(){try{localStorage.setItem('xld.workbench.panel',JSON.stringify({current,expanded,opened,lastAnalysis}));}catch(_){} }
    try{libraryHidden=localStorage.getItem('xld.workbench.libraryHidden')==='true';}catch(_){}
    function setLibrary(hidden){const anchor=getTimeline?.()?.centreTime();libraryHidden=hidden;library.hidden=hidden;document.querySelector('.app-shell').classList.toggle('workbench-library-hidden',hidden);$('workbenchLibrary').setAttribute('aria-expanded',String(!hidden));try{localStorage.setItem('xld.workbench.libraryHidden',String(hidden));}catch(_){}resize(anchor);}
    let frame;function resize(anchor){cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{window.dispatchEvent(new Event('resize'));if(Number.isFinite(anchor))getTimeline?.()?.scrollTo(anchor);});}
    function render(){
      const en=document.documentElement.lang.startsWith('en');
      $('workbenchLibrary').textContent=copy('library');
      $('workbenchAnalysis').textContent=en?'Analyze':'分析';
      $('workbenchResults').textContent=en?'Results':'结果';
      $('workbenchExpand').textContent=expanded?(en?'Restore width':'恢复侧栏'):(en?'Expand tools':'展开工具');
      $('workbenchClose').textContent=en?'Close':'收起';
      $('workbenchPanelTitle').textContent=current==='properties'?(en?'Properties':'属性'):copy(current==='timeline'?'workbench':current);
      $('workbenchExpand').setAttribute('aria-pressed',String(expanded));
    }
    function layout(){const anchor=getTimeline?.()?.centreTime();aside.hidden=!opened;body.classList.toggle('with-panel',opened);body.classList.toggle('panel-expanded',expanded&&opened);$('workbenchAnalysis').setAttribute('aria-pressed',String(opened&&['section','harmony','stems','midi'].includes(current)));$('workbenchResults').setAttribute('aria-pressed',String(opened&&current==='overview'));render();resize(anchor);}
    function display(next){if(next==='timeline')return;current=next;opened=true;if(['section','harmony','stems','midi'].includes(next))lastAnalysis=next;save();layout();}
    function close(){opened=false;save();layout();}
    $('workbenchLibrary').onclick=()=>setLibrary(!libraryHidden);
    $('workbenchAnalysis').onclick=()=>show(lastAnalysis);
    $('workbenchResults').onclick=()=>show('overview');
    $('workbenchExpand').onclick=()=>{expanded=!expanded;display(current);};
    $('workbenchClose').onclick=()=>{close();$('workbenchAnalysis').focus();};
    setLibrary(libraryHidden);layout();
    return {show:display,close,initial,render,openLibrary:()=>setLibrary(false)};
  }
  root.XldWorkbenchShell={create};
})(globalThis);
