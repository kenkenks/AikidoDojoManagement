// ================================
// 出席登録 デバッグランナー
// sup_debug_Attendance.js
// ================================

const DEBUG_ATTENDANCE_LOCATION_ID = "HONBU";
const DEBUG_ATTENDANCE_BILLING_BLOCK_ID = ""; // 空なら自動判定
const DEBUG_ATTENDANCE_MEMBER_ID = "M001";

// doGet: member_attendance_state
function diagnostic_attendance_getMemberStatePerformance() {
  const ctx = createSheetContext();

  const session = getAttendanceSessionInfo({
    location_id: DEBUG_ATTENDANCE_LOCATION_ID,
    billing_block_id: DEBUG_ATTENDANCE_BILLING_BLOCK_ID
  }, ctx);

  if (!session || session.ok !== true || session.requires_selection) {
    sup_logDebug("diagnostic_attendance_getMemberStatePerformance", {
      message: "課金枠が確定できません。",
      session: JSON.stringify(session, null, 2)
    }, ctx);
    return session;
  }

  const params = {
    member_id: DEBUG_ATTENDANCE_MEMBER_ID,
    location_id: session.location_id,
    billing_block_id: session.billing_block_id,
    attendance_date: sup_formatDate_(null, "yyyy-MM-dd")
  };

  //============ テスト対象
  const stateStartedAt = Date.now();
  const result = getMemberAttendanceState(params, ctx);
  perfLog("getMemberAttendanceState total", stateStartedAt);
  //============

  sup_logDebug("diagnostic_attendance_getMemberStatePerformance", {
    params: JSON.stringify(params, null, 2),
    result: JSON.stringify(result, null, 2)
  }, ctx);

  return result;
}
