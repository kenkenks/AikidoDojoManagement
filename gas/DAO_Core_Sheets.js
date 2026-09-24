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

// 行単位更新が必要な移行途中の業務向け。物理行番号はDAO Businessより外へ広げない。
function daoCoreSheets_readWithRowNumbers(table, ctx, requiredHeaders) {
  ctx = ensureSheetContext(ctx);
  const sheetName = daoCoreSheets_tableName_(table);
  const sheet = getRequiredSheet_(sheetName, ctx);
  if (requiredHeaders && requiredHeaders.length) assertHeaders_(sheet, requiredHeaders);
  const values = sheet.getDataRange().getValues();
  const headers = (values[0] || []).map(function(header) { return String(header).trim(); });
  const rows = [];
  for (let index = 1; index < values.length; index++) {
    const source = values[index];
    if (!source.some(function(cell) { return cell !== ''; })) continue;
    const row = {};
    headers.forEach(function(header, column) { row[header] = source[column]; });
    row._rowNumber = index + 1;
    rows.push(row);
  }
  return rows;
}

function daoCoreSheets_updateCellsByRowNumber(table, updates, ctx, requiredHeaders) {
  ctx = ensureSheetContext(ctx);
  if (!updates || updates.length === 0) return;

  const sheetName = daoCoreSheets_tableName_(table);
  const sheet = getRequiredSheet_(sheetName, ctx);
  if (requiredHeaders && requiredHeaders.length) assertHeaders_(sheet, requiredHeaders);
  const header = getHeaderMap_(sheet);

  updates.forEach(function(update) {
    const rowNumber = Number(update.rowNumber);
    if (!rowNumber || rowNumber < 2) throw new Error(sheetName + ' の更新行番号が不正です。');
    Object.keys(update.values || {}).forEach(function(key) {
      if (header.map[key] === undefined) throw new Error(sheetName + 'に ' + key + ' 列がありません。');
      sheet.getRange(rowNumber, header.map[key] + 1).setValue(update.values[key]);
    });
  });

  invalidateSheetRows(ctx, sheetName);
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

function daoCoreSheets_appendValidated(table, objects, requiredHeaders, ctx) {
  ctx = ensureSheetContext(ctx);
  const sheetName = daoCoreSheets_tableName_(table);
  const sheet = getRequiredSheet_(sheetName, ctx);
  assertHeaders_(sheet, requiredHeaders || []);
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


// Viewの生値を保持する（空行・重複ヘッダーも変更しない）。
function daoCoreSheets_readPaymentStatusValues(ctx) {
  const sheet = getRequiredSheet_("20_会費状態View", ctx);
  return sheet.getDataRange().getValues();
}

function daoCoreSheets_upsertPaymentStatusRow(keyValues, updateValues, ctx) {
  const sheetName = "20_会費状態View";
  const keyColumns = ["target_month", "member_id"];
  // 既存契約を維持: Upsertはactive spreadsheetを使用する。
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(`シートが見つかりません: ${sheetName}`);
  }

  const values = sheet.getDataRange().getValues();

  if (values.length === 0) {
    throw new Error(`ヘッダー行がありません: ${sheetName}`);
  }

  const headers = values[0];
  const headerMap = getHeaderMap(headers);

  // キー列存在チェック
  keyColumns.forEach(col => {
    if (headerMap[col] === undefined) {
      throw new Error(`キー列が存在しません: ${sheetName}.${col}`);
    }
  });

  // 更新列存在チェック
  Object.keys(updateValues).forEach(col => {
    if (headerMap[col] === undefined) {
      throw new Error(`更新列が存在しません: ${sheetName}.${col}`);
    }
  });

  let targetRowIndex = -1;

  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    const matched = keyColumns.every(col => {
      return normalizeKeyValue(row[headerMap[col]]) === normalizeKeyValue(keyValues[col]);
    });

    if (matched) {
      targetRowIndex = i;
      break;
    }
  }

  if (targetRowIndex >= 0) {
    // 既存行更新
    const row = values[targetRowIndex];

    Object.keys(updateValues).forEach(col => {
      row[headerMap[col]] = updateValues[col];
    });

    sheet
      .getRange(targetRowIndex + 1, 1, 1, headers.length)
      .setValues([row]);

  } else {
    // 新規行追加
    const newRow = new Array(headers.length).fill("");

    Object.keys(keyValues).forEach(col => {
      if (headerMap[col] !== undefined) {
        newRow[headerMap[col]] = keyValues[col];
      }
    });

    Object.keys(updateValues).forEach(col => {
      newRow[headerMap[col]] = updateValues[col];
    });

    sheet.appendRow(newRow);
  }
}


function daoCoreSheets_ensurePaymentStatusHeaders(updateValues, ctx) {
  ctx = ensureSheetContext(ctx);

  const sheet = ctx.ss.getSheetByName("20_会費状態View");
  if (!sheet) {
    throw new Error("シートが見つかりません: 20_会費状態View");
  }

  const lastColumn = sheet.getLastColumn();
  const headers = lastColumn > 0
    ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(header) {
        return String(header).trim();
      })
    : [];

  const existing = {};
  headers.forEach(function(header) {
    if (header) existing[header] = true;
  });

  const missing = Object.keys(updateValues || {}).filter(function(header) {
    return !existing[header];
  });

  if (missing.length === 0) return;

  const t0 = Date.now();
  sheet
    .getRange(1, headers.length + 1, 1, missing.length)
    .setValues([missing]);
  console.log(
    "[PERF-WRITE] sheet=20_会費状態View" +
    " op=append_headers rows=1 cols=" + missing.length +
    " ms=" + (Date.now() - t0)
  );
}

function daoCoreSheets_updateEvidenceRowAtomic(rowNumber, valuesByHeader, requiredHeaders, ctx) {


  const sheet = getRequiredSheet_("09_決済エビデンス", ctx);
  const headerInfo = assertHeaders_(sheet, requiredHeaders);
  const width = headerInfo.headers.length;
  const rowValues = sheet.getRange(rowNumber, 1, 1, width).getValues()[0];

  Object.keys(valuesByHeader).forEach(function(header) {
    if (headerInfo.map[header] === undefined) {
      throw new Error("09_決済エビデンス に列がありません: " + header);
    }
    rowValues[headerInfo.map[header]] = valuesByHeader[header];
  });

  sheet.getRange(rowNumber, 1, 1, width).setValues([rowValues]);

}

function daoCoreSheets_ensurePaymentReceptionSchema(requiredHeaders, ctx) {

  const results = {};
  ["09_決済エビデンス", "06_入金ログ"].forEach(function(sheetName) {
    const sheet = getRequiredSheet_(sheetName, ctx);
    const before = getHeaderMap_(sheet).headers.length;
    const missing = requiredHeaders.filter(function(header) {
      return getHeaderMap_(sheet).map[header] === undefined;
    });
    if (missing.length > 0) {
      sheet.getRange(1, before + 1, 1, missing.length).setValues([missing]);
      invalidateSheetRows(ctx, sheetName);
    }
    results[sheetName] = { added_headers: missing };
  });
  return { ok: true, sheets: results };
}

function daoCoreSheets_ensureMemberRankHeaders_(sheet, requiredHeaders) {
  const headerInfo = getHeaderMap_(sheet);
  const missing = requiredHeaders.filter(function(header) {
    return headerInfo.map[header] === undefined;
  });

  if (missing.length > 0) {
    sheet.getRange(1, headerInfo.headers.length + 1, 1, missing.length).setValues([missing]);
  }
  return getHeaderMap_(sheet);
}

function daoCoreSheets_openMemberRankUpdates(requiredHeaders, ctx) {
  const sheet = getRequiredSheet_("01_会員マスタ", ctx);
  const headerInfo = daoCoreSheets_ensureMemberRankHeaders_(sheet, requiredHeaders);
  const values = sheet.getDataRange().getValues();
  return {
    headerInfo: headerInfo,
    values: values,
    writeRank: function(rowNumber, rankColumn, sourceColumn, updatedAtColumn, rank, source) {
      sheet.getRange(rowNumber, rankColumn + 1).setValue(rank);
      sheet.getRange(rowNumber, sourceColumn + 1).setValue(source);
      sheet.getRange(rowNumber, updatedAtColumn + 1).setValue(sup_now(ctx));
    },
    invalidate: function() { invalidateSheetRows(ctx, "01_会員マスタ"); }
  };
}

function daoCoreSheets_ensureMemberRankSchema(requiredHeaders, ctx) {
  const sheet = getRequiredSheet_("01_会員マスタ", ctx);
  const before = getHeaderMap_(sheet).headers.length;
  const headerInfo = daoCoreSheets_ensureMemberRankHeaders_(sheet, requiredHeaders);
  return headerInfo.headers.length - before;
}

function daoCoreSheets_ensureTeacherAttendanceSchema(attendanceHeaders, roleHeaders, ctx) {

  let sheet = ctx.ss.getSheetByName("16_先生出席ログ");
  if (!sheet) {
    sheet = ctx.ss.insertSheet("16_先生出席ログ");
    sheet.getRange(1, 1, 1, attendanceHeaders.length).setValues([attendanceHeaders]);
  } else {
    daoCoreSheets_addTeacherAttendanceHeaders_(sheet, attendanceHeaders);
  }
  const teacherSheet = getRequiredSheet_("11_先生マスタ", ctx);
  const addedTeacherHeaders = daoCoreSheets_addTeacherAttendanceHeaders_(teacherSheet, roleHeaders);
  invalidateSheetRows(ctx, "11_先生マスタ");
  invalidateTeacherAttendances(ctx);
  return { ok:true, sheet_name:"16_先生出席ログ", added_teacher_headers:addedTeacherHeaders };
}

function daoCoreSheets_addTeacherAttendanceHeaders_(sheet, required) {
  const info = getHeaderMap_(sheet);
  const missing = required.filter(function(header) { return info.map[header] === undefined; });
  if (missing.length) sheet.getRange(1, info.headers.length + 1, 1, missing.length).setValues([missing]);
  return missing;
}

function daoCoreSheets_cancelTeacherAttendanceRow(row, ctx) {
  const sheet = getRequiredSheet_("16_先生出席ログ", ctx);
  const info = assertHeaders_(sheet, ["teacher_attendance_id", "状態", "取消日時", "取消理由"]);
  const id = normalizeId_(row["teacher_attendance_id"]);
  const values = sheet.getDataRange().getValues();
  for (let index = 1; index < values.length; index++) {
    if (normalizeId_(values[index][info.map["teacher_attendance_id"]]) !== id) continue;
    sheet.getRange(index + 1, info.map["状態"] + 1).setValue("取消");
    sheet.getRange(index + 1, info.map["取消日時"] + 1).setValue(sup_now(ctx));
    sheet.getRange(index + 1, info.map["取消理由"] + 1).setValue("先生出席画面の選択解除・担当変更");
    break;
  }
  invalidateTeacherAttendances(ctx);
}

function daoCoreSheets_appendTeacherAttendanceRows(rows, ctx) {
  appendObjectsByHeader_(getRequiredSheet_("16_先生出席ログ", ctx), rows);
  invalidateTeacherAttendances(ctx);
}

function daoCoreSheets_ensureExaminationMaster(ctx, sheetName, headers, initialRows) {
  let sheet = ctx.ss.getSheetByName(sheetName);
  let created = false;
  if (!sheet) {
    sheet = ctx.ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    created = true;
  }
  assertHeaders_(sheet, headers);
  let seeded = false;
  if (sheet.getLastRow() === 1) {
    sheet.getRange(2, 1, initialRows.length, headers.length).setValues(initialRows);
    seeded = true;
  }
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
  return "作成=" + created + " / 初期行追加=" + seeded;
}

function daoCoreSheets_beginMemberCards(headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const memberSheet = ss.getSheetByName("01_会員マスタ");
  let cardSheet = ss.getSheetByName("08_会員カード");
  if (!cardSheet) cardSheet = ss.insertSheet("08_会員カード");
  cardSheet.clear();
  cardSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  return {
    readMembers: function() { return readSheet(memberSheet); },
    writeRows: function(rows) { cardSheet.getRange(2, 1, rows.length, headers.length).setValues(rows); }
  };
}

function daoCoreSheets_readMemberCardMemberValues() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("01_会員マスタ");
  return sheet.getDataRange().getValues();
}

function daoCoreSheets_createMemberCardTemplate() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let sheet = ss.getSheetByName("08_会員カード_テンプレート");
  if (!sheet) {
    sheet = ss.insertSheet("08_会員カード_テンプレート");
  }

  sheet.clear();

  // レイアウト調整
  sheet.setColumnWidths(1, 1, 120);
  sheet.setColumnWidths(2, 1, 220);
  sheet.setColumnWidths(3, 1, 220);
  sheet.setRowHeights(1, 12, 36);
  sheet.setRowHeight(8, 180);

  // 入力欄
  sheet.getRange("A1").setValue("会員ID");
  sheet.getRange("B1").setValue("M001");
  sheet.getRange("A1:B1").setFontWeight("bold");

  // カード枠
  sheet.getRange("A3:C10").setBorder(true, true, true, true, true, true);
  sheet.getRange("A3:C3").merge().setValue("道場 会員証")
    .setFontSize(20)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  sheet.getRange("A5").setValue("氏名");
  sheet.getRange("B5:C5").merge()
    .setFormula('=IFERROR(VLOOKUP($B$1,\'01_会員マスタ\'!A:Z,2,FALSE),"")')
    .setFontSize(18)
    .setFontWeight("bold");

  sheet.getRange("A6").setValue("会員ID");
  sheet.getRange("B6:C6").merge().setFormula("=$B$1");

  sheet.getRange("A7").setValue("区分");
  sheet.getRange("B7:C7").merge()
    .setFormula('=IFERROR(VLOOKUP($B$1,\'01_会員マスタ\'!A:Z,4,FALSE),"")');

  sheet.getRange("A8").setValue("QR");
  sheet.getRange("B8:C10").merge()
    .setFormula(
      '=IF($B$1="","",IMAGE("https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=" & ENCODEURL($B$12)))'
    )
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  // URL生成欄
  sheet.getRange("A12").setValue("URL");
  sheet.getRange("B12:C12").merge()
    .setFormula('=$B$14 & "?member_id=" & ENCODEURL($B$1)');

  sheet.getRange("A14").setValue("WebアプリURL");
  sheet.getRange("B14:C14").merge().setValue(getSetting("WEB_APP_URL"));

  // 見た目
  sheet.getRange("A3:C10")
    .setVerticalAlignment("middle")
    .setFontFamily("Arial");

  sheet.getRange("A5:A8").setFontWeight("bold");
  sheet.getRange("A12:A14").setFontWeight("bold");

  sheet.getRange("B14:C14").setWrap(true);
  sheet.getRange("B12:C12").setWrap(true);

}
