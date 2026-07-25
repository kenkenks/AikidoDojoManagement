function createSheetContext() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ctx = {
    ss: ss,
    cache: {},
    headerCache: {},
    sheetCache: createSheetObjectMap_(ss)
  };

  ctx.settings = sup_loadSettings(ctx);

  return ctx;
}

function ensureSheetContext(ctx) {
  ctx = ctx || {};

  if (!ctx.ss) {
    ctx.ss = SpreadsheetApp.getActiveSpreadsheet();
  }

  if (!ctx.cache) {
    ctx.cache = {};
  }

  if (!ctx.headerCache) {
    ctx.headerCache = {};
  }

  if (!ctx.sheetCache) {
    ctx.sheetCache = createSheetObjectMap_(ctx.ss);
  }

  // ss/cache を作った後に、設定を一度だけ読む
  if (!ctx.settings) {
    ctx.settings = sup_loadSettings(ctx);
  }

  return ctx;
}

function createSheetObjectMap_(ss) {
  const startedAt = Date.now();
  const result = {};
  ss.getSheets().forEach(function(sheet) {
    result[sheet.getName()] = sheet;
  });
  perfLog("load sheet object map", startedAt);
  return result;
}

function getContextSheet_(ctx, sheetName) {
  ctx = ensureSheetContext(ctx);
  return ctx.sheetCache[sheetName] || null;
}

function getSheetRows(ctx, sheetName) {
  if (!ctx.cache[sheetName]) {
    const sheet = getContextSheet_(ctx, sheetName);
    if (!sheet) throw new Error("シートが見つかりません: " + sheetName);
    const data = readSheetData_(sheet);
    ctx.cache[sheetName] = data.rows;
    ctx.headerCache[sheetName] = data.headers;
  }
  return ctx.cache[sheetName];
}

function assertSheetRowHeaders_(ctx, sheetName, requiredHeaders) {
  getSheetRows(ctx, sheetName);
  const headers = ctx.headerCache[sheetName] || [];
  const headerMap = {};
  headers.forEach(function(header, index) {
    if (header) headerMap[header] = index;
  });
  const missing = requiredHeaders.filter(function(header) {
    return headerMap[header] === undefined;
  });
  if (missing.length > 0) {
    throw new Error(sheetName + " に必要な列がありません: " + missing.join(", "));
  }
  return { headers:headers, map:headerMap };
}

function invalidateSheetRows(ctx, sheetName) {
  if (ctx && ctx.cache) {
    delete ctx.cache[sheetName];
  }
  if (ctx && ctx.headerCache) {
    delete ctx.headerCache[sheetName];
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

function getTeacherAttendances(ctx) {
  return getSheetRows(ctx, "16_先生出席ログ");
}

function getTrainingSlots(ctx) {
  return getSheetRows(ctx, "12_稽古枠マスタ");
}

function getBillingBlocks(ctx) {
  return getSheetRows(ctx, "13_課金枠マスタ");
}

function getRankMasterRows(ctx) {
  return getSheetRows(ctx, "14_級段位マスタ");
}

function getExaminationStandardRows(ctx) {
  return getSheetRows(ctx, "15_審査基準マスタ");
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

function invalidateTeacherAttendances(ctx) {
  invalidateSheetRows(ctx, "16_先生出席ログ");
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
