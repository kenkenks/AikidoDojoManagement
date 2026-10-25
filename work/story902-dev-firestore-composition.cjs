"use strict";

const { APPROVED, lockError } = require("./story902-dev-environment-lock.cjs");

const SCOPE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const APPROVAL_ID = /^STORY902_APPROVAL_[A-Za-z0-9._-]{8,96}$/;

function assertApproval(approval, now) {
  if (!approval || approval.verified !== true || approval.source !== "TRUSTED_APPROVAL_ADAPTER" ||
      approval.kind !== "STORY902_DEV_FIRESTORE" || approval.status !== "APPROVED" ||
      approval.projectId !== APPROVED.projectId || approval.databaseId !== APPROVED.databaseId ||
      approval.target !== APPROVED.target || approval.serviceAccount !== APPROVED.serviceAccount ||
      !APPROVAL_ID.test(String(approval.approvalId || "")) ||
      !SCOPE_ID.test(String(approval.executionScopeId || ""))) {
    throw lockError("DEV_CONNECTION_APPROVAL_INVALID");
  }
  const expires = Date.parse(String(approval.expiresAt || ""));
  if (!Number.isFinite(expires) || expires <= now.getTime()) throw lockError("DEV_CONNECTION_APPROVAL_EXPIRED");
  return approval;
}

function createGuardedDevFirestoreComposition({
  environmentLock,
  loadAndVerifyApproval,
  createClient,
  createRepository,
  clock = () => new Date()
} = {}) {
  if (!environmentLock || typeof environmentLock.open !== "function" ||
      typeof loadAndVerifyApproval !== "function" || typeof createClient !== "function" ||
      typeof createRepository !== "function" || typeof clock !== "function") {
    throw new TypeError("DEV_FIRESTORE_COMPOSITION_DEPENDENCIES_REQUIRED");
  }

  async function prepare() {
    const approval = assertApproval(await loadAndVerifyApproval(), clock());
    const locked = await environmentLock.open(createClient);
    if (locked.attestation.projectId !== approval.projectId ||
        locked.attestation.databaseId !== approval.databaseId ||
        locked.attestation.target !== approval.target ||
        locked.attestation.serviceAccount !== approval.serviceAccount) {
      throw lockError("APPROVAL_ENVIRONMENT_MISMATCH");
    }
    const repository = await createRepository(locked.client, {
      executionScopeId: approval.executionScopeId,
      approvedCollections: locked.attestation.collections
    });
    if (!repository || typeof repository.reserve !== "function" || typeof repository.get !== "function")
      throw lockError("RUN_LEDGER_REPOSITORY_INVALID");
    return Object.freeze({
      repository,
      capability: Object.freeze({
        status: "DEV_REPOSITORY_READY",
        approvalId: approval.approvalId,
        executionScopeId: approval.executionScopeId,
        projectId: approval.projectId,
        databaseId: approval.databaseId,
        serviceAccount: approval.serviceAccount,
        repositoryOperationAllowed: true,
        businessExecutionAllowed: false,
        eventSendAllowed: false,
        timeTripChangeAllowed: false
      })
    });
  }

  return Object.freeze({ prepare });
}

module.exports = { assertApproval, createGuardedDevFirestoreComposition };
