// ========================================
// 09_PaymentEvidenceCore.js
// 決済エビデンス共通Core
// ========================================
//
// TYPE: CORE
// AREA: PAYMENT
// TAG: PAYMENT_EVIDENCE
// TAG: CORE
//

/**
 * ROLE
 * PaymentEvidenceCore / Query
 *
 * RESPONSIBILITY
 * evidence_id から 09_決済エビデンス行を取得する。
 *
 * NOTE
 * rowNumber を返すため、更新処理でも利用する。
 */
function paymentEvidence_findRowById_(evidenceId, ctx) {
  ctx = ensureSheetContext(ctx);

  const sheet = getRequiredSheet_("09_決済エビデンス", ctx);
  const headerInfo = assertHeaders_(sheet, paymentEvidence_requiredHeaders_());
  const values = sheet.getDataRange().getValues();

  for (let r = 1; r < values.length; r++) {
    const valuesRow = values[r];
    if (normalizeId_(valuesRow[headerInfo.map["evidence_id"]]) === normalizeId_(evidenceId)) {
      const row = {};
      headerInfo.headers.forEach((header, index) => row[header] = valuesRow[index]);
      return {
        rowNumber: r + 1,
        row
      };
    }
  }

  return null;
}

/**
 * ROLE
 * PaymentEvidenceCore / Query
 *
 * RESPONSIBILITY
 * invoice_id から 05_請求明細を取得する。
 */
function paymentEvidence_findInvoiceById_(invoiceId, ctx) {
  const id = normalizeId_(invoiceId);
  if (!id) return null;

  return getInvoices(ctx).find(invoice =>
    normalizeId_(invoice["invoice_id"]) === id
  ) || null;
}

/**
 * ROLE
 * PaymentEvidenceCore / Update
 *
 * RESPONSIBILITY
 * 09_決済エビデンスの指定行をヘッダー名指定で更新する。
 *
 * NOTE
 * 将来的にはRepository候補。
 */
function paymentEvidence_updateColumns_(rowNumber, valuesByHeader, ctx) {
  ctx = ensureSheetContext(ctx);

  const sheet = getRequiredSheet_("09_決済エビデンス",ctx);
  const headerInfo = assertHeaders_(sheet, paymentEvidence_requiredHeaders_());

  Object.keys(valuesByHeader).forEach(header => {
    if (headerInfo.map[header] === undefined) {
      throw new Error("09_決済エビデンス に列がありません: " + header);
    }
    sheet.getRange(rowNumber, headerInfo.map[header] + 1).setValue(valuesByHeader[header]);
  });

  paymentEvidence_invalidate(ctx);
}

/**
 * 受付日を業務キー yyyy-MM-dd に正規化する。
 * Sheets の日付セルは Date として返るため、String(...).slice() は使用しない。
 */
function paymentEvidence_normalizeReceptionDate_(value) {
  if (!value) return "";
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  const text = String(value).trim();
  const match = text.match(/^(\d{4})[-\/]?(\d{1,2})[-\/]?(\d{1,2})/);
  if (!match) return "";
  return match[1] + "-" + String(Number(match[2])).padStart(2, "0") + "-" + String(Number(match[3])).padStart(2, "0");
}
