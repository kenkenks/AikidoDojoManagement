// Native Portable Attendance entry.
// Existing registerAttendanceBatch can pass its current SheetContext so that
// the surrounding billing flow shares the same spreadsheet/cache boundary.
function dojoAttendanceNativeApplication_(ctxOrSpreadsheet) {
  var suppliedCtx = null;
  var spreadsheet = null;

  if (ctxOrSpreadsheet && ctxOrSpreadsheet.ss) {
    suppliedCtx = ensureSheetContext(ctxOrSpreadsheet);
    spreadsheet = suppliedCtx.ss;
  } else {
    spreadsheet = ctxOrSpreadsheet || SpreadsheetApp.getActiveSpreadsheet();
  }

  var projectionCtx = suppliedCtx || ensureSheetContext(createSheetContext());

  return DojoAttendanceNative.createApplication({}, {
    spreadsheet: spreadsheet,
    uuid: function() { return Utilities.getUuid(); },
    now: function() { return sup_now(projectionCtx); },
    dateKey: function(value) {
      if (value instanceof Date) {
        return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
      }
      return String(value == null ? "" : value).trim().slice(0, 10);
    },
    projectAttendances: function(change) {
      invalidateAttendances(projectionCtx);
      return paymentStatusView_projectAttendances_(
        change.appended,
        change.cancelled,
        projectionCtx
      );
    }
  });
}

/**
 * AttendanceRegisterJob
 *
 * Native Portable Attendance の collect -> make -> record -> post で
 * 出席事実を登録・同期する Job。
 * 受付全体（月次選択・都度請求・級段位更新・PostEvent）はここへ含めない。
 */
class AttendanceRegisterJob extends Job {
  constructor(ctx) {
    super();
    this.ctx = ctx;
  }

  execute(options) {
    var ctx = ensureSheetContext(this.ctx || createSheetContext());
    var nativeOptions = Object.assign({}, options || {});
    nativeOptions.attendance_date = nativeOptions.attendance_date || sup_today(ctx);
    nativeOptions.target_month = nativeOptions.target_month || sup_targetMonth(ctx);
    return dojoAttendanceNativeApplication_(ctx).registerAttendanceCore(nativeOptions);
  }
}

// Public facade name is preserved while the implementation is now Native.
function dojoAttendanceRegisterCore(options, ctx) {
  return new AttendanceRegisterJob(ctx).execute(options);
}
