// スプレッドシートの読み書きを集約する軽量DAO層。
// 業務処理側では、列番号ではなくヘッダー名を使う。

function getRequiredSheet_(sheetName, ctx) {
  ctx = ensureSheetContext(ctx);

  const sheet = getContextSheet_(ctx, sheetName);
  if (!sheet) {
    throw new Error("シートが見つかりません: " + sheetName);
  }
  return sheet;
}







function appendAttendanceRows(attendanceRows, ctx) {
  return daoAttendanceAppend_(attendanceRows, ctx);
}

function getActiveAttendanceKeySet(attendanceDate, ctx) {
  ctx = ensureSheetContext(ctx);
  
  const dateText = formatAttendanceDate_(attendanceDate, ctx);
  const keys = {};

  getAttendances(ctx).forEach(row => {
    if (!isActiveMasterRow_(row)) return;
    if (formatAttendanceDate_(row["稽古日"], ctx) !== dateText) return;

    const memberId = normalizeId_(row["member_id"]);
    const slotId = normalizeId_(row["slot_id"]);
    if (memberId && slotId) keys[makeAttendanceKey_(dateText, memberId, slotId)] = true;
  });

  return keys;
}

function getActiveAttendanceRowsForScope(attendanceDate, memberId, locationId, billingBlockId, ctx) {
  ctx = ensureSheetContext(ctx);

  const rows = getAttendances(ctx);
  assertSheetRowHeaders_(ctx, "07_出席ログ", [
    "稽古日", "member_id", "location_id", "billing_block_id", "slot_id", "状態"
  ]);

  const dateText = formatAttendanceDate_(attendanceDate, ctx);

  // 07_出席ログは審査進捗でも参照する。
  // 直接getDataRange()すると同一リクエスト内で二重読込みになるため、
  // SheetContextのキャッシュを経由して一度だけ読み込む。
  return rows.filter(row =>
    isActiveMasterRow_(row) &&
    formatAttendanceDate_(row["稽古日"], ctx) === dateText &&
    normalizeId_(row["member_id"]) === normalizeId_(memberId) &&
    normalizeId_(row["location_id"]) === normalizeId_(locationId) &&
    normalizeId_(row["billing_block_id"]) === normalizeId_(billingBlockId)
  );
}

function cancelAttendanceRows(attendanceRows, teacherId, reason, ctx) {
  return daoAttendanceCancel_(attendanceRows, teacherId, reason, ctx);
}
