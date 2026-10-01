const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const billingRecordSource = fs.readFileSync(
  "gas/03_BillingRecord.js",
  "utf8"
);

const paymentSource = fs.readFileSync(
  "gas/DAO_Business_Payment.js",
  "utf8"
);

const billingMatch = billingRecordSource.match(
  /function billingRecordAppendInvoice_\([\s\S]*?\n\}/
);
assert.ok(billingMatch, "billingRecordAppendInvoice_ not found");

const loadMatch = paymentSource.match(
  /function daoPaymentLoadInvoiceStatusRows_\([\s\S]*?\n\}/
);
assert.ok(loadMatch, "daoPaymentLoadInvoiceStatusRows_ not found");

const updateMatch = paymentSource.match(
  /function daoPaymentUpdateInvoiceStatuses_\([\s\S]*?\n\}/
);
assert.ok(updateMatch, "daoPaymentUpdateInvoiceStatuses_ not found");

const calls = {
  append: [],
  read: [],
  updateByKey: []
};

const invoices = [
  {
    invoice_id: "INV-001",
    target_month: "2026-10",
    billing_group_id: "BG001",
    "請求予定額": 7500,
    "金額": 7000,
    "支払状態": "未払い"
  },
  {
    invoice_id: "INV-002",
    target_month: "2026-10",
    billing_group_id: "BG002",
    "請求予定額": "",
    "金額": 2000,
    "支払状態": "一部入金"
  }
];

let updateFound = true;

const sandbox = {
  daoContext_: ctx => ctx,
  daoCore_: ctx => ({
    append(table, rows, passedCtx) {
      calls.append.push({ table, rows, ctx: passedCtx });
      return { appended: true };
    },

    read(table, passedCtx) {
      calls.read.push({ table, ctx: passedCtx });
      return invoices;
    },

    updateByKey(table, keyField, keyValue, values, passedCtx) {
      calls.updateByKey.push({
        table,
        keyField,
        keyValue,
        values,
        ctx: passedCtx
      });
      return { found: updateFound };
    }
  })
};

vm.createContext(sandbox);

vm.runInContext(
  [
    billingMatch[0],
    loadMatch[0],
    updateMatch[0],
    "this.appendInvoice = billingRecordAppendInvoice_;",
    "this.loadStatuses = daoPaymentLoadInvoiceStatusRows_;",
    "this.updateStatuses = daoPaymentUpdateInvoiceStatuses_;"
  ].join("\n"),
  sandbox
);

const ctx = { marker: "CTX" };
const invoice = { invoice_id: "INV-NEW", "金額": 5000 };

const appendResult = sandbox.appendInvoice(invoice, ctx);

assert.deepEqual(appendResult, { appended: true });
assert.equal(calls.append.length, 1);
assert.equal(calls.append[0].table, "invoices");

assert.deepEqual(
  JSON.parse(JSON.stringify(calls.append[0].rows)),
  [invoice]
);

assert.equal(calls.append[0].ctx, ctx);

const statusRows = sandbox.loadStatuses(ctx);

assert.deepEqual(
  JSON.parse(JSON.stringify(statusRows)),
  [
    {
      rowNumber: 2,
      target_month: "2026-10",
      billing_group_id: "BG001",
      invoice_id: "INV-001",
      amount: 7500,
      current_status: "未払い"
    },
    {
      rowNumber: 3,
      target_month: "2026-10",
      billing_group_id: "BG002",
      invoice_id: "INV-002",
      amount: 2000,
      current_status: "一部入金"
    }
  ]
);

const updateResult = sandbox.updateStatuses(
  [
    { invoice_id: "INV-001", status: "支払済" },
    { invoice_id: "INV-002", status: "未払い" }
  ],
  ctx
);

assert.deepEqual(
  JSON.parse(JSON.stringify(updateResult)),
  { updated: 2 }
);

assert.equal(calls.updateByKey.length, 2);

assert.deepEqual(
  JSON.parse(JSON.stringify(calls.updateByKey[0])),
  {
    table: "invoices",
    keyField: "invoice_id",
    keyValue: "INV-001",
    values: { "支払状態": "支払済" },
    ctx: { marker: "CTX" }
  }
);

assert.throws(
  () => sandbox.updateStatuses([{ invoice_id: "", status: "支払済" }], ctx),
  /INVOICE_ID_REQUIRED_FOR_STATUS_UPDATE/
);

updateFound = false;

assert.throws(
  () => sandbox.updateStatuses(
    [{ invoice_id: "INV-MISSING", status: "支払済" }],
    ctx
  ),
  /INVOICE_NOT_FOUND_FOR_STATUS_UPDATE: INV-MISSING/
);

console.log("PASS verify-invoice-canonical-dao");