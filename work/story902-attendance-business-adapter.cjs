"use strict";

const { validateManifest } = require("./story902-manifest-loader.cjs");
const { evaluateContinuationGates } = require("./story902-continuation-gate.cjs");
const planJudge = require("./story902-attendance-plan-judge.cjs");

const EVENT_TYPE = "ATTENDANCE_REGISTER";
const ACTION = "attendance_batch";
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const RUN_ID = /^STORY902[-_][A-Za-z0-9][A-Za-z0-9._-]{5,95}$/;

function result(status, detail = {}) {
  return Object.freeze({ status, mockExecution: true, businessExecutionAllowed: false, autoRetryAllowed: false, ...detail });
}
function block(code, detail) { return result("BLOCKED", { reason: { code, detail } }); }
function findEvent(manifest, eventId) {
  return Array.isArray(manifest?.events) ? manifest.events.find(event => event?.eventId === eventId) || null : null;
}
const { readExpected, normalizeResponse, compareExpected, validReadEvidence } = planJudge;
function normalizeFixture(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fixture = { source_member_id: value.source_member_id, member_id: value.member_id, teacher_id: value.teacher_id,
    location_id: value.location_id, billing_block_id: value.billing_block_id, slot_id: value.slot_id, current_rank: value.current_rank };
  if (![fixture.source_member_id, fixture.member_id, fixture.teacher_id, fixture.location_id, fixture.billing_block_id, fixture.slot_id]
    .every(item => ID.test(String(item || "")))) return null;
  if (typeof fixture.current_rank !== "string" || !fixture.current_rank.trim() || fixture.current_rank.length > 100) return null;
  return Object.freeze({ ...fixture, current_rank: fixture.current_rank.trim() });
}

function inspectAttendanceEventContract({ manifest, eventId, eventResults = {}, fixture } = {}) {
  const validation = validateManifest(manifest);
  if (!validation.valid) return block("MANIFEST_INVALID", validation.errors);
  const event = findEvent(manifest, eventId);
  if (!event) return block("EVENT_NOT_FOUND", eventId || null);
  if (event.eventType !== EVENT_TYPE || event.operation?.name !== "出席登録")
    return block("EVENT_NOT_SUPPORTED", { eventId, eventType: event.eventType, operation: event.operation?.name || null });

  const blockers = [];
  const continuation = evaluateContinuationGates(manifest, eventResults);
  const gate = continuation.gates.find(item => item.eventId === eventId);
  if (!gate?.candidate) blockers.push({ code: "CONTINUATION_NOT_ESTABLISHED", detail: gate || null });
  if (!event.executionDateTime) blockers.push({ code: "EVENT_DATETIME_UNRESOLVED", detail: event.sourceTimeCategory || null });
  if (!ID.test(String(event.planId || ""))) blockers.push({ code: "PLAN_ID_UNRESOLVED", detail: event.planId || null });
  const expected = readExpected(event);
  if (!expected) blockers.push({ code: "EXPECTED_UNRESOLVED", detail: event.expected?.businessValues || null });
  const normalizedFixture = normalizeFixture(fixture);
  if (!normalizedFixture) blockers.push({ code: "FIXTURE_INVALID", detail: null });
  else if (normalizedFixture.source_member_id !== event.memberId)
    blockers.push({ code: "FIXTURE_MEMBER_MISMATCH", detail: { expected: event.memberId, actual: normalizedFixture.source_member_id } });

  return result(blockers.length ? "BLOCKED" : "READY", {
    eventId, eventType: EVENT_TYPE, action: ACTION, executionDateTime: event.executionDateTime || null,
    fixture: normalizedFixture, expected, blockers: Object.freeze(blockers.map(Object.freeze))
  });
}

function createAttendanceCommand({ manifest, eventId, eventResults, runId, requestId, sessionId, fixture } = {}) {
  const inspected = inspectAttendanceEventContract({ manifest, eventId, eventResults, fixture });
  if (inspected.status !== "READY") return inspected;
  if (!RUN_ID.test(String(runId || "")) || !ID.test(String(requestId || "")) || !ID.test(String(sessionId || "")))
    return block("RUN_IDENTIFIERS_INVALID", null);
  const event = findEvent(manifest, eventId);
  return result("READY", { runId, eventId, expected: inspected.expected, fixture: inspected.fixture,
    executionDateTime: inspected.executionDateTime,
    command: Object.freeze({ method: "POST", action: ACTION, input: Object.freeze({
      request_id: requestId, attendance_session_id: sessionId, attendance_date: event.sourceDate,
      teacher_id: inspected.fixture.teacher_id, location_id: inspected.fixture.location_id,
      billing_block_id: inspected.fixture.billing_block_id,
      attendance_items: Object.freeze([Object.freeze({ member_id: inspected.fixture.member_id,
        current_rank: inspected.fixture.current_rank, plan_id: event.planId,
        slot_ids: Object.freeze([inspected.fixture.slot_id]) })]),
      source: `story902_${eventId.replace(/^902-/, "").toLowerCase()}`
    }) })
  });
}

function transportFailure(error) {
  const code = String(error && (error.code || error.name) || "TRANSPORT_FAILURE");
  return result("UNKNOWN", { reason: { code, detail: "write outcome cannot be established" } });
}

function createAttendanceBusinessAdapter({ manifest, transport } = {}) {
  if (!transport || transport.kind !== "STORY902_MOCK_TRANSPORT" || typeof transport.send !== "function" || typeof transport.read !== "function")
    throw new Error("MOCK_TRANSPORT_REQUIRED");
  const attemptedRuns = new Set(), attemptedEvents = new Set();
  async function execute(input = {}) {
    const ready = createAttendanceCommand({ manifest, ...input });
    if (ready.status !== "READY") return ready;
    if (attemptedRuns.has(ready.runId)) return block("AUTOMATIC_RETRY_PROHIBITED", ready.runId);
    if (attemptedEvents.has(ready.eventId)) return block("EVENT_REEXECUTION_PROHIBITED", ready.eventId);
    attemptedRuns.add(ready.runId); attemptedEvents.add(ready.eventId);
    let response;
    try { response = await transport.send(ready.command); } catch (error) { return transportFailure(error); }
    if (!response || !Number.isInteger(response.status)) return result("UNKNOWN", { reason: { code: "RESPONSE_ENVELOPE_INVALID" } });
    if (response.status === 401 || response.status === 403) return result("BLOCKED", { httpStatus: response.status, reason: { code: "AUTHORIZATION_DENIED" } });
    if (response.status === 408 || response.status === 429 || response.status >= 500)
      return result("UNKNOWN", { httpStatus: response.status, reason: { code: "WRITE_OUTCOME_UNCERTAIN", detail: response.body || null } });
    if (response.body?.ok === false) return result("FAIL", { httpStatus: response.status, reason: { code: "BUSINESS_ERROR", detail: response.body || null } });
    if (response.status < 200 || response.status >= 300)
      return result("UNKNOWN", { httpStatus: response.status, reason: { code: "HTTP_OUTCOME_UNCERTAIN", detail: response.body || null } });
    const actual = normalizeResponse(response.body, ready.fixture.member_id, ready.expected);
    if (!actual) return result("UNKNOWN", { httpStatus: response.status, reason: { code: "RESPONSE_FORMAT_INVALID" } });
    let attendance, billing;
    try {
      attendance = await transport.read({ action: "member_attendance_state", params: { member_id: ready.fixture.member_id,
        attendance_date: ready.command.input.attendance_date, location_id: ready.fixture.location_id,
        billing_block_id: ready.fixture.billing_block_id } });
      billing = await transport.read({ action: "getMemberInfo", params: { member_id: ready.fixture.member_id } });
    } catch { return result("UNKNOWN", { httpStatus: response.status, actual, reason: { code: "READ_AFTER_WRITE_UNAVAILABLE" } }); }
    const checks = compareExpected(ready.expected, actual);
    const evidenceMatches = validReadEvidence(attendance, billing, ready);
    return result(checks.every(check => check.status === "PASS") && evidenceMatches ? "PASS" : "FAIL", {
      httpStatus: response.status, expected: ready.expected, actual, checks,
      readAfterWrite: Object.freeze({ attendance, billing, status: evidenceMatches ? "PASS" : "FAIL" }), evidenceKind: "MOCK_ONLY"
    });
  }
  return Object.freeze({ execute });
}

module.exports = { EVENT_TYPE, ACTION, inspectAttendanceEventContract, createAttendanceCommand,
  createAttendanceBusinessAdapter, normalizeResponse, readExpected };
