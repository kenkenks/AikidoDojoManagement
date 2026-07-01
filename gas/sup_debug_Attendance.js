// ================================
// 出席登録 デバッグランナー
// sup_debug_Attendance.js
// ================================

const DEBUG_ATTENDANCE_LOCATION_ID = "HONBU";
const DEBUG_ATTENDANCE_BILLING_BLOCK_ID = ""; // 空なら自動判定
const DEBUG_ATTENDANCE_MEMBER_ID = "M001";
const DEBUG_ATTENDANCE_TEACHER_ID = "T001";

// doGet: attendance_session_info
function debug_attendance_getSessionInfo() {
  const ctx = createSheetContext();

  const params = {
    location_id: DEBUG_ATTENDANCE_LOCATION_ID,
    billing_block_id: DEBUG_ATTENDANCE_BILLING_BLOCK_ID
  };

  //============ テスト対象
  const result = getAttendanceSessionInfo(params, ctx);
  //============

  sup_logDebug("debug_attendance_getSessionInfo", {
    params: JSON.stringify(params, null, 2),
    result: JSON.stringify(result, null, 2)
  },ctx);

  return result;
}

// doGet: member_attendance_state
function debug_attendance_getMemberState() {
  const ctx = createSheetContext();

  const session = getAttendanceSessionInfo({
    location_id: DEBUG_ATTENDANCE_LOCATION_ID,
    billing_block_id: DEBUG_ATTENDANCE_BILLING_BLOCK_ID
  }, ctx);

  if (!session || session.ok !== true || session.requires_selection) {
    sup_logDebug("debug_attendance_getMemberState", {
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
  const result = getMemberAttendanceState(params, ctx);
  //============

  sup_logDebug("debug_attendance_getMemberState", {
    params: JSON.stringify(params, null, 2),
    result: JSON.stringify(result, null, 2)
  }, ctx);

  return result;
}

// doPost: registerAttendanceBatch
function debug_attendance_registerBatch() {
  const ctx = createSheetContext();
  
  const session = getAttendanceSessionInfo({
    location_id: DEBUG_ATTENDANCE_LOCATION_ID,
    billing_block_id: DEBUG_ATTENDANCE_BILLING_BLOCK_ID
  }, ctx);

  if (!session || session.ok !== true || session.requires_selection) {
    sup_logDebug("debug_attendance_registerBatch", {
      message: "課金枠が確定できません。",
      session: JSON.stringify(session, null, 2)
    }, ctx);
    return session;
  }

  const slotIds = (session.slots || []).map(function(slot) {
    return slot.slot_id;
  });

  if (slotIds.length === 0) {
    return {
      ok: false,
      message: "登録対象の稽古枠がありません。"
    };
  }

  const input = {
    mode: "attendance_batch",
    teacher_id: DEBUG_ATTENDANCE_TEACHER_ID,
    location_id: session.location_id,
    billing_block_id: session.billing_block_id,
    //attendance_date: sup_formatDate_(null, "yyyy-MM-dd"),
    attendance_items: [
      {
        member_id: DEBUG_ATTENDANCE_MEMBER_ID,
        slot_ids: slotIds
      }
    ],
    source: "debug_attendance_registerBatch"
  };

  //============ テスト対象
  const result = registerAttendanceBatch(input, ctx);
  //============

  sup_logDebug("debug_attendance_registerBatch", {
    input: JSON.stringify(input, null, 2),
    result: JSON.stringify(result, null, 2)
  }, ctx);

  return result;
}