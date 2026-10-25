"use strict";

const { validateManifest } = require("./story902-manifest-loader.cjs");
const { evaluateContinuationGates } = require("./story902-continuation-gate.cjs");

const DEV_PROJECT_ID = "dojo-management-dev";
const DEV_TARGET = "dev-firebase";
const RUN_ID_PATTERN = /^STORY902[-_][A-Za-z0-9][A-Za-z0-9._-]{5,95}$/;

function reason(code, detail, extra = {}) {
  return { code, detail, ...extra };
}

function expectedTimeTrip(event) {
  if (!event || typeof event.executionDateTime !== "string") return null;
  const parsed = new Date(event.executionDateTime);
  if (Number.isNaN(parsed.valueOf())) return null;
  return {
    projectId: DEV_PROJECT_ID,
    target: DEV_TARGET,
    enabled: true,
    now: parsed.toISOString(),
    targetMonth: event.executionDateTime.slice(0, 7),
    sourceExecutionDateTime: event.executionDateTime
  };
}

function evaluatePreExecutionGate({ manifest, eventResults, eventId, runContext } = {}) {
  const validation = validateManifest(manifest);
  const continuation = evaluateContinuationGates(manifest, eventResults);
  const events = Array.isArray(manifest && manifest.events) ? manifest.events : [];
  const event = events.find(item => item && item.eventId === eventId) || null;
  const continuationGate = continuation.gates.find(item => item.eventId === eventId) || null;
  const context = runContext && typeof runContext === "object" ? runContext : {};
  const reasons = [];

  if (!validation.valid) reasons.push(reason("MANIFEST_INVALID", "manifest validation failed", { errors: validation.errors }));
  if (!event) reasons.push(reason("EVENT_NOT_FOUND", "eventId is not present in manifest", { eventId: eventId || null }));
  if (!continuationGate || !continuationGate.candidate) {
    reasons.push(reason("CONTINUATION_NOT_ESTABLISHED", "B-2 continuation gate is not a candidate", {
      continuationStatus: continuationGate ? continuationGate.status : null,
      continuationReasons: continuationGate ? continuationGate.reasons : []
    }));
  }

  if (!RUN_ID_PATTERN.test(String(context.runId || "")))
    reasons.push(reason("RUN_ID_INVALID", "a valid STORY-902 Run ID is required"));

  const resultSource = context.resultSource;
  if (!resultSource || resultSource.verified !== true)
    reasons.push(reason("RESULT_SOURCE_UNVERIFIED", "B-2 result provenance has not been verified"));
  else if (resultSource.runId !== context.runId)
    reasons.push(reason("RESULT_RUN_ID_MISMATCH", "B-2 results belong to a different Run ID"));

  const environment = context.environment;
  if (!environment || environment.verified !== true)
    reasons.push(reason("DEV_ENVIRONMENT_UNVERIFIED", "DEV environment has not been verified"));
  else if (environment.projectId !== DEV_PROJECT_ID || environment.target !== DEV_TARGET)
    reasons.push(reason("DEV_ENVIRONMENT_MISMATCH", "execution is restricted to dojo-management-dev/dev-firebase"));

  const authorization = context.authorization;
  if (!authorization || authorization.verified !== true || authorization.authenticated !== true || authorization.authorized !== true)
    reasons.push(reason("AUTHORIZATION_UNVERIFIED", "authentication and authorization must be explicitly verified"));

  const fixture = context.fixture;
  if (!fixture || fixture.verified !== true || fixture.consistent !== true)
    reasons.push(reason("FIXTURE_UNVERIFIED", "test fixture integrity must be explicitly verified"));

  const timeTrip = expectedTimeTrip(event);
  if (!timeTrip || !event || event.executionDateTimeSource === "UNRESOLVED")
    reasons.push(reason("EXECUTION_DATETIME_UNRESOLVED", "event executionDateTime is not confirmed"));

  const target = context.timeTripTarget;
  if (!target || target.verified !== true)
    reasons.push(reason("TIME_TRIP_TARGET_UNVERIFIED", "TimeTrip target has not been verified"));
  else if (target.projectId !== DEV_PROJECT_ID || target.target !== DEV_TARGET)
    reasons.push(reason("TIME_TRIP_TARGET_MISMATCH", "TimeTrip is restricted to dojo-management-dev/dev-firebase"));

  return {
    eventId: eventId || null,
    runId: context.runId || null,
    status: reasons.length ? "PRE_EXECUTION_BLOCKED" : "PRE_EXECUTION_READY",
    candidate: reasons.length === 0,
    timeTripOperationAllowed: reasons.length === 0,
    businessExecutionAllowed: false,
    reasons,
    expectedTimeTrip: timeTrip,
    continuationGate
  };
}

module.exports = {
  DEV_PROJECT_ID,
  DEV_TARGET,
  RUN_ID_PATTERN,
  evaluatePreExecutionGate,
  expectedTimeTrip
};
