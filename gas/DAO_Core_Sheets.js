// Sheets DAO Core。既存の物理アクセス関数をここへ集約する第一段階。
// このファイル以外に残るSheet操作は段階移行の対象。

function readSheet(sheet) {
  return readSheetData_(sheet).rows;
}

function readSheetData_(sheet) {
  const t0 = Date.now();

  const values = sheet.getDataRange().getValues();
  const headers = (values.shift() || []).map(header => String(header).trim());

  perfLog(
    `readSheet ${sheet.getName()}`,
    t0
  );

  const rows = values
    .filter(row => row.some(cell => cell !== ""))
    .map(row => {
      const obj = {};
      headers.forEach((header, i) => {
        obj[header] = row[i];
      });
      return obj;
    });

  return {
    headers: headers,
    rows: rows
  };
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

  const t0 = Date.now();
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
  console.log(
    "[PERF-WRITE] sheet=" + sheet.getName() +
    " op=append rows=" + rows.length +
    " cols=" + headers.length +
    " ms=" + (Date.now() - t0)
  );
}

// 論理データ名と物理Sheet名の対応はCore内だけに置く。
function daoCoreSheets_tableName_(table) {
  const names = { members: '01_会員マスタ', fees: '03_料金マスタ', monthlySelections: '04_月次選択', invoices: '05_請求明細', payments: '06_入金ログ', attendances: '07_出席ログ', billingBlocks: '13_課金枠マスタ', trainingSlots: '12_稽古枠マスタ', paymentEvidences: '09_決済エビデンス' };
  if (!Object.prototype.hasOwnProperty.call(names, table)) throw new Error('未対応の論理データ: ' + table);
  return names[table];
}

function daoCoreSheets_read(table, ctx) {
  ctx = ensureSheetContext(ctx);
  return getSheetRows(ctx, daoCoreSheets_tableName_(table));
}

function daoCoreSheets_normalizeKey_(value) {
  return String(value == null ? '' : value).trim();
}

function daoCoreSheets_append(table, objects, ctx) {
  ctx = ensureSheetContext(ctx);
  const sheetName = daoCoreSheets_tableName_(table);
  const sheet = ctx.ss.getSheetByName(sheetName);
  appendObjectsByHeader_(sheet, objects);
  invalidateSheetRows(ctx, sheetName);
}

function daoCoreSheets_updateByKey(table, keyField, keyValue, values, ctx) {
  ctx = ensureSheetContext(ctx);
  const sheetName = daoCoreSheets_tableName_(table);
  const sheet = getRequiredSheet_(sheetName, ctx);
  const header = getHeaderMap_(sheet);
  const data = sheet.getDataRange().getValues();
  const keyColumn = header.map[keyField];
  if (keyColumn === undefined) throw new Error(sheetName + 'に ' + keyField + ' 列がありません。');
  let rowNo = -1;
  for (let i = 1; i < data.length; i++) {
    if (daoCoreSheets_normalizeKey_(data[i][keyColumn]) === daoCoreSheets_normalizeKey_(keyValue)) { rowNo = i + 1; break; }
  }
  if (rowNo < 0) return { found: false };
  const keys = Object.keys(values || {}).filter(function(key) { return header.map[key] !== undefined; });
  const t0 = Date.now();
  keys.forEach(function(key) { sheet.getRange(rowNo, header.map[key] + 1).setValue(values[key]); });
  console.log('[PERF-WRITE] sheet=' + sheet.getName() + ' op=update row=' + rowNo + ' cells=' + keys.length + ' ms=' + (Date.now() - t0));
  invalidateSheetRows(ctx, sheetName);
  return { found: true };
}

function daoCoreSheets_appendAttendanceRows(attendanceRows, ctx) {
  ctx = ensureSheetContext(ctx);

  const sheet = getRequiredSheet_("07_出席ログ", ctx);
  assertHeaders_(sheet, [
    "attendance_id", "稽古日", "登録日時", "member_id", "target_month",
    "location_id", "slot_id", "billing_block_id", "teacher_id",
    "attendance_session_id", "稽古時間分", "状態", "source"
  ]);
  appendObjectsByHeader_(sheet, attendanceRows);
  invalidateAttendances(ctx);
}

function daoCoreSheets_cancelAttendanceRows(attendanceRows, teacherId, reason, ctx) {
  ctx = ensureSheetContext(ctx);

  if (!attendanceRows || attendanceRows.length === 0) return;

  const sheet = getRequiredSheet_("07_出席ログ", ctx);
  const headerInfo = assertHeaders_(sheet, [
    "状態", "取消日時", "取消者teacher_id", "取消理由"
  ]);
  const cancelledAt = sup_now(ctx);

  attendanceRows.forEach(row => {
    const rowNumber = Number(row._rowNumber);
    if (!rowNumber || rowNumber < 2) throw new Error("取消対象の行番号が不正です。");
    const t0 = Date.now();
    sheet.getRange(rowNumber, headerInfo.map["状態"] + 1).setValue("取消");
    sheet.getRange(rowNumber, headerInfo.map["取消日時"] + 1).setValue(cancelledAt);
    sheet.getRange(rowNumber, headerInfo.map["取消者teacher_id"] + 1).setValue(teacherId);
    sheet.getRange(rowNumber, headerInfo.map["取消理由"] + 1).setValue(reason || "画面同期による選択解除");
    console.log(
      "[PERF-WRITE] sheet=" + sheet.getName() +
      " op=cancel row=" + rowNumber +
      " cells=4 ms=" + (Date.now() - t0)
    );
  });

  invalidateAttendances(ctx);
}

// 生ヘッダと空行を維持し、取消・更新用の物理行番号を付ける。
function daoCoreSheets_readAttendanceScopeRows(ctx) {
  const sheet = getRequiredSheet_("07_出席ログ", ctx);
  assertHeaders_(sheet, [
    "attendance_id",
    "稽古日",
    "member_id",
    "location_id",
    "billing_block_id",
    "slot_id",
    "teacher_id",
    "状態"
  ]);

  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  return values.map(function(valuesRow, index) {
    const row = { _rowNumber: index + 2 };
    headers.forEach(function(header, column) {
      row[header] = valuesRow[column];
    });
    return row;
  });
}

function daoCoreSheets_updateAttendanceRows(rows, updateValues, ctx) {
  ctx = ensureSheetContext(ctx);

  if (!rows || rows.length === 0) return;

  const sheet = getRequiredSheet_("07_出席ログ", ctx);
  const headerInfo = getHeaderMap_(sheet);
  const now = sup_now(ctx);

  rows.forEach(function(row) {
    const rowNumber = Number(row._rowNumber);
    if (!rowNumber || rowNumber < 2) {
      throw new Error("更新対象の行番号が不正です。");
    }

    Object.keys(updateValues || {}).forEach(function(header) {
      if (headerInfo.map[header] === undefined) return;
      sheet.getRange(rowNumber, headerInfo.map[header] + 1).setValue(updateValues[header]);
    });

    if (headerInfo.map["確認日時"] !== undefined) {
      sheet.getRange(rowNumber, headerInfo.map["確認日時"] + 1).setValue(now);
    }
  });

  invalidateAttendances(ctx);
}

