// Coreの選択と既存Sheets Contextとの接続を行う境界。
// 別Coreを使う場合は、同じ要求ContextにdaoCoreとsettingsを注入する。
// 現行の呼出元にはSheetsを既定として提供する（段階移行）。
function daoContext_(ctx) {
  if (ctx && ctx.daoCore) return ctx;
  return ensureSheetContext(ctx);
}

function daoCore_(ctx) {
  return ctx && ctx.daoCore ? ctx.daoCore : {
    readPaymentStatusValues: daoCoreSheets_readPaymentStatusValues,
    upsertPaymentStatusRow: daoCoreSheets_upsertPaymentStatusRow,
    ensurePaymentStatusHeaders: daoCoreSheets_ensurePaymentStatusHeaders,
    updateEvidenceRowAtomic: daoCoreSheets_updateEvidenceRowAtomic,
    ensurePaymentReceptionSchema: daoCoreSheets_ensurePaymentReceptionSchema,
    openMemberRankUpdates: daoCoreSheets_openMemberRankUpdates,
    ensureMemberRankSchema: daoCoreSheets_ensureMemberRankSchema,
    ensureTeacherAttendanceSchema: daoCoreSheets_ensureTeacherAttendanceSchema,
    appendTeacherAttendanceRows: daoCoreSheets_appendTeacherAttendanceRows,
    cancelTeacherAttendanceRow: daoCoreSheets_cancelTeacherAttendanceRow,
    ensureExaminationMaster: daoCoreSheets_ensureExaminationMaster,
    beginMemberCards: daoCoreSheets_beginMemberCards,
    createMemberCardTemplate: daoCoreSheets_createMemberCardTemplate,
    readMemberCardMemberValues: daoCoreSheets_readMemberCardMemberValues,
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
