(function(root){
 'use strict';
 const bridge=root.XinsMusicLabFusion,doc=root.document,form=doc.getElementById('scoreNoteForm');if(!form||!bridge?.scoreNotes)return;
 const pick=doc.getElementById('scoreNoteSelect'),start=doc.getElementById('scoreNoteStart'),end=doc.getElementById('scoreNoteEnd'),text=doc.getElementById('scoreNoteText'),save=doc.getElementById('scoreNoteSave'),remove=doc.getElementById('scoreNoteRemove'),now=doc.getElementById('scoreNoteNow'),status=doc.getElementById('scoreNoteStatus'),audio=doc.getElementById('fusionAudio');
 const i18n=root.XinMusicLabDynamicUi,say=(key,fallback)=>i18n?.t(key,{},fallback)||fallback;
 let track='',selected='',notes=[],sequence=0,busy=false,loading=false;
 const tell=(key,fallback)=>{if(i18n?.bindText)i18n.bindText(status,key,{},fallback);else status.textContent=fallback;};
 function buttons(){for(const e of [pick,start,end,text,save,now])e.disabled=!track||busy||loading;remove.disabled=!track||busy||loading||!selected;}
 function current(){const t=Math.max(0,Number(audio.currentTime)||0),duration=Number(audio.duration);start.value=t.toFixed(2);end.value=(duration>t?Math.min(duration,t+6):t+6).toFixed(2);}
 function fresh(){selected='';text.value='';current();}
 function render(){const keep=selected;pick.replaceChildren(new Option(say('notes.new','新建一句'),''));for(const n of notes)pick.add(new Option(`${n.start.toFixed(2)}—${n.end.toFixed(2)} · ${n.text.slice(0,35)}`,n.id));pick.value=keep;buttons();}
 async function load(id){const ticket=++sequence,changed=track!==id;track=id;loading=true;if(changed){notes=[];fresh();render();tell('notes.local','仅保存在本机；修改和删除会保留历史副本。');}if(!id){loading=false;buttons();return;}buttons();try{const r=await bridge.scoreNotes(id);if(ticket!==sequence)return;if(!r.ok)throw Error(r.error);notes=r.notes;render();}catch(e){if(ticket===sequence)tell('notes.failed','笔记未能读取或保存；请保留文字后重试。');}finally{if(ticket===sequence){loading=false;buttons();}}}
 pick.addEventListener('change',()=>{selected=pick.value;const n=notes.find(n=>n.id===selected);if(n){start.value=n.start;end.value=n.end;text.value=n.text;}else fresh();buttons();});
 now.addEventListener('click',current);
 form.addEventListener('submit',async e=>{e.preventDefault();if(!track||busy||loading)return;const id=track;busy=true;buttons();try{
  const result=await bridge.saveScoreNote(id,{...(selected?{id:selected}:{}),start:Number(start.value),end:Number(end.value),text:text.value});
  if(!result.ok)throw Error(result.error);if(id!==track)return;selected=result.note.id;await root.XinScoreSceneView.refresh();await load(id);tell('notes.saved','字幕已保存。');
 }catch(e){if(id===track)tell(e.message==='notes-time-invalid'?'notes.badTime':'notes.failed',e.message==='notes-time-invalid'?'时间需在歌曲范围内，结束晚于开始。':'笔记未能读取或保存；请保留文字后重试。');}finally{busy=false;buttons();}});
 remove.addEventListener('click',async()=>{if(!selected||busy)return;const id=track,note=selected;busy=true;buttons();try{const r=await bridge.removeScoreNote(id,note);if(!r.ok)throw Error(r.error);if(id!==track)return;fresh();await root.XinScoreSceneView.refresh();await load(id);tell('notes.removed','已删除，历史副本仍保留在本机。');}catch(e){tell('notes.failed','笔记未能读取或保存；请保留文字后重试。');}finally{busy=false;buttons();}});
 root.addEventListener('xin-score-track',e=>load(e.detail?.trackId||''));
 i18n?.subscribe(()=>render());buttons();
})(globalThis);
