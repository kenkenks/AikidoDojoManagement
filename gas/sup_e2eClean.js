// ==============================
// E2E test data clean
// ==============================
/**
 * 指定した member_id に関係する会費データだけを残し、
 * それ以外のE2Eテストデータを物理削除する。
 *
 * 実行例:
 *   e2eCleanExceptMembers(["M001", "M005"]);
 *
 * NOTE:
 * - マスタは削除しない。
 * - 07_出席ログは対象外。
 * - 削除件数表示、dry-run、論理削除は扱わない。
 * - 請求グループ単位で整合性を保つため、指定会員と同じ
 *   billing_group_id に属する会費データは残す。
 */

/**
 * スプレッドシートメニューからE2Eクリーンを実行する。
 * 残したい member_id をカンマ区切りで入力する。
 */
function showE2eCleanPrompt() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    "E2Eテストデータ クリーン",
    "残す member_id をカンマ区切りで入力してください。\n" +
      "例: M001,M005\n\n" +
      "指定した会員（同じ請求グループを含む）以外の会費テストデータを物理削除します。",
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) return;

  const keepMemberIds = String(response.getResponseText() || "")
    .split(/[\s,，]+/)
    .map(function(value) { return value.trim(); })
    .filter(function(value) { return !!value; });

  try {
    const result = e2eCleanExceptMembers(keepMemberIds);
    ui.alert("E2Eテストデータ クリーン", result.message, ui.ButtonSet.OK);
  } catch (err) {
    ui.alert(
      "E2Eテストデータ クリーン - エラー",
      err && err.message ? err.message : String(err),
      ui.ButtonSet.OK
    );
  }
}

function e2eCleanExceptMembers(keepMemberIds) {
  const ctx = createSheetContext();
  return e2eClean_exceptMembers_(keepMemberIds, ctx);
}

function e2eClean_exceptMembers_(keepMemberIds, ctx) {
  ctx = ensureSheetContext(ctx);

  const keepMemberSet = e2eClean_normalizeSet_(keepMemberIds);
  const requestedMemberIds = Object.keys(keepMemberSet);
  if (requestedMemberIds.length === 0) {
    throw new Error("残す member_id を1件以上指定してください。");
  }

  // 削除開始前に、保持対象の関連キーをすべて確定する。
  const members = getMembers(ctx);
  const existingMemberSet = {};
  const keepBillingGroupSet = {};

  members.forEach(function(row) {
    const memberId = normalizeId_(row["member_id"]);
    if (!memberId) return;
    existingMemberSet[memberId] = true;

    if (keepMemberSet[memberId]) {
      const billingGroupId = normalizeId_(row["請求グループID"] || row["billing_group_id"]);
      if (billingGroupId) keepBillingGroupSet[billingGroupId] = true;
    }
  });

  const missingMemberIds = requestedMemberIds.filter(function(memberId) {
    return !existingMemberSet[memberId];
  });
  if (missingMemberIds.length > 0) {
    throw new Error("01_会員マスタに存在しない member_id があります: " + missingMemberIds.join(", "));
  }

  const invoiceRows = getInvoices(ctx);
  const keepInvoiceSet = {};
  invoiceRows.forEach(function(row) {
    if (e2eClean_keepByMemberOrGroup_(row, keepMemberSet, keepBillingGroupSet)) {
      const invoiceId = normalizeId_(row["invoice_id"]);
      if (invoiceId) keepInvoiceSet[invoiceId] = true;
    }
  });

  // 下流から削除する。判定に必要なキーは上で収集済み。
  e2eClean_deleteRowsExcept_("09_決済エビデンス", function(row) {
    return e2eClean_keepByMemberOrInvoice_(row, keepMemberSet, keepInvoiceSet);
  }, ctx);

  e2eClean_deleteRowsExcept_("06_入金ログ", function(row) {
    return e2eClean_keepByMemberOrGroup_(row, keepMemberSet, keepBillingGroupSet) ||
      e2eClean_keepByInvoice_(row, keepInvoiceSet);
  }, ctx);

  e2eClean_deleteRowsExcept_("20_会費状態View", function(row) {
    return e2eClean_keepByMemberOrGroup_(row, keepMemberSet, keepBillingGroupSet);
  }, ctx);

  e2eClean_deleteRowsExcept_("05_請求明細", function(row) {
    return e2eClean_keepByMemberOrGroup_(row, keepMemberSet, keepBillingGroupSet) ||
      e2eClean_keepByInvoice_(row, keepInvoiceSet);
  }, ctx);

  e2eClean_deleteRowsExcept_("04_月次選択", function(row) {
    return e2eClean_keepByMemberOrGroup_(row, keepMemberSet, keepBillingGroupSet);
  }, ctx);

  return {
    ok: true,
    keep_member_ids: requestedMemberIds,
    message: "指定会員に関係しないE2E会費データをクリーンしました。"
  };
}

function e2eClean_normalizeSet_(values) {
  const set = {};
  (Array.isArray(values) ? values : []).forEach(function(value) {
    const id = normalizeId_(value);
    if (id) set[id] = true;
  });
  return set;
}

function e2eClean_keepByMemberOrGroup_(row, memberSet, billingGroupSet) {
  const memberId = normalizeId_(row["member_id"]);
  const billingGroupId = normalizeId_(row["billing_group_id"] || row["請求グループID"]);
  return !!((memberId && memberSet[memberId]) ||
    (billingGroupId && billingGroupSet[billingGroupId]));
}

function e2eClean_keepByMemberOrInvoice_(row, memberSet, invoiceSet) {
  const memberId = normalizeId_(row["member_id"]);
  const invoiceId = normalizeId_(row["invoice_id"]);
  return !!((memberId && memberSet[memberId]) ||
    (invoiceId && invoiceSet[invoiceId]));
}

function e2eClean_keepByInvoice_(row, invoiceSet) {
  const invoiceId = normalizeId_(row["invoice_id"]);
  return !!(invoiceId && invoiceSet[invoiceId]);
}

function e2eClean_deleteRowsExcept_(sheetName, keepPredicate, ctx) {
  const sheet = getRequiredSheet_(sheetName, ctx);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return;

  const headers = values[0].map(function(header) {
    return String(header).trim();
  });

  for (let rowIndex = values.length - 1; rowIndex >= 1; rowIndex--) {
    const row = {};
    headers.forEach(function(header, column) {
      row[header] = values[rowIndex][column];
    });

    if (!keepPredicate(row)) {
      sheet.deleteRow(rowIndex + 1);
    }
  }

  invalidateSheetRows(ctx, sheetName);
}
