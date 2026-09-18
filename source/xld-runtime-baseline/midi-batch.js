(function(root){
  'use strict';
  async function run({plan,sourceRunId,readSource,runStep,cancelled,onStep}) {
    const completed=[];
    for(let index=0;index<plan.length;index++) {
      if(cancelled())return {ok:false,error:'analysis-cancelled',completed};
      const source=await readSource();
      if(cancelled())return {ok:false,error:'analysis-cancelled',completed};
      if(!source?.ok || source.runId!==sourceRunId)return {ok:false,error:'midi-batch-source-changed',completed};
      onStep(index+1,plan.length,plan[index]);
      if(cancelled())return {ok:false,error:'analysis-cancelled',completed};
      let response;
      try {response=await runStep(plan[index]);}catch(error){response={ok:false,error:'request-failed',detail:String(error)};}
      if(!response?.ok)return {...response,ok:false,completed,step:plan[index]};
      completed.push(plan[index]);
    }
    if(cancelled())return {ok:false,error:'analysis-cancelled',completed};
    const source=await readSource();
    if(cancelled())return {ok:false,error:'analysis-cancelled',completed};
    if(!source?.ok || source.runId!==sourceRunId)return {ok:false,error:'midi-batch-source-changed',completed};
    return {ok:true,completed};
  }
  const api={run};if(typeof module==='object' && module.exports)module.exports=api;
  root.XldMidiBatch=api;
})(globalThis);
