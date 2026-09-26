// Step6-B: existing 04_月次選択 business persistence boundary through Portable DAO.
function daoPortableMonthlySelection_(ctx) {
  ctx = ensureSheetContext(ctx || createSheetContext());
  return DojoPortableDaoMonthlySelection.create({}, { spreadsheet: ctx.ss });
}

function daoPortableMonthlySelection_readAll_(ctx) {
  return daoPortableMonthlySelection_(ctx).readAll('monthlySelection');
}

function daoPortableMonthlySelection_append_(selection, ctx) {
  var result = daoPortableMonthlySelection_(ctx).appendRecord('monthlySelection', selection);
  if (result && result.appended) invalidateMonthlySelections(ctx);
  return result;
}
