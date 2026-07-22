import fs from "node:fs";

const gas = fs.readFileSync(new URL("../gas/06_PaymentReceptionScope.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../web/qr/payment_teacher.html", import.meta.url), "utf8");

const checks = [
  [gas.includes("member_name: memberNames[memberId]"), "DTOに会員名がある"],
  [gas.includes("billing_group_id: normalizeId_"), "DTOに請求グループIDがある"],
  [gas.includes("payment_method_label:"), "DTOに支払方法表示名がある"],
  [gas.includes("paid_at: paymentStatusTeacher_formatDateTime_"), "DTOに受付日時がある"],
  [gas.includes("payments: payments"), "集計レスポンスに明細がある"],
  [html.includes("renderRegisteredPayments(result.payments || [])"), "画面が明細を描画する"],
  [html.includes("請求グループ ${escapeHtml(billing)}"), "請求グループを表示する"],
  [html.includes("payment.payment_method_label"), "支払方法を表示する"],
  [html.includes("payment.paid_at"), "受付日時を表示する"]
];

const failed = checks.filter(([ok]) => !ok).map(([, label]) => label);
if (failed.length) {
  console.error("FAIL\n- " + failed.join("\n- "));
  process.exit(1);
}
console.log("PASS: 会費受付の登録済み明細DTO・表示契約");
