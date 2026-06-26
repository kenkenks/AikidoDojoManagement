//--------------------------
// 共通
//--------------------------
function normalizeMonth(value) {

  if (value instanceof Date) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      "yyyy-MM"
    );
  }

  return String(value).trim();
}

//-----------------------------------------------------------------------------
function filterBySheet(memberId, rows, boolCol, boolValue) {
  return rows.filter(r =>

    String(r["member_id"]).trim() ===
      String(memberId).trim()

    &&

    String(r[boolCol]).trim() === boolValue
  );
}

function filterBySheetByDate(memberId, rows, boolCol, boolValue) {

  return rows.filter(r =>
    String(r["member_id"]).trim() === String(memberId).trim() &&
    normalizeMonth(r[boolCol]) === normalizeMonth(boolValue)
  );
}

function readSheet(sheet) {
  const t0 = Date.now();

  const values = sheet.getDataRange().getValues();
  const headers = values.shift();

  perfLog(
    `readSheet ${sheet.getName()}`,
    t0
  );

  return values
    .filter(row => row.some(cell => cell !== ""))
    .map(row => {
      const obj = {};
      headers.forEach((header, i) => {
        obj[header] = row[i];
      });
      return obj;
    });
}

function sheetLog(label, value) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('debug_log') || ss.insertSheet('debug_log');

  sh.appendRow([
    new Date(),
    label,
    typeof value === 'object' ? JSON.stringify(value) : value
  ]);
}