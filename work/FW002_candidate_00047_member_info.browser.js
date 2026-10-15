// Temporary human-reviewed Console script; no live execution by local test tools.
// Before running: candidate=00047-mok, Ready=True, approved digest, normal=00045-jaw 100%.
// Use a known existing admin session. Change EXPECTED_ACCESS only to test an
// existing non-admin login; never change account roles or infer identity from URLs.
(async () => {
  'use strict';
  const EXPECTED_ACCESS = 'admin'; // 'admin' or 'non_admin'
  const BASE = 'https://candidate---dojo-time-travel-admin-q6ujypei6a-an.a.run.app';
  const MEMBER = 'M001';
  let item = 'Browser context', status = null, phase = 'BROWSER_CONTEXT';
  const emit = (result, checks) => console.log(JSON.stringify({item,httpStatus:status,result,checks}));
  const check = v => { if (!v) throw Error('CHECK_FAILED'); };
  const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const money = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  const count = v => Number.isSafeInteger(v) && v >= 0;
  const id = v => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(v);
  const close = (a,b) => Math.abs(a-b) <= Math.max(1e-8,Number.EPSILON*8*Math.max(Math.abs(a),Math.abs(b)));
  try {
    check(location.href === 'https://dojo-management-dev.web.app/qr/qr_generator.html');
    check(typeof RUNTIME_CONFIG !== 'undefined' && RUNTIME_CONFIG.target === 'dev-firebase' &&
      RUNTIME_CONFIG.firebase?.projectId === 'dojo-management-dev');
    const api = typeof dojoApiClient !== 'undefined' ? dojoApiClient : null;
    const auth = typeof firebaseAuthClient !== 'undefined' ? firebaseAuthClient : null;
    check(['admin','non_admin'].includes(EXPECTED_ACCESS) && api && typeof api.request === 'function' &&
      auth && typeof auth.getCurrentUser === 'function');
    phase = 'AUTH_SESSION'; await auth.ready; check(!!auth.getCurrentUser());
    async function get(name,params) {
      item=name;status=null;phase='COMMUNICATION_OR_AUTH';
      const url=new URL('/api/webconnect',BASE);
      for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
      // No target_month/targetMonth override. Existing client refreshes once on 401.
      const response=await api.request(url.href,{method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30000)});
      status=response.status;phase=status===401?'AUTHENTICATION_ERROR':status===403?'PERMISSION_ERROR':status===503?'SERVICE_UNAVAILABLE_CAUSE_UNKNOWN':'HTTP_ERROR';
      return response;
    }
    const clockResponse=await get('SystemContext',{action:'system_context'});
    check(status===200);phase='CLOCK_DATA_ERROR';const clock=await clockResponse.json();
    check(object(clock)&&clock.ok===true&&clock.timezone==='Asia/Tokyo'&&typeof clock.time_travel_enabled==='boolean'&&
      /^\d{4}-(0[1-9]|1[0-2])$/.test(clock.target_month||''));
    emit('PASS',{targetMonthReadFromServer:true});
    const response=await get('getMemberInfo access',{action:'getMemberInfo',member_id:MEMBER});
    if(EXPECTED_ACCESS==='non_admin'){
      check(status===403);emit('PASS',{expectedNonAdminDenied:true});return;
    }
    check(status===200);phase='RESPONSE_FORMAT_ERROR';const b=await response.json();
    check(object(b));phase='BUSINESS_RESULT_ERROR';check(b.ok===true);
    phase='DTO_FIELDS_MISSING_OR_INVALID';
    for(const key of ['memberId','memberName','billingGroupId','targetMonth','invoiceSummary','planType','status','message'])check(typeof b[key]==='string');
    for(const key of ['billedTotal','paidTotal','unpaidAmount','cashPaidTotal','paypayPaidTotal','otherPaidTotal','monthlyCap'])check(money(b[key]));
    for(const key of ['invoiceCount','paymentCount','lessonCount','cashRequestsLen','evidenceRequestedCount','evidenceConfirmedCount','evidencePostedCount'])check(count(b[key]));
    for(const key of ['isPaid','isCapped','todayAttendanceRegistered'])check(typeof b[key]==='boolean');
    check(Array.isArray(b.invoiceIds)&&Array.isArray(b.invoiceItems)&&Array.isArray(b.unpaidInvoiceItems));
    for(const row of [...b.invoiceItems,...b.unpaidInvoiceItems]){
      check(object(row)&&id(row.invoice_id)&&id(row.billing_group_id)&&id(row.plan_id)&&typeof row.member_id==='string'&&
        typeof row.target_month==='string'&&typeof row.billing_type==='string'&&typeof row.label==='string'&&typeof row.status==='string'&&money(row.amount)&&row.amount>0);
    }
    phase='DATA_CHECK_ERROR';
    check(b.memberId===MEMBER&&id(b.billingGroupId)&&b.targetMonth===clock.target_month);
    check(b.invoiceIds.every(id)&&new Set(b.invoiceIds).size===b.invoiceIds.length&&b.invoiceCount===b.invoiceIds.length&&b.invoiceCount===b.invoiceItems.length);
    check(b.invoiceItems.every((row,i)=>row.invoice_id===b.invoiceIds[i]&&row.billing_group_id===b.billingGroupId&&row.target_month===b.targetMonth));
    const expectedUnpaid=b.invoiceItems.filter(row=>row.status!=='支払済'&&row.status!=='免除');
    check(b.unpaidInvoiceItems.length===expectedUnpaid.length&&b.unpaidInvoiceItems.every((row,i)=>
      Object.keys(expectedUnpaid[i]).every(k=>row[k]===expectedUnpaid[i][k])&&Object.keys(row).every(k=>row[k]===expectedUnpaid[i][k])));
    check(close(b.invoiceItems.reduce((sum,row)=>sum+row.amount,0),b.billedTotal));
    check(close(b.cashPaidTotal+b.paypayPaidTotal+b.otherPaidTotal,b.paidTotal));
    if(b.paymentCount===0)check(b.paidTotal===0);
    const emptyState=['未宣言','請求なし'].includes(b.status);
    if(emptyState){
      check(b.invoiceCount===0&&b.billedTotal===0&&b.unpaidAmount===0&&b.monthlyCap===0&&!b.isPaid&&!b.isCapped);
      check(b.status==='未宣言'?b.planType==='':b.planType.length>0);
    }else{
      check(close(b.unpaidAmount,Math.max(b.billedTotal-b.paidTotal,0)));
      check(b.status===(b.billedTotal===0?'免除':b.unpaidAmount===0?'支払済':'未払い'));
      check(b.isPaid===(b.unpaidAmount===0&&b.billedTotal>0)&&b.isCapped===(b.monthlyCap>0&&b.billedTotal>=b.monthlyCap));
    }
    emit('PASS',{businessOk:true,requiredDtoFieldsValid:true,memberMatched:true,billingGroupInternallyMatched:true,
      serverTargetMonthMatched:true,invoiceIdsAndCountMatched:true,invoiceSumMatched:true,unpaidAmountMatched:true,
      paymentBreakdownMatched:true,statusAndFlagsMatched:true});
    item='Data coverage';
    if(b.invoiceCount===0)emit('未確認',{reason:'NO_POSITIVE_INVOICE_ITEMS',emptyBusinessStateValid:true});
    if(b.invoiceCount<2)emit('未確認',{reason:'MULTIPLE_INVOICES_NOT_PRESENT'});
    else emit('PASS',{multipleInvoiceAggregationMatched:true});
    if(b.paymentCount===0)emit('未確認',{reason:'NO_PAYMENT_RECORDS_IN_DTO'});
    item='Independent source verification';status=null;
    emit('未確認',{billingGroupAgainstMemberMasterProven:false,sourceAmountsAndViewFreshnessIndependentlyProven:false,
      zeroAmountInvoiceCountProven:false,otherLoginRolesTested:false,
      reason:'DTO_DOES_NOT_EXPOSE_RAW_RECORDS_OR_ACCOUNT_AUTHORIZATION'});
  } catch {
    emit('FAIL',{failureType:phase,stopped:true,
      sourceDataShortageProven:false});
  }
})();
