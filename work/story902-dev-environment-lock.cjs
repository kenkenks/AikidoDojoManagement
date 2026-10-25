"use strict";

const APPROVED = Object.freeze({
  projectId: "dojo-management-dev",
  projectNumber: "374758850136",
  target: "dev-firebase",
  mode: "development",
  databaseId: "(default)",
  cloudRunService: "dojo-time-travel-admin",
  serviceAccount: "374758850136-compute@developer.gserviceaccount.com",
  collections: Object.freeze([
    "story902_execution_scopes", "story902_runs",
    "story902_event_claims", "story902_environment_locks"
  ])
});

function lockError(code, detail = null) {
  return Object.assign(new Error(code), { name: "Story902EnvironmentLockError", code, detail });
}

function assertNoEndpointOverride(env = {}) {
  for (const key of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST", "FIRESTORE_HOST"])
    if (String(env[key] || "").trim()) throw lockError("REAL_DEV_EMULATOR_MIX_FORBIDDEN", key);
  if (String(env.GOOGLE_APPLICATION_CREDENTIALS || "").trim())
    throw lockError("SERVICE_ACCOUNT_KEY_FILE_FORBIDDEN");
  for (const key of ["GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT"])
    if (env[key] && env[key] !== APPROVED.projectId) throw lockError("PROJECT_ENV_MISMATCH", key);
  if (env.FIRESTORE_DATABASE_ID && env.FIRESTORE_DATABASE_ID !== APPROVED.databaseId)
    throw lockError("DATABASE_ENV_MISMATCH");
}

function assertProfile(profile) {
  if (!profile || profile.projectId !== APPROVED.projectId ||
      profile.confirmedDevelopmentProject !== APPROVED.projectId ||
      profile.target !== APPROVED.target || profile.mode !== APPROVED.mode ||
      profile.runtime !== "firebase") throw lockError("DEV_TARGET_PROFILE_MISMATCH");
}

function assertRuntimeIdentity(identity) {
  if (!identity || identity.verified !== true || identity.source !== "CLOUD_RUN_SERVICE_CONFIGURATION" ||
      identity.projectId !== APPROVED.projectId || identity.projectNumber !== APPROVED.projectNumber ||
      identity.service !== APPROVED.cloudRunService || identity.serviceAccount !== APPROVED.serviceAccount)
    throw lockError("RUNTIME_IDENTITY_NOT_APPROVED");
}

function assertClient(client) {
  const appProjectId = client?.app?.options?.projectId;
  if (!client || client.projectId !== APPROVED.projectId || client.databaseId !== APPROVED.databaseId ||
      appProjectId !== APPROVED.projectId || typeof client.collection !== "function" ||
      typeof client.runTransaction !== "function") throw lockError("SDK_TARGET_MISMATCH");
}

function createDevEnvironmentLock({ loadTargetProfile, inspectRuntimeIdentity, env = process.env } = {}) {
  if (typeof loadTargetProfile !== "function" || typeof inspectRuntimeIdentity !== "function")
    throw new TypeError("ENVIRONMENT_INSPECTORS_REQUIRED");
  async function open(createClient) {
    if (typeof createClient !== "function") throw new TypeError("CLIENT_FACTORY_REQUIRED");
    assertNoEndpointOverride(env);
    const [profile, identity] = await Promise.all([loadTargetProfile(), inspectRuntimeIdentity()]);
    assertProfile(profile);
    assertRuntimeIdentity(identity);
    const client = await createClient();
    assertClient(client);
    return Object.freeze({
      client,
      attestation: Object.freeze({
        status: "DEV_ENVIRONMENT_LOCK_VERIFIED",
        projectId: APPROVED.projectId,
        databaseId: APPROVED.databaseId,
        target: APPROVED.target,
        service: APPROVED.cloudRunService,
        serviceAccount: APPROVED.serviceAccount,
        collections: APPROVED.collections,
        emulator: false,
        firestoreOperationAllowed: false,
        businessExecutionAllowed: false
      })
    });
  }
  return Object.freeze({ open });
}

module.exports = {
  APPROVED, lockError, assertNoEndpointOverride, assertProfile,
  assertRuntimeIdentity, assertClient, createDevEnvironmentLock
};
