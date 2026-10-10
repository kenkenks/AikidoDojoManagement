// Read-only inventory of known GAS master sheets. Never returns row values.
function runner_gas2firebase_master_inventory() {
  const names = [
    '01_会員マスタ', '03_料金マスタ', '03_料金プラン選択ルール',
    '10_道場マスタ', '11_先生マスタ', '12_稽古枠マスタ',
    '13_課金枠マスタ', '14_級段位マスタ', '15_審査基準マスタ'
  ];
  const ctx = createSheetContext();
  return { ok: true, sheets: names.map(function(name) {
    try {
      const rows = getSheetRows(ctx, name);
      const sheet = ctx && ctx.ss && ctx.ss.getSheetByName ? ctx.ss.getSheetByName(name) : null;
      // Header names are read from actual sheet if accessible; otherwise union of row keys.
      const headers = sheet && sheet.getLastColumn() > 0
        ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String)
        : Array.from(new Set(rows.reduce(function(acc, row) { return acc.concat(Object.keys(row)); }, [])));
      const types = {};
      headers.forEach(function(h) {
        types[h] = Array.from(new Set(rows.map(function(row) {
          const v = row[h];
          if (v === '' || v === null || v === undefined) return 'empty';
          if (v instanceof Date) return 'date';
          return typeof v;
        })));
      });
      return { sheet: name, ok: true, count: rows.length, headers: headers, types: types };
    } catch (e) { return { sheet: name, ok: false, error: String(e && e.message || e) }; }
  }) };
}
