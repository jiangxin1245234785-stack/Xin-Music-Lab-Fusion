(function(root){
  'use strict';
  const doc=root.document, bridge=root.XinsMusicLabFusion;
  const el=id=>doc.getElementById('externalMidi'+id);
  const panel=el('Panel'), choose=el('Choose'), file=el('File'), edit=el('Edit'), status=el('Status');
  if (!panel || !bridge?.externalMidi) return;
  const audio=doc.getElementById('fusionAudio'), tracks=el('Parts'), offset=el('Offset'), grid=el('Grid');
  const names={vocals:['人声','Vocals'],guitar:['吉他','Guitar'],piano:['键盘','Keys'],strings:['弦乐','Strings'],
    winds:['管乐','Winds'],bass:['贝斯','Bass'],drums:['鼓','Drums'],synth:['合成键盘','Synth keys'],unassigned:['待分配（雷达不显示）','Unassigned (off radar)']};
  const en=()=>doc.documentElement.lang.toLowerCase().startsWith('en');
  let id='', record=null, busy=false, generation=0, pickedFor='', problem='';
  const limits=4*1024*1024;
  function message(error) {
    if (error==='midi-too-large') return en()?'This file exceeds the MIDI import limits.':'文件超过 MIDI 导入上限。';
    if (error==='midi-settings') return en()?'Enter a whole offset between −60000 and 60000 ms.':'请输入 −60000 至 60000 毫秒之间的整数。';
    if (error==='midi-changed') return en()?'The MIDI was replaced. Reopen its settings.':'MIDI 已被替换，请重新打开设置。';
    if (error==='midi-no-visible-notes') return en()?'No playable notes overlap the recording with these settings.':'当前设置下，录音时间内没有可显示的音符。';
    return en()?'Unable to import or read the MIDI. Use a standard type 0 or 1 file with notes.':'MIDI 读取失败。请选择带音符的标准 0 型或 1 型 MIDI 文件。';
  }
  function render() {
    choose.disabled=!id||busy;
    edit.hidden=!record;
    for(const input of edit.querySelectorAll('button,select,input'))input.disabled=busy;
    grid.disabled=busy||!record?.hasMeter;
    status.textContent=problem||(record?record.name+' · '+record.parts.length+(en()?' parts':' 个声部'):'');
    status.hidden=!status.textContent;
  }
  function form() {
    tracks.replaceChildren();
    if(record) {
      offset.value=record.offsetMs;grid.checked=record.grid;
      for(const part of record.parts){
        const label=doc.createElement('label'), caption=doc.createElement('span'), select=doc.createElement('select');
        label.className='xl-row';caption.textContent=(part.name||'MIDI')+' · Ch '+(part.channel+1);
        for(const [key,langs] of Object.entries(names)) select.add(new Option(langs[en()?1:0],key));
        select.value=part.group;label.append(caption,select);tracks.append(label);
      }
    }else edit.open=false;
    render();
  }
  async function change(action, values={}) {
    if (!id||busy) return;
    const current=id, ticket=++generation;
    busy=true;problem='';render();
    try {
      const result=await bridge.externalMidi({trackId:current,action,revision:record?.revision,...values});
      if(ticket!==generation)return;
      if(!result.ok)throw Error(result.error);
      record=result.record;form();
      if(action!=='read')await root.XinScoreSceneView?.refresh();
    }catch(e){if(ticket===generation)problem=message(e.message);}
    finally{if(ticket===generation){busy=false;render();}}
  }
  function selectTrack(next){
    if(id===next)return;
    ++generation;id=next;record=null;busy=false;problem='';form();
    if(id)change('read');
  }
  async function importFile(f, expected) {
    if(!f||id!==expected||!id||busy)return;
    if(f.size>limits){problem=message('midi-too-large');render();return;}
    try{
      const bytes=new Uint8Array(await f.arrayBuffer());
      if(id===expected)await change('import',{bytes,name:f.name,duration:audio.duration});
    }catch(e){if(id===expected){problem=message(e.message);render();}}
  }
  choose.addEventListener('click',()=>{pickedFor=id;file.click();});
  file.addEventListener('change',()=>{const selected=file.files[0];file.value='';importFile(selected,pickedFor);});
  panel.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();});
  panel.addEventListener('drop',e=>{e.preventDefault();importFile(e.dataTransfer.files[0],id);});
  el('Apply').addEventListener('click',()=>change('apply',{groups:[...tracks.querySelectorAll('select')].map(s=>s.value),offsetMs:offset.valueAsNumber,grid:grid.checked}));
  el('Restore').addEventListener('click',()=>change('restore'));
  root.addEventListener('xin-score-track',e=>selectTrack(e.detail?.trackId||''));
  root.XinMusicLabDynamicUi?.subscribe?.(form);
  render();
})(globalThis);
