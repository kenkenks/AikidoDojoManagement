// ========================================
// sup_runner_Code.js
// TASK-DEV-011-000
// Code.js 全入口ランナー
// ========================================

function runner_code_runAllEntrances() {
  const results = [];

  results.push(runner_code_doGet_getMemberInfo());
  results.push(runner_code_doGet_getPaymentInfo());
  results.push(runner_code_doGet_attendanceSessionInfo());
  results.push(runner_code_doGet_memberAttendanceState());

  results.push(runner_code_doPost_attendanceBatch());
  results.push(runner_code_doPost_paypayCodeRecord());
  //results.push(runner_code_doPost_legacyQrExperimentLog());

  Logger.log(JSON.stringify(results, null, 2));

  return {
    ok: results.every(function(r) { return r.ok === true; }),
    task: "TASK-DEV-011-000",
    name: "Code.js 全入口ランナー",
    count: results.length,
    results: results
  };
}

function runner_code_execute_(name, callback) {
  try {
    const content = callback();

    return {
      ok: true,
      name: name,
      content: content
    };

  } catch (e) {
    Logger.log(e.stack || e.message);

    return {
      ok: false,
      name: name,
      message: e.message,
      stack: e.stack || ""
    };
  }
}

function runner_code_content_(output) {
  if (!output) return "";

  if (typeof output.getContent === "function") {
    return output.getContent();
  }

  return JSON.stringify(output);
}

// ----------------------------------------
// doGet runners
// ----------------------------------------

function runner_code_doGet_getMemberInfo() {
  return runner_code_execute_("doGet:getMemberInfo", function() {
    const e = {
      parameter: {
        action: "getMemberInfo",
        member_id: "M001"
      }
    };

    return runner_code_content_(doGet(e));
  });
}

function runner_code_doGet_getPaymentInfo() {
  return runner_code_execute_("doGet:getPaymentInfo", function() {
    const e = {
      parameter: {
        action: "getPaymentInfo",
        member_id: "M001",
        plan_id: "P002"
      }
    };

    return runner_code_content_(doGet(e));
  });
}

function runner_code_doGet_attendanceSessionInfo() {
  return runner_code_execute_("doGet:attendance_session_info", function() {
    const e = {
      parameter: {
        action: "attendance_session_info",
        location_id: "HONBU",
        billing_block_id: ""
      }
    };

    return runner_code_content_(doGet(e));
  });
}

function runner_code_doGet_memberAttendanceState() {
  return runner_code_execute_("doGet:member_attendance_state", function() {
    const e = {
      parameter: {
        action: "member_attendance_state",
        member_id: "M001",
        location_id: "HONBU",
        billing_block_id: "B_KYO_MON_1030_1230"
      }
    };

    return runner_code_content_(doGet(e));
  });
}

// ----------------------------------------
// doPost runners
// ----------------------------------------

function runner_code_doPost_attendanceBatch() {
  return runner_code_execute_("doPost:attendance_batch", function() {
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
      source: "runner_code_doPost_attendanceBatch"
    };

    const e = {
      postData: {
        contents: JSON.stringify(payload)
      }
    };

    return runner_code_content_(doPost(e));
  });
}

function runner_code_doPost_paypayCodeRecord() {
  return runner_code_execute_("doPost:paypay_code_record", function() {
    const start = paypayCode_start({
      member_id: "M001",
      plan_id: "P002",
      teacher_id: "PAYPAY_MEMBER"
    }, createSheetContext());

    if (!start || start.ok !== true) {
      return JSON.stringify({
        ok: false,
        step: "paypay_code_start",
        message: start && start.message ? start.message : "PayPay開始処理に失敗しました。",
        start: start
      });
    }

    const payload = {
      mode: "paypay_code_record",
      member_id: "M001",
      evidence_code: "DEBUG-PAYPAY-CODE",
      evidence_items: start.evidenceItems || [],
      source: "runner_code_doPost_paypayCodeRecord"
    };

    const e = {
      postData: {
        contents: JSON.stringify(payload)
      }
    };

    return runner_code_content_(doPost(e));
  });
}

function runner_code_doPost_legacyQrExperimentLog() {
  return runner_code_execute_("doPost:legacy_qr_experiment_log", function() {
    const payload = {
      member_id: "M001",
      location_id: "HONBU",
      source: "runner_code_doPost_legacyQrExperimentLog"
    };

    const e = {
      postData: {
        contents: JSON.stringify(payload)
      }
    };

    return runner_code_content_(doPost(e));
  });
}