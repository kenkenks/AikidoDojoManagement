function createSheetContext() {
  return {
    ss: SpreadsheetApp.getActiveSpreadsheet(),
    cache: {}
  };
}

function ensureSheetContext(ctx) {
  ctx = ctx || {};
  if (!ctx.ss) {
    ctx.ss = SpreadsheetApp.getActiveSpreadsheet();
  }
  if (!ctx.cache) {
    ctx.cache = {};
  }
  return ctx;
}

function getSheetRows(ctx, sheetName) {
  if (!ctx.cache[sheetName]) {
    const sheet = ctx.ss.getSheetByName(sheetName);
    ctx.cache[sheetName] = readSheet(sheet);
  }
  return ctx.cache[sheetName];
}

function invalidateSheetRows(ctx, sheetName) {
  if (ctx && ctx.cache) {
    delete ctx.cache[sheetName];
  }
}


//// シート専用ラッパー関数 (getXXX)

function getMembers(ctx) {
  return getSheetRows(ctx, "01_会員マスタ");
}

function getFees(ctx) {
  return getSheetRows(ctx, "03_料金マスタ");
}

function getMonthlySelections(ctx) {
  return getSheetRows(ctx, "04_月次選択");
}

function getInvoices(ctx) {
  return getSheetRows(ctx, "05_請求明細");
}

function getInvoice(invoice_id, ctx) {
  return getInvoices(ctx).find(row =>
    normalizeId_(row["invoice_id"]) === normalizeId_(invoice_id)
  );
}

function getPayments(ctx) {
  return getSheetRows(ctx, "06_入金ログ");
}

function getAttendances(ctx) {
  return getSheetRows(ctx, "07_出席ログ");
}

function getLocations(ctx) {
  return getSheetRows(ctx, "10_道場マスタ");
}

function getTeachers(ctx) {
  return getSheetRows(ctx, "11_先生マスタ");
}

function getTrainingSlots(ctx) {
  return getSheetRows(ctx, "12_稽古枠マスタ");
}

function getBillingBlocks(ctx) {
  return getSheetRows(ctx, "13_課金枠マスタ");
}

function getPaymentEvidences(ctx) {
  return getSheetRows(ctx, "09_決済エビデンス");
}

function getFeeStatusViewRows(ctx) {
  return getSheetRows(ctx, "20_会費状態View");
}

////------------------------------------------------
//// シート専用ラッパー関数 (invalidateXXX)
////
function invalidateMonthlySelections(ctx) {
  invalidateSheetRows(ctx, "04_月次選択");
}

function invalidateInvoices(ctx) {
  invalidateSheetRows(ctx, "05_請求明細");
}

function invalidatePayments(ctx) {
  invalidateSheetRows(ctx, "06_入金ログ");
}

function invalidateAttendances(ctx) {
  invalidateSheetRows(ctx, "07_出席ログ");
}

function invalidateTrainingSlots(ctx) {
  invalidateSheetRows(ctx, "12_稽古枠マスタ");
}

function invalidateBillingBlocks(ctx) {
  invalidateSheetRows(ctx, "13_課金枠マスタ");
}

function invalidatePaymentEvidences(ctx) {
  invalidateSheetRows(ctx, "09_決済エビデンス");
}

function invalidateFeeStatusView(ctx) {
  invalidateSheetRows(ctx, "20_会費状態View");
}
