"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  fingerprint, stableEventKey, transition, updateTimeTrip,
  projectContinuationResult
} = require("./story902-run-ledger-model.cjs");
const { createMockRunLedgerRepository } = require("./story902-run-ledger-mock-repository.cjs");

const fp = value => fingerprint({ value });
const base = Object.freeze({
  projectId: "dojo-management-dev",
  target: "dev-firebase",
  storyId: "STORY-902",
  executionScopeId: "STORY902_SCOPE_2027_07",
  runId: "STORY902-D2-RUN-0001",
  eventId: "902-E010",
  manifestFingerprint: fp("manifest"),
  fixtureFingerprint: fp("fixture"),
  eventFingerprint: fp("event"),
  evidenceKind: "MOCK_ONLY"
});
const intent = Object.freeze({
  requestId: "STORY902_D2_REQUEST_001",
  sessionId: "STORY902_D2_SESSION_001",
  payloadFingerprint: fp("payload"),
  expectedFingerprint: fp("expected")
});
const clock = (() => { let n = 0; return () => `2026-10-25T00:00:${String(n++).padStart(2, "0")}.000Z`; })();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
async function rejectsCode(fn, code) { await assert.rejects(fn, error => error?.code === code); }

test("reserves a valid Event Claim", async () => {
  const repo = createMockRunLedgerRepository({ clock });
  const row = await repo.reserve(base);
  assert.equal(row.state, "RESERVED");
  assert.equal(row.stableEventKey, stableEventKey(base));
  assert.equal(row.businessExecutionAllowed, false);
});

test("same Run ID cannot reserve the same claim twice", async () => {
  const repo = createMockRunLedgerRepository({ clock });
  await repo.reserve(base);
  await rejectsCode(() => repo.reserve(base), "EVENT_CLAIM_ALREADY_EXISTS");
});

test("different Run ID cannot reserve the same event claim", async () => {
  const repo = createMockRunLedgerRepository({ clock });
  await repo.reserve(base);
  await rejectsCode(() => repo.reserve({ ...base, runId: "STORY902-D2-RUN-0002" }), "EVENT_CLAIM_ALREADY_EXISTS");
});

test("request ID changes do not permit another reservation", async () => {
  const repo = createMockRunLedgerRepository({ clock });
  await repo.reserve({ ...base, requestId: "REQUEST_ONE" });
  assert.equal(stableEventKey(base), stableEventKey({ ...base, requestId: "REQUEST_TWO" }));
  await rejectsCode(() => repo.reserve({
    ...base,
    runId: "STORY902-D2-RUN-0008",
    requestId: "REQUEST_TWO"
  }), "EVENT_CLAIM_ALREADY_EXISTS");
});

test("fixture changes do not permit another reservation", async () => {
  const repo = createMockRunLedgerRepository({ clock });
  await repo.reserve(base);
  await rejectsCode(() => repo.reserve({ ...base, runId: "STORY902-D2-RUN-0003", fixtureFingerprint: fp("other") }),
    "EVENT_CLAIM_FINGERPRINT_CONFLICT");
});

test("concurrent runners produce exactly one reservation", async () => {
  const repo = createMockRunLedgerRepository({ clock });
  const outcomes = await Promise.allSettled([
    repo.reserve(base),
    repo.reserve({ ...base, runId: "STORY902-D2-RUN-0004" }),
    repo.reserve({ ...base, runId: "STORY902-D2-RUN-0005" })
  ]);
  assert.equal(outcomes.filter(item => item.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter(item => item.status === "rejected").length, 2);
  assert.equal(repo.size(), 1);
});

test("executionScopeId is mandatory and never auto-generated", async () => {
  const repo = createMockRunLedgerRepository({ clock });
  await rejectsCode(() => repo.reserve({ ...base, executionScopeId: "" }), "EXECUTION_SCOPE_ID_REQUIRED");
});

test("invalid state transitions are rejected", async () => {
  const repo = createMockRunLedgerRepository({ clock });
  const row = await repo.reserve(base);
  await rejectsCode(() => repo.markInFlight(row.stableEventKey, row.version), "STATE_TRANSITION_INVALID");
});

test("SEND_INTENT_RECORDED interruption becomes UNKNOWN", async () => {
  const repo = createMockRunLedgerRepository({ clock });
  let row = await repo.reserve(base);
  row = await repo.recordSendIntent(row.stableEventKey, row.version, intent);
  row = await repo.recoverInterrupted(row.stableEventKey, row.version);
  assert.equal(row.state, "UNKNOWN");
  assert.equal(row.unknownReason, "PROCESS_INTERRUPTED");
});

test("IN_FLIGHT interruption becomes UNKNOWN", async () => {
  const repo = createMockRunLedgerRepository({ clock });
  let row = await repo.reserve(base);
  row = await repo.recordSendIntent(row.stableEventKey, row.version, intent);
  row = await repo.markInFlight(row.stableEventKey, row.version);
  row = await repo.recoverInterrupted(row.stableEventKey, row.version);
  assert.equal(row.state, "UNKNOWN");
});

test("RESERVED interruption remains reserved and blocks reuse", async () => {
  const repo = createMockRunLedgerRepository({ clock });
  let row = await repo.reserve(base);
  row = await repo.recoverInterrupted(row.stableEventKey, row.version);
  assert.equal(row.state, "RESERVED");
  assert.equal(row.recoveryRequired, true);
  await rejectsCode(() => repo.reserve({ ...base, runId: "STORY902-D2-RUN-0006" }), "EVENT_CLAIM_ALREADY_EXISTS");
});

test("UNKNOWN cannot be reset or automatically resent", async () => {
  const repo = createMockRunLedgerRepository({ clock });
  let row = await repo.reserve(base);
  row = await repo.recordSendIntent(row.stableEventKey, row.version, intent);
  row = await repo.markInFlight(row.stableEventKey, row.version);
  row = await repo.finish(row.stableEventKey, row.version, { status: "UNKNOWN", unknownReason: "HTTP_TIMEOUT" });
  await rejectsCode(() => repo.recordSendIntent(row.stableEventKey, row.version, intent), "TERMINAL_STATE_IMMUTABLE");
  await rejectsCode(() => repo.reserve({ ...base, runId: "STORY902-D2-RUN-0007" }), "EVENT_CLAIM_ALREADY_EXISTS");
});

for (const status of ["PASS", "FAIL"]) test(`${status} is immutable`, async () => {
  const repo = createMockRunLedgerRepository({ clock });
  let row = await repo.reserve({ ...base, executionScopeId: `SCOPE_${status}` });
  row = await repo.recordSendIntent(row.stableEventKey, row.version, intent);
  row = await repo.markInFlight(row.stableEventKey, row.version);
  row = await repo.finish(row.stableEventKey, row.version, { status });
  await rejectsCode(() => repo.finish(row.stableEventKey, row.version, { status: "UNKNOWN", unknownReason: "OVERWRITE" }),
    "TERMINAL_STATE_IMMUTABLE");
});

test("Mock evidence cannot be projected as a DEV continuation result", async () => {
  const repo = createMockRunLedgerRepository({ clock });
  let row = await repo.reserve(base);
  row = await repo.recordSendIntent(row.stableEventKey, row.version, intent);
  row = await repo.markInFlight(row.stableEventKey, row.version);
  row = await repo.finish(row.stableEventKey, row.version, { status: "PASS" });
  assert.throws(() => projectContinuationResult(row, {
    ...base,
    projectId: base.projectId,
    target: base.target
  }), error => error?.code === "MOCK_EVIDENCE_NOT_EXECUTABLE");
});

test("DEV result projection requires exact Run provenance", () => {
  let row = {
    ...require("./story902-run-ledger-model.cjs").createReservedRecord({ ...base, evidenceKind: "DEV_LIVE" }, clock())
  };
  row = transition(row, "recordSendIntent", intent, clock());
  row = transition(row, "markInFlight", {}, clock());
  row = transition(row, "finish", { status: "PASS" }, clock());
  assert.throws(() => projectContinuationResult(row, { ...base, runId: "STORY902-D2-RUN-WRONG" }),
    error => error?.code === "RESULT_PROVENANCE_INVALID");
  const projected = projectContinuationResult(row, base);
  assert.equal(projected.status, "PASS");
  assert.equal(projected.businessExecutionAllowed, false);
});

test("TimeTrip restore state is independent from terminal business result", () => {
  let row = require("./story902-run-ledger-model.cjs").createReservedRecord(base, clock());
  row = transition(row, "recordSendIntent", intent, clock());
  row = transition(row, "markInFlight", {}, clock());
  row = transition(row, "finish", { status: "FAIL" }, clock());
  const changed = updateTimeTrip(row, "RESTORE_FAILED", fp("restore"));
  assert.equal(changed.state, "FAIL");
  assert.equal(changed.timeTrip.state, "RESTORE_FAILED");
  assert.equal(changed.businessExecutionAllowed, false);
});

test("all records keep business execution disabled and sources contain no infrastructure client", async () => {
  const repo = createMockRunLedgerRepository({ clock });
  let row = await repo.reserve({ ...base, executionScopeId: "SCOPE_DISABLED" });
  assert.equal(row.businessExecutionAllowed, false);
  row = await repo.recordSendIntent(row.stableEventKey, row.version, intent);
  assert.equal(row.businessExecutionAllowed, false);
  row = await repo.markInFlight(row.stableEventKey, row.version);
  assert.equal(row.businessExecutionAllowed, false);
  row = await repo.finish(row.stableEventKey, row.version, { status: "PASS" });
  assert.equal(row.businessExecutionAllowed, false);
  const source = ["story902-run-ledger-model.cjs", "story902-run-ledger-mock-repository.cjs"]
    .map(file => fs.readFileSync(path.join(__dirname, file), "utf8")).join("\n");
  assert(!/firebase-admin|@google-cloud|fetch\s*\(|https?:\/\//.test(source));
});

(async () => {
  let passed = 0;
  for (const item of tests) {
    try { await item.fn(); passed++; console.log(`PASS ${item.name}`); }
    catch (error) { console.error(`FAIL ${item.name}`); console.error(error); process.exitCode = 1; }
  }
  console.log(`\n${passed}/${tests.length} PASS`);
})();
