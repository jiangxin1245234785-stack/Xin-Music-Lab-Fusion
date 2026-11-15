'use strict';
// Runs in the renderer. Survey only the active layer plus the persistent transport/top bar.
// A scrollable ancestor is tested by actually scrolling it and hit-testing the control.
function surveyShell(layer = 'main') {
  const name = e => e.id ? '#'+e.id : e.getAttribute('aria-label') || e.textContent.trim().slice(0,50);
  const shown = e => {
    if (!e.getClientRects().length) return false;
    for (let p=e;p;p=p.parentElement) {
      const s=getComputedStyle(p);
      if (s.display==='none'||s.visibility==='hidden'||Number(s.opacity)<.05) return false;
      if(p.tagName==='DETAILS'&&!p.open&&!p.querySelector(':scope > summary')?.contains(e))return false;
    }
    return true;
  };
  const selector=layer==='library'?'#fusionPanel':layer==='settings'?'#xlSettings':layer==='glitch'?'#glitchPanel':'.visual-catalog';
  const roots=[...document.querySelectorAll('.xl-top,.xl-transport,'+selector)];
  const controls=[...new Set(roots.flatMap(r=>[...r.querySelectorAll('button,select,input,textarea,summary')]))];
  const unreachable=[],clipped=[],overlays=[],saved=new Map();let count=0,scrolled=0;
  const library=document.getElementById('fusionPanel'),settings=document.getElementById('xlSettings');
  const opened=e=>e?.classList.contains('is-open')&&getComputedStyle(e).visibility==='visible'&&Number(getComputedStyle(e).opacity)>.95;
  const state={library:opened(library),settings:opened(settings),effect:document.querySelector('.stage').dataset.effect,libraryClass:library.className,settingsClass:settings.className,libraryOpacity:getComputedStyle(library).opacity,settingsOpacity:getComputedStyle(settings).opacity};
  const layerReady=layer==='library'?state.library&&!state.settings:layer==='settings'?state.settings&&!state.library:!state.library&&!state.settings&&(layer!=='score'||state.effect==='score');
  if(!layerReady)unreachable.push({control:layer+' layer',blockedBy:'expected layer is not active',state});
  for(const e of controls) {
    if(!shown(e))continue;
    const initial=e.getBoundingClientRect();if(initial.width<2||initial.height<2)continue;
    count++;let didScroll=false;
    for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement){
      const s=getComputedStyle(p),r=p.getBoundingClientRect(),b=e.getBoundingClientRect();
      if(!/(auto|scroll)/.test(s.overflowX+s.overflowY))continue;
      if(!saved.has(p))saved.set(p,[p.scrollLeft,p.scrollTop]);
      if(p.scrollHeight>p.clientHeight+2&&(b.top<r.top||b.bottom>r.bottom)){p.scrollTop+=b.top-r.top-(r.height-b.height)/2;didScroll=true;}
      if(p.scrollWidth>p.clientWidth+2&&(b.left<r.left||b.right>r.right)){p.scrollLeft+=b.left-r.left-(r.width-b.width)/2;didScroll=true;}
    }
    const r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
    const hit=x>=0&&y>=0&&x<innerWidth&&y<innerHeight?document.elementFromPoint(x,y):null;
    if(!(hit&&(hit===e||e.contains(hit)||hit.closest('label')?.contains(e))))
      unreachable.push({control:name(e),box:[r.left,r.top,r.right,r.bottom].map(Math.round),blockedBy:hit?name(hit):'viewport'});
    if(didScroll)scrolled++;
    if(e.tagName==='BUTTON'&&e.id!=='xlNow'&&e.scrollWidth>e.clientWidth+2)clipped.push(name(e));
  }
  for(const [e,[x,y]]of saved){e.scrollLeft=x;e.scrollTop=y;}
  const rect=e=>{const r=e.getBoundingClientRect();return [r.left,r.top,r.right,r.bottom].map(Math.round);};
  const toast=document.querySelector('.toast.show'),drawer=layer==='library'?document.getElementById('fusionPanel'):layer==='settings'?document.getElementById('xlSettings'):null;
  if(toast&&drawer&&shown(toast)){
    const a=toast.getBoundingClientRect(),b=drawer.querySelector('.xl-drawer__head').getBoundingClientRect();
    if(a.right>b.left&&a.left<b.right&&a.bottom>b.top&&a.top<b.bottom&&Number(getComputedStyle(toast).zIndex)>Number(getComputedStyle(drawer).zIndex))overlays.push('scene toast covers drawer header');
  }
  return {layer,state,controls:count,scrolled,unreachable,clipped,overlays,rootScroll:[scrollX,scrollY],viewport:[innerWidth,innerHeight],bars:roots.slice(0,2).map(rect)};
}
module.exports={surveyShell};
