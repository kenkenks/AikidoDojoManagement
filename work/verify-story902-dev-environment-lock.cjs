"use strict";

const assert = require("node:assert/strict");
const {
  APPROVED, createDevEnvironmentLock
} = require("./story902-dev-environment-lock.cjs");

const tests = [];
let passed = 0;
function test(name, fn) { tests.push({ name, fn }); }

function profile(overrides = {}) {
  return {
    target: APPROVED.target,
    runtime: "firebase",
    mode: APPROVED.mode,
    projectId: APPROVED.projectId,
    confirmedDevelopmentProject: APPROVED.projectId,
    ...overrides
  };
}
function identity(overrides = {}) {
  return {
    verified: true,
    source: "CLOUD_RUN_SERVICE_CONFIGURATION",
    projectId: APPROVED.projectId,
    projectNumber: APPROVED.projectNumber,
    service: APPROVED.cloudRunService,
    serviceAccount: APPROVED.serviceAccount,
    ...overrides
  };
}
function client(overrides = {}) {
  return {
    projectId: APPROVED.projectId,
    databaseId: APPROVED.databaseId,
    app: { options: { projectId: APPROVED.projectId } },
    collection() {},
    runTransaction() {},
    ...overrides
  };
}
function setup({ profileValue = profile(), identityValue = identity(), env = {}, clientValue = client() } = {}) {
  const calls = { profile: 0, identity: 0, client: 0 };
  const lock = createDevEnvironmentLock({
    env,
    loadTargetProfile: async () => { calls.profile += 1; return profileValue; },
    inspectRuntimeIdentity: async () => { calls.identity += 1; return identityValue; }
  });
  return {
    calls,
    open: () => lock.open(async () => { calls.client += 1; return clientValue; })
  };
}
async function rejectsCode(promise, code) {
  await assert.rejects(promise, error => error?.code === code || error?.message === code);
}

test("正しいDEV設定を操作なしでattest", async () => {
  const harness = setup();
  const result = await harness.open();
  assert.equal(result.attestation.status, "DEV_ENVIRONMENT_LOCK_VERIFIED");
  assert.equal(result.attestation.firestoreOperationAllowed, false);
  assert.equal(result.attestation.businessExecutionAllowed, false);
  assert.deepEqual(harness.calls, { profile: 1, identity: 1, client: 1 });
});

test("project ID不一致をclient生成前に拒否", async () => {
  const harness = setup({ profileValue: profile({ projectId: "other-dev" }) });
  await rejectsCode(harness.open(), "DEV_TARGET_PROFILE_MISMATCH");
  assert.equal(harness.calls.client, 0);
});

test("database ID不一致をFirestore操作前に拒否", async () => {
  const harness = setup({ clientValue: client({ databaseId: "other" }) });
  await rejectsCode(harness.open(), "SDK_TARGET_MISMATCH");
  assert.equal(harness.calls.client, 1);
});

test("Emulator設定混入をinspector前に拒否", async () => {
  const harness = setup({ env: { FIRESTORE_EMULATOR_HOST: "127.0.0.1:8087" } });
  await rejectsCode(harness.open(), "REAL_DEV_EMULATOR_MIX_FORBIDDEN");
  assert.deepEqual(harness.calls, { profile: 0, identity: 0, client: 0 });
});

test("未設定profileを拒否", async () => {
  const harness = setup({ profileValue: null });
  await rejectsCode(harness.open(), "DEV_TARGET_PROFILE_MISMATCH");
  assert.equal(harness.calls.client, 0);
});

test("本番project ID環境変数をinspector前に拒否", async () => {
  const harness = setup({ env: { GOOGLE_CLOUD_PROJECT: "dojo-management-prod" } });
  await rejectsCode(harness.open(), "PROJECT_ENV_MISMATCH");
  assert.deepEqual(harness.calls, { profile: 0, identity: 0, client: 0 });
});

test("不正な実行主体設定を拒否", async () => {
  const harness = setup({ identityValue: identity({ serviceAccount: "other@developer.gserviceaccount.com" }) });
  await rejectsCode(harness.open(), "RUNTIME_IDENTITY_NOT_APPROVED");
  assert.equal(harness.calls.client, 0);
});

test("key file認証を接続前に拒否", async () => {
  const harness = setup({ env: { GOOGLE_APPLICATION_CREDENTIALS: "C:\\secret.json" } });
  await rejectsCode(harness.open(), "SERVICE_ACCOUNT_KEY_FILE_FORBIDDEN");
  assert.deepEqual(harness.calls, { profile: 0, identity: 0, client: 0 });
});

test("SDK app project不一致をFirestore操作前に拒否", async () => {
  const harness = setup({ clientValue: client({ app: { options: { projectId: "other" } } }) });
  await rejectsCode(harness.open(), "SDK_TARGET_MISMATCH");
  assert.equal(harness.calls.client, 1);
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
  console.log(`D-3c environment lock: ${passed}/${tests.length} PASS`);
  if (passed !== tests.length) process.exitCode = 1;
})();
