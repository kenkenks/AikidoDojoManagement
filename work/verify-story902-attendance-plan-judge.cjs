"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadManifest } = require("./story902-manifest-loader.cjs");
const { createAttendanceCommand, createAttendanceBusinessAdapter } = require("./story902-attendance-business-adapter.cjs");
const { BILLING_CONTRACTS, readExpected, normalizeResponse, validReadEvidence } =
  require("./story902-attendance-plan-judge.cjs");

const sourceManifest = loadManifest().manifest;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function monthlyManifest(amount = 4321) {
  const manifest = JSON.parse(JSON.stringify(sourceManifest));
  const event = manifest.events.find(item => item.eventId === "902-E020");
  event.executionDateTime = "2027-07-02T19:30:00+09:00";
  event.executionDateTimeSource = "TEST_ONLY";
  event.specificationStatus = "EXECUTABLE";
  event.expected.businessValues = { source: "SYNTHETIC_TEST_ONLY", specificationStatus: "CONFIRMED",
    billing_contract: "MONTHLY", plan_id: "P001", registered_count: 1, cancelled_count: 0,
    invoice_count: 1, planned_amount: amount };
  return manifest;
}
const fixture = Object.freeze({ source_member_id: "M002", member_id: "STORY902_M002", teacher_id: "STORY902_T002",
  location_id: "STORY902_L002", billing_block_id: "STORY902_B002", slot_id: "STORY902_S002", current_rank: "成人無級" });
const base = Object.freeze({ eventId: "902-E020", eventResults: {}, runId: "STORY902-PLAN-JUDGE-001",
  requestId: "STORY902_PLAN_JUDGE_REQ_001", sessionId: "STORY902_PLAN_JUDGE_SESSION_001", fixture });

test("legacy E010 Expected is inferred as the USAGE contract", () => {
  const event = sourceManifest.events.find(item => item.eventId === "902-E010");
  const expected = readExpected(event);
  assert.equal(expected.billing_contract, "USAGE");
  assert.deepEqual(expected, { registered_count: 1, cancelled_count: 0, charge_count: 1, planned_amount: 1500 });
});
test("usage response retains charge count and planned amount", () => {
  const expected = readExpected(sourceManifest.events.find(item => item.eventId === "902-E010"));
  const actual = normalizeResponse({ ok: true, registered_count: 1, cancelled_count: 0,
    usage_billing: [{ member_id: "M1", charge_count: 1, planned_amount: 1500 }] }, "M1", expected);
  assert.deepEqual(actual, expected);
});
test("usage response cannot substitute a skipped monthly result", () => {
  const expected = readExpected(sourceManifest.events.find(item => item.eventId === "902-E010"));
  assert.equal(normalizeResponse({ ok: true, registered_count: 1, cancelled_count: 0,
    usage_billing: [{ ok: true, skipped: true, plan_id: "P002" }] }, "M1", expected), null);
});
test("complete monthly Expected is accepted without calculating an amount", () => {
  const event = monthlyManifest().events.find(item => item.eventId === "902-E020");
  const expected = readExpected(event);
  assert.equal(expected.billing_contract, "MONTHLY");
  assert.deepEqual(expected, { registered_count: 1, cancelled_count: 0, plan_id: "P001",
    usage_billing_skipped: true, invoice_count: 1, planned_amount: 4321 });
});
test("monthly Expected without a confirmed amount remains unresolved", () => {
  const manifest = monthlyManifest();
  manifest.events.find(item => item.eventId === "902-E020").expected.businessValues.planned_amount = null;
  assert.equal(readExpected(manifest.events.find(item => item.eventId === "902-E020")), null);
  assert.equal(createAttendanceCommand({ manifest, ...base }).status, "BLOCKED");
});
test("monthly response requires an explicit successful skip for the selected plan", () => {
  const expected = readExpected(monthlyManifest().events.find(item => item.eventId === "902-E020"));
  assert.equal(normalizeResponse({ ok: true, registered_count: 1, cancelled_count: 0,
    usage_billing: [{ ok: true, skipped: false, plan_id: "P001" }] }, fixture.member_id, expected), null);
  assert.equal(normalizeResponse({ ok: true, registered_count: 1, cancelled_count: 0,
    usage_billing: [{ ok: true, skipped: true, plan_id: "OTHER" }] }, fixture.member_id, expected), null);
});
test("skipped alone is insufficient without monthly selection and invoice evidence", () => {
  const ready = createAttendanceCommand({ manifest: monthlyManifest(), ...base });
  const attendance = { ok: true, member_id: fixture.member_id, selected_slot_ids: [fixture.slot_id],
    billing_plan_selected: true, billing_plan_id: "P001" };
  assert.equal(validReadEvidence(attendance, { ok: true, memberId: fixture.member_id,
    targetMonth: "2027-07", planType: "P001", invoiceCount: 0, invoiceIds: [], billedTotal: 0 }, ready), false);
});
test("monthly evidence verifies plan selection, invoice count and billed total", () => {
  const ready = createAttendanceCommand({ manifest: monthlyManifest(), ...base });
  const attendance = { ok: true, member_id: fixture.member_id, selected_slot_ids: [fixture.slot_id],
    billing_plan_selected: true, billing_plan_id: "P001" };
  const billing = { ok: true, memberId: fixture.member_id, targetMonth: "2027-07", planType: "P001",
    invoiceCount: 1, invoiceIds: ["I1"], billedTotal: 4321 };
  assert.equal(validReadEvidence(attendance, billing, ready), true);
});
test("monthly adapter returns PASS only after response and read-after-write both match", async () => {
  const transport = { kind: "STORY902_MOCK_TRANSPORT",
    async send() { return { status: 200, body: { ok: true, registered_count: 1, cancelled_count: 0,
      usage_billing: [{ ok: true, skipped: true, plan_id: "P001" }] } }; },
    async read(request) { return request.action === "member_attendance_state"
      ? { ok: true, member_id: fixture.member_id, selected_slot_ids: [fixture.slot_id], billing_plan_selected: true, billing_plan_id: "P001" }
      : { ok: true, memberId: fixture.member_id, targetMonth: "2027-07", planType: "P001",
        invoiceCount: 1, invoiceIds: ["I1"], billedTotal: 4321 }; } };
  const value = await createAttendanceBusinessAdapter({ manifest: monthlyManifest(), transport }).execute(base);
  assert.equal(value.status, "PASS");
  assert.equal(value.evidenceKind, "MOCK_ONLY");
  assert.equal(value.businessExecutionAllowed, false);
});
test("47-event attendance plans are data, not hard-coded Judge branches", () => {
  const plans = [...new Set(sourceManifest.events.filter(item => item.eventType === "ATTENDANCE_REGISTER").map(item => item.planId))].sort();
  assert.deepEqual(plans, ["P001", "P002", "P011", "P020", "P021"]);
  assert.deepEqual(Object.values(BILLING_CONTRACTS).sort(), ["MONTHLY", "USAGE"]);
});
test("plan Judge has no network, Firebase, Firestore or TimeTrip client", () => {
  const source = fs.readFileSync(path.join(__dirname, "story902-attendance-plan-judge.cjs"), "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(|firebase-admin|@google-cloud\/firestore|TimeTrip|https:\/\//);
});

(async () => {
  let passed = 0;
  for (const item of tests) {
    try { await item.fn(); passed += 1; process.stdout.write(`PASS ${item.name}\n`); }
    catch (error) { process.stderr.write(`FAIL ${item.name}\n${error.stack}\n`); process.exitCode = 1; }
  }
  process.stdout.write(`\n${passed}/${tests.length} PASS\n`);
})();
