'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createFirestoreProgressReader} = require('../cloud/attendance/progress-firestore.cjs');
function mock({attendance=[], member={member_id:'M1',status:'有効',current_rank:'成人一級'}, standards=[{'現在級段位':'成人一級','次回審査級段位':'成人初段','必要稽古数':3,'進捗表示対象':true,'状態':'有効'}], ranks=[{'表示名':'成人一級',rank_id:'R1','表示順':10,'状態':'有効'}]}={}) {
  const calls=[];
  const core={readById:async()=>member,queryEqual:async(s,f,o)=>{calls.push({s,f,o});return attendance;},
    readPage:async({collection})=>({documents:(collection==='ranks'?ranks:standards).map(fields=>({fields})),nextPageToken:null})};
  return {core,calls};
}
test('reads member-scoped history and logical-schema masters, then projects GAS fields',async()=>{
  const {core,calls}=mock({attendance:[{member_id:'M1','稽古日':'2026-10-01',slot_id:'A','状態':'有効'}]});
  const result=await createFirestoreProgressReader(core)('M1');
  assert.equal(result.training_count,1);assert.equal(result.required_training_count,3);
  assert.equal(result.next_rank,'成人初段');assert.equal(result.current_rank_id,'R1');
  assert.deepEqual(calls[0].f,[{field:'member_id',value:'M1'}]);assert.equal(calls[0].o.limit,500);
});
test('missing standard never fabricates eligibility',async()=>{
  const result=await createFirestoreProgressReader(mock({standards:[]}).core)('M1');
  assert.equal(result.examination_ready,false);assert.equal(result.required_training_count,0);
});
test('incomplete history fails closed',async()=>{
  await assert.rejects(createFirestoreProgressReader(mock({attendance:Array(500).fill({})}).core)('M1'),/INCOMPLETE/);
});
test('invalid identity and duplicate active master fail closed',async()=>{
  const {core}=mock();const read=createFirestoreProgressReader(core);
  await assert.rejects(read('../M1'),/INVALID_PROGRESS_MEMBER_ID/);
  const dupe=mock({standards:[{'現在級段位':'成人一級'},{'現在級段位':'成人一級'}]});
  await assert.rejects(createFirestoreProgressReader(dupe.core)('M1'),/DUPLICATE/);
});
test('master pagination loop and cap fail closed',async()=>{
  const {core}=mock();core.readPage=async()=>({documents:[],nextPageToken:'loop'});
  await assert.rejects(createFirestoreProgressReader(core)('M1'),/PAGINATION_LOOP/);
});
