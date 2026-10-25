"use strict";

const assert = require("node:assert/strict");
const {
  fingerprint, projectContinuationResult
} = require("./story902-run-ledger-model.cjs");
const { createFirestoreRunLedgerRepository } = require("./story902-run-ledger-firestore-repository.cjs");
const { createFirestoreTransactionFake } = require("./story902-firestore-transaction-fake.cjs");

let passed = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
async function rejectsCode(promise, code) {
  await assert.rejects(promise, error => error?.code === code || error?.message === code);
}

const fp = value => fingerprint({ value });
function input(overrides = {}) {
  return {
    projectId: "dojo-management-dev",
    target: "dev-firebase",
    storyId: "STORY-902",
    executionScopeId: "STORY902_SCOPE_202710",
    runId: "STORY902-RUN-20271025-A",
    eventId: "902-E010",
    manifestFingerprint: fp("manifest"),
    fixtureFingerprint: fp("fixture"),
    eventFingerprint: fp("event"),
    evidenceKind: "DEV_LIVE",
    ...overrides
  };
}
function setup() {
  const fake = createFirestoreTransactionFake();
  let tick = 0;
  const clock = () => `2027-07-02T10:00:${String(tick++).padStart(2, "0")}.000Z`;
  return { fake, repository: createFirestoreRunLedgerRepository(fake, { clock, serverTimestamp: clock }) };
}
async function sent(repository, reserved) {
  return repository.recordSendIntent(reserved.stableEventKey, reserved.version, {
    requestId: "REQ_E010_001",
    sessionId: "SESSION_E010_001",
    payloadFingerprint: fp("payload"),
    expectedFingerprint: fp("expected")
  });
}

test("初回Claim成功", async () => {
  const { repository } = setup();
  const record = await repository.reserve(input());
  assert.equal(record.state, "RESERVED");
  assert.equal(record.businessExecutionAllowed, false);
  assert.deepEqual(await repository.get(record.stableEventKey), record);
});

test("同一Claimの重複拒否", async () => {
  const { repository } = setup();
  await repository.reserve(input());
  await rejectsCode(repository.reserve(input()), "EVENT_CLAIM_ALREADY_EXISTS");
});

test("Run ID変更による重複拒否", async () => {
  const { repository } = setup();
  await repository.reserve(input());
  await rejectsCode(repository.reserve(input({ runId: "STORY902-RUN-20271025-B" })), "EVENT_CLAIM_ALREADY_EXISTS");
});

test("requestId変更はClaimを変更しない", async () => {
  const { repository } = setup();
  await repository.reserve(input({ requestId: "REQ_A" }));
  await rejectsCode(repository.reserve(input({ requestId: "REQ_B", runId: "STORY902-RUN-20271025-B" })), "EVENT_CLAIM_ALREADY_EXISTS");
});

test("fixture変更はfingerprint conflict", async () => {
  const { repository } = setup();
  await repository.reserve(input());
  await rejectsCode(repository.reserve(input({ fixtureFingerprint: fp("fixture-2") })), "EVENT_CLAIM_FINGERPRINT_CONFLICT");
});

test("同時3 Runnerで成功1件・競合2件", async () => {
  const { repository, fake } = setup();
  const outcomes = await Promise.allSettled([
    repository.reserve(input({ runId: "STORY902-RUN-20271025-A" })),
    repository.reserve(input({ runId: "STORY902-RUN-20271025-B" })),
    repository.reserve(input({ runId: "STORY902-RUN-20271025-C" }))
  ]);
  assert.equal(outcomes.filter(x => x.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter(x => x.status === "rejected").length, 2);
  assert.ok(fake.metrics().callbackInvocations > 3, "競合再試行が必要");
});

test("RESERVED中断後もClaim保持・再予約拒否", async () => {
  const { repository } = setup();
  const reserved = await repository.reserve(input());
  const recovered = await repository.recoverInterrupted(reserved.stableEventKey, reserved.version);
  assert.equal(recovered.state, "RESERVED");
  assert.equal(recovered.recoveryRequired, true);
  await rejectsCode(repository.reserve(input({ runId: "STORY902-RUN-20271025-B" })), "EVENT_CLAIM_ALREADY_EXISTS");
});

test("SEND_INTENT_RECORDED中断はUNKNOWN", async () => {
  const { repository } = setup();
  const intent = await sent(repository, await repository.reserve(input()));
  const recovered = await repository.recoverInterrupted(intent.stableEventKey, intent.version);
  assert.equal(recovered.state, "UNKNOWN");
  assert.equal(recovered.unknownReason, "PROCESS_INTERRUPTED");
});

test("IN_FLIGHT中断はUNKNOWN", async () => {
  const { repository } = setup();
  const intent = await sent(repository, await repository.reserve(input()));
  const active = await repository.markInFlight(intent.stableEventKey, intent.version);
  const recovered = await repository.recoverInterrupted(active.stableEventKey, active.version);
  assert.equal(recovered.state, "UNKNOWN");
});

for (const terminal of ["PASS", "FAIL", "BLOCKED", "UNKNOWN"]) {
  test(`${terminal}の上書き禁止`, async () => {
    const { repository } = setup();
    const intent = await sent(repository, await repository.reserve(input()));
    const active = await repository.markInFlight(intent.stableEventKey, intent.version);
    const done = await repository.finish(active.stableEventKey, active.version, {
      status: terminal,
      result: { status: terminal },
      ...(terminal === "UNKNOWN" ? { unknownReason: "OUTCOME_UNCERTAIN" } : {})
    });
    await rejectsCode(repository.finish(done.stableEventKey, done.version, {
      status: "PASS", result: { status: "PASS" }
    }), "TERMINAL_STATE_IMMUTABLE");
    assert.equal((await repository.get(done.stableEventKey)).state, terminal);
  });
}

test("Event結果とTimeTrip状態を独立管理", async () => {
  const { repository } = setup();
  const intent = await sent(repository, await repository.reserve(input()));
  const active = await repository.markInFlight(intent.stableEventKey, intent.version);
  const done = await repository.finish(active.stableEventKey, active.version, { status: "PASS", result: { status: "PASS" } });
  const timed = await repository.setTimeTripState(done.stableEventKey, done.version, "RESTORED", fp("time"));
  assert.equal(timed.state, "PASS");
  assert.equal(timed.timeTrip.state, "RESTORED");
});

test("Mock証跡をlive Repositoryへ保存しない", async () => {
  const { repository } = setup();
  await rejectsCode(repository.reserve(input({ evidenceKind: "MOCK_ONLY" })), "REPOSITORY_EVIDENCE_KIND_REQUIRED");
});

test("DEV証跡のprovenanceを維持", async () => {
  const { repository } = setup();
  const intent = await sent(repository, await repository.reserve(input()));
  const active = await repository.markInFlight(intent.stableEventKey, intent.version);
  const done = await repository.finish(active.stableEventKey, active.version, { status: "PASS", result: { status: "PASS" } });
  const projected = projectContinuationResult(done, {
    runId: done.runId, eventId: done.eventId,
    manifestFingerprint: done.manifestFingerprint,
    fixtureFingerprint: done.fixtureFingerprint,
    projectId: done.projectId, target: done.target
  });
  assert.equal(projected.status, "PASS");
  assert.equal(projected.businessExecutionAllowed, false);
});

test("Transaction失敗時は安全停止", async () => {
  const { repository, fake } = setup();
  fake.injectFailureBeforeCommit();
  await assert.rejects(repository.reserve(input()), /FAKE_TRANSACTION_FAILED/);
  assert.equal(fake.metrics().documentCount, 0);
});

test("Transaction競合再試行に外部副作用なし", async () => {
  const { repository, fake } = setup();
  await Promise.allSettled([
    repository.reserve(input({ runId: "STORY902-RUN-20271025-A" })),
    repository.reserve(input({ runId: "STORY902-RUN-20271025-B" })),
    repository.reserve(input({ runId: "STORY902-RUN-20271025-C" }))
  ]);
  assert.ok(fake.metrics().callbackInvocations > 3);
  assert.equal(fake.metrics().outsideEffects, 0);
});

test("commit応答喪失後も重複Claimを作らない", async () => {
  const { repository, fake } = setup();
  fake.injectCommitResponseLoss();
  await rejectsCode(repository.reserve(input()), "REPOSITORY_OUTCOME_UNKNOWN");
  const dump = fake.dump();
  assert.equal(Object.keys(dump).filter(path => path.startsWith("story902_event_claims/")).length, 1);
  await rejectsCode(repository.reserve(input({ runId: "STORY902-RUN-20271025-B" })), "EVENT_CLAIM_ALREADY_EXISTS");
});

test("全永続recordでbusinessExecutionAllowed=false", async () => {
  const { repository, fake } = setup();
  await repository.reserve(input());
  for (const value of Object.values(fake.dump())) assert.equal(value.businessExecutionAllowed, false);
});

(async () => {
  for (const entry of tests) {
    try {
      await entry.fn();
      passed += 1;
      console.log(`PASS ${entry.name}`);
    } catch (error) {
      console.error(`FAIL ${entry.name}`);
      console.error(error);
      process.exitCode = 1;
    }
  }
  console.log(`D-3a: ${passed}/${tests.length} PASS`);
  if (passed !== tests.length) process.exitCode = 1;
})();
