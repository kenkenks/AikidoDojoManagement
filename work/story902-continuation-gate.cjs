"use strict";

const { validateManifest } = require("./story902-manifest-loader.cjs");

const RESULT_STATUSES = new Set(["PASS", "FAIL", "BLOCKED", "UNKNOWN"]);

function confirmedDependencies(event) {
  return [
    ...event.dependencies.businessData,
    ...event.dependencies.executionOrder
  ];
}

function createResultIndex(input) {
  const index = new Map();
  const errors = [];
  let entries;
  if (input === undefined || input === null) entries = [];
  else if (input instanceof Map) entries = [...input.entries()].map(([eventId, status]) => ({ eventId, status }));
  else if (Array.isArray(input)) entries = input;
  else if (typeof input === "object") entries = Object.entries(input).map(([eventId, status]) => ({ eventId, status }));
  else return { valid: false, index, errors: [{ code: "RESULTS_TYPE", detail: "eventResults must be an object, Map, or array" }] };

  for (const [resultIndex, result] of entries.entries()) {
    const eventId = result && result.eventId;
    const status = result && result.status;
    if (typeof eventId !== "string" || !eventId) {
      errors.push({ code: "RESULT_EVENT_ID", detail: `invalid result eventId at index ${resultIndex}`, resultIndex });
      continue;
    }
    if (!RESULT_STATUSES.has(status)) {
      errors.push({ code: "RESULT_STATUS", detail: `invalid result status for ${eventId}: ${String(status)}`, eventId, resultIndex });
      continue;
    }
    if (index.has(eventId)) {
      errors.push({ code: "RESULT_DUPLICATE", detail: `duplicate result for ${eventId}`, eventId, resultIndex });
      continue;
    }
    index.set(eventId, status);
  }
  return { valid: errors.length === 0, index, errors };
}

function dependencyReason(eventId, status) {
  if (status === undefined) return { code: "DEPENDENCY_RESULT_MISSING", dependencyEventId: eventId, resultStatus: null };
  if (status === "FAIL") return { code: "DEPENDENCY_FAILED", dependencyEventId: eventId, resultStatus: status };
  if (status === "BLOCKED") return { code: "DEPENDENCY_BLOCKED", dependencyEventId: eventId, resultStatus: status };
  if (status === "UNKNOWN") return { code: "DEPENDENCY_UNKNOWN", dependencyEventId: eventId, resultStatus: status };
  return null;
}

function invalidManifestGates(manifest, validation) {
  const events = Array.isArray(manifest && manifest.events) ? manifest.events : [];
  return events.map((event, eventIndex) => ({
    eventId: event && typeof event === "object" && !Array.isArray(event) && typeof event.eventId === "string" ? event.eventId : null,
    eventIndex,
    status: "MANIFEST_INVALID",
    candidate: false,
    businessExecutionAllowed: false,
    reasons: validation.errors.map(error => ({
      code: error.code,
      detail: error.message,
      eventId: error.eventId,
      eventIndex: error.eventIndex
    }))
  }));
}

function evaluateContinuationGates(manifest, eventResults) {
  const validation = validateManifest(manifest);
  if (!validation.valid) return {
    manifestValid: false,
    resultsValid: null,
    resultErrors: [],
    gates: invalidManifestGates(manifest, validation)
  };

  const results = createResultIndex(eventResults);
  const manifestEventIds = new Set(manifest.events.map(event => event.eventId));
  const unknownResultErrors = [...results.index.keys()]
    .filter(eventId => !manifestEventIds.has(eventId))
    .map(eventId => ({
      code: "RESULT_EVENT_UNKNOWN",
      detail: `result eventId is not present in manifest: ${eventId}`,
      eventId
    }));
  const resultErrors = [...results.errors, ...unknownResultErrors];
  const resultsValid = results.valid && unknownResultErrors.length === 0;
  const globalResultReasons = resultsValid ? [] : resultErrors;
  const gates = manifest.events.map((event, eventIndex) => {
    const reasons = [];
    let status = "CONTINUATION_CANDIDATE";
    if (!resultsValid) {
      status = "RESULT_MODEL_INVALID";
      reasons.push(...globalResultReasons);
    } else if (event.specificationStatus !== "EXECUTABLE") {
      status = "SPECIFICATION_BLOCKED";
      reasons.push({ code: "SPECIFICATION_NOT_EXECUTABLE", specificationStatus: event.specificationStatus });
    } else if (Array.isArray(event.dependencies.candidates) && event.dependencies.candidates.length) {
      status = "DEPENDENCY_DEFINITION_BLOCKED";
      reasons.push({
        code: "DEPENDENCY_DEFINITION_UNRESOLVED",
        dependencyEventIds: event.dependencies.candidates.map(candidate => candidate.eventId)
      });
    } else {
      for (const dependencyEventId of confirmedDependencies(event)) {
        const reason = dependencyReason(dependencyEventId, results.index.get(dependencyEventId));
        if (reason) reasons.push(reason);
      }
      if (reasons.length) status = "DEPENDENCY_RESULT_BLOCKED";
    }
    return {
      eventId: event.eventId,
      eventIndex,
      status,
      candidate: status === "CONTINUATION_CANDIDATE",
      businessExecutionAllowed: false,
      reasons,
      confirmedDependencyEventIds: confirmedDependencies(event)
    };
  });
  return { manifestValid: true, resultsValid, resultErrors, gates };
}

module.exports = {
  RESULT_STATUSES,
  createResultIndex,
  evaluateContinuationGates
};
