// Coreの選択と既存Sheets Contextとの接続を行う境界。
// 別Coreを使う場合は、同じ要求ContextにdaoCoreとsettingsを注入する。
// 現行の呼出元にはSheetsを既定として提供する（段階移行）。
function daoContext_(ctx) {
  if (ctx && ctx.daoCore) return ctx;
  return ensureSheetContext(ctx);
}

function daoCore_(ctx) {
  return ctx && ctx.daoCore ? ctx.daoCore : {
    read: daoCoreSheets_read,
    readWithRowNumbers: daoCoreSheets_readWithRowNumbers,
    updateCellsByRowNumber: daoCoreSheets_updateCellsByRowNumber,
    append: daoCoreSheets_append,
    appendValidated: daoCoreSheets_appendValidated,
    updateByKey: daoCoreSheets_updateByKey,
    appendAttendanceRows: daoCoreSheets_appendAttendanceRows,
    cancelAttendanceRows: daoCoreSheets_cancelAttendanceRows,
    readAttendanceScopeRows: daoCoreSheets_readAttendanceScopeRows,
    updateAttendanceRows: daoCoreSheets_updateAttendanceRows
  };
}
