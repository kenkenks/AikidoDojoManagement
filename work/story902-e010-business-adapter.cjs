"use strict";

const { validateManifest } = require("./story902-manifest-loader.cjs");
const { evaluateContinuationGates } = require("./story902-continuation-gate.cjs");

const EVENT_ID = "902-E010";
const EVENT_TYPE = "ATTENDANCE_REGISTER";
const ACTION = "attendance_batch";
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const RUN_ID = /^STORY902[-_][A-Za-z0-9][A-Za-z0-9._-]{5,95}$/;

function result(status, detail = {}) {
  return Object.freeze({
    status,
    mockExecution: true,
    businessExecutionAllowed: false,
    autoRetryAllowed: false,
    ...detail
  });
}

function block(code, detail) {
  return result("BLOCKED", { reason: { code, detail } });
}

function findEvent(manifest) {
  return Array.isArray(manifest && manifest.events)
    ? manifest.events.find(event => event && event.eventId === EVENT_ID) || null
    : null;
}

function readExpected(event) {
  const value = event && event.expected && event.expected.businessValues;
  if (!value || value.specificationStatus !== "CONFIRMED") return null;
  const expected = {
    registered_count: value.registered_count,
    cancelled_count: value.cancelled_count,
    charge_count: value.usage_billing_charge_count,
    planned_amount: value.planned_amount
  };
  if (!Object.values(expected).every(Number.isFinite)) return null;
  return Object.freeze(expected);
}

function normalizeFixture(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fixture = {
    source_member_id: value.source_member_id,
    member_id: value.member_id,
    teacher_id: value.teacher_id,
    location_id: value.location_id,
    billing_block_id: value.billing_block_id,
    slot_id: value.slot_id,
    current_rank: value.current_rank
  };
  if (![fixture.source_member_id, fixture.member_id, fixture.teacher_id, fixture.location_id, fixture.billing_block_id, fixture.slot_id].every(item => ID.test(String(item || "")))) return null;
  if (typeof fixture.current_rank !== "string" || !fixture.current_rank.trim() || fixture.current_rank.length > 100) return null;
  return Object.freeze({ ...fixture, current_rank: fixture.current_rank.trim() });
}

function createCommand({ manifest, eventId, eventResults, runId, requestId, sessionId, fixture } = {}) {
  const validation = validateManifest(manifest);
  if (!validation.valid) return block("MANIFEST_INVALID", validation.errors);
  if (eventId !== EVENT_ID) return block("EVENT_NOT_SUPPORTED", eventId || null);
  const event = findEvent(manifest);
  if (!event || event.eventType !== EVENT_TYPE || event.operation?.name !== "出席登録")
    return block("EVENT_CONTRACT_INVALID", eventId);
  const continuation = evaluateContinuationGates(manifest, eventResults || {});
  const gate = continuation.gates.find(item => item.eventId === EVENT_ID);
  if (!gate || !gate.candidate) return block("CONTINUATION_NOT_ESTABLISHED", gate || null);
  if (!RUN_ID.test(String(runId || "")) || !ID.test(String(requestId || "")) || !ID.test(String(sessionId || "")))
    return block("RUN_IDENTIFIERS_INVALID", null);
  const normalizedFixture = normalizeFixture(fixture);
  if (!normalizedFixture) return block("FIXTURE_INVALID", null);
  if (normalizedFixture.source_member_id !== event.memberId)
    return block("FIXTURE_MEMBER_MISMATCH", { expected: event.memberId, actual: normalizedFixture.source_member_id });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(event.sourceDate || "")) || !event.executionDateTime)
    return block("EVENT_DATETIME_UNRESOLVED", null);
  if (!ID.test(String(event.planId || ""))) return block("PLAN_ID_UNRESOLVED", null);
  const expected = readExpected(event);
  if (!expected) return block("EXPECTED_UNRESOLVED", null);
  return result("READY", {
    runId,
    eventId: EVENT_ID,
    expected,
    fixture: normalizedFixture,
    command: Object.freeze({
      method: "POST",
      action: ACTION,
      input: Object.freeze({
        request_id: requestId,
        attendance_session_id: sessionId,
        attendance_date: event.sourceDate,
        teacher_id: normalizedFixture.teacher_id,
        location_id: normalizedFixture.location_id,
        billing_block_id: normalizedFixture.billing_block_id,
        attendance_items: Object.freeze([Object.freeze({
          member_id: normalizedFixture.member_id,
          current_rank: normalizedFixture.current_rank,
          plan_id: event.planId,
          slot_ids: Object.freeze([normalizedFixture.slot_id])
        })]),
        source: "story902_e010"
      })
    })
  });
}

function normalizeResponse(body, memberId) {
  if (!body || typeof body !== "object" || Array.isArray(body) || body.ok !== true) return null;
  if (![body.registered_count, body.cancelled_count].every(Number.isFinite) || !Array.isArray(body.usage_billing)) return null;
  const matching = body.usage_billing.filter(item => item && item.member_id === memberId);
  if (matching.length !== 1 || !Number.isFinite(matching[0].charge_count) || !Number.isFinite(matching[0].planned_amount)) return null;
  return Object.freeze({
    registered_count: body.registered_count,
    cancelled_count: body.cancelled_count,
    charge_count: matching[0].charge_count,
    planned_amount: matching[0].planned_amount
  });
}

function compareExpected(expected, actual) {
  return Object.freeze(Object.keys(expected).map(name => Object.freeze({
    name,
    expected: expected[name],
    actual: actual ? actual[name] : null,
    status: actual && Object.is(expected[name], actual[name]) ? "PASS" : "FAIL"
  })));
}

function validReadEvidence(attendance, billing, ready) {
  const input = ready.command.input;
  const item = input.attendance_items[0];
  return attendance?.ok === true
    && attendance.member_id === item.member_id
    && Array.isArray(attendance.selected_slot_ids)
    && attendance.selected_slot_ids.includes(item.slot_ids[0])
    && attendance.billing_plan_selected === true
    && attendance.billing_plan_id === item.plan_id
    && billing?.ok === true
    && billing.memberId === item.member_id
    && billing.targetMonth === input.attendance_date.slice(0, 7)
    && Number(billing.billedTotal) === ready.expected.planned_amount;
}

function transportFailure(error) {
  const code = String(error && (error.code || error.name) || "TRANSPORT_FAILURE");
  return result("UNKNOWN", { reason: { code, detail: "write outcome cannot be established" } });
}

function createE010BusinessAdapter({ manifest, transport } = {}) {
  if (!transport || transport.kind !== "STORY902_MOCK_TRANSPORT" || typeof transport.send !== "function" || typeof transport.read !== "function")
    throw new Error("MOCK_TRANSPORT_REQUIRED");
  const attemptedRuns = new Set();
  const attemptedEvents = new Set();

  async function execute(input = {}) {
    const ready = createCommand({ manifest, ...input });
    if (ready.status !== "READY") return ready;
    if (attemptedRuns.has(ready.runId)) return block("AUTOMATIC_RETRY_PROHIBITED", ready.runId);
    if (attemptedEvents.has(ready.eventId)) return block("EVENT_REEXECUTION_PROHIBITED", ready.eventId);
    attemptedRuns.add(ready.runId);
    attemptedEvents.add(ready.eventId);
    let response;
    try {
      response = await transport.send(ready.command);
    } catch (error) {
      return transportFailure(error);
    }
    if (!response || !Number.isInteger(response.status)) return result("UNKNOWN", { reason: { code: "RESPONSE_ENVELOPE_INVALID" } });
    if (response.status === 401 || response.status === 403)
      return result("BLOCKED", { httpStatus: response.status, reason: { code: "AUTHORIZATION_DENIED" } });
    if (response.status === 408 || response.status === 429 || response.status >= 500)
      return result("UNKNOWN", { httpStatus: response.status, reason: { code: "WRITE_OUTCOME_UNCERTAIN", detail: response.body || null } });
    if (response.body?.ok === false)
      return result("FAIL", { httpStatus: response.status, reason: { code: "BUSINESS_ERROR", detail: response.body || null } });
    if (response.status < 200 || response.status >= 300)
      return result("UNKNOWN", { httpStatus: response.status, reason: { code: "HTTP_OUTCOME_UNCERTAIN", detail: response.body || null } });
    const actual = normalizeResponse(response.body, ready.fixture.member_id);
    if (!actual) return result("UNKNOWN", { httpStatus: response.status, reason: { code: "RESPONSE_FORMAT_INVALID" } });

    let attendance;
    let billing;
    try {
      attendance = await transport.read({ action: "member_attendance_state", params: {
        member_id: ready.fixture.member_id,
        attendance_date: ready.command.input.attendance_date,
        location_id: ready.fixture.location_id,
        billing_block_id: ready.fixture.billing_block_id
      }});
      billing = await transport.read({ action: "getMemberInfo", params: { member_id: ready.fixture.member_id } });
    } catch (error) {
      return result("UNKNOWN", { httpStatus: response.status, actual, reason: { code: "READ_AFTER_WRITE_UNAVAILABLE" } });
    }
    const checks = compareExpected(ready.expected, actual);
    const evidenceMatches = validReadEvidence(attendance, billing, ready);
    const passed = checks.every(check => check.status === "PASS") && evidenceMatches;
    return result(passed ? "PASS" : "FAIL", {
      httpStatus: response.status,
      expected: ready.expected,
      actual,
      checks,
      readAfterWrite: Object.freeze({ attendance, billing, status: evidenceMatches ? "PASS" : "FAIL" }),
      evidenceKind: "MOCK_ONLY"
    });
  }

  return Object.freeze({ execute });
}

module.exports = {
  EVENT_ID,
  createCommand,
  createE010BusinessAdapter,
  normalizeResponse,
  readExpected
};
