// 先生出席の物理操作をCoreへ委譲する。担当区分・登録取消の判断は呼出元に維持。
function daoTeacherAttendanceEnsureSchema_(attendanceHeaders, roleHeaders, ctx) {
  return daoCore_(ctx).ensureTeacherAttendanceSchema(attendanceHeaders, roleHeaders, ctx);
}

function daoTeacherAttendanceAppend_(rows, ctx) {
  return daoCore_(ctx).appendTeacherAttendanceRows(rows, ctx);
}

function daoTeacherAttendanceCancelRow_(row, ctx) {
  return daoCore_(ctx).cancelTeacherAttendanceRow(row, ctx);
}
