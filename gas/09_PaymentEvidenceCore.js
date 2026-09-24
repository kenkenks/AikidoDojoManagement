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
  return daoPaymentFindEvidenceById_(evidenceId, ctx);
}

/**
 * ROLE
 * PaymentEvidenceCore / Query
 *
 * RESPONSIBILITY
 * invoice_id から 05_請求明細を取得する。
 */
function paymentEvidence_findInvoiceById_(invoiceId, ctx) {
  return daoPaymentFindInvoiceById_(invoiceId, ctx);
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
  daoPaymentUpdateEvidenceByRowNumber_(rowNumber, valuesByHeader, ctx);
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
