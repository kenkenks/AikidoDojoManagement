"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadManifest } = require("./story902-manifest-loader.cjs");
const { evaluateContinuationGates } = require("./story902-continuation-gate.cjs");
const { evaluatePreExecutionGate } = require("./story902-pre-execution-gate.cjs");
const { createTimeTripController } = require("./story902-time-trip-controller.cjs");

const manifest = loadManifest().manifest;
const RUN_ID = "STORY902-B3-20261025-001";

function context(overrides = {}) {
  return {
    runId: RUN_ID,
    resultSource: { verified: true, runId: RUN_ID },
    environment: { verified: true, projectId: "dojo-management-dev", target: "dev-firebase" },
    authorization: { verified: true, authenticated: true, authorized: true },
    fixture: { verified: true, consistent: true },
    timeTripTarget: { verified: true, projectId: "dojo-management-dev", target: "dev-firebase" },
    ...overrides
  };
}

function gate(options = {}) {
  return evaluatePreExecutionGate({
    manifest: options.manifest || manifest,
    eventResults: options.eventResults || {},
    eventId: options.eventId || "902-E010",
    runContext: options.runContext || context()
  });
}

function mockAdapter(options = {}) {
  const calls = [];
  const baseline = Object.prototype.hasOwnProperty.call(options, "baseline")
    ? options.baseline
    : { ok: true, enabled: false, now: "", target_month: "" };
  let current = structuredClone(baseline);
  let readCount = 0;
  return {
    calls,
    async read() {
      calls.push("read");
      readCount += 1;
      if (options.readError && readCount === (options.readErrorAt || 1)) throw options.readError;
      if (options.readback && readCount === 2) return structuredClone(options.readback);
      if (options.restoreReadError && calls.some(call => Array.isArray(call) && call[0] === "restore")) throw options.restoreReadError;
      if (options.restoreReadback && calls.some(call => Array.isArray(call) && call[0] === "restore")) return structuredClone(options.restoreReadback);
      return structuredClone(current);
    },
    async set(value) {
      calls.push(["set", value]);
      if (options.setError) throw options.setError;
      current = {
        ok: true,
        enabled: value.enabled,
        now: value.now,
        target_month: value.targetMonth,
        effective: { time_travel_enabled: value.enabled, target_month: value.targetMonth }
      };
    },
    async restore(value) {
      calls.push(["restore", value]);
      if (options.restoreError) throw options.restoreError;
      current = { ok: true, ...structuredClone(value) };
    }
  };
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function hasReason(result, code) { return result.reasons.some(item => item.code === code); }

test("normal manifest keeps only E010 as the B-2 continuation candidate", () => {
  const result = evaluateContinuationGates(manifest, {});
  assert.equal(result.manifestValid, true);
  assert.deepEqual(result.gates.filter(item => item.candidate).map(item => item.eventId), ["902-E010"]);
  assert.equal(result.gates.filter(item => !item.candidate).length, 46);
});

test("confirmed E010 context passes only the TimeTrip pre-execution gate", () => {
  const result = gate();
  assert.equal(result.status, "PRE_EXECUTION_READY");
  assert.equal(result.timeTripOperationAllowed, true);
  assert.equal(result.businessExecutionAllowed, false);
  assert.equal(result.expectedTimeTrip.targetMonth, "2027-07");
});

for (const item of [
  ["missing Run ID", { runId: "" }, "RUN_ID_INVALID"],
  ["unverified result provenance", { resultSource: { verified: false, runId: RUN_ID } }, "RESULT_SOURCE_UNVERIFIED"],
  ["mismatched result Run ID", { resultSource: { verified: true, runId: "STORY902-OTHER-0001" } }, "RESULT_RUN_ID_MISMATCH"],
  ["non-DEV environment", { environment: { verified: true, projectId: "production", target: "prod" } }, "DEV_ENVIRONMENT_MISMATCH"],
  ["unverified authorization", { authorization: { verified: false, authenticated: true, authorized: true } }, "AUTHORIZATION_UNVERIFIED"],
  ["unverified fixture", { fixture: { verified: false, consistent: true } }, "FIXTURE_UNVERIFIED"],
  ["mismatched TimeTrip target", { timeTripTarget: { verified: true, projectId: "production", target: "prod" } }, "TIME_TRIP_TARGET_MISMATCH"]
]) test(`${item[0]} blocks TimeTrip`, () => {
  const result = gate({ runContext: context(item[1]) });
  assert.equal(result.timeTripOperationAllowed, false);
  assert.equal(result.businessExecutionAllowed, false);
  assert.equal(hasReason(result, item[2]), true);
});

test("unconfirmed event datetime blocks TimeTrip", () => {
  const copy = structuredClone(manifest);
  copy.events[0].executionDateTime = null;
  copy.events[0].executionDateTimeSource = "UNRESOLVED";
  const result = gate({ manifest: copy });
  assert.equal(result.timeTripOperationAllowed, false);
  assert.equal(hasReason(result, "EXECUTION_DATETIME_UNRESOLVED"), true);
});

test("a provisional event is not accepted by the pre-execution gate", () => {
  const result = gate({ eventId: "902-E020" });
  assert.equal(result.timeTripOperationAllowed, false);
  assert.equal(hasReason(result, "CONTINUATION_NOT_ESTABLISHED"), true);
});

test("invalid manifest fails closed before TimeTrip", () => {
  const copy = structuredClone(manifest);
  copy.events.push(null);
  const result = gate({ manifest: copy });
  assert.equal(result.timeTripOperationAllowed, false);
  assert.equal(result.businessExecutionAllowed, false);
  assert.equal(hasReason(result, "MANIFEST_INVALID"), true);
});

test("controller follows prepare, set, verify and restore states", async () => {
  const adapter = mockAdapter();
  const controller = createTimeTripController({ adapter });
  assert.equal(controller.getState().state, "NOT_PREPARED");
  assert.equal((await controller.prepare(gate())).state, "PREPARED");
  assert.equal((await controller.set()).state, "TIME_SET");
  const verified = await controller.verify();
  assert.equal(verified.state, "VERIFIED");
  assert.equal(verified.timeTripVerified, true);
  assert.equal(verified.businessExecutionAllowed, false);
  assert.equal((await controller.restore()).state, "RESTORED");
  assert.equal(adapter.calls.filter(call => call === "read").length, 3);
});

test("invalid baseline is rejected before PREPARED", async () => {
  for (const baseline of [
    null,
    { ok: false, enabled: false, now: "", target_month: "" },
    { ok: true, enabled: "false", now: "", target_month: "" },
    { ok: true, enabled: false },
    { ok: true, enabled: true, now: "bad", target_month: "2027-07" },
    { ok: true, enabled: true, now: "2027-07-02T10:30:00.000Z", target_month: "bad" }
  ]) {
    const adapter = mockAdapter({ baseline });
    const controller = createTimeTripController({ adapter });
    await assert.rejects(controller.prepare(gate()), error => error.code === "PREPARE_FAILED");
    assert.equal(controller.getState().state, "PREPARE_FAILED");
    assert.equal(controller.getState().businessExecutionAllowed, false);
  }
});

test("disabled baseline is restored with its required empty values and verified", async () => {
  const adapter = mockAdapter();
  const controller = createTimeTripController({ adapter });
  await controller.prepare(gate());
  await controller.set();
  await controller.verify();
  const restored = await controller.restore();
  assert.equal(restored.state, "RESTORED");
  assert.deepEqual(adapter.calls.find(call => Array.isArray(call) && call[0] === "restore")[1], {
    enabled: false, now: "", target_month: ""
  });
});

test("enabled baseline normalizes its time and restores after readback verification", async () => {
  const adapter = mockAdapter({ baseline: {
    ok: true, enabled: true, now: "2027-06-30T19:00:00+09:00", target_month: "2027-06"
  } });
  const controller = createTimeTripController({ adapter });
  await controller.prepare(gate());
  const restored = await controller.restore();
  assert.equal(restored.state, "RESTORED");
  assert.equal(restored.baseline.now, "2027-06-30T10:00:00.000Z");
});

test("set failure stops safely and still allows restore", async () => {
  const adapter = mockAdapter({ setError: new Error("mock set failed") });
  const controller = createTimeTripController({ adapter });
  await controller.prepare(gate());
  await assert.rejects(controller.set(), error => error.code === "TIME_TRIP_SET_FAILED");
  assert.equal(controller.getState().state, "SET_FAILED");
  assert.equal((await controller.restore()).state, "RESTORED");
});

test("verify mismatch stops safely and still allows restore", async () => {
  const adapter = mockAdapter({ readback: { ok: true, enabled: true, now: "2027-07-03T10:30:00.000Z", target_month: "2027-07" } });
  const controller = createTimeTripController({ adapter });
  await controller.prepare(gate());
  await controller.set();
  await assert.rejects(controller.verify(), error => error.code === "TIME_TRIP_VERIFY_FAILED");
  assert.equal(controller.getState().timeTripVerified, false);
  assert.equal(controller.getState().businessExecutionAllowed, false);
  assert.equal((await controller.restore()).state, "RESTORED");
});

test("restore failure is diagnosable and never permits business execution", async () => {
  const adapter = mockAdapter({ restoreError: new Error("mock restore failed") });
  const controller = createTimeTripController({ adapter });
  await controller.prepare(gate());
  await assert.rejects(controller.restore(), error => error.code === "TIME_TRIP_RESTORE_FAILED");
  const state = controller.getState();
  assert.equal(state.state, "RESTORE_FAILED");
  assert.equal(state.diagnostics.at(-1).operation, "restore");
  assert.equal(state.businessExecutionAllowed, false);
});

test("restore readback mismatch is RESTORE_FAILED", async () => {
  const adapter = mockAdapter({ restoreReadback: { ok: true, enabled: true, now: "2027-07-02T10:30:00.000Z", target_month: "2027-07" } });
  const controller = createTimeTripController({ adapter });
  await controller.prepare(gate());
  await assert.rejects(controller.restore(), error => error.code === "TIME_TRIP_RESTORE_FAILED");
  assert.equal(controller.getState().state, "RESTORE_FAILED");
  assert.equal(controller.getState().diagnostics.at(-1).operation, "restore");
});

test("restore read failure is RESTORE_FAILED", async () => {
  const adapter = mockAdapter({ restoreReadError: new Error("mock restore read failed") });
  const controller = createTimeTripController({ adapter });
  await controller.prepare(gate());
  await assert.rejects(controller.restore(), error => error.code === "TIME_TRIP_RESTORE_FAILED");
  assert.equal(controller.getState().state, "RESTORE_FAILED");
});

test("blocked pre-execution gate prevents controller prepare and adapter access", async () => {
  const adapter = mockAdapter();
  const controller = createTimeTripController({ adapter });
  await assert.rejects(controller.prepare(gate({ runContext: context({ runId: "" }) })), error => error.code === "PRE_EXECUTION_GATE_BLOCKED");
  assert.deepEqual(adapter.calls, []);
});

test("forged gate structures are rejected before adapter access", async () => {
  const valid = gate();
  const forgeries = [
    { ...valid, status: "PRE_EXECUTION_BLOCKED" },
    { ...valid, candidate: false },
    { ...valid, businessExecutionAllowed: true },
    { ...valid, runId: "bad" },
    { ...valid, eventId: "bad" },
    { ...valid, expectedTimeTrip: { ...valid.expectedTimeTrip, projectId: "production" } },
    { ...valid, expectedTimeTrip: { ...valid.expectedTimeTrip, target: "prod" } },
    { ...valid, expectedTimeTrip: { ...valid.expectedTimeTrip, enabled: false } },
    { ...valid, expectedTimeTrip: { ...valid.expectedTimeTrip, now: "not-a-date" } },
    { ...valid, expectedTimeTrip: { ...valid.expectedTimeTrip, targetMonth: "2027-08" } },
    { ...valid, expectedTimeTrip: { ...valid.expectedTimeTrip, sourceExecutionDateTime: "2027-07-02T20:00:00+09:00" } }
  ];
  for (const forged of forgeries) {
    const adapter = mockAdapter();
    const controller = createTimeTripController({ adapter });
    await assert.rejects(controller.prepare(forged));
    assert.deepEqual(adapter.calls, []);
    assert.equal(controller.getState().businessExecutionAllowed, false);
  }
});

test("all controller success and failure snapshots prohibit business execution", async () => {
  const adapter = mockAdapter();
  const controller = createTimeTripController({ adapter });
  assert.equal(controller.getState().businessExecutionAllowed, false);
  assert.equal((await controller.prepare(gate())).businessExecutionAllowed, false);
  assert.equal((await controller.set()).businessExecutionAllowed, false);
  assert.equal((await controller.verify()).businessExecutionAllowed, false);
  assert.equal((await controller.restore()).businessExecutionAllowed, false);
});

test("B-3 sources contain no real network or Firebase client", () => {
  for (const file of ["story902-pre-execution-gate.cjs", "story902-time-trip-controller.cjs"]) {
    const source = fs.readFileSync(path.join(__dirname, file), "utf8");
    assert.doesNotMatch(source, /\bfetch\s*\(|firebase-admin|@google-cloud\/firestore|https:\/\//);
  }
});

(async () => {
  let passed = 0;
  for (const item of tests) {
    try {
      await item.fn();
      passed += 1;
      process.stdout.write(`PASS ${item.name}\n`);
    } catch (error) {
      process.stderr.write(`FAIL ${item.name}\n${error.stack}\n`);
      process.exitCode = 1;
    }
  }
  process.stdout.write(`\n${passed}/${tests.length} PASS\n`);
})();
