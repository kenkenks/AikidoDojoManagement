"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadManifest } = require("./story902-manifest-loader.cjs");
const { inspectAttendanceEventContract, normalizeResponse } = require("./story902-attendance-business-adapter.cjs");

const manifest = loadManifest().manifest;
const contract = JSON.parse(fs.readFileSync(path.join(__dirname, "story902-e020-contract-readiness.json"), "utf8"));
const event = manifest.events.find(item => item.eventId === "902-E020");
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("E020 source identity matches the 47-event manifest", () => {
  assert.ok(event);
  assert.equal(event.sourceRow, 3);
  assert.equal(event.eventType, "ATTENDANCE_REGISTER");
  assert.equal(event.sourceDate, "2027-07-02");
  assert.equal(event.memberId, "M002");
  assert.equal(event.planId, "P001");
});
test("existing WebConnect contract resolves to POST attendance_batch", () => {
  assert.deepEqual(contract.confirmedContract.webConnect, {
    action: "attendance_batch", method: "POST", source: "shared/WebConnectCore.js and existing attendance UI"
  });
});
test("Excel row order is not promoted to an E010 dependency", () => {
  assert.deepEqual(event.dependencies.businessData, []);
  assert.deepEqual(event.dependencies.executionOrder, []);
  assert.equal(event.rowOrderCandidate.previousEventId, "902-E010");
  assert.equal(event.rowOrderCandidate.status, "PROVISIONAL");
  assert.deepEqual(contract.confirmedContract.dependencies.businessData, []);
  assert.deepEqual(contract.confirmedContract.dependencies.executionOrder, []);
});
test("E010 fixture is not silently reused for M002", () => {
  assert.equal(contract.fixture.source_member_id, "M002");
  for (const key of ["member_id", "teacher_id", "location_id", "billing_block_id", "slot_id", "current_rank"])
    assert.equal(contract.fixture[key], null);
});
test("P001 values remain unconfirmed pending a read-only master lookup", () => {
  assert.equal(contract.readOnlyChecksRequired.length, 1);
  assert.equal(contract.readOnlyChecksRequired[0].action, "qr_generator_options");
  assert.ok(contract.blockers.includes("P001_MASTER_UNVERIFIED"));
  assert.equal(contract.expected.planned_amount, null);
});
test("execution time remains a user-approved specification gap", () => {
  assert.equal(event.executionDateTime, null);
  assert.equal(contract.userDecisionsRequired[0].code, "EXECUTION_TIME");
  assert.ok(contract.blockers.includes("EXECUTION_TIME_UNRESOLVED"));
});
test("monthly usage response is handled by the monthly Judge contract", () => {
  const monthly = { ok: true, registered_count: 1, cancelled_count: 0,
    usage_billing: [{ ok: true, skipped: true, plan_id: "P001", message: "回数料金ではないため同期対象外です。" }] };
  const expected = { billing_contract: "MONTHLY", plan_id: "P001" };
  const actual = normalizeResponse(monthly, "STORY902_M002", expected);
  assert.equal(actual.billing_contract, "MONTHLY");
  assert.deepEqual(actual, { registered_count: 1, cancelled_count: 0, plan_id: "P001", usage_billing_skipped: true });
  assert.equal(contract.expected.judgeSupport, "AVAILABLE_WHEN_EXPECTED_CONFIRMED");
});
test("common attendance adapter keeps E020 blocked and does not invent fixture data", () => {
  const result = inspectAttendanceEventContract({ manifest, eventId: "902-E020" });
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.businessExecutionAllowed, false);
  assert.deepEqual(result.blockers.map(item => item.code), [
    "CONTINUATION_NOT_ESTABLISHED", "EVENT_DATETIME_UNRESOLVED", "EXPECTED_UNRESOLVED", "FIXTURE_INVALID"
  ]);
});
test("E020 manifest is not promoted while readiness blockers remain", () => {
  assert.equal(event.specificationStatus, "PROVISIONAL");
  assert.equal(contract.readiness, "BLOCKED");
  assert.equal(contract.blockers.length, 4);
});
test("readiness artifact defines only offline lookup metadata", () => {
  const source = fs.readFileSync(path.join(__dirname, "story902-e020-contract-readiness.json"), "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(|firebase-admin|@google-cloud\/firestore|https:\/\//);
  assert.deepEqual(contract.readOnlyChecksRequired.map(item => item.action), ["qr_generator_options"]);
});

let passed = 0;
for (const item of tests) {
  try { item.fn(); passed += 1; process.stdout.write(`PASS ${item.name}\n`); }
  catch (error) { process.stderr.write(`FAIL ${item.name}\n${error.stack}\n`); process.exitCode = 1; }
}
process.stdout.write(`\n${passed}/${tests.length} PASS\n`);
