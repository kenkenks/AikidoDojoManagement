import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../gas/05_Payment.js", import.meta.url), "utf8");
const match = source.match(/function payment_calculateInvoiceStatuses_\([\s\S]*?\n\}/);
assert.ok(match, "payment_calculateInvoiceStatuses_ がありません");

const sandbox = {
  normalizeId_: (value) => String(value ?? "").trim()
};
vm.createContext(sandbox);
vm.runInContext(`${match[0]}; this.calculate = payment_calculateInvoiceStatuses_;`, sandbox);

const invoices = [
  { rowNumber: 2, invoice_id: "MONTHLY", amount: 7500, current_status: "未払い" },
  { rowNumber: 3, invoice_id: "EXAM", amount: 2000, current_status: "未払い" }
];

let result = sandbox.calculate(invoices, [
  { invoice_id: "MONTHLY", 入金額: 7500 }
]);
assert.deepEqual(result.map((row) => row.status), ["支払済", "未払い"]);
assert.deepEqual(result.map((row) => row.unpaid_amount), [0, 2000]);

result = sandbox.calculate(invoices, [
  { invoice_id: "MONTHLY", 入金額: 7500 },
  { invoice_id: "EXAM", 入金額: 2000 }
]);
assert.deepEqual(result.map((row) => row.status), ["支払済", "支払済"]);

result = sandbox.calculate(invoices, [
  { invoice_id: "", 入金額: 7500 }
]);
assert.deepEqual(result.map((row) => row.status), ["支払済", "未払い"]);

console.log("PASS verify-payment-invoice-allocation");
