"use strict";

const assert = require("node:assert/strict");
const { createRunLedgerInspector } = require("./story902-run-ledger-inspector.cjs");

const key = "a".repeat(64);
const baseClaim = Object.freeze({
  schemaVersion: 1,
  stableEventKey: key,
  projectId: "dojo-management-dev",
  target: "dev-firebase",
  storyId: "STORY-902",
  executionScopeId: "STORY902_SCOPE_20261025_APPLY01_001",
  eventId: "902-E010",
  ownerRunId: "STORY902-RUN-INSPECT-001",
  state: "IN_FLIGHT",
  version: 3,
  businessExecutionAllowed: false
});
const baseRun = Object.freeze({
  schemaVersion: 1,
  runId: "STORY902-RUN-INSPECT-001",
  projectId: "dojo-management-dev",
  target: "dev-firebase",
  storyId: "STORY-902",
  state: "ACTIVE",
  businessExecutionAllowed: false
});
const baseEvent = Object.freeze({
  schemaVersion: 1,
  stableEventKey: key,
  runId: "STORY902-RUN-INSPECT-001",
  eventId: "902-E010",
  projectId: "dojo-management-dev",
  target: "dev-firebase",
  storyId: "STORY-902",
  state: "IN_FLIGHT",
  version: 3,
  timeTrip: { state: "SET_VERIFIED", evidenceDigest: null },
  businessExecutionAllowed: false
});
const attestation = Object.freeze({
  source: "STORY902_ENVIRONMENT_LOCK",
  status: "ATTESTED",
  projectId: "dojo-management-dev",
  databaseId: "(default)",
  target: "dev-firebase",
  repositoryOperationAllowed: true,
  businessExecutionAllowed: false,
  eventSendAllowed: false,
  timeTripChangeAllowed: false
});

function adapter(overrides = {}) {
  const calls = [];
  const docs = {
    [`story902_event_claims/${key}`]: baseClaim,
    "story902_runs/STORY902-RUN-INSPECT-001": baseRun,
    "story902_runs/STORY902-RUN-INSPECT-001/events/902-E010": baseEvent,
    "story902_environment_locks/dojo-management-dev_dev-firebase": { state: "LOCKED" },
    ...(overrides.docs || {})
  };
  return {
    kind: "STORY902_READ_ONLY_ADAPTER",
    calls,
    async getDocument(path) { calls.push(["get", path]); return docs[path] ?? null; },
    async listCollection(path) { calls.push(["list", path]); return overrides.audits || []; }
  };
}

async function rejectsCode(fn, code) {
  await assert.rejects(Promise.resolve().then(fn), error => error?.code === code);
}

(async () => {
  const tests = [];
  let passed = 0;
  const test = (name, fn) => tests.push({ name, fn });

  test("正常Claim/Event/TimeTripをread-only取得", async () => {
    const transport = adapter();
    const result = await createRunLedgerInspector(transport, attestation).inspectClaim(key);
    assert.equal(result.event.state, "IN_FLIGHT");
    assert.equal(result.timeTrip.state, "SET_VERIFIED");
    assert.equal(result.readOnly, true);
    assert.equal(result.businessExecutionAllowed, false);
    assert.equal(transport.calls.length, 5);
  });

  test("UNKNOWNをRECOVERY_REQUIREDとして識別", async () => {
    const unknown = { ...baseEvent, state: "UNKNOWN" };
    const transport = adapter({ docs: {
      "story902_runs/STORY902-RUN-INSPECT-001/events/902-E010": unknown
    }});
    const result = await createRunLedgerInspector(transport, attestation).inspectClaim(key);
    assert.equal(result.recoveryRequired, true);
    assert.ok(result.recoveryReasons.includes("EVENT_UNKNOWN"));
  });

  test("TimeTrip復元不明と復旧証跡を識別", async () => {
    const event = { ...baseEvent, timeTrip: { state: "RECOVERY_REQUIRED", evidenceDigest: null } };
    const transport = adapter({
      docs: { "story902_runs/STORY902-RUN-INSPECT-001/events/902-E010": event },
      audits: [{ recoveryId: "RECOVERY_001", decision: "STOP_ALL_FOLLOWING_EVENTS" }]
    });
    const result = await createRunLedgerInspector(transport, attestation).inspectClaim(key);
    assert.ok(result.recoveryReasons.includes("TIME_TRIP_RECOVERY_REQUIRED"));
    assert.ok(result.recoveryReasons.includes("RECOVERY_AUDIT_STOP"));
    assert.equal(result.recoveryAudits.length, 1);
  });

  test("Environment lockのRECOVERY_REQUIREDを識別", async () => {
    const transport = adapter({ docs: {
      "story902_environment_locks/dojo-management-dev_dev-firebase": { state: "RECOVERY_REQUIRED" }
    }});
    const result = await createRunLedgerInspector(transport, attestation).inspectClaim(key);
    assert.ok(result.recoveryReasons.includes("ENVIRONMENT_LOCK_RECOVERY_REQUIRED"));
  });

  test("Claim/Event不整合を遮断", async () => {
    const event = { ...baseEvent, version: 99 };
    const transport = adapter({ docs: {
      "story902_runs/STORY902-RUN-INSPECT-001/events/902-E010": event
    }});
    await rejectsCode(() => createRunLedgerInspector(transport, attestation).inspectClaim(key), "EVENT_CLAIM_INCONSISTENT");
  });

  test("Environment attestation不一致を読取前に遮断", async () => {
    const transport = adapter();
    await rejectsCode(() => Promise.resolve(createRunLedgerInspector(transport, { ...attestation, projectId: "prod" })), "ENVIRONMENT_ATTESTATION_REQUIRED");
    assert.equal(transport.calls.length, 0);
  });

  test("書込み能力を持つAdapterを拒否", async () => {
    const transport = { ...adapter(), update: async () => {} };
    await rejectsCode(() => Promise.resolve(createRunLedgerInspector(transport, attestation)), "WRITE_CAPABILITY_FORBIDDEN");
  });

  test("Inspector公開契約に書込み操作がない", async () => {
    const inspector = createRunLedgerInspector(adapter(), attestation);
    assert.deepEqual(Object.keys(inspector).sort(), ["databaseId", "inspectClaim", "kind", "projectId", "target"]);
    assert.equal(typeof inspector.update, "undefined");
    assert.equal(typeof inspector.runTransaction, "undefined");
  });

  for (const entry of tests) {
    await entry.fn();
    passed += 1;
    console.log(`PASS ${entry.name}`);
  }
  console.log(`D-3f inspector offline: ${passed}/${tests.length} PASS`);
})().catch(error => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
