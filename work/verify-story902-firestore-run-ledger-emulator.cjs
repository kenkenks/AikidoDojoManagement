"use strict";

process.env.TZ = "Asia/Tokyo";
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { fingerprint, projectContinuationResult } = require("./story902-run-ledger-model.cjs");
const { createFirestoreRunLedgerRepository } = require("./story902-run-ledger-firestore-repository.cjs");

const HOST = "127.0.0.1:8087";
const EMULATOR_PROJECT = "demo-story902-d3b-emulator";
const TARGET_PROJECT = "dojo-management-dev";
const SCOPE_PREFIX = "D3B_EMULATOR_20261025";

function assertSafeEnvironment() {
  if (process.env.FIRESTORE_EMULATOR_HOST !== HOST) throw Error("EMULATOR_HOST_NOT_CONFIRMED");
  const project = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  if (project !== EMULATOR_PROJECT || !project.startsWith("demo-")) throw Error("EMULATOR_PROJECT_NOT_CONFIRMED");
  if (process.env.GCLOUD_PROJECT && process.env.GOOGLE_CLOUD_PROJECT &&
      process.env.GCLOUD_PROJECT !== process.env.GOOGLE_CLOUD_PROJECT) throw Error("EMULATOR_PROJECT_AMBIGUOUS");
  if (!/^127\.0\.0\.1:\d+$/.test(HOST)) throw Error("LOCAL_EMULATOR_REQUIRED");
}

const fp = value => fingerprint({ value });
function input(scope, overrides = {}) {
  return {
    projectId: TARGET_PROJECT,
    target: "dev-firebase",
    storyId: "STORY-902",
    executionScopeId: `${SCOPE_PREFIX}_${scope}`,
    runId: `STORY902-RUN-${scope}-A`,
    eventId: "902-E010",
    manifestFingerprint: fp("manifest"),
    fixtureFingerprint: fp("fixture"),
    eventFingerprint: fp("event"),
    evidenceKind: "EMULATOR_ONLY",
    ...overrides
  };
}

function repository(db) {
  let tick = 0;
  return createFirestoreRunLedgerRepository(db, {
    clock: () => `2027-07-02T10:00:${String(tick++ % 60).padStart(2, "0")}.000Z`,
    serverTimestamp: () => FieldValue.serverTimestamp(),
    evidenceKind: "EMULATOR_ONLY"
  });
}

async function rejectsCode(promise, code) {
  await assert.rejects(promise, error => error?.code === code || error?.message === code);
}

async function sent(repo, reserved, suffix = "1") {
  return repo.recordSendIntent(reserved.stableEventKey, reserved.version, {
    requestId: `REQ_E010_${suffix}`,
    sessionId: `SESSION_E010_${suffix}`,
    payloadFingerprint: fp(`payload-${suffix}`),
    expectedFingerprint: fp("expected")
  });
}

async function childClaim() {
  assertSafeEnvironment();
  const app = initializeApp({ projectId: EMULATOR_PROJECT }, `story902-d3b-child-${process.pid}`);
  try {
    await rejectsCode(repository(getFirestore(app)).reserve(input("PROCESS")), "EVENT_CLAIM_ALREADY_EXISTS");
    process.stdout.write("CHILD_DUPLICATE_REJECTED\n");
  } finally {
    await deleteApp(app);
  }
}

if (process.argv.includes("--child-claim")) {
  childClaim().catch(error => { console.error(error?.stack || error); process.exitCode = 1; });
} else {
  (async () => {
    assertSafeEnvironment();
    const app = initializeApp({ projectId: EMULATOR_PROJECT }, `story902-d3b-main-${process.pid}`);
    const db = getFirestore(app);
    const tests = [];
    let passed = 0;
    const test = (name, fn) => tests.push({ name, fn });

    test("Claim初回取得", async () => {
      const record = await repository(db).reserve(input("FIRST"));
      assert.equal(record.state, "RESERVED");
      assert.equal(record.evidenceKind, "EMULATOR_ONLY");
    });

    test("同一Claim重複・Run ID・requestId変更を拒否", async () => {
      const repo = repository(db);
      await repo.reserve(input("DUP"));
      await rejectsCode(repo.reserve(input("DUP")), "EVENT_CLAIM_ALREADY_EXISTS");
      await rejectsCode(repo.reserve(input("DUP", { runId: "STORY902-RUN-DUP-B" })), "EVENT_CLAIM_ALREADY_EXISTS");
      await rejectsCode(repo.reserve(input("DUP", { runId: "STORY902-RUN-DUP-C", requestId: "OTHER" })), "EVENT_CLAIM_ALREADY_EXISTS");
    });

    test("fixture変更を別Claimにしない", async () => {
      const repo = repository(db);
      await repo.reserve(input("FIXTURE"));
      await rejectsCode(repo.reserve(input("FIXTURE", { fixtureFingerprint: fp("other-fixture") })), "EVENT_CLAIM_FINGERPRINT_CONFLICT");
    });

    test("同時3 Runnerは成功1件・競合2件で原子的", async () => {
      const outcomes = await Promise.allSettled([
        repository(db).reserve(input("RACE", { runId: "STORY902-RUN-RACE-A" })),
        repository(db).reserve(input("RACE", { runId: "STORY902-RUN-RACE-B" })),
        repository(db).reserve(input("RACE", { runId: "STORY902-RUN-RACE-C" }))
      ]);
      assert.equal(outcomes.filter(x => x.status === "fulfilled").length, 1);
      assert.equal(outcomes.filter(x => x.status === "rejected").length, 2);
      const claims = await db.collection("story902_event_claims").where("executionScopeId", "==", `${SCOPE_PREFIX}_RACE`).get();
      assert.equal(claims.size, 1);
    });

    test("RESERVED中断後もClaim保持", async () => {
      const repo = repository(db);
      const reserved = await repo.reserve(input("RESERVED"));
      const recovered = await repo.recoverInterrupted(reserved.stableEventKey, reserved.version);
      assert.equal(recovered.state, "RESERVED");
      assert.equal(recovered.recoveryRequired, true);
      await rejectsCode(repository(db).reserve(input("RESERVED", { runId: "STORY902-RUN-RESERVED-B" })), "EVENT_CLAIM_ALREADY_EXISTS");
    });

    test("SEND_INTENT_RECORDED中断はUNKNOWN", async () => {
      const repo = repository(db);
      const intent = await sent(repo, await repo.reserve(input("INTENT")), "INTENT");
      const recovered = await repo.recoverInterrupted(intent.stableEventKey, intent.version);
      assert.equal(recovered.state, "UNKNOWN");
      assert.equal(recovered.unknownReason, "PROCESS_INTERRUPTED");
    });

    test("IN_FLIGHT中断はUNKNOWN", async () => {
      const repo = repository(db);
      const intent = await sent(repo, await repo.reserve(input("INFLIGHT")), "INFLIGHT");
      const active = await repo.markInFlight(intent.stableEventKey, intent.version);
      const recovered = await repo.recoverInterrupted(active.stableEventKey, active.version);
      assert.equal(recovered.state, "UNKNOWN");
    });

    test("PASS/FAIL/BLOCKED/UNKNOWNは上書き不可", async () => {
      for (const status of ["PASS", "FAIL", "BLOCKED", "UNKNOWN"]) {
        const repo = repository(db);
        const reserved = await repo.reserve(input(`TERMINAL_${status}`));
        const intent = await sent(repo, reserved, status);
        const active = await repo.markInFlight(intent.stableEventKey, intent.version);
        const done = await repo.finish(active.stableEventKey, active.version, {
          status, result: { status }, ...(status === "UNKNOWN" ? { unknownReason: "OUTCOME_UNCERTAIN" } : {})
        });
        await rejectsCode(repo.finish(done.stableEventKey, done.version, { status: "PASS", result: { status: "PASS" } }), "TERMINAL_STATE_IMMUTABLE");
      }
    });

    test("Repository再生成後もClaim保持", async () => {
      const first = repository(db);
      const reserved = await first.reserve(input("RECREATE"));
      const second = repository(db);
      assert.equal((await second.get(reserved.stableEventKey)).runId, reserved.runId);
      await rejectsCode(second.reserve(input("RECREATE", { runId: "STORY902-RUN-RECREATE-B" })), "EVENT_CLAIM_ALREADY_EXISTS");
    });

    test("別プロセスからClaim重複拒否", async () => {
      await repository(db).reserve(input("PROCESS"));
      const child = spawnSync(process.execPath, [__filename, "--child-claim"], {
        cwd: process.cwd(), env: { ...process.env }, encoding: "utf8", timeout: 30000
      });
      assert.equal(child.status, 0, child.stderr);
      assert.match(child.stdout, /CHILD_DUPLICATE_REJECTED/);
    });

    test("Event結果とTimeTrip復元状態は独立", async () => {
      const repo = repository(db);
      const intent = await sent(repo, await repo.reserve(input("TIMETRIP")), "TIMETRIP");
      const active = await repo.markInFlight(intent.stableEventKey, intent.version);
      const done = await repo.finish(active.stableEventKey, active.version, { status: "FAIL", result: { status: "FAIL" } });
      const restored = await repo.setTimeTripState(done.stableEventKey, done.version, "RESTORED", fp("restored"));
      assert.equal(restored.state, "FAIL");
      assert.equal(restored.timeTrip.state, "RESTORED");
    });

    test("Mock証跡とEmulator証跡を分離", async () => {
      const repo = repository(db);
      await rejectsCode(repo.reserve(input("MOCK", { evidenceKind: "MOCK_ONLY" })), "REPOSITORY_EVIDENCE_KIND_REQUIRED");
      const intent = await sent(repo, await repo.reserve(input("EVIDENCE")), "EVIDENCE");
      const active = await repo.markInFlight(intent.stableEventKey, intent.version);
      const done = await repo.finish(active.stableEventKey, active.version, { status: "PASS", result: { status: "PASS" } });
      await rejectsCode(Promise.resolve().then(() => projectContinuationResult(done, {
        runId: done.runId, eventId: done.eventId, manifestFingerprint: done.manifestFingerprint,
        fixtureFingerprint: done.fixtureFingerprint, projectId: done.projectId, target: done.target
      })), "EMULATOR_EVIDENCE_NOT_EXECUTABLE");
    });

    test("Transaction失敗時は安全停止", async () => {
      const failing = {
        collection: (...args) => db.collection(...args),
        runTransaction: async () => { throw Object.assign(Error("EMULATED_TRANSACTION_FAILURE"), { code: "UNAVAILABLE" }); }
      };
      await assert.rejects(repository(failing).reserve(input("TXFAIL")), /EMULATED_TRANSACTION_FAILURE/);
      const count = await db.collection("story902_event_claims").where("executionScopeId", "==", `${SCOPE_PREFIX}_TXFAIL`).get();
      assert.equal(count.size, 0);
    });

    test("commit応答喪失相当でも二重Claimなし", async () => {
      const uncertain = {
        collection: (...args) => db.collection(...args),
        async runTransaction(callback) {
          await db.runTransaction(callback);
          throw Object.assign(Error("EMULATED_COMMIT_RESPONSE_LOST"), { outcomeUnknown: true });
        }
      };
      await rejectsCode(repository(uncertain).reserve(input("UNKNOWN_COMMIT")), "REPOSITORY_OUTCOME_UNKNOWN");
      const count = await db.collection("story902_event_claims").where("executionScopeId", "==", `${SCOPE_PREFIX}_UNKNOWN_COMMIT`).get();
      assert.equal(count.size, 1);
      await rejectsCode(repository(db).reserve(input("UNKNOWN_COMMIT", { runId: "STORY902-RUN-UNKNOWN_COMMIT-B" })), "EVENT_CLAIM_ALREADY_EXISTS");
    });

    try {
      for (const entry of tests) {
        await entry.fn();
        passed += 1;
        console.log(`PASS ${entry.name}`);
      }
      const report = {
        ok: true,
        evidenceKind: "EMULATOR_ONLY",
        host: HOST,
        emulatorProject: EMULATOR_PROJECT,
        targetProject: TARGET_PROJECT,
        namespace: SCOPE_PREFIX,
        tests: { passed, total: tests.length },
        collections: {
          claims: (await db.collection("story902_event_claims").get()).size,
          runs: (await db.collection("story902_runs").get()).size
        },
        businessExecutionAllowed: false
      };
      console.log(JSON.stringify(report, null, 2));
    } finally {
      await deleteApp(app);
    }
    if (passed !== tests.length) process.exitCode = 1;
  })().catch(error => { console.error(error?.stack || error); process.exitCode = 1; });
}
