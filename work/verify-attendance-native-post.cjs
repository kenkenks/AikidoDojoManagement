const {test}=require('node:test');
const assert=require('node:assert/strict');
const {postAttendancePlan}=require('../shared/AttendanceNative.js');

function row(id, memberId='M1') {
  return {attendance_id:id,member_id:memberId,target_month:'2099-07'};
}

test('native post projects appended and cancelled attendance changes',()=>{
  const result={ok:true,message:'done'};
  const appended=[row('NEW1')];
  const cancelled=[row('OLD1')];
  const calls=[];
  const actual=postAttendancePlan(
    {result,rowsToAppend:appended,rowsToCancel:cancelled},
    {projectAttendances:change=>calls.push(change)}
  );
  assert.equal(actual,result);
  assert.equal(calls.length,1);
  assert.equal(calls[0].appended,appended);
  assert.equal(calls[0].cancelled,cancelled);
});

test('native post does not project a rejected plan',()=>{
  const result={ok:false,message:'bad'};
  let called=false;
  const actual=postAttendancePlan(
    {result,rowsToAppend:[row('NEW1')],rowsToCancel:[]},
    {projectAttendances:()=>{called=true;}}
  );
  assert.equal(actual,result);
  assert.equal(called,false);
});

test('native post requires projection contract for an accepted plan',()=>{
  assert.throws(
    ()=>postAttendancePlan({result:{ok:true},rowsToAppend:[],rowsToCancel:[]},{}),
    /ATTENDANCE_PROJECTION_REQUIRED/
  );
});
