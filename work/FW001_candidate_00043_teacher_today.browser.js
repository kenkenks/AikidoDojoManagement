// Temporary, human-reviewed Console verification. Does not run until pasted/executed.
// Recheck candidate tag -> dojo-time-travel-admin-00043-wuh before running.
// Use an EXISTING login. This script neither changes roles nor signs in/out.
(async () => {
  'use strict';
  const EXPECTED_ACCESS='allow'; // 'deny' only with a known existing ordinary-member/inactive-teacher session.
  const BASE='https://candidate---dojo-time-travel-admin-q6ujypei6a-an.a.run.app';
  const LOCATION='HONBU',BLOCK='B_KYO_MON_1030_1230';
  let item='context',status=null,phase='CONTEXT';
  const check=x=>{if(!x)throw Error('CHECK_FAILED');};
  const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
  const text=x=>typeof x==='string';
  const number=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
  const uniqueStrings=x=>Array.isArray(x)&&x.every(v=>text(v)&&v.trim().length>0)&&new Set(x).size===x.length;
  const emit=(result,checks)=>console.log(JSON.stringify({item,httpStatus:status,result,checks}));
  // request() returns Response, adds the existing Firebase bearer header, and
  // retries once after a 401 token refresh. No independent retry loop is added.
  const api=typeof dojoApiClient!=='undefined'?dojoApiClient:
    typeof firebaseAttendanceApi!=='undefined'?firebaseAttendanceApi:null;
  const auth=typeof firebaseAuthClient!=='undefined'?firebaseAuthClient:
    typeof firebaseAttendanceAuth!=='undefined'?firebaseAttendanceAuth:null;
  async function get(name,path){
    item=name;status=null;phase='COMMUNICATION_OR_AUTH';
    const url=new URL(path,BASE);check(url.origin===BASE&&url.pathname.startsWith('/api/'));
    const response=await api.request(url.href,{method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)});
    status=response.status;phase='HTTP';return response;
  }
  async function body(response){check(response.status===200);phase='DATA_CHECK';const b=await response.json();check(object(b)&&b.ok===true);return b;}
  function validate(b,date,block){
    check(b.attendance_date===date&&b.location_id===LOCATION&&b.billing_block_id===block);
    check(Number.isInteger(b.member_count)&&b.member_count>=0&&Array.isArray(b.attendance_items)&&b.member_count===b.attendance_items.length);
    check(new Set(b.attendance_items.map(r=>r?.member_id)).size===b.member_count);
    for(const r of b.attendance_items){
      check(object(r)&&text(r.member_id)&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(r.member_id));
      check(text(r.member_name)&&text(r.current_rank)&&text(r.next_rank)&&number(r.rank_sort_order));
      check(number(r.training_count)&&number(r.required_training_count)&&typeof r.examination_ready==='boolean');
      check(['会員個別','審査基準マスタ','未設定'].includes(r.required_training_count_source));
      const remaining=r.required_training_count>0?Math.max(r.required_training_count-r.training_count,0):null;
      check(r.remaining_training_count===remaining&&r.examination_ready===(r.required_training_count>0&&remaining===0));
      check(uniqueStrings(r.slot_ids)&&uniqueStrings(r.statuses)&&!r.statuses.includes('取消'));
    }
  }
  try{
    check(location.origin==='https://dojo-management-dev.web.app');
    check(typeof RUNTIME_CONFIG!=='undefined'&&RUNTIME_CONFIG.target==='dev-firebase'&&RUNTIME_CONFIG.firebase.projectId==='dojo-management-dev');
    check(['allow','deny'].includes(EXPECTED_ACCESS)&&api&&typeof api.request==='function'&&auth);
    phase='COMMUNICATION_OR_AUTH';await auth.ready;check(!!auth.getCurrentUser());
    const clock=await body(await get('Business clock','/api/webconnect?action=system_context'));
    check(clock.timezone==='Asia/Tokyo'&&typeof clock.time_travel_enabled==='boolean'&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(clock.system_now));
    const day=clock.system_now.slice(0,10),instant=new Date(clock.system_now.replace(' ','T')+'+09:00');
    check(Number.isFinite(instant.getTime())&&new Date(instant.getTime()+9*3600000).toISOString().slice(0,19)===clock.system_now.replace(' ','T'));
    emit('PASS',{businessClockValid:true});
    // Date deliberately omitted: verify server SystemContext default, not a client override.
    const response=await get('Teacher overview access','/api/webconnect?'+new URLSearchParams({action:'teacher_attendance_today',location_id:LOCATION}));
    if(EXPECTED_ACCESS==='deny'){
      check(status===403);emit('PASS',{expectedAccessDenied:true});return;
    }
    const all=await body(response);validate(all,day,'');
    emit('PASS',{authorizedRead:true,businessDateMatched:true,dojoEchoMatched:true,listDtoValid:true,noCancelledStatusReturned:true});
    if(all.member_count===0){item='Nonempty/cancelled data coverage';emit('未確認',{reason:'EMPTY_LIST_NO_ROW_EVIDENCE'});}
    const filtered=await body(await get('Billing block overview','/api/webconnect?'+new URLSearchParams({action:'teacher_attendance_today',location_id:LOCATION,billing_block_id:BLOCK,attendance_date:day})));
    validate(filtered,day,BLOCK);
    const ids=new Set(all.attendance_items.map(r=>r.member_id));
    check(filtered.attendance_items.every(r=>ids.has(r.member_id)));
    for(const row of filtered.attendance_items){
      const parent=all.attendance_items.find(r=>r.member_id===row.member_id);
      check(row.slot_ids.every(id=>parent.slot_ids.includes(id))&&row.statuses.every(s=>parent.statuses.includes(s)));
    }
    emit('PASS',{explicitDateAndBlockEchoMatched:true,listDtoValid:true,subsetConsistent:true,noCancelledStatusReturned:true});
    item='Coverage';status=null;
    emit('未確認',{cancelledSourceRecordExclusionProven:false,otherLoginRolesTested:false,
      reason:'RESPONSE_CANNOT_PROVE_SOURCE_CANCELLED_ROWS_OR_OTHER_USER_ROLES'});
  }catch{emit('FAIL',{failureType:phase,stopped:true});}
})();
