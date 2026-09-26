(function(root){
 'use strict';
 function create({show,getState}){
  const $=id=>document.getElementById(id),panel=document.createElement('section');panel.id='workspaceProperties';panel.hidden=true;
  panel.innerHTML='<p id="propertyContext" class="derived-hint"></p><details class="property-listening" open><summary id="propertyListeningTitle"></summary><div id="propertyListening"></div></details><section class="property-notes"><h3 id="propertyNotesTitle"></h3><p id="propertyEmpty" class="derived-hint"></p></section><section class="property-annotation"><h3 id="propertyAnnotationTitle"></h3></section>';
  $('workbenchPanelBody').insertBefore(panel,$('workspaceLogs'));
  const empty=document.createElement('div');empty.id='workbenchEmptyActions';empty.className='result-module-links';empty.innerHTML='<button id=emptyLibrary type=button class=quiet-button></button><button id=emptyAnalysis type=button class=quiet-button></button><button id=emptyStems type=button class=quiet-button></button>';
  $('timelineLanes').before(empty);
  $('emptyLibrary').onclick=()=>{if(document.querySelector('.workspace-library').hidden)$('workbenchLibrary').click();document.querySelector('.workspace-library button')?.focus();};
  $('emptyAnalysis').onclick=()=>show('section');$('emptyStems').onclick=()=>show('stems');
  const tab=document.createElement('button');tab.id='workspace-tab-properties';tab.type='button';tab.dataset.workspaceTab='properties';tab.setAttribute('role','tab');tab.setAttribute('aria-controls','workspaceProperties');document.querySelector('.workspace-tabs').append(tab);
  const launch=document.createElement('button');launch.id='timelineProperties';launch.type='button';launch.className='quiet-button';launch.onclick=()=>show('properties');document.querySelector('.timeline-audition').prepend(launch);
  const listening=$('propertyListening');
  // Move controls, not copies: preserve their listeners, exact values and controller ownership.
  const dash=$('timelineLoopStart').nextElementSibling;
  for(const id of ['timelineAuditionScope','timelineMixPreset','timelineRefinements','timelineAuditionSource'])listening.append($(id));
  const loop=document.createElement('div');loop.className='property-loop';
  const loopLabel=document.createElement('strong');loopLabel.id='propertyLoopTitle';loop.append(loopLabel);
  loop.append($('timelineLoopStart'),dash,$('timelineLoopEnd'),$('timelineLoopEnable'),$('timelineLoopClear'));listening.append(loop,$('timelineMixReset'));
  const notes=panel.querySelector('.property-notes');notes.append($('timelineSelection'),$('midiEditBar'));
  panel.querySelector('.property-annotation').append($('timelineEditor'));
  const help=document.createElement('details');help.className='property-help';help.innerHTML='<summary id="propertyHelpTitle"></summary>';help.append($('timelineHint'));panel.append(help);
  for(const id of ['midiEditToggle','timelineSelectNotes','timelineLoopChoose','timelineAnnotate'])$(id).addEventListener('click',()=>{if($(id).getAttribute('aria-pressed')==='true')show('properties');});
  let annotationWasHidden=$('timelineEditor').hidden;
  const observer=new MutationObserver(()=>{const hidden=$('timelineEditor').hidden;if(annotationWasHidden&&!hidden)show('properties');annotationWasHidden=hidden;render();});
  observer.observe($('timelineEditor'),{attributes:true,attributeFilter:['hidden']});observer.observe($('midiEditBar'),{attributes:true,attributeFilter:['hidden']});observer.observe($('timelineSelection'),{attributes:true,attributeFilter:['hidden']});observer.observe($('timelineSummary'),{childList:true});
  function render(){const en=document.documentElement.lang.startsWith('en');
   empty.hidden=Boolean(document.querySelector('#timelineLanes .tl-row'));
   $('emptyLibrary').textContent=en?'Choose a track':'选择曲目';$('emptyAnalysis').textContent=en?'Analyze sections':'分析段落';$('emptyStems').textContent=en?'Generate stems / MIDI':'生成分轨 / MIDI';
   $('emptyAnalysis').disabled=$('emptyStems').disabled=!getState().selectedTrack;
   const labels={properties:en?'Properties':'属性',listening:en?'Listening / loop':'监听 / 循环',notes:en?'Notes':'音符',annotation:en?'Annotation':'标注',help:en?'Gestures and instructions':'操作说明'};
   tab.textContent=launch.textContent=labels.properties;$('propertyListeningTitle').textContent=labels.listening;$('propertyNotesTitle').textContent=labels.notes;$('propertyAnnotationTitle').textContent=labels.annotation;$('propertyHelpTitle').textContent=labels.help;
   $('propertyLoopTitle').textContent=en?'Loop range · seconds':'循环区间 · 秒';
   $('propertyContext').textContent=$('timelineSummary').textContent;
   $('propertyEmpty').hidden=!$('timelineSelection').hidden||!$('midiEditBar').hidden;
   $('propertyEmpty').textContent=en?'Focus a part, then use Select notes or Edit notes on the timeline.':'先聚焦一个声部，再使用时间轴上的“选择音符”或“编辑音符”。';
   panel.querySelector('.property-annotation').hidden=$('timelineEditor').hidden;
  }
  render();return {render};
 }
 root.XldWorkbenchProperties={create};
})(globalThis);
