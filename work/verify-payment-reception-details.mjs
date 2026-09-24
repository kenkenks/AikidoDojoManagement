import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const gas = fs.readFileSync(new URL("../gas/06_PaymentReceptionScope.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../web/qr/payment_teacher.html", import.meta.url), "utf8");

const checks = [
  [html.includes("renderRegisteredPayments(result.payments || [])"), "画面が明細を描画する"],
  [html.includes("請求グループ ${escapeHtml(billing)}"), "請求グループを表示する"],
  [html.includes("payment.payment_method_label"), "支払方法を表示する"],
  [html.includes("payment.paid_at"), "受付日時を表示する"]
];

// DTOの実際の返却値を検証する。実装中の変数名・変換式には依存しない。
const payment = { payment_id: "PAY1", member_id: "M1", billing_group_id: "G1", invoice_id: "INV1", target_month: "2026-09", amount: 3000, payment_method: "CASH", paid_at: "2026-09-24 10:30", reception_date: "2026-09-24", location_id: "L1", billing_block_id: "B1" };
const reads = [];
const context = {
  ensureSheetContext: value => value,
  normalizeId_: value => String(value || "").trim(),
  normalizeMonth: value => String(value || "").slice(0, 7),
  paymentStatusTeacher_normalizeDate_: value => String(value || "").slice(0, 10),
  paymentEvidence_normalizePaymentMethod_: value => value,
  paymentStatusView_parseInvoiceItems_: value => JSON.parse(value || "[]"),
  getSheetRows(ctx, name) {
    reads.push(name);
    return [{ member_id: "M1", billing_group_id: "G1", target_month: "2026-09", 会員名: "試験会員", invoice_items_json: "[]", reception_payments_json: JSON.stringify([payment]), attendance_items_json: "[]" }];
  }
};
vm.createContext(context);
vm.runInContext(gas, context);
const result = context.paymentReception_getScopeSummary({ reception_date: "2026-09-24", location_id: "L1", billing_block_id: "B1" }, {});
assert.equal(result.ok, true);
assert.deepEqual(JSON.parse(JSON.stringify(result.payments)), [{ payment_id: "PAY1", member_id: "M1", member_name: "試験会員", billing_group_id: "G1", invoice_id: "INV1", target_month: "2026-09", amount: 3000, payment_method: "CASH", payment_method_label: "現金", paid_at: "2026-09-24 10:30" }]);
assert.equal(result.cash_total, 3000);
assert.deepEqual(reads, ["20_会費状態View"]);

const failed = checks.filter(([ok]) => !ok).map(([, label]) => label);
if (failed.length) {
  console.error("FAIL\n- " + failed.join("\n- "));
  process.exit(1);
}
console.log("PASS: 会費受付の登録済み明細DTO・表示契約");
