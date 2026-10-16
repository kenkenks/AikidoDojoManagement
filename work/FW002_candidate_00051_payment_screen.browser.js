// Temporary Console verification. Review before execution; local tests use mocks only.
// Recheck candidate=00051-hil, Ready=True, digest=63557aecb3106e97d87cc777eaed4ed6ecba891f1a871b1b4002d9c34bb9517b.
// Normal traffic must remain 00049-dur 100%. Use an existing Firebase admin login.
(async () => {
  'use strict';
  const BASE='https://candidate---dojo-time-travel-admin-q6ujypei6a-an.a.run.app';
  const BASELINE_DAY='2026-10-26';
  // 2026-10-16 JST確認: 月曜午前に2人目の有効出席が追加されたため、
  // Firestore原本とReader実測（出席会員2・ATTENDED_UNPAID 2）へ厳密に再ベースラインした。
  const SCOPES=[
    {name:'MONDAY_MORNING',location:'HONBU',block:'B_KYO_MON_1030_1230',attendance:2,exceptions:2},
    {name:'NO_ATTENDANCE_SCOPE',location:'HONBU',block:'B_KYO_FRI_1030_1230',attendance:0,exceptions:0}
  ];
  let stage='BROWSER_CONTEXT',failure='CONTEXT_REQUIRED';
  const emit=(result,reason)=>console.log(JSON.stringify({result,reason}));
  const check=v=>{if(!v)throw Error('CHECK_FAILED');};
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const money=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
  const count=v=>Number.isSafeInteger(v)&&v>=0;
  const id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(v);
  const close=(a,b)=>Math.abs(a-b)<=Math.max(1e-8,Number.EPSILON*8*Math.max(Math.abs(a),Math.abs(b)));
  try {
    check(location.href==='https://dojo-management-dev.web.app/qr/qr_generator.html');
    check(typeof RUNTIME_CONFIG!=='undefined'&&RUNTIME_CONFIG.target==='dev-firebase'&&RUNTIME_CONFIG.firebase?.projectId==='dojo-management-dev');
    const api=typeof dojoApiClient!=='undefined'?dojoApiClient:null;
    const auth=typeof firebaseAuthClient!=='undefined'?firebaseAuthClient:null;
    check(api&&typeof api.request==='function'&&auth&&typeof auth.getCurrentUser==='function');
    failure='AUTH_SESSION_REQUIRED';await auth.ready;check(!!auth.getCurrentUser());
    async function get(name,params){
      stage=name;failure='COMMUNICATION_OR_AUTH_ERROR';
      const url=new URL('/api/webconnect',BASE);
      for(const [key,value]of Object.entries(params))url.searchParams.set(key,value);
      // Existing client obtains/attaches the token internally and refreshes once on 401.
      // No getIdToken call, token logging, account change, or independent retry here.
      const response=await api.request(url.href,{method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30000)});
      failure=response.status===401?'HTTP_401_AUTHENTICATION_ERROR':response.status===403?'HTTP_403_PERMISSION_ERROR':
        response.status===503?'HTTP_503_CAUSE_UNCONFIRMED':Number.isInteger(response.status)?'HTTP_'+response.status+'_ERROR':'HTTP_ERROR';
      if(response.status===409){
        let body;try{body=await response.json();}catch{}
        failure=body?.error==='RECEPTION_MIGRATION_REQUIRED'?'HTTP_409_MIGRATION_REQUIRED':
          body?.error==='RECEPTION_SOURCE_CONFLICT'?'HTTP_409_SOURCE_CONFLICT':'HTTP_409_UNCLASSIFIED';
      }
      check(response.status===200);failure='HTTP_200_RESPONSE_FORMAT_ERROR';const body=await response.json();
      check(object(body));failure='HTTP_200_BUSINESS_RESULT_ERROR';check(body.ok===true);return body;
    }
    const clock=await get('SYSTEM_CONTEXT',{action:'system_context'});
    failure='HTTP_200_CLOCK_DATA_ERROR';
    check(clock.timezone==='Asia/Tokyo'&&typeof clock.time_travel_enabled==='boolean'&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(clock.system_now||''));
    const instant=new Date(clock.system_now.replace(' ','T')+'+09:00');
    check(Number.isFinite(instant.getTime())&&new Date(instant.getTime()+9*3600000).toISOString().slice(0,19)===clock.system_now.replace(' ','T'));
    check(/^\d{4}-(0[1-9]|1[0-2])$/.test(clock.target_month||''));
    const day=clock.system_now.slice(0,10);
    let firstLists;
    emit('PASS','SYSTEM_CONTEXT:HTTP_200_VALID_BUSINESS_DAY');
    for(const scope of SCOPES){
      const screen=await get(scope.name,{action:'payment_screen_read',reception_date:day,location_id:scope.location,billing_block_id:scope.block,payment_method:'PAYPAY'});
      failure='HTTP_200_SCREEN_DTO_ERROR';
      check(object(screen.summary)&&object(screen.confirmed)&&object(screen.posted));
      const b=screen.summary;check(b.ok===true);
      const allIds=new Set();
      for(const [key,status]of [['confirmed','CONFIRMED'],['posted','POSTED']]){
        const list=screen[key];
        check(list.ok===true&&list.success===true&&list.target_month===clock.target_month&&list.payment_method==='PAYPAY'&&
          Array.isArray(list.statuses)&&list.statuses.length===1&&list.statuses[0]===status&&
          list.location_id===''&&list.billing_block_id===''&&Array.isArray(list.evidences)&&count(list.count)&&
          list.count===list.evidences.length&&money(list.total_amount));
        let total=0;
        for(const e of list.evidences){
          check(object(e)&&id(e.evidence_id)&&!allIds.has(e.evidence_id)&&id(e.invoice_id)&&id(e.member_id)&&id(e.billing_group_id)&&id(e.plan_id)&&
            e.target_month===clock.target_month&&e.status===status&&e.payment_method==='PAYPAY'&&money(e.amount)&&e.amount>0&&
            typeof e.member_name==='string'&&typeof e.label==='string'&&typeof e.payment_method_label==='string'&&
            typeof e.evidence_code==='string'&&e.evidence_code.length>0&&typeof e.reception_date==='string'&&
            typeof e.requested_at==='string'&&e.requested_at.length>0&&typeof e.confirmed_at==='string'&&e.confirmed_at.length>0&&
            typeof e.posted_at==='string'&&typeof e.payment_log_id==='string'&&typeof e.location_id==='string'&&typeof e.billing_block_id==='string'&&typeof e.remarks==='string');
          check(status==='POSTED'?e.posted_at.length>0&&id(e.payment_log_id):e.posted_at===''&&e.payment_log_id==='');
          allIds.add(e.evidence_id);total+=e.amount;
        }
        check(close(total,list.total_amount));
        emit('PASS',scope.name+':'+key.toUpperCase()+'_LIST_DTO_AND_ARITHMETIC_MATCHED');
        if(list.count===0)emit('未確認',scope.name+':'+key.toUpperCase()+'_CLASSIFICATION_SORT_AND_FILTERS_NO_EVIDENCE');
        else emit('未確認',scope.name+':'+key.toUpperCase()+'_SOURCE_DATETIME_PRECISION_AND_FILTER_COMPLETENESS_NOT_PROVEN_BY_DTO');
      }
      if(firstLists){
        const ids=list=>list.evidences.map(e=>e.evidence_id);
        check(JSON.stringify(ids(firstLists.confirmed))===JSON.stringify(ids(screen.confirmed))&&
          JSON.stringify(ids(firstLists.posted))===JSON.stringify(ids(screen.posted)));
        emit('PASS','EVIDENCE_LIST_IDS_MATCH_ACROSS_RECEPTION_SCOPES');
      }else firstLists=screen;
      failure='HTTP_200_DTO_FIELDS_MISSING_OR_INVALID';
      check(b.reception_date===day&&b.location_id===scope.location&&b.billing_block_id===scope.block);
      for(const key of ['cash_total','paypay_total','other_total','total_amount','expected_total','outstanding_total'])check(money(b[key]));
      check(count(b.payment_count)&&count(b.attendance_member_count)&&Array.isArray(b.payments)&&Array.isArray(b.reconciliation_items));
      for(const p of b.payments)check(object(p)&&id(p.payment_id)&&id(p.member_id)&&id(p.billing_group_id)&&typeof p.member_name==='string'&&
        typeof p.invoice_id==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(p.target_month||'')&&p.target_month===day.slice(0,7)&&
        typeof p.payment_method==='string'&&p.payment_method.length>0&&typeof p.payment_method_label==='string'&&typeof p.paid_at==='string'&&money(p.amount));
      for(const r of b.reconciliation_items)check(object(r)&&['ATTENDED_UNPAID','PAID_WITHOUT_ATTENDANCE'].includes(r.status)&&typeof r.label==='string'&&id(r.billing_group_id)&&money(r.amount)&&
        Array.isArray(r.member_ids)&&r.member_ids.length>0&&r.member_ids.every(id)&&new Set(r.member_ids).size===r.member_ids.length&&
        Array.isArray(r.member_names)&&r.member_names.length===r.member_ids.length&&r.member_names.every(n=>typeof n==='string'));
      failure='HTTP_200_DATA_CHECK_ERROR';
      check(b.payment_count===b.payments.length&&new Set(b.payments.map(p=>p.payment_id)).size===b.payment_count);
      const sum=rows=>rows.reduce((n,r)=>n+r.amount,0);
      check(close(b.cash_total+b.paypay_total+b.other_total,b.total_amount)&&close(sum(b.payments),b.total_amount));
      check(close(sum(b.payments.filter(p=>p.payment_method==='CASH')),b.cash_total)&&close(sum(b.payments.filter(p=>p.payment_method==='PAYPAY')),b.paypay_total));
      check(close(sum(b.payments.filter(p=>!['CASH','PAYPAY'].includes(p.payment_method))),b.other_total));
      const unpaid=b.reconciliation_items.filter(r=>r.status==='ATTENDED_UNPAID');
      check(close(sum(unpaid),b.expected_total)&&close(b.expected_total,b.outstanding_total));
      check(new Set(b.reconciliation_items.map(r=>r.status+'|'+r.billing_group_id)).size===b.reconciliation_items.length);
      check(unpaid.every(r=>r.amount>0)&&new Set(unpaid.flatMap(r=>r.member_ids)).size<=b.attendance_member_count);
      for(const r of b.reconciliation_items.filter(r=>r.status==='PAID_WITHOUT_ATTENDANCE')){
        const rows=b.payments.filter(p=>p.billing_group_id===r.billing_group_id);
        check(rows.length>0&&close(r.amount,sum(rows)));
      }
      if(b.payment_count===0)check(b.total_amount===0&&b.cash_total===0&&b.paypay_total===0&&b.other_total===0);
      emit('PASS',scope.name+':HTTP_200_DTO_SCOPE_AND_ARITHMETIC_MATCHED');
      if(day===BASELINE_DAY){
        const expected={payment_count:0,attendance_member_count:scope.attendance,
          reconciliation_count:scope.exceptions,attended_unpaid_count:scope.exceptions};
        const actual={payment_count:b.payment_count,attendance_member_count:b.attendance_member_count,
          reconciliation_count:b.reconciliation_items.length,attended_unpaid_count:unpaid.length};
        failure='HTTP_200_PREFLIGHT_BASELINE_MISMATCH_OR_DATA_CHANGED expected='+JSON.stringify(expected)+' actual='+JSON.stringify(actual);
        check(b.payment_count===0&&b.attendance_member_count===scope.attendance&&b.reconciliation_items.length===scope.exceptions);
        check(scope.attendance===0?b.expected_total===0:unpaid.length===scope.exceptions);
        emit('PASS',scope.name+':PREFLIGHT_ATTENDANCE_EXCEPTION_AND_ZERO_PAYMENT_MATCHED');
      }else emit('未確認',scope.name+':BUSINESS_DAY_CHANGED_PREFLIGHT_COUNTS_NOT_COMPARABLE');
      if(b.payment_count===0)emit('未確認',scope.name+':NONZERO_PAYMENT_METHOD_COVERAGE_UNAVAILABLE');
    }
    emit('未確認','SOURCE_RECORDS_VIEW_FRESHNESS_AND_LEGACY_RECOVERY_NOT_INDEPENDENTLY_PROVEN_BY_DTO');
  } catch {
    emit('FAIL',stage+':'+failure);
  }
})();
