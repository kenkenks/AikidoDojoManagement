"use strict";

const { validateManifest } = require("./story902-manifest-loader.cjs");
const { evaluateContinuationGates } = require("./story902-continuation-gate.cjs");

const EVENT_TYPE = "CASH_PAYMENT";
const ACTION = "payment_cash_accept";
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const RUN_ID = /^STORY902[-_][A-Za-z0-9][A-Za-z0-9._-]{5,95}$/;

function result(status, detail = {}) {
  return Object.freeze({ status, mockExecution: true, businessExecutionAllowed: false, autoRetryAllowed: false, ...detail });
}
function block(code, detail) { return result("BLOCKED", { reason: { code, detail } }); }
function findEvent(manifest, eventId) {
  return Array.isArray(manifest?.events) ? manifest.events.find(event => event?.eventId === eventId) || null : null;
}
function readExpected(event) {
  const value = event?.expected?.businessValues;
  if (!value || value.specificationStatus !== "CONFIRMED") return null;
  const expected = { accepted_amount: value.accepted_amount, payment_count: value.payment_count };
  return Number.isFinite(expected.accepted_amount) && Number.isInteger(expected.payment_count)
    ? Object.freeze(expected) : null;
}
function normalizeFixture(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fixture = { source_member_id: value.source_member_id, member_id: value.member_id,
    billing_group_id: value.billing_group_id, location_id: value.location_id,
    billing_block_id: value.billing_block_id, reception_session_id: value.reception_session_id || "",
    plan_id: value.plan_id };
  if (![fixture.source_member_id, fixture.member_id, fixture.billing_group_id, fixture.location_id,
    fixture.billing_block_id, fixture.plan_id].every(item => ID.test(String(item || "")))) return null;
  if (fixture.reception_session_id && !ID.test(fixture.reception_session_id)) return null;
  return Object.freeze(fixture);
}

function inspectCashPaymentEventContract({ manifest, eventId, eventResults = {}, fixture } = {}) {
  const validation = validateManifest(manifest);
  if (!validation.valid) return block("MANIFEST_INVALID", validation.errors);
  const event = findEvent(manifest, eventId);
  if (!event) return block("EVENT_NOT_FOUND", eventId || null);
  if (event.eventType !== EVENT_TYPE || event.operation?.name !== "会費受付")
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
  else {
    if (normalizedFixture.source_member_id !== event.memberId)
      blockers.push({ code: "FIXTURE_MEMBER_MISMATCH", detail: { expected: event.memberId, actual: normalizedFixture.source_member_id } });
    if (normalizedFixture.plan_id !== event.planId)
      blockers.push({ code: "FIXTURE_PLAN_MISMATCH", detail: { expected: event.planId, actual: normalizedFixture.plan_id } });
  }
  return result(blockers.length ? "BLOCKED" : "READY", { eventId, eventType: EVENT_TYPE, action: ACTION,
    executionDateTime: event.executionDateTime || null, fixture: normalizedFixture, expected,
    blockers: Object.freeze(blockers.map(Object.freeze)) });
}

function createCashPaymentCommand({ manifest, eventId, eventResults, runId, requestId, fixture } = {}) {
  const inspected = inspectCashPaymentEventContract({ manifest, eventId, eventResults, fixture });
  if (inspected.status !== "READY") return inspected;
  if (!RUN_ID.test(String(runId || "")) || !REQUEST_ID.test(String(requestId || "")))
    return block("RUN_IDENTIFIERS_INVALID", null);
  return result("READY", { runId, eventId, expected: inspected.expected, fixture: inspected.fixture,
    executionDateTime: inspected.executionDateTime,
    command: Object.freeze({ method: "POST", action: ACTION, input: Object.freeze({
      request_id: requestId, location_id: inspected.fixture.location_id,
      billing_block_id: inspected.fixture.billing_block_id,
      reception_session_id: inspected.fixture.reception_session_id,
      items: Object.freeze([Object.freeze({ member_id: inspected.fixture.member_id,
        billing_group_id: inspected.fixture.billing_group_id })])
    }) })
  });
}

function normalizeResponse(body, fixture) {
  if (!body || typeof body !== "object" || Array.isArray(body) || body.ok !== true) return null;
  if (!Number.isFinite(body.accepted_amount) || !Array.isArray(body.payments)) return null;
  if (body.billing_group_id !== fixture.billing_group_id) return null;
  return Object.freeze({ accepted_amount: body.accepted_amount, payment_count: body.payments.length });
}
function compareExpected(expected, actual) {
  return Object.freeze(Object.keys(expected).map(name => Object.freeze({ name, expected: expected[name],
    actual: actual ? actual[name] : null, status: actual && Object.is(expected[name], actual[name]) ? "PASS" : "FAIL" })));
}
function createCashPaymentBusinessAdapter({ manifest, transport } = {}) {
  if (!transport || transport.kind !== "STORY902_MOCK_TRANSPORT" || typeof transport.send !== "function")
    throw new Error("MOCK_TRANSPORT_REQUIRED");
  const attemptedEvents = new Set();
  return Object.freeze({ async execute(input = {}) {
    const ready = createCashPaymentCommand({ manifest, ...input });
    if (ready.status !== "READY") return ready;
    if (attemptedEvents.has(ready.eventId)) return block("EVENT_REEXECUTION_PROHIBITED", ready.eventId);
    attemptedEvents.add(ready.eventId);
    let response;
    try { response = await transport.send(ready.command); }
    catch (error) { return result("UNKNOWN", { reason: { code: String(error?.code || error?.name || "TRANSPORT_FAILURE") } }); }
    if (!response || !Number.isInteger(response.status)) return result("UNKNOWN", { reason: { code: "RESPONSE_ENVELOPE_INVALID" } });
    if (response.status === 401 || response.status === 403)
      return result("BLOCKED", { httpStatus: response.status, reason: { code: "AUTHORIZATION_DENIED" } });
    if (response.status === 408 || response.status === 429 || response.status >= 500)
      return result("UNKNOWN", { httpStatus: response.status, reason: { code: "WRITE_OUTCOME_UNCERTAIN" } });
    if (response.body?.ok === false)
      return result("FAIL", { httpStatus: response.status, reason: { code: response.body.error || "BUSINESS_ERROR" } });
    if (response.status < 200 || response.status >= 300)
      return result("UNKNOWN", { httpStatus: response.status, reason: { code: "HTTP_OUTCOME_UNCERTAIN" } });
    const actual = normalizeResponse(response.body, ready.fixture);
    if (!actual) return result("UNKNOWN", { httpStatus: response.status, reason: { code: "RESPONSE_FORMAT_INVALID" } });
    const checks = compareExpected(ready.expected, actual);
    return result(checks.every(check => check.status === "PASS") ? "PASS" : "FAIL", {
      httpStatus: response.status, expected: ready.expected, actual, checks, evidenceKind: "MOCK_ONLY"
    });
  }});
}

module.exports = { EVENT_TYPE, ACTION, inspectCashPaymentEventContract, createCashPaymentCommand,
  createCashPaymentBusinessAdapter, normalizeResponse, readExpected };
