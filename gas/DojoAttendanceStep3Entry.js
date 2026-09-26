// Step 3-C Portable Attendance entry.
// Existing registerAttendanceBatch can pass its current SheetContext so that
// the old billing/payment flow and the new Portable Attendance core share the
// same spreadsheet and cache invalidation boundary.
function dojoAttendanceStep3Application_(ctxOrSpreadsheet) {
  var suppliedCtx = null;
  var spreadsheet = null;

  if (ctxOrSpreadsheet && ctxOrSpreadsheet.ss) {
    suppliedCtx = ensureSheetContext(ctxOrSpreadsheet);
    spreadsheet = suppliedCtx.ss;
  } else {
    spreadsheet = ctxOrSpreadsheet || SpreadsheetApp.getActiveSpreadsheet();
  }

  var projectionCtx = suppliedCtx || ensureSheetContext(createSheetContext());

  return DojoAttendanceStep3.createApplication({}, {
    spreadsheet: spreadsheet,
    timezone: Session.getScriptTimeZone(),
    formatDate: function(date, zone, pattern) {
      return Utilities.formatDate(date, zone, pattern);
    },
    uuid: function() {
      return Utilities.getUuid();
    },
    // registerAttendanceBatch already owns the script lock. Avoid taking the
    // same lock a second time when Portable Attendance is called from it.
    lock: suppliedCtx ? {
      waitLock: function() {},
      releaseLock: function() {}
    } : undefined,
    projectAttendances: function(change) {
      // Old billing logic immediately following Attendance Core reads 07 again.
      // Invalidate the existing SheetContext before projecting / continuing.
      invalidateAttendances(projectionCtx);
      return paymentStatusView_projectAttendances_(
        change.appended,
        change.cancelled,
        projectionCtx
      );
    }
  });
}

function dojoAttendanceStep3RegisterCore(options, ctx) {
  return dojoAttendanceStep3Application_(ctx).registerAttendanceCore(options);
}
