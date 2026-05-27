/**
 * Viewシートの行をキーで検索し、存在すれば更新、なければ追加する
 *
 * @param {string} sheetName
 * @param {string[]} keyColumns
 * @param {Object} keyValues
 * @param {Object} updateValues
 */
function upsertViewRow(sheetName, keyColumns, keyValues, updateValues) {
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

/**
 * ヘッダー名から列indexを引くMapを作る
 *
 * @param {string[]} headers
 * @return {Object}
 */
function getHeaderMap(headers) {
  const map = {};

  headers.forEach((header, index) => {
    map[String(header).trim()] = index;
  });

  return map;
}

function normalizeKeyValue(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM");
  }
  return String(value).trim();
}