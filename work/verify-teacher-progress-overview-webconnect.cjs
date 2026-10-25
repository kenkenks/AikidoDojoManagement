'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const {createAdminApi}=require('../cloud/api/admin-api.cjs');
const {createDispatch}=require('../cloud/api/webConnect.cjs');

const DTO={ok:true,member_count:1,progress_items:[{member_id:'M1',training_count:3,required_training_count:5}]};
function fixture({admin=false,teacher=false,active=true,linked=true,fail=false}={}){
  let reads=0;
  const handle=createAdminApi({
    verifyIdToken:async token=>{if(token==='bad')throw Error('BAD_TOKEN');return {uid:'U1',admin};},
    getSystemContext:async()=>({}),getTimeTravel:async()=>({}),saveTimeTravel:async()=>{},
    readMember:async()=>null,readMembers:async()=>[],
    resolveDojoPrincipal:async()=>!linked?null:teacher?{teacher_id:'T1'}:{member_id:'M1'},
    isActiveTeacher:async()=>active,
    readTeacherAttendanceProgress:async()=>{reads++;if(fail)throw Error('READ_FAILED');return DTO;},
    readAttendanceProgressSummary:async id=>({ok:true,member_id:id})
  });
  const dispatch=createDispatch(handle);
  return {call:(authorization,input={action:'teacher_attendance_progress'})=>dispatch({action:'teacher_attendance_progress',input,context:{authorization}}),
    single:(authorization,input)=>dispatch({action:'attendance_progress_summary',input,context:{authorization}}),get reads(){return reads;}};
}

test('active teacher principal and admin receive the unchanged batch DTO',async()=>{
  for(const options of [{teacher:true},{admin:true}]){
    const api=fixture(options),response=await api.call('Bearer user');
    assert.equal(response.status,200);assert.deepEqual(response.body,DTO);assert.equal(api.reads,1);
  }
});
test('member, unlinked/disabled teacher and unauthenticated caller are rejected before reading',async()=>{
  for(const [options,authorization,status] of [[{},'Bearer user',403],[{linked:false},'Bearer user',403],
    [{teacher:true,active:false},'Bearer user',403],[{},null,401],[{},'Bearer bad',401]]){
    const api=fixture(options),response=await api.call(authorization);
    assert.equal(response.status,status);assert.equal(api.reads,0);
  }
});
test('client teacher_id and role never grant access or reach the reader',async()=>{
  const member=fixture();
  assert.equal((await member.call('Bearer user',{action:'teacher_attendance_progress',teacher_id:'T1',role:'teacher'})).status,403);
  assert.equal(member.reads,0);
  const teacher=fixture({teacher:true});
  assert.equal((await teacher.call('Bearer user',{action:'teacher_attendance_progress',teacher_id:'T1'})).status,400);
  assert.equal(teacher.reads,0);
});
test('reader failure is closed and single-member progress remains available',async()=>{
  const failed=fixture({teacher:true,fail:true});
  assert.equal((await failed.call('Bearer user')).status,503);
  const member=fixture();
  const single=await member.single('Bearer user',{action:'attendance_progress_summary',member_id:'M1'});
  assert.equal(single.status,200);assert.deepEqual(single.body,{ok:true,member_id:'M1'});
});
