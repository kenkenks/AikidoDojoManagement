// Temporary Console script. Review before executing; no automatic execution by tooling.
// First verify candidate -> 00045-jaw, Ready=True, and the approved image digest.
// Keep allow for a known M001 member/admin/active-teacher session. Use deny ONLY
// for an existing ordinary-member session known to belong to another member.
(async () => {
  'use strict';
  const EXPECTED_ACCESS = 'allow'; // 'allow' or 'deny'; never infer identity from a URL/virtual session.
  const BASE = 'https://candidate---dojo-time-travel-admin-q6ujypei6a-an.a.run.app';
  const MEMBER = 'M001';
  let status = null, phase = 'BROWSER_CONTEXT';
  const emit = (item, result, checks) => console.log(JSON.stringify({item,httpStatus:status,result,checks}));
  const check = value => { if (!value) throw Error('CHECK_FAILED'); };
  const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const integer = v => Number.isSafeInteger(v) && v >= 0;
  const validDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(v+'T00:00:00Z')) && new Date(v+'T00:00:00Z').toISOString().slice(0,10) === v;
  try {
    check(location.href === 'https://dojo-management-dev.web.app/qr/qr_generator.html');
    check(typeof RUNTIME_CONFIG !== 'undefined' && RUNTIME_CONFIG.target === 'dev-firebase' &&
      RUNTIME_CONFIG.firebase?.projectId === 'dojo-management-dev');
    const api = typeof dojoApiClient !== 'undefined' ? dojoApiClient : null;
    const auth = typeof firebaseAuthClient !== 'undefined' ? firebaseAuthClient : null;
    check(['allow','deny'].includes(EXPECTED_ACCESS) && api && typeof api.request === 'function' &&
      auth && typeof auth.getCurrentUser === 'function');
    phase = 'COMMUNICATION_OR_AUTH';
    await auth.ready;
    check(!!auth.getCurrentUser());
    const url = new URL('/api/webconnect',BASE);
    url.searchParams.set('action','attendance_progress_summary');
    url.searchParams.set('member_id',MEMBER);
    // Existing client attaches the token and retries once on 401 after refresh.
    // No additional retry, role lookup, token extraction, or mutation request.
    const response = await api.request(url.href,{method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)});
    status = response.status; phase = 'HTTP_ERROR';
    if (EXPECTED_ACCESS === 'deny') {
      check(status === 403);
      emit('Progress access','PASS',{expectedOtherMemberDenied:true});
      emit('Progress DTO','未確認',{reason:'ACCESS_DENIED_NO_DATA_READ'});
      return;
    }
    // Reader's exact missing/inactive-member business result, not a general 400 exemption.
    if (status === 400) {
      phase = 'DATA_CHECK_ERROR';
      const missing = await response.json();
      check(object(missing) && missing.ok === false && missing.message === '有効な会員が見つかりません。');
      emit('Progress data coverage','未確認',{reason:'ACTIVE_TARGET_MEMBER_UNAVAILABLE',successfulReadProven:false});
      return;
    }
    check(status === 200);
    phase = 'DATA_CHECK_ERROR';
    const data = await response.json();
    check(object(data) && data.ok === true && data.member_id === MEMBER);
    for (const key of ['member_name','current_rank','current_rank_id','next_rank','examination_note','rank_source'])
      check(typeof data[key] === 'string');
    check(Object.hasOwn(data,'rank_updated_at') && (data.rank_start_date === '' || validDate(data.rank_start_date)));
    check(integer(data.rank_sort_order));
    for (const key of ['carried_training_count','recorded_training_count','training_count','required_training_count'])
      check(integer(data[key]));
    check(data.training_count === data.carried_training_count + data.recorded_training_count);
    const remaining = data.required_training_count > 0 ? Math.max(data.required_training_count-data.training_count,0) : null;
    check(data.remaining_training_count === remaining && typeof data.examination_ready === 'boolean' &&
      data.examination_ready === (data.required_training_count > 0 && remaining === 0));
    check(['会員個別','審査基準マスタ','未設定'].includes(data.required_training_count_source));
    check((data.required_training_count_source === '未設定') === (data.required_training_count === 0));
    const dates = data.recent_attendance_dates;
    check(Array.isArray(dates) && dates.length <= 5 && dates.every(validDate) && new Set(dates).size === dates.length);
    check(dates.every((d,i) => (!data.rank_start_date || d >= data.rank_start_date) && (i === 0 || dates[i-1] > d)));
    check(dates.length <= data.recorded_training_count && (data.recorded_training_count === 0 ? dates.length === 0 : dates.length > 0));
    emit('Progress access and DTO','PASS',{authorizedGet:true,memberMatched:true,dtoStructureValid:true,
      countEquationMatched:true,remainingAndEligibilityMatched:true,requiredSourceMatched:true,recentDatesConsistent:true});
    if (data.recorded_training_count === 0)
      emit('Nonempty attendance coverage','未確認',{reason:'NO_COUNTED_ATTENDANCE'});
    if (data.required_training_count === 0)
      emit('Configured examination standard coverage','未確認',{reason:'REQUIREMENT_NOT_CONFIGURED'});
    emit('Source evidence coverage','未確認',{cancelledRecordExclusionProven:false,
      distinctSlotCountIndependentlyProven:false,carryAndRequirementMasterValuesIndependentlyProven:false,
      latestFiveAgainstFullHistoryProven:false,otherLoginRolesTested:false,
      reason:'SUMMARY_DTO_DOES_NOT_EXPOSE_SOURCE_HISTORY_OR_ACCOUNT_LINKS'});
  } catch {
    emit('Progress verification','FAIL',{failureType:phase,stopped:true});
  }
})();
