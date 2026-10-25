'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const {performance}=require('node:perf_hooks');
const {createFirestoreProgressReader,createFirestoreProgressBatchReader}=require('../cloud/attendance/progress-firestore.cjs');

function fixture({memberCount=4,slotsPerMember=8,pageSize=100}={}){
  const ranks=[
    {id:'R1',fields:{rank_id:'R1','状態':'有効','表示名':'成人無級','表示順':1}},
    {id:'R2',fields:{rank_id:'R2','状態':'有効','表示名':'5級','表示順':2}}];
  const standards=[
    {id:'ES1',fields:{'状態':'有効','現在級段位':'成人無級','次回審査級段位':'5級','必要稽古数':20,'進捗表示対象':true}},
    {id:'ES2',fields:{'状態':'有効','現在級段位':'5級','次回審査級段位':'4級','必要稽古数':30,'進捗表示対象':true}}];
  const members=Array.from({length:memberCount},(_,index)=>{
    const id='M'+String(index+1).padStart(4,'0');
    return {id,fields:{member_id:id,member_name:'会員'+index,status:'在籍',current_rank:index%2?'5級':'成人無級',
      rank_start_date:'2026-01-01',carried_training_count:index%3}};
  });
  const attendances=[];
  for(let index=0;index<memberCount;index++)for(let slot=0;slot<slotsPerMember;slot++){
    const day=String(1+(slot%20)).padStart(2,'0'),id=members[index].id;
    attendances.push({id:`A_${index}_${slot}`,fields:{member_id:id,'稽古日':'2026-10-'+day,slot_id:'S'+slot,'状態':'確認済'}});
  }
  if(memberCount){
    attendances.push({id:'DUP',fields:{...attendances[0].fields}});
    attendances.push({id:'PENDING',fields:{member_id:members[0].id,'稽古日':'2026-10-21',slot_id:'PENDING','状態':'確認待ち'}});
  }
  const tables={members,attendances,examination_standards:standards,ranks},calls=[];
  const core={
    async readPage({collection},{pageToken}){calls.push(['readPage',collection]);const rows=tables[collection]||[],offset=pageToken?Number(pageToken):0;
      return {documents:rows.slice(offset,offset+pageSize),nextPageToken:offset+pageSize<rows.length?String(offset+pageSize):null};},
    async readById({collection},id){calls.push(['readById',collection]);return tables[collection].find(row=>row.id===id)?.fields||null;},
    async queryEqual({collection},filters){calls.push(['queryEqual',collection]);return tables[collection].map(row=>row.fields).filter(row=>filters.every(filter=>row[filter.field]===filter.value));}
  };
  return {core,calls,tables};
}
const extra=new Set(['progress_percent','forecast_status','forecast_label','forecast_reason','forecast_weeks','weekly_training_slots','recent_training_days','recent_training_slots']);
const baseDto=value=>Object.fromEntries(Object.entries(value).filter(([key])=>!extra.has(key)));

test('batch and member DTOs agree for multiple members and ranks',async()=>{
  const data=fixture({memberCount:6,slotsPerMember:8});
  const batch=await createFirestoreProgressBatchReader(data.core,{getSystemContext:async()=>({ok:true,timezone:'Asia/Tokyo',system_now:'2026-10-25 12:00:00'})})();
  assert.equal(batch.member_count,6);
  for(const item of batch.progress_items){
    const single=await createFirestoreProgressReader(data.core)(item.member_id);
    assert.deepEqual(baseDto(item),single);
    assert.equal(item.recorded_training_count,8);
    assert.equal(item.training_count,8+Number(item.carried_training_count));
    assert.equal(item.progress_percent,Math.round(item.training_count*100/item.required_training_count));
    assert.equal(item.remaining_training_count,item.required_training_count-item.training_count);
  }
  assert.deepEqual(new Set(batch.progress_items.map(item=>item.current_rank)),new Set(['成人無級','5級']));
  assert.deepEqual(new Set(batch.progress_items.map(item=>item.next_rank)),new Set(['5級','4級']));
});

test('large batch stays page-based without member-scoped reads',async t=>{
  const measurements=[];
  for(const size of [{members:250,slots:20},{members:400,slots:20}]){
    const data=fixture({memberCount:size.members,slotsPerMember:size.slots});
    const started=performance.now();
    const result=await createFirestoreProgressBatchReader(data.core,{getSystemContext:async()=>({ok:true,timezone:'Asia/Tokyo',system_now:'2026-10-25 12:00:00'})})();
    const elapsedMs=Number((performance.now()-started).toFixed(2));
    const pages=data.calls.filter(call=>call[0]==='readPage').length;
    assert.equal(result.member_count,size.members);
    assert.equal(data.calls.some(call=>call[0]==='readById'||call[0]==='queryEqual'),false);
    assert.equal(pages,Math.ceil(size.members/100)+Math.ceil((size.members*size.slots+2)/100)+2);
    measurements.push({members:size.members,attendance_records:size.members*size.slots+2,page_reads:pages,elapsed_ms:elapsedMs});
  }
  t.diagnostic(JSON.stringify(measurements));
});
