"use strict";

process.env.TZ = "Asia/Tokyo";
const assert = require("node:assert/strict");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { fingerprint } = require("./story902-run-ledger-model.cjs");
const { createFirestoreRunLedgerRepository } = require("./story902-run-ledger-firestore-repository.cjs");

const HOST = "127.0.0.1:8087";
const EMULATOR_PROJECT = "demo-story902-d3e-recovery";
const TARGET_PROJECT = "dojo-management-dev";
const SCOPE_PREFIX = "D3E_RECOVERY_20261025";

function assertSafeEnvironment() {
  if (process.env.FIRESTORE_EMULATOR_HOST !== HOST) throw Error("EMULATOR_HOST_NOT_CONFIRMED");
  const project = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  if (project !== EMULATOR_PROJECT || !project.startsWith("demo-")) throw Error("EMULATOR_PROJECT_NOT_CONFIRMED");
  if (process.env.GCLOUD_PROJECT && process.env.GOOGLE_CLOUD_PROJECT &&
      process.env.GCLOUD_PROJECT !== process.env.GOOGLE_CLOUD_PROJECT) throw Error("EMULATOR_PROJECT_AMBIGUOUS");
  if (!/^127\.0\.0\.1:\d+$/.test(HOST)) throw Error("LOCAL_EMULATOR_REQUIRED");
}

const fp = value => fingerprint({ value });
function input(scenario) {
  return {
    projectId: TARGET_PROJECT,
    target: "dev-firebase",
    storyId: "STORY-902",
    executionScopeId: `${SCOPE_PREFIX}_${scenario}`,
    runId: `STORY902-RECOVERY-${scenario}-A`,
    eventId: "902-E010",
    manifestFingerprint: fp("manifest"),
    fixtureFingerprint: fp("fixture"),
    eventFingerprint: fp("event"),
    evidenceKind: "EMULATOR_ONLY"
  };
}

function repository(db) {
  let tick = 0;
  return createFirestoreRunLedgerRepository(db, {
    clock: () => `2027-07-02T10:10:${String(tick++ % 60).padStart(2, "0")}.000Z`,
    serverTimestamp: () => FieldValue.serverTimestamp(),
    evidenceKind: "EMULATOR_ONLY"
  });
}

async function sent(repo, reserved, suffix) {
  return repo.recordSendIntent(reserved.stableEventKey, reserved.version, {
    requestId: `REQ_RECOVERY_${suffix}`,
    sessionId: `SESSION_RECOVERY_${suffix}`,
    payloadFingerprint: fp(`payload-${suffix}`),
    expectedFingerprint: fp("expected")
  });
}

async function rejectsCode(promise, code) {
  await assert.rejects(promise, error => error?.code === code || error?.message === code);
}

async function appendRecoveryAudit(db, record, scenario, decision, observations) {
  const recoveryId = `RECOVERY_${scenario}_001`;
  const ref = db.collection("story902_runs").doc(record.runId)
    .collection("recovery_audits").doc(recoveryId);
  await db.runTransaction(async tx => {
    const existing = await tx.get(ref);
    if (existing.exists) throw Error("RECOVERY_AUDIT_IMMUTABLE");
    tx.create(ref, {
      schemaVersion: 1,
      recoveryId,
      runId: record.runId,
      executionScopeId: record.executionScopeId,
      eventId: record.eventId,
      stableEventKey: record.stableEventKey,
      scenario,
      decision,
      observations,
      eventState: record.state,
      timeTripState: record.timeTrip.state,
      evidenceKind: "EMULATOR_ONLY",
      automaticRetryAllowed: false,
      businessExecutionAllowed: false,
      recordedAt: FieldValue.serverTimestamp()
    });
  });
  const saved = await ref.get();
  assert.equal(saved.exists, true);
  assert.equal(saved.data().automaticRetryAllowed, false);
  return saved.data();
}

(async () => {
  assertSafeEnvironment();
  const app = initializeApp({ projectId: EMULATOR_PROJECT }, `story902-d3e-${process.pid}`);
  const db = getFirestore(app);
  const tests = [];
  let passed = 0;
  const test = (name, fn) => tests.push({ name, fn });

  test("RESERVED中断はClaim保持・自動再送禁止", async () => {
    const repo = repository(db);
    const reserved = await repo.reserve(input("RESERVED"));
    const recovered = await repo.recoverInterrupted(reserved.stableEventKey, reserved.version);
    assert.equal(recovered.state, "RESERVED");
    assert.equal(recovered.recoveryRequired, true);
    await rejectsCode(repo.reserve({ ...input("RESERVED"), runId: "STORY902-RECOVERY-RESERVED-B" }), "EVENT_CLAIM_ALREADY_EXISTS");
    await appendRecoveryAudit(db, recovered, "RESERVED", "HOLD_CLAIM", ["CLAIM_EXISTS", "EVENT_NOT_SENT"]);
  });

  test("SEND_INTENT_RECORDED中断はUNKNOWN固定", async () => {
    const repo = repository(db);
    const intent = await sent(repo, await repo.reserve(input("SEND_INTENT")), "SEND_INTENT");
    const unknown = await repo.recoverInterrupted(intent.stableEventKey, intent.version);
    assert.equal(unknown.state, "UNKNOWN");
    await rejectsCode(repo.finish(unknown.stableEventKey, unknown.version, { status: "PASS" }), "TERMINAL_STATE_IMMUTABLE");
    await appendRecoveryAudit(db, unknown, "SEND_INTENT", "MANUAL_READ_ONLY_REVIEW", ["SEND_STATUS_UNCERTAIN"]);
  });

  test("IN_FLIGHT中断はUNKNOWN固定", async () => {
    const repo = repository(db);
    const intent = await sent(repo, await repo.reserve(input("IN_FLIGHT")), "IN_FLIGHT");
    const inFlight = await repo.markInFlight(intent.stableEventKey, intent.version);
    const unknown = await repo.recoverInterrupted(inFlight.stableEventKey, inFlight.version);
    assert.equal(unknown.state, "UNKNOWN");
    await rejectsCode(repo.finish(unknown.stableEventKey, unknown.version, { status: "FAIL" }), "TERMINAL_STATE_IMMUTABLE");
    await appendRecoveryAudit(db, unknown, "IN_FLIGHT", "MANUAL_READ_ONLY_REVIEW", ["EVENT_RESULT_UNCERTAIN"]);
  });

  test("commit応答喪失でもClaimは1件・再予約禁止", async () => {
    const uncertain = {
      collection: (...args) => db.collection(...args),
      async runTransaction(callback) {
        await db.runTransaction(callback);
        throw Object.assign(Error("EMULATED_COMMIT_RESPONSE_LOST"), { outcomeUnknown: true });
      }
    };
    const value = input("COMMIT_LOST");
    await rejectsCode(repository(uncertain).reserve(value), "REPOSITORY_OUTCOME_UNKNOWN");
    const normal = repository(db);
    const key = require("./story902-run-ledger-model.cjs").stableEventKey(value);
    const existing = await normal.get(key);
    assert.equal(existing.state, "RESERVED");
    await rejectsCode(normal.reserve({ ...value, runId: "STORY902-RECOVERY-COMMIT_LOST-B" }), "EVENT_CLAIM_ALREADY_EXISTS");
    await appendRecoveryAudit(db, existing, "COMMIT_LOST", "HOLD_CLAIM", ["COMMIT_RESPONSE_LOST", "CLAIM_READ_BACK"]);
  });

  test("Event結果不明はUNKNOWNのまま監査記録", async () => {
    const repo = repository(db);
    const intent = await sent(repo, await repo.reserve(input("EVENT_UNKNOWN")), "EVENT_UNKNOWN");
    const active = await repo.markInFlight(intent.stableEventKey, intent.version);
    const unknown = await repo.finish(active.stableEventKey, active.version, {
      status: "UNKNOWN", unknownReason: "EVENT_RESPONSE_LOST", result: { status: "UNKNOWN" }
    });
    const audit = await appendRecoveryAudit(db, unknown, "EVENT_UNKNOWN", "RETAIN_UNKNOWN", ["READ_AFTER_WRITE_NOT_ATTRIBUTABLE"]);
    assert.equal(audit.eventState, "UNKNOWN");
    assert.equal((await repo.get(unknown.stableEventKey)).state, "UNKNOWN");
  });

  test("TimeTrip復元不明はEvent結果と独立してRECOVERY_REQUIRED", async () => {
    const repo = repository(db);
    const intent = await sent(repo, await repo.reserve(input("TIMETRIP_UNKNOWN")), "TIMETRIP_UNKNOWN");
    const active = await repo.markInFlight(intent.stableEventKey, intent.version);
    const failed = await repo.finish(active.stableEventKey, active.version, { status: "FAIL", result: { status: "FAIL" } });
    const recovery = await repo.setTimeTripState(failed.stableEventKey, failed.version, "RECOVERY_REQUIRED", fp("time-trip-readback-uncertain"));
    assert.equal(recovery.state, "FAIL");
    assert.equal(recovery.timeTrip.state, "RECOVERY_REQUIRED");
    await appendRecoveryAudit(db, recovery, "TIMETRIP_UNKNOWN", "STOP_ALL_FOLLOWING_EVENTS", ["TIME_TRIP_RESTORE_UNCONFIRMED"]);
  });

  try {
    for (const entry of tests) {
      await entry.fn();
      passed += 1;
      console.log(`PASS ${entry.name}`);
    }
    const audits = await db.collectionGroup("recovery_audits").get();
    assert.equal(audits.size, tests.length);
    console.log(JSON.stringify({
      ok: true,
      evidenceKind: "EMULATOR_ONLY",
      host: HOST,
      emulatorProject: EMULATOR_PROJECT,
      targetProject: TARGET_PROJECT,
      namespace: SCOPE_PREFIX,
      tests: { passed, total: tests.length },
      recoveryAudits: audits.size,
      automaticRetryAllowed: false,
      businessExecutionAllowed: false
    }, null, 2));
  } finally {
    await deleteApp(app);
  }
})().catch(error => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
