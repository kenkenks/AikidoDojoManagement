// ================================
// Code.js デバッグランナー
// ================================

function debug_code_doGet_attendanceSessionInfo() {
  const e = {
    parameter: {
      action: "attendance_session_info",
      location_id: "HONBU",
      billing_block_id: ""
    }
  };

  const result = doGet(e);

  Logger.log(result.getContent());

  return result.getContent();
}

function debug_code_doGet_memberAttendanceState() {
  const e = {
    parameter: {
      action: "member_attendance_state",
      member_id: "M001",
      location_id: "HONBU",
      billing_block_id: "B_KYO_MON_1030_1230"
    }
  };

  const result = doGet(e);

  Logger.log(result.getContent());

  return result.getContent();
}

function debug_code_doPost_attendanceBatch() {
  const payload = {
    mode: "attendance_batch",
    teacher_id: "T001",
    location_id: "HONBU",
    billing_block_id: "B_KYO_MON_1030_1230",
    attendance_items: [
      {
        member_id: "M001",
        slot_ids: [
          "KYO_MON_1030",
          "KYO_MON_1130"
        ]
      }
    ],
    source: "debug_code_doPost_attendanceBatch"
  };

  const e = {
    postData: {
      contents: JSON.stringify(payload)
    }
  };

  const result = doPost(e);

  Logger.log(result.getContent());

  return result.getContent();
}