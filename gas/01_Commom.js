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




