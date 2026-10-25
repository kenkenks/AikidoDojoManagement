// WebConnect API contract shared by GAS and Cloud Run. No runtime-specific APIs.
var WebConnectCore = (function () {
  // Transport-independent action resolution. HTTP method validation stays in adapters.
  function resolve(action, input) {
    action = String(action || '');
    if (action === 'system_context') return { operation: 'systemContext.read', input: null };
    if (action === 'time_travel_admin') return { operation: 'timeTravel.read', input: null };
    if (action === 'member_read') return { operation: 'member.readById', input: input || {} };
    if (action === 'getMemberInfo') return { operation: 'billing.memberInfo', input: input || {} };
    if (action === 'payment_reception_summary') return { operation: 'billing.receptionSummary', input: input || {} };
    if (action === 'payment_screen_read') return { operation: 'billing.screenRead', input: input || {} };
    if (action === 'paypay_code_start') return { operation: 'billing.paypayCodeStart', input: input || {} };
    if (action === 'paypay_code_record') return { operation: 'billing.paypayCodeRecord', input: input || {} };
    if (action === 'payment_paypay_post_selected') return { operation: 'billing.paypayPostSelected', input: input || {} };
    if (action === 'payment_cash_accept') return { operation: 'billing.cashAccept', input: input || {} };
    if (action === 'members_read') return { operation: 'member.readByIds', input: input || {} };
    if (action === 'member_management_list') return { operation: 'memberManagement.list', input: input || {} };
    if (action === 'member_management_save') return { operation: 'memberManagement.save', input: input || {} };
    if (action === 'member_management_group_save') return { operation: 'memberManagement.groupSave', input: input || {} };
    if (action === 'member_management_withdraw') return { operation: 'memberManagement.withdraw', input: input || {} };
    if (action === 'attendance_session_info') return { operation: 'attendance.sessionInfo', input: input || {} };
    if (action === 'attendance_member_options') return { operation: 'attendance.memberOptions', input: input || {} };
    if (action === 'teacher_attendance_today') return { operation: 'attendance.teacherToday', input: input || {} };
    if (action === 'attendance_rank_options') return { operation: 'attendance.rankOptions', input: input || {} };
    if (action === 'member_attendance_state') return { operation: 'attendance.memberState', input: input || {} };
    if (action === 'attendance_progress_summary') return { operation: 'attendance.progressSummary', input: input || {} };
    if (action === 'attendance_saved_state') return { operation: 'attendance.savedState', input: input || {} };
    if (action === 'attendance_pending_list') return { operation: 'attendance.pendingList', input: input || {} };
    if (action === 'attendance_pending_confirm') return { operation: 'attendance.pendingConfirm', input: input || {} };
    if (action === 'attendance_batch') return { operation: 'attendance.registerBatch', input: input || {} };
    if (action === 'paper_attendance_ocr') return { operation: 'attendance.paperOcr', input: input || {} };
    if (action === 'time_travel_set') {
      var data = input || {};
      return { operation: 'timeTravel.save', input: {
        enabled: data.enabled, now: data.now || '', target_month: data.target_month || ''
      } };
    }
    return null;
  }
  function route(request) {
    var method = String(request && request.method || 'GET').toUpperCase();
    var action = String(request && request.action || '');
    if (method === 'GET' && action === 'system_context') {
      return { operation: 'systemContext.read', input: null };
    }
    // Attendance contract: routing only. Backend handlers must implement each operation.
    var attendanceReads = {
      attendance_session_info: 'attendance.sessionInfo',
      attendance_member_options: 'attendance.memberOptions',
      member_attendance_state: 'attendance.memberState',
      attendance_saved_state: 'attendance.savedState',
      teacher_attendance_today: 'attendance.teacherToday',
      teacher_attendance_state: 'attendance.teacherState',
      teacher_attendance_identity: 'attendance.teacherIdentity',
      teacher_attendance_monthly_summary: 'attendance.teacherMonthlySummary',
      attendance_progress_summary: 'attendance.progressSummary',
      attendance_rank_options: 'attendance.rankOptions',
      attendance_pending_list: 'attendance.pendingList',
      post_receipt: 'attendance.postReceipt'
    };
    if (method === 'GET' && Object.prototype.hasOwnProperty.call(attendanceReads, action)) {
      return { operation: attendanceReads[action], input: request.params || {} };
    }
    var data = request && request.data || {};
    if (method === 'POST' && (action === 'attendance_batch' || action === 'teacher_attendance_sync' || action === 'attendance_pending_confirm')) {
      return { operation: action === 'attendance_batch' ? 'attendance.registerBatch' : action === 'attendance_pending_confirm' ? 'attendance.pendingConfirm' : 'attendance.teacherSync', input: data };
    }
    if (method === 'GET' && action === 'time_travel_admin') {
      return { operation: 'timeTravel.read', input: null };
    }
    if (method === 'POST' && action === 'time_travel_set') {
      var data = request.data || {};
      return { operation: 'timeTravel.save', input: {
        enabled: data.enabled,
        now: data.now || '',
        target_month: data.target_month || ''
      } };
    }
    return null;
  }
  return { route: route, resolve: resolve };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = WebConnectCore;
