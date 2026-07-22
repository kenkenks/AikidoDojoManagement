import fs from "node:fs";
import vm from "node:vm";

const captured = [];
const context = {
  console,
  normalizeId_: value => String(value == null ? "" : value).trim(),
  normalizeMonth: value => String(value || "").slice(0, 7),
  sup_now: () => "2026-07-22 10:45",
  paymentEvidence_toDisplayPaymentMethod_: value => value === "CASH" ? "現金" : "PayPay",
  appendObjectsByHeader_: (sheet, rows) => captured.push(...rows),
  invalidatePayments: () => {},
  ensureSheetContext: value => value,
  Utilities: { getUuid: () => "12345678-0000" }
};
vm.createContext(context);
[
  "gas/09_PaymentEvidenceRequest.js",
  "gas/09_PaymentEvidencePost.js",
  "gas/05_Payment.js"
].forEach(file => vm.runInContext(fs.readFileSync(file, "utf8"), context));

const request = context.paymentEvidenceRequest_make({
  invoice_id: "INV-1",
  billing_group_id: "G1",
  member_id: "M1",
  payment_method: "CASH",
  amount: 3000,
  location_id: "HONBU",
  billing_block_id: "B_KYO_MON_1030_1230",
  teacher_id: "T001",
  reception_session_id: "PAYREC-20260722-HONBU-B_KYO_MON_1030_1230"
}, {});

const payment = context.paymentEvidencePost_make({
  evidence: {
    member_id: "M1",
    payment_method: "CASH",
    amount: 3000,
    evidence_id: "CASH-1",
    confirmed_at: "2026-07-22 10:45",
    location_id: request.location_id,
    billing_block_id: request.billing_block_id,
    teacher_id: request.teacher_id,
    reception_session_id: request.reception_session_id
  },
  invoice: {
    target_month: "2026-07",
    billing_group_id: "G1",
    invoice_id: "INV-1"
  }
}, {});

context.payment_append({
  ss: { getSheetByName: () => ({}) }
}, payment);

const saved = captured[0] || {};
for (const key of ["location_id", "billing_block_id", "teacher_id", "reception_session_id"]) {
  if (!request[key] || payment[key] !== request[key] || saved[key] !== request[key]) {
    throw new Error("scope propagation mismatch: " + key);
  }
}

console.log("Payment reception scope propagation: OK");
