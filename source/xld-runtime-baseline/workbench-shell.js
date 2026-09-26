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
    let current='timeline',expanded=false,lastAnalysis='section',libraryHidden=false;
    try{libraryHidden=localStorage.getItem('xld.workbench.libraryHidden')==='true';}catch(_){}
    function setLibrary(hidden){const anchor=getTimeline?.()?.centreTime();libraryHidden=hidden;library.hidden=hidden;document.querySelector('.app-shell').classList.toggle('workbench-library-hidden',hidden);$('workbenchLibrary').setAttribute('aria-expanded',String(!hidden));try{localStorage.setItem('xld.workbench.libraryHidden',String(hidden));}catch(_){}resize(anchor);}
    let frame;function resize(anchor){cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{window.dispatchEvent(new Event('resize'));if(Number.isFinite(anchor))getTimeline?.()?.scrollTo(anchor);});}
    function render(){
      const en=document.documentElement.lang.startsWith('en');
      $('workbenchLibrary').textContent=copy('library');
      $('workbenchAnalysis').textContent=en?'Analyze':'分析';
      $('workbenchResults').textContent=en?'Results':'结果';
      $('workbenchExpand').textContent=expanded?(en?'Narrow':'收窄'):(en?'Expand':'展开');
      $('workbenchClose').textContent=en?'Close':'收起';
      $('workbenchPanelTitle').textContent=current==='properties'?(en?'Properties':'属性'):copy(current==='timeline'?'workbench':current);
      $('workbenchExpand').setAttribute('aria-pressed',String(expanded));
    }
    function display(next){const anchor=getTimeline?.()?.centreTime();current=next;if(['section','harmony','stems','midi'].includes(next))lastAnalysis=next;aside.hidden=next==='timeline';body.classList.toggle('with-panel',!aside.hidden);body.classList.toggle('panel-expanded',expanded&&!aside.hidden);$('workbenchAnalysis').setAttribute('aria-pressed',String(['section','harmony','stems','midi'].includes(next)));$('workbenchResults').setAttribute('aria-pressed',String(next==='overview'));render();resize(anchor);}
    $('workbenchLibrary').onclick=()=>setLibrary(!libraryHidden);
    $('workbenchAnalysis').onclick=()=>show(lastAnalysis);
    $('workbenchResults').onclick=()=>show('overview');
    $('workbenchExpand').onclick=()=>{expanded=!expanded;display(current);};
    $('workbenchClose').onclick=()=>{show('timeline');$('workbenchAnalysis').focus();};
    setLibrary(libraryHidden);render();
    return {show:display,render,openLibrary:()=>setLibrary(false)};
  }
  root.XldWorkbenchShell={create};
})(globalThis);
