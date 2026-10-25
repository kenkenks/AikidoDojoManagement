'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../shared/WebConnectCore.js');
const { createAdminApi } = require('../cloud/api/admin-api.cjs');
test('WebConnect contract maps TimeTrip GET and POST', () => {
  assert.deepEqual(core.route({method:'GET',action:'time_travel_admin'}), {operation:'timeTravel.read',input:null});
  assert.deepEqual(core.route({method:'POST',action:'time_travel_set',data:{enabled:false}}),
    {operation:'timeTravel.save',input:{enabled:false,now:'',target_month:''}});
  assert.deepEqual(core.route({method:'GET',action:'system_context'}), {operation:'systemContext.read',input:null});
  assert.equal(core.route({method:'GET',action:'missing'}),null);
});
test('Cloud Run TimeTrip uses shared WebConnect route, preserves auth and legacy URL', async () => {
  let saved;
  const api = createAdminApi({
    verifyIdToken: async token => ({uid:token,admin:token==='admin'}),
    getTimeTravel: async () => ({enabled:true}),
    getSystemContext: async () => ({ok:true,system_now:'2026-10-11 10:00:00',target_month:'2026-10',time_travel_enabled:false}),
    saveTimeTravel: async input => {saved=input; return {ok:true};},
    readMember: async () => null,
    readMembers: async () => []
  });
  const req = (url,method='GET',body=null,token='admin') => api({url,method,body,authorization:'Bearer '+token});
  assert.equal((await req('/api/system/admin/time-travel')).body.enabled,true);
  assert.equal((await req('/api/admin/time-travel')).body.enabled,true);
  assert.equal((await req('/api/system/admin/time-travel','GET',null,'user')).status,403);
  assert.equal((await req('/api/system/admin/time-travel','POST',{enabled:false,now:'2026-01-01'})).status,200);
  assert.deepEqual(saved,{enabled:false,now:'2026-01-01',target_month:''});
  assert.equal((await req('/api/system/admin/time-travel','DELETE')).status,405);
});

// Routing contract only: the Firebase handlers are not implemented by this test.
test('Attendance GET WebConnect contracts cover existing GAS actions', () => {
  const cases = {
    attendance_session_info:'attendance.sessionInfo',
    attendance_member_options:'attendance.memberOptions',
    member_attendance_state:'attendance.memberState',
    attendance_saved_state:'attendance.savedState',
    teacher_attendance_today:'attendance.teacherToday',
    teacher_attendance_progress:'attendance.teacherProgress',
    teacher_attendance_state:'attendance.teacherState',
    teacher_attendance_identity:'attendance.teacherIdentity',
    teacher_attendance_monthly_summary:'attendance.teacherMonthlySummary',
    attendance_progress_summary:'attendance.progressSummary',
    attendance_rank_options:'attendance.rankOptions',
    post_receipt:'attendance.postReceipt'
  };
  for (const [action,operation] of Object.entries(cases)) {
    const params={member_id:'M001',location_id:'L001'};
    assert.deepEqual(core.route({method:'GET',action,params}),{operation,input:params});
    assert.equal(core.route({method:'POST',action,data:{}}),null);
  }
});
test('Attendance POST WebConnect contracts retain existing payloads', () => {
  const payload={mode:'attendance_batch',attendance_items:[{member_id:'M001'}],request_id:'R001'};
  assert.deepEqual(core.route({method:'POST',action:'attendance_batch',data:payload}),
    {operation:'attendance.registerBatch',input:payload});
  const teacher={mode:'teacher_attendance_sync',teacher_id:'T001',selected_slot_ids:['S001']};
  assert.deepEqual(core.route({method:'POST',action:'teacher_attendance_sync',data:teacher}),
    {operation:'attendance.teacherSync',input:teacher});
  assert.equal(core.route({method:'GET',action:'attendance_batch'}),null);
  assert.equal(core.route({method:'POST',action:'unknown',data:{}}),null);
});
