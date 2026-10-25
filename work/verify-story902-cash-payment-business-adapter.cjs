"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadManifest } = require("./story902-manifest-loader.cjs");
const { inspectCashPaymentEventContract, createCashPaymentCommand, createCashPaymentBusinessAdapter } =
  require("./story902-cash-payment-business-adapter.cjs");

const manifest = loadManifest().manifest;
const cashEvents = manifest.events.filter(event => event.eventType === "CASH_PAYMENT");
const fixture = Object.freeze({ source_member_id: "M001", member_id: "STORY902_M001", billing_group_id: "STORY902_G001",
  location_id: "STORY902_L001", billing_block_id: "STORY902_B001", reception_session_id: "STORY902_R001", plan_id: "P002" });
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function resolvedE040() {
  const copy = structuredClone(manifest), event = copy.events.find(item => item.eventId === "902-E040");
  event.specificationStatus = "EXECUTABLE";
  event.executionDateTime = "2027-07-02T20:10:00+09:00";
  event.dependencies.candidates = [];
  event.expected.businessValues = { specificationStatus: "CONFIRMED", accepted_amount: 1500, payment_count: 1 };
  return copy;
}
function input(patch = {}) { return { eventId: "902-E040", eventResults: {}, runId: "STORY902-CASH-TEST-001",
  requestId: "STORY902.CASH.REQ.001", fixture, ...patch }; }

test("manifest contains exactly 13 cash payment events", () => assert.equal(cashEvents.length, 13));
test("all current cash events remain blocked and do not acquire inferred dependencies", () => {
  for (const event of cashEvents) {
    const value = inspectCashPaymentEventContract({ manifest, eventId: event.eventId });
    assert.equal(value.status, "BLOCKED");
    assert.ok(value.blockers.some(item => item.code === "CONTINUATION_NOT_ESTABLISHED"));
    assert.ok(value.blockers.some(item => item.code === "EVENT_DATETIME_UNRESOLVED"));
    assert.ok(value.blockers.some(item => item.code === "EXPECTED_UNRESOLVED"));
    assert.deepEqual(event.dependencies.businessData, []);
    assert.deepEqual(event.dependencies.executionOrder, []);
  }
});
test("a resolved test-only contract maps to existing payment_cash_accept without client money", () => {
  const value = createCashPaymentCommand({ manifest: resolvedE040(), ...input() });
  assert.equal(value.status, "READY");
  assert.equal(value.executionDateTime, "2027-07-02T20:10:00+09:00");
  assert.deepEqual(value.command, { method: "POST", action: "payment_cash_accept", input: {
    request_id: "STORY902.CASH.REQ.001", location_id: "STORY902_L001", billing_block_id: "STORY902_B001",
    reception_session_id: "STORY902_R001", items: [{ member_id: "STORY902_M001", billing_group_id: "STORY902_G001" }]
  }});
  assert.equal(Object.hasOwn(value.command.input, "amount"), false);
  assert.equal(Object.hasOwn(value.command.input.items[0], "plan_id"), false);
  assert.equal(value.businessExecutionAllowed, false);
});
test("fixture member and plan must agree with manifest", () => {
  for (const changed of [{ source_member_id: "M999" }, { plan_id: "P999" }]) {
    const value = inspectCashPaymentEventContract({ manifest: resolvedE040(), eventId: "902-E040", fixture: { ...fixture, ...changed } });
    assert.equal(value.status, "BLOCKED");
    assert.ok(value.blockers.some(item => item.code.includes("MISMATCH")));
  }
});
test("blocked current manifest never calls transport", async () => {
  const transport = { kind: "STORY902_MOCK_TRANSPORT", calls: 0, async send() { this.calls += 1; } };
  const adapter = createCashPaymentBusinessAdapter({ manifest, transport });
  for (const [index, event] of cashEvents.entries()) {
    const value = await adapter.execute(input({ eventId: event.eventId, runId: `STORY902-CASH-BLOCK-${index}` }));
    assert.equal(value.status, "BLOCKED");
  }
  assert.equal(transport.calls, 0);
});
test("normal mock response is normalized and compared", async () => {
  const transport = { kind: "STORY902_MOCK_TRANSPORT", async send() { return { status: 200, body: { ok: true,
    billing_group_id: fixture.billing_group_id, accepted_amount: 1500, payments: [{ payment_id: "PAY-1" }], idempotent_replay: false } }; } };
  const value = await createCashPaymentBusinessAdapter({ manifest: resolvedE040(), transport }).execute(input());
  assert.equal(value.status, "PASS");
  assert.deepEqual(value.actual, { accepted_amount: 1500, payment_count: 1 });
  assert.equal(value.evidenceKind, "MOCK_ONLY");
});
test("expected mismatch is FAIL without repairing values", async () => {
  const transport = { kind: "STORY902_MOCK_TRANSPORT", async send() { return { status: 200, body: { ok: true,
    billing_group_id: fixture.billing_group_id, accepted_amount: 1000, payments: [{ payment_id: "PAY-1" }] } }; } };
  const value = await createCashPaymentBusinessAdapter({ manifest: resolvedE040(), transport }).execute(input());
  assert.equal(value.status, "FAIL");
  assert.equal(value.actual.accepted_amount, 1000);
});
test("request replay is never automatic inside one adapter", async () => {
  const transport = { kind: "STORY902_MOCK_TRANSPORT", calls: 0, async send() { this.calls += 1; return { status: 500, body: {} }; } };
  const adapter = createCashPaymentBusinessAdapter({ manifest: resolvedE040(), transport });
  assert.equal((await adapter.execute(input())).status, "UNKNOWN");
  const retry = await adapter.execute(input({ runId: "STORY902-CASH-TEST-002", requestId: "STORY902.CASH.REQ.002" }));
  assert.equal(retry.status, "BLOCKED");
  assert.equal(retry.reason.code, "EVENT_REEXECUTION_PROHIBITED");
  assert.equal(transport.calls, 1);
});
test("unsupported event types and non-mock transports are rejected", () => {
  assert.equal(inspectCashPaymentEventContract({ manifest, eventId: "902-E010" }).reason.code, "EVENT_NOT_SUPPORTED");
  assert.throws(() => createCashPaymentBusinessAdapter({ manifest, transport: { send() {} } }), /MOCK_TRANSPORT_REQUIRED/);
});
test("adapter has no real infrastructure client", () => {
  const source = fs.readFileSync(path.join(__dirname, "story902-cash-payment-business-adapter.cjs"), "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(|firebase-admin|@google-cloud\/firestore|https:\/\//);
});

(async () => {
  let passed = 0;
  for (const item of tests) {
    try { await item.fn(); passed += 1; process.stdout.write(`PASS ${item.name}\n`); }
    catch (error) { process.stderr.write(`FAIL ${item.name}\n${error.stack}\n`); process.exitCode = 1; }
  }
  process.stdout.write(`\n${passed}/${tests.length} PASS\n`);
})();
