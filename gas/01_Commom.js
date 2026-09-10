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
