"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadManifest } = require("./story902-manifest-loader.cjs");
const { inspectAttendanceEventContract, createAttendanceCommand, createAttendanceBusinessAdapter } =
  require("./story902-attendance-business-adapter.cjs");

const manifest = loadManifest().manifest;
const reps = ["902-E020", "902-E030", "902-E070", "902-E080"];
const fixture = Object.freeze({ source_member_id: "M001", member_id: "STORY902_M001", teacher_id: "STORY902_T001",
  location_id: "STORY902_L001", billing_block_id: "STORY902_B001", slot_id: "STORY902_S001", current_rank: "成人無級" });
const base = Object.freeze({ eventId: "902-E010", eventResults: {}, runId: "STORY902-ATTENDANCE-001",
  requestId: "STORY902_ATTENDANCE_REQ_001", sessionId: "STORY902_ATTENDANCE_SESSION_001", fixture });
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("manifest contains 26 attendance registration events", () => {
  assert.equal(manifest.events.filter(event => event.eventType === "ATTENDANCE_REGISTER").length, 26);
});
test("E010 remains command-compatible through the shared adapter", () => {
  const value = createAttendanceCommand({ manifest, ...base });
  assert.equal(value.status, "READY");
  assert.equal(value.command.action, "attendance_batch");
  assert.equal(value.command.method, "POST");
  assert.equal(value.command.input.source, "story902_e010");
  assert.equal(value.executionDateTime, "2027-07-02T19:30:00+09:00");
  assert.equal(value.businessExecutionAllowed, false);
});
test("representative events are recognized but blocked with machine-readable unresolved contracts", () => {
  const expected = { "902-E020": ["CONTINUATION_NOT_ESTABLISHED", "EVENT_DATETIME_UNRESOLVED", "EXPECTED_UNRESOLVED", "FIXTURE_INVALID"],
    "902-E030": ["CONTINUATION_NOT_ESTABLISHED", "EVENT_DATETIME_UNRESOLVED", "EXPECTED_UNRESOLVED", "FIXTURE_INVALID"],
    "902-E070": ["CONTINUATION_NOT_ESTABLISHED", "EVENT_DATETIME_UNRESOLVED", "EXPECTED_UNRESOLVED", "FIXTURE_INVALID"],
    "902-E080": ["CONTINUATION_NOT_ESTABLISHED", "EVENT_DATETIME_UNRESOLVED", "EXPECTED_UNRESOLVED", "FIXTURE_INVALID"] };
  for (const eventId of reps) {
    const value = inspectAttendanceEventContract({ manifest, eventId });
    assert.equal(value.status, "BLOCKED");
    assert.deepEqual(value.blockers.map(item => item.code), expected[eventId]);
    assert.equal(value.action, "attendance_batch");
    assert.equal(value.businessExecutionAllowed, false);
  }
});
test("row-order candidates are not promoted to dependencies", () => {
  for (const eventId of reps) {
    const event = manifest.events.find(item => item.eventId === eventId);
    assert.deepEqual(event.dependencies.businessData, []);
    assert.deepEqual(event.dependencies.executionOrder, []);
    assert.equal(event.rowOrderCandidate.status, "PROVISIONAL");
  }
});
test("representative blocked events never call transport", async () => {
  const transport = { kind: "STORY902_MOCK_TRANSPORT", calls: [], async send(command) { this.calls.push(command); }, async read() {} };
  const adapter = createAttendanceBusinessAdapter({ manifest, transport });
  for (const [index, eventId] of reps.entries()) {
    const value = await adapter.execute({ ...base, eventId, runId: `STORY902-ATTENDANCE-REP-${index}` });
    assert.equal(value.status, "BLOCKED");
  }
  assert.equal(transport.calls.length, 0);
});
test("fixture must map the source member before a command is built", () => {
  const value = createAttendanceCommand({ manifest, ...base, fixture: { ...fixture, source_member_id: "M999" } });
  assert.equal(value.status, "BLOCKED");
  assert.ok(value.blockers.some(item => item.code === "FIXTURE_MEMBER_MISMATCH"));
});
test("unsupported event types are rejected", () => {
  const event = manifest.events.find(item => item.eventType !== "ATTENDANCE_REGISTER");
  const value = inspectAttendanceEventContract({ manifest, eventId: event.eventId });
  assert.equal(value.status, "BLOCKED");
  assert.equal(value.reason.code, "EVENT_NOT_SUPPORTED");
});
test("shared adapter has no real infrastructure client", () => {
  const source = fs.readFileSync(path.join(__dirname, "story902-attendance-business-adapter.cjs"), "utf8");
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
