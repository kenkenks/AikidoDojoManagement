// WebConnect API contract shared by GAS and Cloud Run. No runtime-specific APIs.
var WebConnectCore = (function () {
  function route(request) {
    var method = String(request && request.method || 'GET').toUpperCase();
    var action = String(request && request.action || '');
    if (method === 'GET' && action === 'system_context') {
      return { operation: 'systemContext.read', input: null };
    }
    // Attendance contract: routing only. Backend handlers must implement each operation.
    var attendanceReads = {
      attendance_session_info: 'attendance.sessionInfo',
      member_attendance_state: 'attendance.memberState',
      attendance_saved_state: 'attendance.savedState',
      teacher_attendance_today: 'attendance.teacherToday',
      teacher_attendance_state: 'attendance.teacherState',
      teacher_attendance_identity: 'attendance.teacherIdentity',
      teacher_attendance_monthly_summary: 'attendance.teacherMonthlySummary',
      attendance_progress_summary: 'attendance.progressSummary',
      attendance_rank_options: 'attendance.rankOptions',
      post_receipt: 'attendance.postReceipt'
    };
    if (method === 'GET' && Object.prototype.hasOwnProperty.call(attendanceReads, action)) {
      return { operation: attendanceReads[action], input: request.params || {} };
    }
    var data = request && request.data || {};
    if (method === 'POST' && (action === 'attendance_batch' || action === 'teacher_attendance_sync')) {
      return { operation: action === 'attendance_batch' ? 'attendance.registerBatch' : 'attendance.teacherSync', input: data };
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
  return { route: route };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = WebConnectCore;
