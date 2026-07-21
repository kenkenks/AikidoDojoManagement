import fs from "node:fs";
import vm from "node:vm";

const code = fs.readFileSync(new URL("../gas/03_BillingExtra.js", import.meta.url), "utf8");
let invoices = [];
let refreshed = false;

globalThis.ensureSheetContext = value => value || {};
globalThis.createSheetContext = () => ({});
globalThis.normalizeId_ = value => String(value || "").trim();
globalThis.normalizeMonth = value => String(value || "").trim();
globalThis.isActiveMasterRow_ = row => row["状態"] !== "取消" && row["状態"] !== "無効";
globalThis.sup_targetMonth = () => "2026-07";
globalThis.getMembers = () => [{ member_id:"M001", "請求グループID":"G001", "状態":"有効" }];
globalThis.getFees = () => [{ plan_id:"EXAM-KYU2", "会費タイプ":"審査費", "表示名":"2級審査費", "回数単価":5000, "状態":"有効" }];
globalThis.getInvoices = () => invoices;
globalThis.billingCoreMakeInvoiceObject_ = (month, groupId, memberId, planId, type, name, quantity, price) => ({
  invoice_id:"INV-TEST", target_month:month, billing_group_id:groupId, member_id:memberId,
  plan_id:planId, "請求種別":type, "表示名":name, "請求予定額":quantity * price, "支払状態":"未払い"
});
globalThis.billingRecordAppendInvoice_ = invoice => { invoices.push(invoice); };
globalThis.paymentStatusView_refresh = () => { refreshed = true; };

vm.runInThisContext(code);

const first = globalThis.billingExtraEnsureInvoice("M001", "EXAM-KYU2", {});
if (!first.ok || !first.created || invoices.length !== 1 || !refreshed) {
  throw new Error("exam invoice was not created");
}
const second = globalThis.billingExtraEnsureInvoice("M001", "EXAM-KYU2", {});
if (!second.ok || second.created !== false || invoices.length !== 1) {
  throw new Error("duplicate exam invoice was created");
}

console.log("Exam fee invoice creation: OK");
console.log("Duplicate prevention: OK");
