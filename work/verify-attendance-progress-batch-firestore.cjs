'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const {createFirestoreProgressReader,createFirestoreProgressBatchReader}=require('../cloud/attendance/progress-firestore.cjs');

const tables={
  members:[
    {id:'M1',fields:{member_id:'M1',member_name:'一郎',status:'在籍',current_rank:'成人無級',rank_start_date:'2026-01-02',carried_training_count:2}},
    {id:'M2',fields:{member_id:'M2',member_name:'二郎',status:'有効',current_rank:'成人無級'}},
    {id:'M3',fields:{member_id:'M3',member_name:'退会者',status:'退会',current_rank:'成人無級'}}],
  attendances:[
    {id:'A0',fields:{member_id:'M1','稽古日':'2026-01-01',slot_id:'S1','状態':'確認済'}},
    {id:'A1',fields:{member_id:'M1','稽古日':'2026-01-03',slot_id:'S1','状態':'確認済'}},
    {id:'A1D',fields:{member_id:'M1','稽古日':'2026-01-03',slot_id:'S1','状態':'確認済'}},
    {id:'A2',fields:{member_id:'M1','稽古日':'2026-01-04',slot_id:'S2','状態':'確認待ち'}},
    {id:'A3',fields:{member_id:'M2','稽古日':'2026-02-01',slot_id:'S1','状態':'確認済','稽古時間分':90}},
    {id:'A4',fields:{member_id:'M3','稽古日':'2026-02-01',slot_id:'S1','状態':'確認済'}}],
  examination_standards:[{id:'ES1',fields:{'状態':'有効','現在級段位':'成人無級','次回審査級段位':'5級','必要稽古数':5,'必要稽古日数':2,'進捗表示対象':true}}],
  ranks:[{id:'R1',fields:{rank_id:'R1','状態':'有効','表示名':'成人無級','表示順':1}}]
};
function coreFixture(pageSize=100){
  const calls=[];
  const core={
    async readPage({collection},{pageToken}){
      calls.push(['readPage',collection]);
      const offset=pageToken?Number(pageToken):0,rows=tables[collection]||[],docs=rows.slice(offset,offset+pageSize);
      return {documents:docs,nextPageToken:offset+pageSize<rows.length?String(offset+pageSize):null};
    },
    async readById({collection},id){calls.push(['readById',collection]);return (tables[collection]||[]).find(row=>row.id===id)?.fields||null;},
    async queryEqual({collection},filters){calls.push(['queryEqual',collection]);return (tables[collection]||[]).map(row=>row.fields).filter(row=>filters.every(filter=>row[filter.field]===filter.value));}
  };
  return {core,calls};
}

test('batch equals the existing per-member DTO and excludes inactive members',async()=>{
  const batchFixture=coreFixture();
  const batch=await createFirestoreProgressBatchReader(batchFixture.core)();
  assert.equal(batch.member_count,2);
  assert.deepEqual(batch.progress_items.map(item=>item.member_id),['M1','M2']);
  for(const item of batch.progress_items){
    const single=await createFirestoreProgressReader(coreFixture().core)(item.member_id);
    const {progress_percent,forecast_status,forecast_label,forecast_reason,forecast_weeks,weekly_training_slots,
      recent_training_days,recent_training_slots,...batchSummary}=item;
    assert.deepEqual(batchSummary,single);
    assert.equal(item.progress_percent,Math.min(100,Math.round(single.training_count*100/single.required_training_count)));
  }
});
test('pending rows are excluded, confirmed duplicates collapse, carry and rank start remain intact',async()=>{
  const result=await createFirestoreProgressBatchReader(coreFixture().core)();
  const first=result.progress_items[0];
  assert.equal(first.carried_training_count,2);
  assert.equal(first.recorded_training_count,1);
  assert.equal(first.training_count,3);
  assert.equal(first.training_days,1);
  assert.equal(first.remaining_training_count,2);
  assert.deepEqual(first.recent_attendance_dates,['2026-01-03']);
});
test('missing standards and ranks preserve the existing zero/default contract',async()=>{
  const savedStandards=tables.examination_standards,savedRanks=tables.ranks;
  tables.examination_standards=[];tables.ranks=[];
  try{
    const result=await createFirestoreProgressBatchReader(coreFixture().core)();
    assert.equal(result.progress_items[0].required_training_count,0);
    assert.equal(result.progress_items[0].remaining_training_count,null);
    assert.equal(result.progress_items[0].current_rank_id,'');
  }finally{tables.examination_standards=savedStandards;tables.ranks=savedRanks;}
});
test('storage reads are collection-page based and do not grow with member count',async()=>{
  const fixture=coreFixture();
  await createFirestoreProgressBatchReader(fixture.core)();
  assert.equal(fixture.calls.filter(call=>call[0]==='readById'||call[0]==='queryEqual').length,0);
  assert.deepEqual(fixture.calls,[['readPage','members'],['readPage','attendances'],['readPage','examination_standards'],['readPage','ranks']]);
});
test('system business date drives forecast without adding member-scoped reads',async()=>{
  const fixture=coreFixture();
  const result=await createFirestoreProgressBatchReader(fixture.core,{getSystemContext:async()=>({ok:true,timezone:'Asia/Tokyo',system_now:'2026-03-15 12:00:00'})})();
  assert.equal(result.progress_items[0].forecast_label,'算出不可');
  assert.equal(fixture.calls.filter(call=>call[0]==='readById'||call[0]==='queryEqual').length,0);
});
test('pagination is supported without per-member queries',async()=>{
  const fixture=coreFixture(1);
  const result=await createFirestoreProgressBatchReader(fixture.core)();
  assert.equal(result.member_count,2);
  assert.equal(fixture.calls.some(call=>call[0]==='queryEqual'),false);
});
