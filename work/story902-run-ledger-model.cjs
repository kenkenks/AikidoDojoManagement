"use strict";

const { createHash } = require("node:crypto");

const PROJECT_ID = "dojo-management-dev";
const TARGET = "dev-firebase";
const STORY_ID = "STORY-902";
const EVENT_STATES = new Set([
  "RESERVED", "SEND_INTENT_RECORDED", "IN_FLIGHT",
  "PASS", "FAIL", "BLOCKED", "UNKNOWN"
]);
const TERMINAL_STATES = new Set(["PASS", "FAIL", "BLOCKED", "UNKNOWN"]);
const EVIDENCE_KINDS = new Set(["MOCK_ONLY", "DEV_LIVE", "MANUAL_RESOLUTION"]);
const TIME_TRIP_STATES = new Set([
  "NOT_STARTED", "BASELINE_CAPTURED", "SET_VERIFIED",
  "RESTORED", "RESTORE_FAILED", "RECOVERY_REQUIRED"
]);
const RUN_ID = /^STORY902[-_][A-Za-z0-9][A-Za-z0-9._-]{5,95}$/;
const EVENT_ID = /^902-E\d{3}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const FINGERPRINT = /^[a-f0-9]{64}$/;

function failure(code, detail = null) {
  return Object.assign(new Error(code), { name: "Story902RunLedgerError", code, detail });
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function canonicalize(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw failure("CANONICAL_VALUE_INVALID");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    if (keys.some(key => value[key] === undefined)) throw failure("CANONICAL_VALUE_INVALID");
    return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  }
  throw failure("CANONICAL_VALUE_INVALID");
}

function fingerprint(value) {
  return createHash("sha256").update(canonicalize(value), "utf8").digest("hex");
}

function requireIdentifier(value, code) {
  if (!IDENTIFIER.test(String(value || ""))) throw failure(code);
  return String(value);
}

function validateIdentity(input = {}) {
  if (input.projectId !== PROJECT_ID || input.target !== TARGET || input.storyId !== STORY_ID)
    throw failure("DEV_ENVIRONMENT_REQUIRED");
  if (!RUN_ID.test(String(input.runId || ""))) throw failure("RUN_ID_INVALID");
  if (!EVENT_ID.test(String(input.eventId || ""))) throw failure("EVENT_ID_INVALID");
  requireIdentifier(input.executionScopeId, "EXECUTION_SCOPE_ID_REQUIRED");
  for (const name of ["manifestFingerprint", "fixtureFingerprint", "eventFingerprint"])
    if (!FINGERPRINT.test(String(input[name] || ""))) throw failure("FINGERPRINT_INVALID", name);
  return Object.freeze({
    projectId: PROJECT_ID,
    target: TARGET,
    storyId: STORY_ID,
    executionScopeId: input.executionScopeId,
    runId: input.runId,
    eventId: input.eventId,
    manifestFingerprint: input.manifestFingerprint,
    fixtureFingerprint: input.fixtureFingerprint,
    eventFingerprint: input.eventFingerprint
  });
}

function stableEventKey(input) {
  const identity = validateIdentity(input);
  return fingerprint({
    projectId: identity.projectId,
    target: identity.target,
    storyId: identity.storyId,
    executionScopeId: identity.executionScopeId,
    eventId: identity.eventId
  });
}

function createReservedRecord(input, now) {
  const identity = validateIdentity(input);
  return Object.freeze({
    schemaVersion: 1,
    ...identity,
    stableEventKey: stableEventKey(identity),
    state: "RESERVED",
    requestId: null,
    sessionId: null,
    payloadFingerprint: null,
    expectedFingerprint: null,
    evidenceKind: input.evidenceKind || "MOCK_ONLY",
    unknownReason: null,
    result: null,
    readAfterWrite: { status: "NOT_RUN", evidenceDigest: null },
    timeTrip: { state: "NOT_STARTED", evidenceDigest: null },
    reservedAt: now,
    sendIntentRecordedAt: null,
    inFlightAt: null,
    finishedAt: null,
    businessExecutionAllowed: false,
    version: 1
  });
}

function assertRecord(record) {
  if (!record || record.schemaVersion !== 1 || !EVENT_STATES.has(record.state)) throw failure("LEDGER_RECORD_INVALID");
  validateIdentity(record);
  if (record.stableEventKey !== stableEventKey(record)) throw failure("EVENT_CLAIM_KEY_INVALID");
  if (!EVIDENCE_KINDS.has(record.evidenceKind) || !TIME_TRIP_STATES.has(record.timeTrip?.state))
    throw failure("LEDGER_RECORD_INVALID");
  if (record.businessExecutionAllowed !== false) throw failure("BUSINESS_EXECUTION_MUST_REMAIN_DISABLED");
  return record;
}

function transition(record, operation, input = {}, now) {
  assertRecord(record);
  if (TERMINAL_STATES.has(record.state)) throw failure("TERMINAL_STATE_IMMUTABLE", record.state);
  const next = clone(record);
  if (operation === "recordSendIntent") {
    if (record.state !== "RESERVED") throw failure("STATE_TRANSITION_INVALID");
    next.requestId = requireIdentifier(input.requestId, "REQUEST_ID_REQUIRED");
    next.sessionId = requireIdentifier(input.sessionId, "SESSION_ID_REQUIRED");
    if (!FINGERPRINT.test(String(input.payloadFingerprint || "")) || !FINGERPRINT.test(String(input.expectedFingerprint || "")))
      throw failure("FINGERPRINT_INVALID");
    next.payloadFingerprint = input.payloadFingerprint;
    next.expectedFingerprint = input.expectedFingerprint;
    next.state = "SEND_INTENT_RECORDED";
    next.sendIntentRecordedAt = now;
  } else if (operation === "markInFlight") {
    if (record.state !== "SEND_INTENT_RECORDED") throw failure("STATE_TRANSITION_INVALID");
    next.state = "IN_FLIGHT";
    next.inFlightAt = now;
  } else if (operation === "finish") {
    if (record.state !== "IN_FLIGHT" || !TERMINAL_STATES.has(input.status)) throw failure("STATE_TRANSITION_INVALID");
    next.state = input.status;
    next.result = clone(input.result || { status: input.status });
    next.unknownReason = input.status === "UNKNOWN" ? requireIdentifier(input.unknownReason, "UNKNOWN_REASON_REQUIRED") : null;
    if (input.readAfterWrite) next.readAfterWrite = clone(input.readAfterWrite);
    next.finishedAt = now;
  } else {
    throw failure("LEDGER_OPERATION_UNKNOWN");
  }
  next.version = record.version + 1;
  next.businessExecutionAllowed = false;
  return Object.freeze(next);
}

function markInterrupted(record, now) {
  assertRecord(record);
  if (record.state === "SEND_INTENT_RECORDED" || record.state === "IN_FLIGHT") {
    const next = clone(record);
    next.state = "UNKNOWN";
    next.unknownReason = "PROCESS_INTERRUPTED";
    next.result = { status: "UNKNOWN", reason: "PROCESS_INTERRUPTED" };
    next.readAfterWrite = { status: "NOT_RUN", evidenceDigest: null };
    next.finishedAt = now;
    next.version = record.version + 1;
    next.businessExecutionAllowed = false;
    return Object.freeze(next);
  }
  return Object.freeze({ record: clone(record), recoveryRequired: record.state === "RESERVED" });
}

function updateTimeTrip(record, state, evidenceDigest = null) {
  assertRecord(record);
  if (!TIME_TRIP_STATES.has(state)) throw failure("TIME_TRIP_STATE_INVALID");
  if (evidenceDigest !== null && !FINGERPRINT.test(String(evidenceDigest))) throw failure("FINGERPRINT_INVALID");
  const next = clone(record);
  next.timeTrip = { state, evidenceDigest };
  next.version = record.version + 1;
  next.businessExecutionAllowed = false;
  return Object.freeze(next);
}

function projectContinuationResult(record, provenance = {}) {
  assertRecord(record);
  if (record.evidenceKind === "MOCK_ONLY") throw failure("MOCK_EVIDENCE_NOT_EXECUTABLE");
  if (provenance.runId !== record.runId || provenance.eventId !== record.eventId ||
      provenance.manifestFingerprint !== record.manifestFingerprint ||
      provenance.fixtureFingerprint !== record.fixtureFingerprint ||
      provenance.projectId !== PROJECT_ID || provenance.target !== TARGET)
    throw failure("RESULT_PROVENANCE_INVALID");
  if (!TERMINAL_STATES.has(record.state)) throw failure("RESULT_NOT_TERMINAL");
  return Object.freeze({
    eventId: record.eventId,
    status: record.state,
    runId: record.runId,
    stableEventKey: record.stableEventKey,
    evidenceKind: record.evidenceKind,
    businessExecutionAllowed: false
  });
}

module.exports = {
  PROJECT_ID, TARGET, STORY_ID, EVENT_STATES, TERMINAL_STATES, TIME_TRIP_STATES,
  failure, canonicalize, fingerprint, validateIdentity, stableEventKey,
  createReservedRecord, assertRecord, transition, markInterrupted,
  updateTimeTrip, projectContinuationResult
};
