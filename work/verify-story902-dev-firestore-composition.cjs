"use strict";

const assert = require("node:assert/strict");
const { APPROVED, createDevEnvironmentLock } = require("./story902-dev-environment-lock.cjs");
const { createGuardedDevFirestoreComposition } = require("./story902-dev-firestore-composition.cjs");

const tests = [];
let passed = 0;
const test = (name, fn) => tests.push({ name, fn });
async function rejectsCode(promise, code) {
  await assert.rejects(promise, error => error?.code === code || error?.message === code);
}

function fixture(overrides = {}) {
  const calls = { approval: 0, profile: 0, identity: 0, client: 0, repository: 0 };
  const env = overrides.env || {};
  const profile = overrides.profile || {
    target: APPROVED.target, runtime: "firebase", mode: APPROVED.mode,
    projectId: APPROVED.projectId, confirmedDevelopmentProject: APPROVED.projectId
  };
  const identity = overrides.identity || {
    verified: true, source: "CLOUD_RUN_SERVICE_CONFIGURATION",
    projectId: APPROVED.projectId, projectNumber: APPROVED.projectNumber,
    service: APPROVED.cloudRunService, serviceAccount: APPROVED.serviceAccount
  };
  const client = overrides.client || {
    projectId: APPROVED.projectId, databaseId: APPROVED.databaseId,
    app: { options: { projectId: APPROVED.projectId } },
    collection() {}, runTransaction() {}
  };
  const approval = overrides.approval === undefined ? {
    verified: true, source: "TRUSTED_APPROVAL_ADAPTER", kind: "STORY902_DEV_FIRESTORE",
    status: "APPROVED", approvalId: "STORY902_APPROVAL_OFFLINE_001",
    executionScopeId: "STORY902_SCOPE_OFFLINE_001",
    projectId: APPROVED.projectId, databaseId: APPROVED.databaseId,
    target: APPROVED.target, serviceAccount: APPROVED.serviceAccount,
    expiresAt: "2026-10-26T00:00:00.000Z"
  } : overrides.approval;
  const lock = createDevEnvironmentLock({
    env,
    loadTargetProfile: async () => { calls.profile += 1; return profile; },
    inspectRuntimeIdentity: async () => { calls.identity += 1; return identity; }
  });
  const composition = createGuardedDevFirestoreComposition({
    environmentLock: lock,
    loadAndVerifyApproval: async () => { calls.approval += 1; return approval; },
    createClient: async () => { calls.client += 1; return client; },
    createRepository: async (_client, options) => {
      calls.repository += 1;
      assert.equal(options.executionScopeId, approval.executionScopeId);
      return { reserve() {}, get() {} };
    },
    clock: () => new Date("2026-10-25T00:00:00.000Z")
  });
  return { calls, prepare: () => composition.prepare() };
}

test("明示承認とEnvironment lock後だけRepositoryを生成", async () => {
  const f = fixture();
  const result = await f.prepare();
  assert.equal(result.capability.repositoryOperationAllowed, true);
  assert.equal(result.capability.businessExecutionAllowed, false);
  assert.equal(result.capability.eventSendAllowed, false);
  assert.deepEqual(f.calls, { approval: 1, profile: 1, identity: 1, client: 1, repository: 1 });
});

test("承認なしではSDK初期化もRepository生成もしない", async () => {
  const f = fixture({ approval: null });
  await rejectsCode(f.prepare(), "DEV_CONNECTION_APPROVAL_INVALID");
  assert.deepEqual(f.calls, { approval: 1, profile: 0, identity: 0, client: 0, repository: 0 });
});

test("期限切れ承認を拒否", async () => {
  const f = fixture({ approval: {
    verified: true, source: "TRUSTED_APPROVAL_ADAPTER", kind: "STORY902_DEV_FIRESTORE",
    status: "APPROVED", approvalId: "STORY902_APPROVAL_EXPIRED_001",
    executionScopeId: "STORY902_SCOPE_OFFLINE_001", projectId: APPROVED.projectId,
    databaseId: APPROVED.databaseId, target: APPROVED.target,
    serviceAccount: APPROVED.serviceAccount, expiresAt: "2026-10-24T00:00:00.000Z"
  } });
  await rejectsCode(f.prepare(), "DEV_CONNECTION_APPROVAL_EXPIRED");
  assert.equal(f.calls.client, 0);
  assert.equal(f.calls.repository, 0);
});

test("Emulator混入はSDK初期化前に停止", async () => {
  const f = fixture({ env: { FIRESTORE_EMULATOR_HOST: "127.0.0.1:8087" } });
  await rejectsCode(f.prepare(), "REAL_DEV_EMULATOR_MIX_FORBIDDEN");
  assert.equal(f.calls.client, 0);
  assert.equal(f.calls.repository, 0);
});

test("SDK project/database不一致ではRepository生成なし", async () => {
  const f = fixture({ client: {
    projectId: APPROVED.projectId, databaseId: "other",
    app: { options: { projectId: APPROVED.projectId } }, collection() {}, runTransaction() {}
  } });
  await rejectsCode(f.prepare(), "SDK_TARGET_MISMATCH");
  assert.equal(f.calls.client, 1);
  assert.equal(f.calls.repository, 0);
});

test("不正実行主体ではSDK初期化前に停止", async () => {
  const f = fixture({ identity: {
    verified: true, source: "CLOUD_RUN_SERVICE_CONFIGURATION",
    projectId: APPROVED.projectId, projectNumber: APPROVED.projectNumber,
    service: APPROVED.cloudRunService, serviceAccount: "other@example.invalid"
  } });
  await rejectsCode(f.prepare(), "RUNTIME_IDENTITY_NOT_APPROVED");
  assert.equal(f.calls.client, 0);
  assert.equal(f.calls.repository, 0);
});

test("承認と実環境の不一致を拒否", async () => {
  const f = fixture({ approval: {
    verified: true, source: "TRUSTED_APPROVAL_ADAPTER", kind: "STORY902_DEV_FIRESTORE",
    status: "APPROVED", approvalId: "STORY902_APPROVAL_WRONGSA_001",
    executionScopeId: "STORY902_SCOPE_OFFLINE_001", projectId: APPROVED.projectId,
    databaseId: APPROVED.databaseId, target: APPROVED.target,
    serviceAccount: "other@example.invalid", expiresAt: "2026-10-26T00:00:00.000Z"
  } });
  await rejectsCode(f.prepare(), "DEV_CONNECTION_APPROVAL_INVALID");
  assert.equal(f.calls.client, 0);
  assert.equal(f.calls.repository, 0);
});

(async () => {
  for (const entry of tests) {
    try { await entry.fn(); passed += 1; console.log(`PASS ${entry.name}`); }
    catch (error) { console.error(`FAIL ${entry.name}`); console.error(error); process.exitCode = 1; }
  }
  console.log(`D-3d composition: ${passed}/${tests.length} PASS`);
  if (passed !== tests.length) process.exitCode = 1;
})();
