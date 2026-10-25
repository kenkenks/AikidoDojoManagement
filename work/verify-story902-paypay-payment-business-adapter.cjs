"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadManifest } = require("./story902-manifest-loader.cjs");
const { inspectPayPayEventContract, createPayPayWorkflow, createPayPayBusinessAdapter } =
  require("./story902-paypay-payment-business-adapter.cjs");

const manifest = loadManifest().manifest;
const fixture = Object.freeze({ source_member_id: "M001", member_id: "STORY902_M001", plan_id: "P002",
  location_id: "STORY902_L001", billing_block_id: "STORY902_B001", reception_session_id: "STORY902_R001",
  evidence_code: "STORY902-PAYPAY-1500" });
const requestIds = Object.freeze({ start: "STORY902.PAYPAY.START.001", record: "STORY902.PAYPAY.RECORD.001", post: "STORY902.PAYPAY.POST.001" });
const base = Object.freeze({ eventId: "902-E150", eventResults: {}, runId: "STORY902-PAYPAY-TEST-001", requestIds, fixture });
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function resolvedManifest() {
  const copy = structuredClone(manifest), event = copy.events.find(item => item.eventId === "902-E150");
  event.specificationStatus = "EXECUTABLE";
  event.executionDateTime = "2027-07-09T20:10:00+09:00";
  event.dependencies.candidates = [];
  event.expected.businessValues = { specificationStatus: "CONFIRMED", accepted_amount: 1500, payment_count: 1 };
  return copy;
}
function transport(overrides = {}) {
  const calls = [];
  return { kind: "STORY902_MOCK_TRANSPORT", calls, async send(command) {
    calls.push(command);
    if (overrides.errorAt === command.action) throw Object.assign(new Error("lost"), { code: "NETWORK_LOST" });
    if (overrides.responseAt?.[command.action]) return overrides.responseAt[command.action];
    if (command.action === "paypay_code_start") return { status: 200, body: { ok: true, evidenceItems: [{ evidence_id: "PPE-1" }] } };
    if (command.action === "paypay_code_record") return { status: 200, body: { ok: true, evidenceItems: [{ evidence_id: "PPE-1" }] } };
    if (command.action === "payment_paypay_post_selected") return { status: 200, body: { ok: true,
      results: [{ evidence_id: "PPE-1", payment_id: "PAY-1", amount: 1500 }] } };
    throw new Error("UNEXPECTED_ACTION");
  }};
}

test("manifest has one normal PayPay payment and two separate exceptional PayPay event types", () => {
  assert.equal(manifest.events.filter(event => event.eventType === "PAYPAY_PAYMENT").length, 1);
  assert.equal(manifest.events.filter(event => event.eventType === "PAYMENT_REPLAY_PAYPAY").length, 1);
  assert.equal(manifest.events.filter(event => event.eventType === "PAYMENT_DOUBLE_PAYPAY").length, 1);
});
test("current E150 remains blocked with every unresolved contract reason", () => {
  const value = inspectPayPayEventContract({ manifest, eventId: "902-E150" });
  assert.equal(value.status, "BLOCKED");
  assert.deepEqual(value.blockers.map(item => item.code), ["CONTINUATION_NOT_ESTABLISHED", "EVENT_DATETIME_UNRESOLVED", "EXPECTED_UNRESOLVED", "FIXTURE_INVALID"]);
  assert.equal(value.businessExecutionAllowed, false);
});
test("replay and double-payment events are not silently routed as normal reception", () => {
  for (const eventId of ["902-E450", "902-E460"])
    assert.equal(inspectPayPayEventContract({ manifest, eventId }).reason.code, "EVENT_NOT_SUPPORTED");
});
test("resolved test-only workflow starts with existing member action", () => {
  const value = createPayPayWorkflow({ manifest: resolvedManifest(), ...base });
  assert.equal(value.status, "READY");
  assert.equal(value.executionDateTime, "2027-07-09T20:10:00+09:00");
  assert.deepEqual(value.startCommand, { method: "POST", action: "paypay_code_start", input: {
    request_id: requestIds.start, member_id: fixture.member_id, plan_id: "P002", reception_date: "2027-07-09"
  }});
});
test("mock workflow calls start, record and teacher post in order", async () => {
  const mock = transport();
  const value = await createPayPayBusinessAdapter({ manifest: resolvedManifest(), transport: mock }).execute(base);
  assert.equal(value.status, "PASS");
  assert.deepEqual(mock.calls.map(call => call.action), ["paypay_code_start", "paypay_code_record", "payment_paypay_post_selected"]);
  assert.equal(mock.calls[1].input.evidence_code, fixture.evidence_code);
  assert.deepEqual(mock.calls[2].input.evidence_items, [{ evidence_id: "PPE-1" }]);
  assert.deepEqual(value.actual, { accepted_amount: 1500, payment_count: 1 });
});
test("fixture mismatch and missing PayPay code are blocked before transport", () => {
  for (const changed of [{ plan_id: "P999" }, { source_member_id: "M999" }, { evidence_code: "" }]) {
    const value = inspectPayPayEventContract({ manifest: resolvedManifest(), eventId: "902-E150", fixture: { ...fixture, ...changed } });
    assert.equal(value.status, "BLOCKED");
  }
});
test("invalid stage response stops the workflow as UNKNOWN", async () => {
  const mock = transport({ responseAt: { paypay_code_record: { status: 200, body: { ok: true, evidenceItems: [{ evidence_id: "OTHER" }] } } } });
  const value = await createPayPayBusinessAdapter({ manifest: resolvedManifest(), transport: mock }).execute(base);
  assert.equal(value.status, "UNKNOWN");
  assert.equal(value.reason.code, "RECORD_RESPONSE_INVALID");
  assert.equal(mock.calls.length, 2);
});
test("transport loss is UNKNOWN and the event is not automatically resent", async () => {
  const mock = transport({ errorAt: "payment_paypay_post_selected" });
  const adapter = createPayPayBusinessAdapter({ manifest: resolvedManifest(), transport: mock });
  assert.equal((await adapter.execute(base)).status, "UNKNOWN");
  const retry = await adapter.execute({ ...base, runId: "STORY902-PAYPAY-TEST-002" });
  assert.equal(retry.status, "BLOCKED");
  assert.equal(retry.reason.code, "EVENT_REEXECUTION_PROHIBITED");
  assert.equal(mock.calls.length, 3);
});
test("expected mismatch remains FAIL", async () => {
  const mock = transport({ responseAt: { payment_paypay_post_selected: { status: 200, body: { ok: true,
    results: [{ evidence_id: "PPE-1", payment_id: "PAY-1", amount: 1000 }] } } } });
  const value = await createPayPayBusinessAdapter({ manifest: resolvedManifest(), transport: mock }).execute(base);
  assert.equal(value.status, "FAIL");
  assert.equal(value.actual.accepted_amount, 1000);
});
test("blocked manifest never calls transport and implementation has no infrastructure client", async () => {
  const mock = transport();
  assert.equal((await createPayPayBusinessAdapter({ manifest, transport: mock }).execute(base)).status, "BLOCKED");
  assert.equal(mock.calls.length, 0);
  const source = fs.readFileSync(path.join(__dirname, "story902-paypay-payment-business-adapter.cjs"), "utf8");
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
