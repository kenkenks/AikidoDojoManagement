"use strict";

const { validateManifest } = require("./story902-manifest-loader.cjs");
const { evaluateContinuationGates } = require("./story902-continuation-gate.cjs");

const EVENT_TYPE = "PAYPAY_PAYMENT";
const ACTIONS = Object.freeze({ start: "paypay_code_start", record: "paypay_code_record", post: "payment_paypay_post_selected" });
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
  const fixture = { source_member_id: value.source_member_id, member_id: value.member_id, plan_id: value.plan_id,
    location_id: value.location_id, billing_block_id: value.billing_block_id,
    reception_session_id: value.reception_session_id || "", evidence_code: value.evidence_code };
  if (![fixture.source_member_id, fixture.member_id, fixture.plan_id, fixture.location_id, fixture.billing_block_id]
    .every(item => ID.test(String(item || "")))) return null;
  if (fixture.reception_session_id && !ID.test(fixture.reception_session_id)) return null;
  if (typeof fixture.evidence_code !== "string" || !/^[\x21-\x7e]{1,128}$/.test(fixture.evidence_code)
    || fixture.evidence_code.trim() !== fixture.evidence_code) return null;
  return Object.freeze(fixture);
}
function inspectPayPayEventContract({ manifest, eventId, eventResults = {}, fixture } = {}) {
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
  return result(blockers.length ? "BLOCKED" : "READY", { eventId, eventType: EVENT_TYPE, actions: ACTIONS,
    executionDateTime: event.executionDateTime || null, fixture: normalizedFixture, expected,
    blockers: Object.freeze(blockers.map(Object.freeze)) });
}
function validateRequestIds(value) {
  return value && [value.start, value.record, value.post].every(item => REQUEST_ID.test(String(item || "")));
}
function createPayPayWorkflow({ manifest, eventId, eventResults, runId, requestIds, fixture } = {}) {
  const inspected = inspectPayPayEventContract({ manifest, eventId, eventResults, fixture });
  if (inspected.status !== "READY") return inspected;
  if (!RUN_ID.test(String(runId || "")) || !validateRequestIds(requestIds)) return block("RUN_IDENTIFIERS_INVALID", null);
  const event = findEvent(manifest, eventId);
  return result("READY", { runId, eventId, executionDateTime: inspected.executionDateTime,
    expected: inspected.expected, fixture: inspected.fixture, requestIds: Object.freeze({ ...requestIds }),
    startCommand: Object.freeze({ method: "POST", action: ACTIONS.start, input: Object.freeze({
      request_id: requestIds.start, member_id: inspected.fixture.member_id,
      plan_id: event.planId, reception_date: event.sourceDate
    }) })
  });
}
function idsFromEvidence(body) {
  if (!body || body.ok !== true || !Array.isArray(body.evidenceItems) || !body.evidenceItems.length) return null;
  const ids = body.evidenceItems.map(item => item?.evidence_id);
  return ids.every(id => ID.test(String(id || ""))) && new Set(ids).size === ids.length ? Object.freeze(ids) : null;
}
function classifyResponse(response) {
  if (!response || !Number.isInteger(response.status)) return result("UNKNOWN", { reason: { code: "RESPONSE_ENVELOPE_INVALID" } });
  if (response.status === 401 || response.status === 403) return result("BLOCKED", { httpStatus: response.status, reason: { code: "AUTHORIZATION_DENIED" } });
  if (response.status === 408 || response.status === 429 || response.status >= 500)
    return result("UNKNOWN", { httpStatus: response.status, reason: { code: "WRITE_OUTCOME_UNCERTAIN" } });
  if (response.body?.ok === false) return result("FAIL", { httpStatus: response.status, reason: { code: response.body.error || "BUSINESS_ERROR" } });
  if (response.status < 200 || response.status >= 300) return result("UNKNOWN", { httpStatus: response.status, reason: { code: "HTTP_OUTCOME_UNCERTAIN" } });
  return null;
}
function normalizePostResponse(body) {
  if (!body || body.ok !== true || !Array.isArray(body.results)) return null;
  if (!body.results.every(item => Number.isFinite(item?.amount) && ID.test(String(item?.payment_id || "")))) return null;
  return Object.freeze({ accepted_amount: body.results.reduce((sum, item) => sum + item.amount, 0), payment_count: body.results.length });
}
function createPayPayBusinessAdapter({ manifest, transport } = {}) {
  if (!transport || transport.kind !== "STORY902_MOCK_TRANSPORT" || typeof transport.send !== "function")
    throw new Error("MOCK_TRANSPORT_REQUIRED");
  const attemptedEvents = new Set();
  return Object.freeze({ async execute(input = {}) {
    const ready = createPayPayWorkflow({ manifest, ...input });
    if (ready.status !== "READY") return ready;
    if (attemptedEvents.has(ready.eventId)) return block("EVENT_REEXECUTION_PROHIBITED", ready.eventId);
    attemptedEvents.add(ready.eventId);
    const send = async command => {
      try { const response = await transport.send(command); return { response, failure: classifyResponse(response) }; }
      catch (error) { return { failure: result("UNKNOWN", { reason: { code: String(error?.code || error?.name || "TRANSPORT_FAILURE") } }) }; }
    };
    const started = await send(ready.startCommand);
    if (started.failure) return started.failure;
    const startIds = idsFromEvidence(started.response.body);
    if (!startIds) return result("UNKNOWN", { reason: { code: "START_RESPONSE_INVALID" } });
    const record = await send({ method: "POST", action: ACTIONS.record, input: {
      request_id: ready.requestIds.record, member_id: ready.fixture.member_id,
      evidence_code: ready.fixture.evidence_code, evidence_items: startIds.map(evidence_id => ({ evidence_id }))
    }});
    if (record.failure) return record.failure;
    const confirmedIds = idsFromEvidence(record.response.body);
    if (!confirmedIds || confirmedIds.join("\n") !== startIds.join("\n"))
      return result("UNKNOWN", { reason: { code: "RECORD_RESPONSE_INVALID" } });
    const posted = await send({ method: "POST", action: ACTIONS.post, input: {
      request_id: ready.requestIds.post, location_id: ready.fixture.location_id,
      billing_block_id: ready.fixture.billing_block_id, reception_session_id: ready.fixture.reception_session_id,
      evidence_items: confirmedIds.map(evidence_id => ({ evidence_id }))
    }});
    if (posted.failure) return posted.failure;
    const actual = normalizePostResponse(posted.response.body);
    if (!actual) return result("UNKNOWN", { reason: { code: "POST_RESPONSE_INVALID" } });
    const checks = Object.keys(ready.expected).map(name => Object.freeze({ name, expected: ready.expected[name],
      actual: actual[name], status: Object.is(ready.expected[name], actual[name]) ? "PASS" : "FAIL" }));
    return result(checks.every(check => check.status === "PASS") ? "PASS" : "FAIL", {
      expected: ready.expected, actual, checks: Object.freeze(checks), evidenceKind: "MOCK_ONLY",
      stages: Object.freeze({ start: "PASS", record: "PASS", post: "PASS" })
    });
  }});
}

module.exports = { EVENT_TYPE, ACTIONS, inspectPayPayEventContract, createPayPayWorkflow,
  createPayPayBusinessAdapter, normalizePostResponse, readExpected };
