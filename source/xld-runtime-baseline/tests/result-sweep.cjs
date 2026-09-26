'use strict';
// The cross-library inventory the owner judges from before deleting. What matters is that the number it sorts by
// actually separates a noisy segmentation from a clean one, and that nothing it cannot read disappears from view.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {createResultSweep,measure,FRAGMENT_SECONDS,fragmentSecondsFor}=require('../core/result-sweep.cjs');
const KINDS={msaf:'section','msaf-sf':'section',songformer:'section','chord-chordmini':'harmony'};
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'xld-result-sweep-'));
 try{
  const sweep=createResultSweep({engineKinds:KINDS});
  const track=async(name,files)=>{
   const directory=path.join(root,name);await fs.mkdir(directory,{recursive:true});
   for(const [file,body] of Object.entries(files))await fs.writeFile(path.join(directory,file),typeof body==='string'?body:JSON.stringify(body));
   return {trackId:name,title:name,album:'Album',directory};
  };
  const spans=list=>({schemaVersion:1,kind:'sections',duration:100,segments:list.map(([start,end],i)=>({start,end,label:'S'+i}))});

  // --- the measure ------------------------------------------------------------------------------------------
  // A fragment means a defect only for the kind it is measured on. Chord results on the real library run 247-255
  // spans with 86-105 under two seconds and shortest spans near 0.5s — all healthy. One shared threshold would
  // sort every chord result above every noisy segmentation in a list whose whole job is worst-first.
  assert.deepEqual(FRAGMENT_SECONDS,{section:2,harmony:0.25});
  assert.equal(fragmentSecondsFor('section'),2);assert.equal(fragmentSecondsFor('harmony'),0.25);assert.equal(fragmentSecondsFor('other'),2);
  const chordLike={duration:100,chords:Array.from({length:60},(_,i)=>({start:i*1.6,end:(i+1)*1.6,label:'C'}))};
  assert.equal(measure(chordLike,'section').fragments,60,'every 1.6s span would be a fragment on the section scale');
  assert.equal(measure(chordLike,'harmony').fragments,0,'and none of them is on the chord scale');
  const noisy=measure(spans([[0,0.04],[0.04,1],[1,1.5],[1.5,2.4],[2.4,60],[60,99],[99,100]]));
  const clean=measure(spans(Array.from({length:8},(_,i)=>[i*12.5,(i+1)*12.5])));
  // The real case this exists for (02 Les Enfants du Paradis): the noisy result has FEWER boundaries than the
  // clean one, so counting segments calls it the tidier of the two. Fragments are what tell them apart.
  assert(noisy.segments<clean.segments,'7 segments against 8: by count the noisy one looks cleaner');
  assert.equal(noisy.fragments,5,JSON.stringify(noisy));
  assert.equal(clean.fragments,0);
  assert.equal(Math.round(noisy.shortest*100),4);
  assert.equal(noisy.coverage,1);assert.equal(clean.coverage,1);
  // Coverage does not discriminate — both are 100% — which is exactly why the sort does not use it.
  assert.equal(noisy.coverage,clean.coverage);
  assert.deepEqual(measure({segments:[]}),{segments:0,measured:0,shortest:null,longest:null,fragments:0,fragmentSeconds:2,duration:null,coverage:null,meanConfidence:null,labels:[],spans:[]});
  assert.equal(measure({}),null,'a body with no spans at all is not a measurement');
  assert.equal(measure(null),null);
  // Chord results carry the same span shape plus a confidence, and are measured the same way.
  const chords=measure({duration:10,chords:[{start:0,end:4,label:'C',confidence:0.9},{start:4,end:10,label:'Am',confidence:0.5}]});
  assert.equal(chords.segments,2);assert.equal(chords.meanConfidence,0.7);
  assert.deepEqual(chords.labels,['C','Am']);
  // Spans that are backwards or non-numeric are not measured, but they are still counted as present.
  const broken=measure({duration:10,segments:[{start:5,end:1},{start:'x',end:2},{start:0,end:3}]});
  assert.equal(broken.segments,3);assert.equal(broken.measured,1,JSON.stringify(broken));
  assert.deepEqual(broken.spans,[[0,3]],'only measurable spans are drawn');

  // --- the scan ---------------------------------------------------------------------------------------------
  const tracks=[
   await track('noisy',{'msaf.json':spans([[0,0.04],[0.04,1],[1,1.5],[1.5,60],[60,100]]),'songformer.json':spans([[0,50],[50,100]])}),
   await track('tidy',{'msaf.json':spans([[0,40],[40,100]])}),
   await track('failed',{'msaf.error.json':{error:'boom'}}),
   await track('corrupt',{'msaf.json':'{not json'}),
   await track('empty',{}),
   await track('other',{'chord-chordmini.json':{duration:10,chords:[{start:0,end:10,label:'C'}]},'unrelated.json':{x:1}})
  ];
  tracks.push({trackId:'gone',title:'gone',album:'Album',directory:path.join(root,'does-not-exist')});
  const {rows,warnings}=await sweep.scan(tracks);
  assert.deepEqual(warnings,[],'a missing directory is not a warning, it is just nothing');
  const key=row=>row.trackId+'/'+row.engine;
  // Worst first.
  assert.equal(rows[0].trackId,'noisy','the noisiest segmentation sorts to the top: '+JSON.stringify(rows.map(r=>[key(r),r.fragments])));
  assert.equal(rows[0].engine,'msaf');
  assert.equal(rows[0].fragments,3);
  assert(rows.findIndex(r=>r.trackId==='tidy')>0);
  // Everything present is listed, including what could not be parsed and what failed.
  assert.deepEqual(new Set(rows.map(key)),new Set(['noisy/msaf','noisy/songformer','tidy/msaf','failed/msaf','corrupt/msaf','other/chord-chordmini']));
  assert.equal(rows.find(r=>r.trackId==='failed').state,'failed');
  assert(rows.find(r=>r.trackId==='corrupt').unreadable,'an unreadable result stays visible: being unreadable is a reason to delete it');
  assert.equal(rows.find(r=>r.trackId==='other').kind,'harmony');
  // An engine that is not in the registry is never listed, whatever files exist beside it.
  assert(!rows.some(r=>r.engine==='unrelated'));
  // Filtering to one engine is what the "show me every MSAF segmentation" view does.
  const onlyMsaf=await sweep.scan(tracks,{engines:['msaf']});
  assert.deepEqual(new Set(onlyMsaf.rows.map(r=>r.trackId)),new Set(['noisy','tidy','failed','corrupt']));
  assert(onlyMsaf.rows.every(r=>r.engine==='msaf'));
  // Rows carry what a person needs to decide, and what the deletion needs to act.
  for(const row of rows) {
   assert(row.trackId&&row.engine&&row.kind&&row.state,JSON.stringify(row));
   assert(!('file' in row)||typeof row.file==='string');
  }
  assert(rows.find(r=>r.trackId==='tidy').bytes>0);
  assert(Number.isFinite(rows.find(r=>r.trackId==='tidy').modifiedMs));

  // --- a directory that cannot be listed is reported, not silently emptied ------------------------------------
  const realReaddir=fs.readdir;
  fs.readdir=async(...args)=>{if(String(args[0]).endsWith('tidy')){const error=Error('EPERM');error.code='EPERM';throw error;}return realReaddir(...args);};
  const guarded=await sweep.scan(tracks,{engines:['msaf']});
  fs.readdir=realReaddir;
  assert.deepEqual(guarded.warnings.map(w=>w.trackId),['tidy'],'an unreadable directory is a warning: '+JSON.stringify(guarded.warnings));
  assert(!guarded.rows.some(r=>r.trackId==='tidy'),'and its rows are absent rather than invented');

  console.log('result sweep: ok (fragments discriminate where coverage and segment count do not; unreadable and failed results stay visible; unlisted directories warn)');
 }finally{await fs.rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
