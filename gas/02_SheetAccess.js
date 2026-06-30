// スプレッドシートの読み書きを集約する軽量DAO層。
// 業務処理側では、列番号ではなくヘッダー名を使う。

function getRequiredSheet_(ctx, sheetName) {
  ctx = ensureSheetContext(ctx);
  const sheet = ctx.ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error("シートが見つかりません: " + sheetName);
  }
  return sheet;
}

function getHeaderMap_(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (lastColumn === 0) {
    throw new Error("ヘッダーがありません: " + sheet.getName());
  }

  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const map = {};
  headers.forEach((header, index) => {
    const key = String(header).trim();
    if (key) map[key] = index;
  });
  return { headers, map };
}

function assertHeaders_(sheet, requiredHeaders) {
  const headerInfo = getHeaderMap_(sheet);
  const missing = requiredHeaders.filter(header => headerInfo.map[header] === undefined);
  if (missing.length > 0) {
    throw new Error(sheet.getName() + " に必要な列がありません: " + missing.join(", "));
  }
  return headerInfo;
}

function appendObjectsByHeader_(sheet, objects) {
  if (!objects || objects.length === 0) return;

  const headers = getHeaderMap_(sheet).headers;
  const rows = objects.map(object => headers.map(header => {
    return Object.prototype.hasOwnProperty.call(object, header) ? object[header] : "";
  }));

  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
}

function appendAttendanceRows(ctx, attendanceRows) {
  const sheet = getRequiredSheet_(ctx, "07_出席ログ");
  assertHeaders_(sheet, [
    "attendance_id", "稽古日", "登録日時", "member_id", "target_month",
    "location_id", "slot_id", "billing_block_id", "teacher_id",
    "attendance_session_id", "稽古時間分", "状態", "source"
  ]);
  appendObjectsByHeader_(sheet, attendanceRows);
  invalidateAttendances(ctx);
}

function getActiveAttendanceKeySet(ctx, attendanceDate) {
  const dateText = formatAttendanceDate_(attendanceDate);
  const keys = {};

  getAttendances(ctx).forEach(row => {
    if (!isActiveMasterRow_(row)) return;
    if (formatAttendanceDate_(row["稽古日"]) !== dateText) return;

    const memberId = normalizeId_(row["member_id"]);
    const slotId = normalizeId_(row["slot_id"]);
    if (memberId && slotId) keys[makeAttendanceKey_(dateText, memberId, slotId)] = true;
  });

  return keys;
}

function getActiveAttendanceRowsForScope(ctx, attendanceDate, memberId, locationId, billingBlockId) {
  const sheet = getRequiredSheet_(ctx, "07_出席ログ");
  assertHeaders_(sheet, [
    "稽古日", "member_id", "location_id", "billing_block_id", "slot_id", "状態"
  ]);

  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  const dateText = formatAttendanceDate_(attendanceDate);

  return values.map((valuesRow, index) => {
    const row = { _rowNumber: index + 2 };
    headers.forEach((header, column) => row[header] = valuesRow[column]);
    return row;
  }).filter(row =>
    isActiveMasterRow_(row) &&
    formatAttendanceDate_(row["稽古日"]) === dateText &&
    normalizeId_(row["member_id"]) === normalizeId_(memberId) &&
    normalizeId_(row["location_id"]) === normalizeId_(locationId) &&
    normalizeId_(row["billing_block_id"]) === normalizeId_(billingBlockId)
  );
}

function cancelAttendanceRows(ctx, attendanceRows, teacherId, reason) {
  if (!attendanceRows || attendanceRows.length === 0) return;

  const sheet = getRequiredSheet_(ctx, "07_出席ログ");
  const headerInfo = assertHeaders_(sheet, [
    "状態", "取消日時", "取消者teacher_id", "取消理由"
  ]);
  const cancelledAt = sup_now(ctx);

  attendanceRows.forEach(row => {
    const rowNumber = Number(row._rowNumber);
    if (!rowNumber || rowNumber < 2) throw new Error("取消対象の行番号が不正です。");
    sheet.getRange(rowNumber, headerInfo.map["状態"] + 1).setValue("取消");
    sheet.getRange(rowNumber, headerInfo.map["取消日時"] + 1).setValue(cancelledAt);
    sheet.getRange(rowNumber, headerInfo.map["取消者teacher_id"] + 1).setValue(teacherId);
    sheet.getRange(rowNumber, headerInfo.map["取消理由"] + 1).setValue(reason || "画面同期による選択解除");
  });

  invalidateAttendances(ctx);
}
