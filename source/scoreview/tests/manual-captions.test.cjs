const {test}=require('node:test'),assert=require('node:assert/strict');
const {mergeManual}=require('../adapter/captions.cjs'),{modelFrom}=require('../adapter/track-model.cjs');
test('manual intervals replace whole overlapping rules, boundary-touching rules remain',()=>{
 const rule=[[0,6,'before','rule'],[6,12,'overlap','rule'],[12,18,'after','rule']];
 const r=mergeManual(rule,[{start:6,end:12,text:'written'}]);assert.deepEqual(r,[[0,6,'before','rule'],[6,12,'written','manual'],[12,18,'after','rule']]);assert.equal(rule[1][2],'overlap');
});
test('manual captions are drawn even when the notes produce no automatic caption',()=>{
 const r=modelFrom({track:{id:'song'},stems:{piano:{notes:[{start:0,end:2,pitch:60,velocity:100}]}},manualCaptions:[{start:0,end:1,text:'文字 <script>literal</script>'}]});assert(r.ok);assert(r.model.captions.some(c=>c[2].includes('<script>')&&c[3]==='manual'));
});
