// Step 3-B: Portable Attendance -> Portable DAO -> GAS Adapter -> real Google Sheets.
// Uses temporary real sheets only. Existing attendance/payment routes and production sheets are untouched.
function runner_attendanceStep3_realSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var suffix = Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  var created = [];
  var byCanonical = {};

  function addTemp(canonicalName, headers, rows) {
    var sheet = ss.insertSheet('__PORTABLE_ATT_' + suffix + '_' + created.length);
    created.push(sheet);
    byCanonical[canonicalName] = sheet;
    var values = [headers].concat(rows || []);
    sheet.getRange(1, 1, values.length, headers.length).setValues(values);
    return sheet;
  }

  try {
    addTemp('99_設定', ['key', 'value'], [
      ['TIME_TRAVEL_ENABLED', 'FALSE'],
      ['DEBUG', 'TRUE']
    ]);
    addTemp('01_会員マスタ', ['member_id', '氏名', '状態'], [
      ['M1', 'Portable検証会員', '有効']
    ]);
    addTemp('10_道場マスタ', ['location_id', '状態'], [
      ['L1', '有効']
    ]);
    addTemp('11_先生マスタ', ['teacher_id', '状態', '出席受付可'], [
      ['T1', '有効', true]
    ]);
    addTemp('12_稽古枠マスタ', ['slot_id', 'location_id', 'billing_block_id', '状態', '稽古時間分'], [
      ['S1', 'L1', 'B1', '有効', 60],
      ['S2', 'L1', 'B1', '有効', 60]
    ]);
    addTemp('13_課金枠マスタ', ['billing_block_id', 'location_id', '状態'], [
      ['B1', 'L1', '有効']
    ]);
    var attendanceSheet = addTemp('07_出席ログ', [
      'attendance_id', '稽古日', '登録日時', 'member_id', 'target_month',
      'location_id', 'slot_id', 'billing_block_id', 'teacher_id',
      'attendance_session_id', '稽古時間分', '状態', 'source', '取消日時',
      '取消者teacher_id', '取消理由', '備考'
    ], []);

    // Wrapper redirects canonical production sheet names to the temporary real sheets.
    var testSpreadsheet = {
      getSheetByName: function(name) { return byCanonical[name] || null; }
    };
    var projectionCalls = 0;
    var app = DojoAttendanceStep3.createApplication({}, {
      spreadsheet: testSpreadsheet,
      timezone: Session.getScriptTimeZone(),
      formatDate: function(date, zone, pattern) { return Utilities.formatDate(date, zone, pattern); },
      uuid: function() { return Utilities.getUuid(); },
      projectAttendances: function() { projectionCalls++; }
    });

    function options(slotIds) {
      return {
        teacher_id: 'T1',
        location_id: 'L1',
        billing_block_id: 'B1',
        attendance_session_id: 'STEP3B-' + suffix,
        attendance_date: '2099-07-09',
        target_month: '2099-07',
        attendance_items: [{ member_id: 'M1', slot_ids: slotIds }],
        require_teacher: true,
        initial_status: '有効',
        source: 'step3b_real_sheets',
        sync_unselected: true
      };
    }

    var checks = [];
    var r1 = app.registerAttendanceCore(options(['S1', 'S2']));
    if (!r1.ok || r1.registered_count !== 2 || r1.retained_count !== 0 || r1.cancelled_count !== 0) throw new Error('CREATE_FAILED');
    checks.push('CREATE');

    var r2 = app.registerAttendanceCore(options(['S1', 'S2']));
    if (!r2.ok || r2.registered_count !== 0 || r2.retained_count !== 2 || r2.cancelled_count !== 0) throw new Error('READ_RETAIN_FAILED');
    checks.push('READ_RETAIN');

    var r3 = app.registerAttendanceCore(options(['S1']));
    if (!r3.ok || r3.registered_count !== 0 || r3.retained_count !== 1 || r3.cancelled_count !== 1) throw new Error('CANCEL_FAILED');
    checks.push('CANCEL');

    var r4 = app.registerAttendanceCore(options(['S1', 'S2']));
    if (!r4.ok || r4.registered_count !== 1 || r4.retained_count !== 1 || r4.cancelled_count !== 0) throw new Error('REREGISTER_FAILED');
    checks.push('REREGISTER');

    var r5 = app.registerAttendanceCore(options([]));
    if (!r5.ok || r5.registered_count !== 0 || r5.retained_count !== 0 || r5.cancelled_count !== 2) throw new Error('CLEAR_FAILED');
    checks.push('CLEAR');

    var values = attendanceSheet.getDataRange().getValues();
    if (values.length !== 4) throw new Error('ATTENDANCE_ROW_COUNT_FAILED:' + values.length);
    var headers = values[0];
    var statusIndex = headers.indexOf('状態');
    var slotIndex = headers.indexOf('slot_id');
    if (statusIndex < 0 || slotIndex < 0) throw new Error('ATTENDANCE_HEADER_FAILED');
    var active = values.slice(1).filter(function(row) { return String(row[statusIndex]) !== '取消'; });
    if (active.length !== 0) throw new Error('FINAL_ACTIVE_ROWS_FAILED:' + active.length);
    var slots = values.slice(1).map(function(row) { return String(row[slotIndex]); }).sort().join(',');
    if (slots !== 'S1,S2,S2') throw new Error('ATTENDANCE_HISTORY_FAILED:' + slots);
    if (projectionCalls !== 5) throw new Error('PROJECTION_CALL_COUNT_FAILED:' + projectionCalls);
    checks.push('REAL_SHEET_HISTORY');

    var result = {
      ok: true,
      message: 'ATTENDANCE-STEP3 REAL SHEETS PASS',
      success: checks.length,
      checks: checks,
      attendance_rows: values.length - 1,
      projection_calls: projectionCalls
    };
    console.log(JSON.stringify(result));
    return result;
  } finally {
    created.forEach(function(sheet) {
      try { ss.deleteSheet(sheet); } catch (e) { console.log('TEMP_SHEET_DELETE_FAILED:' + e); }
    });
  }
}
