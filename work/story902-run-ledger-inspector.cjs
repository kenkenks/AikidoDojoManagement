"use strict";

const { createHash } = require("node:crypto");

const PROJECT_ID = "dojo-management-dev";
const DATABASE_ID = "(default)";
const TARGET = "dev-firebase";
const STORY_ID = "STORY-902";
const CLAIM_KEY = /^[a-f0-9]{64}$/;
const RUN_ID = /^STORY902[-_][A-Za-z0-9][A-Za-z0-9._-]{5,95}$/;
const EVENT_ID = /^902-E\d{3}$/;

function failure(code, detail = null) {
  return Object.assign(new Error(code), { name: "Story902InspectorError", code, detail });
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function validateAdapter(adapter) {
  if (!adapter || adapter.kind !== "STORY902_READ_ONLY_ADAPTER" ||
      typeof adapter.getDocument !== "function" || typeof adapter.listCollection !== "function") {
    throw failure("READ_ONLY_ADAPTER_REQUIRED");
  }
  for (const name of ["create", "set", "update", "delete", "runTransaction", "sendEvent"])
    if (typeof adapter[name] === "function") throw failure("WRITE_CAPABILITY_FORBIDDEN", name);
}

function validateAttestation(attestation) {
  if (!attestation || attestation.source !== "STORY902_ENVIRONMENT_LOCK" ||
      attestation.status !== "ATTESTED" || attestation.projectId !== PROJECT_ID ||
      attestation.databaseId !== DATABASE_ID || attestation.target !== TARGET ||
      attestation.repositoryOperationAllowed !== true ||
      attestation.businessExecutionAllowed !== false ||
      attestation.eventSendAllowed !== false || attestation.timeTripChangeAllowed !== false) {
    throw failure("ENVIRONMENT_ATTESTATION_REQUIRED");
  }
}

function requireClaimKey(value) {
  if (!CLAIM_KEY.test(String(value || ""))) throw failure("CLAIM_KEY_INVALID");
  return String(value);
}

function assertClaim(claim, key) {
  if (!claim || claim.stableEventKey !== key || claim.projectId !== PROJECT_ID ||
      claim.target !== TARGET || claim.storyId !== STORY_ID ||
      !RUN_ID.test(String(claim.ownerRunId || "")) || !EVENT_ID.test(String(claim.eventId || ""))) {
    throw failure("CLAIM_INVALID");
  }
  return claim;
}

function assertEvent(event, claim) {
  if (!event || event.stableEventKey !== claim.stableEventKey ||
      event.runId !== claim.ownerRunId || event.eventId !== claim.eventId ||
      event.projectId !== PROJECT_ID || event.target !== TARGET || event.storyId !== STORY_ID ||
      event.version !== claim.version || event.businessExecutionAllowed !== false) {
    throw failure("EVENT_CLAIM_INCONSISTENT");
  }
  return event;
}

function recoveryReasons(run, event, audits, environmentLock) {
  const reasons = [];
  if (run?.state === "RECOVERY_REQUIRED") reasons.push("RUN_RECOVERY_REQUIRED");
  if (event?.state === "UNKNOWN") reasons.push("EVENT_UNKNOWN");
  if (event?.recoveryRequired === true || event?.state === "RESERVED" && event?.recoveryRequired)
    reasons.push("EVENT_RECOVERY_REQUIRED");
  if (["RESTORE_FAILED", "RECOVERY_REQUIRED"].includes(event?.timeTrip?.state))
    reasons.push("TIME_TRIP_RECOVERY_REQUIRED");
  if (environmentLock?.state === "RECOVERY_REQUIRED") reasons.push("ENVIRONMENT_LOCK_RECOVERY_REQUIRED");
  if (audits.some(entry => entry?.decision === "STOP_ALL_FOLLOWING_EVENTS"))
    reasons.push("RECOVERY_AUDIT_STOP");
  return [...new Set(reasons)];
}

function createRunLedgerInspector(adapter, attestation) {
  validateAdapter(adapter);
  validateAttestation(attestation);

  async function inspectClaim(stableEventKey) {
    const key = requireClaimKey(stableEventKey);
    const claimPath = `story902_event_claims/${key}`;
    const claim = assertClaim(await adapter.getDocument(claimPath), key);
    const runPath = `story902_runs/${claim.ownerRunId}`;
    const eventPath = `${runPath}/events/${claim.eventId}`;
    const [run, event, audits, environmentLock] = await Promise.all([
      adapter.getDocument(runPath),
      adapter.getDocument(eventPath),
      adapter.listCollection(`${runPath}/recovery_audits`),
      adapter.getDocument("story902_environment_locks/dojo-management-dev_dev-firebase")
    ]);
    if (!run || run.runId !== claim.ownerRunId || run.projectId !== PROJECT_ID || run.target !== TARGET)
      throw failure("RUN_INVALID");
    assertEvent(event, claim);
    if (!Array.isArray(audits)) throw failure("RECOVERY_AUDITS_INVALID");
    const reasons = recoveryReasons(run, event, audits, environmentLock);
    return Object.freeze({
      schemaVersion: 1,
      projectId: PROJECT_ID,
      databaseId: DATABASE_ID,
      target: TARGET,
      stableEventKey: key,
      claim: clone(claim),
      run: clone(run),
      event: clone(event),
      timeTrip: clone(event.timeTrip),
      recoveryAudits: clone(audits),
      environmentLock: clone(environmentLock),
      recoveryRequired: reasons.length > 0,
      recoveryReasons: reasons,
      evidenceDigest: digest({ claim, run, event, audits, environmentLock }),
      readOnly: true,
      businessExecutionAllowed: false,
      eventSendAllowed: false,
      timeTripChangeAllowed: false
    });
  }

  return Object.freeze({
    kind: "STORY902_RUN_LEDGER_INSPECTOR",
    projectId: PROJECT_ID,
    databaseId: DATABASE_ID,
    target: TARGET,
    inspectClaim
  });
}

module.exports = {
  PROJECT_ID, DATABASE_ID, TARGET, STORY_ID,
  createRunLedgerInspector, recoveryReasons
};
