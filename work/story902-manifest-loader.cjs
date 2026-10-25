"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_MANIFEST_PATH = path.join(__dirname, "story902-event-manifest.json");
const SUPPORTED_SCHEMA_VERSIONS = new Set([1]);
const SPECIFICATION_STATUSES = new Set(["EXECUTABLE", "PROVISIONAL", "UNRESOLVED"]);
const IMPLEMENTATION_STATUSES = new Set(["IMPLEMENTED", "NOT_STARTED"]);
const EVENT_ID_PATTERN = /^902-E\d{3}$/;
const REQUIRED_EVENT_FIELDS = [
  "eventId", "sourceRow", "eventType", "sourceDate", "sourceTimeCategory",
  "executionDateTime", "actor", "memberId", "payload", "expected",
  "dependencies", "specificationStatus", "unresolvedItems"
];

class ManifestValidationError extends Error {
  constructor(errors) {
    super(`STORY-902 manifest validation failed (${errors.length})`);
    this.name = "ManifestValidationError";
    this.code = "STORY902_MANIFEST_INVALID";
    this.errors = errors;
  }
}

function issue(code, message, eventId = null, field = null, eventIndex = null) {
  return { code, message, eventId, field, eventIndex };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function isValidExecutionDateTime(value) {
  if (value === null) return true;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+09:00$/.test(String(value || ""))) return false;
  return !Number.isNaN(Date.parse(value));
}

function dependencyIds(event) {
  const dependencies = event && event.dependencies;
  if (!isPlainObject(dependencies)) return [];
  return [
    ...(Array.isArray(dependencies.businessData) ? dependencies.businessData : []),
    ...(Array.isArray(dependencies.executionOrder) ? dependencies.executionOrder : [])
  ];
}

function detectCycles(events) {
  const graph = new Map(events.map((event) => [event.eventId, dependencyIds(event)]));
  const visiting = new Set();
  const visited = new Set();
  const cycles = [];
  function visit(id, trail) {
    if (visiting.has(id)) {
      const start = trail.indexOf(id);
      cycles.push([...trail.slice(start), id]);
      return;
    }
    if (visited.has(id) || !graph.has(id)) return;
    visiting.add(id);
    for (const dependencyId of graph.get(id)) visit(dependencyId, [...trail, id]);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of graph.keys()) visit(id, []);
  return cycles;
}

function validateManifest(manifest) {
  const errors = [];
  if (!isPlainObject(manifest)) return { valid: false, errors: [issue("MANIFEST_TYPE", "manifest must be an object")] };
  if (!SUPPORTED_SCHEMA_VERSIONS.has(manifest.schemaVersion))
    errors.push(issue("SCHEMA_VERSION", `unsupported schemaVersion: ${String(manifest.schemaVersion)}`, null, "schemaVersion"));
  if (manifest.storyId !== "STORY-902") errors.push(issue("STORY_ID", "storyId must be STORY-902", null, "storyId"));
  if (!Array.isArray(manifest.events)) {
    errors.push(issue("EVENTS_TYPE", "events must be an array", null, "events"));
    return { valid: false, errors };
  }

  const allowedTypes = new Set();
  if (Array.isArray(manifest.adapters)) for (const adapter of manifest.adapters)
    for (const type of Array.isArray(adapter.eventTypes) ? adapter.eventTypes : []) allowedTypes.add(type);
  const ids = new Set();
  const duplicateIds = new Set();
  for (const [eventIndex, event] of manifest.events.entries()) {
    const id = event && event.eventId || null;
    if (!isPlainObject(event)) {
      errors.push(issue("EVENT_TYPE", `event at index ${eventIndex} must be an object`, null, "events", eventIndex));
      continue;
    }
    for (const field of REQUIRED_EVENT_FIELDS)
      if (!Object.prototype.hasOwnProperty.call(event, field)) errors.push(issue("REQUIRED_FIELD", `missing required field: ${field}`, id, field, eventIndex));
    if (!EVENT_ID_PATTERN.test(String(id || ""))) errors.push(issue("EVENT_ID_FORMAT", `invalid eventId at index ${eventIndex}: ${String(id)}`, id, "eventId", eventIndex));
    if (ids.has(id)) duplicateIds.add(id); else ids.add(id);
    if (!allowedTypes.has(event.eventType)) errors.push(issue("EVENT_TYPE_UNKNOWN", `unknown eventType: ${String(event.eventType)}`, id, "eventType"));
    if (!isValidDate(event.sourceDate)) errors.push(issue("SOURCE_DATE", `invalid sourceDate: ${String(event.sourceDate)}`, id, "sourceDate"));
    if (!String(event.sourceTimeCategory || "").trim()) errors.push(issue("TIME_CATEGORY", "sourceTimeCategory is required", id, "sourceTimeCategory"));
    if (!isValidExecutionDateTime(event.executionDateTime))
      errors.push(issue("EXECUTION_DATETIME", `invalid executionDateTime: ${String(event.executionDateTime)}`, id, "executionDateTime"));
    if (event.executionDateTime === null && event.executionDateTimeSource !== "UNRESOLVED")
      errors.push(issue("EXECUTION_DATETIME_STATE", "null executionDateTime must be UNRESOLVED", id, "executionDateTimeSource"));
    if (!SPECIFICATION_STATUSES.has(event.specificationStatus))
      errors.push(issue("SPECIFICATION_STATUS", `invalid specificationStatus: ${String(event.specificationStatus)}`, id, "specificationStatus"));
    if (!isPlainObject(event.implementation) || !IMPLEMENTATION_STATUSES.has(event.implementation.status))
      errors.push(issue("IMPLEMENTATION_STATUS", `invalid implementation status: ${String(event.implementation && event.implementation.status)}`, id, "implementation.status"));
    if (!isPlainObject(event.dependencies) || !Array.isArray(event.dependencies.businessData) || !Array.isArray(event.dependencies.executionOrder))
      errors.push(issue("DEPENDENCIES_TYPE", "dependencies.businessData and executionOrder must be arrays", id, "dependencies"));
    if (!Array.isArray(event.unresolvedItems)) errors.push(issue("UNRESOLVED_ITEMS_TYPE", "unresolvedItems must be an array", id, "unresolvedItems"));
  }
  for (const id of duplicateIds) errors.push(issue("EVENT_ID_DUPLICATE", `duplicate eventId: ${id}`, id, "eventId"));
  for (const event of manifest.events.filter(isPlainObject)) for (const dependencyId of dependencyIds(event))
    if (!ids.has(dependencyId)) errors.push(issue("DEPENDENCY_MISSING", `dependency does not exist: ${dependencyId}`, event.eventId, "dependencies"));
  for (const cycle of detectCycles(manifest.events.filter(isPlainObject)))
    errors.push(issue("DEPENDENCY_CYCLE", `dependency cycle: ${cycle.join(" -> ")}`, cycle[0], "dependencies"));
  return { valid: errors.length === 0, errors };
}

function loadManifest(filePath = DEFAULT_MANIFEST_PATH, options = {}) {
  const absolutePath = path.resolve(filePath);
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  } catch (error) {
    throw new ManifestValidationError([issue("MANIFEST_READ", `cannot read manifest: ${error.message}`)]);
  }
  const validation = validateManifest(manifest);
  if (!validation.valid && options.allowInvalid !== true) throw new ManifestValidationError(validation.errors);
  return { path: absolutePath, manifest, validation };
}

function evaluateExecutionGates(manifest, options = {}) {
  const validation = validateManifest(manifest);
  const completed = new Set(options.completedEventIds || []);
  const events = Array.isArray(manifest && manifest.events) ? manifest.events : [];
  if (!validation.valid) {
    return events.map((event, eventIndex) => ({
      eventId: isPlainObject(event) && typeof event.eventId === "string" ? event.eventId : null,
      eventIndex,
      status: "MANIFEST_INVALID",
      candidate: false,
      businessExecutionAllowed: false,
      reasons: validation.errors.map(error => ({
        code: error.code,
        detail: error.message,
        eventId: error.eventId,
        eventIndex: error.eventIndex
      })),
      deferredRuntimeChecks: ["AUTHENTICATION", "DEV_ENVIRONMENT", "TEST_FIXTURE", "TIME_TRIP"]
    }));
  }
  const errorsByEvent = new Map();
  for (const error of validation.errors) {
    const key = error.eventId || "*";
    if (!errorsByEvent.has(key)) errorsByEvent.set(key, []);
    errorsByEvent.get(key).push(error);
  }
  const globalErrors = errorsByEvent.get("*") || [];
  return events.map((event, eventIndex) => {
    const manifestErrors = [...globalErrors, ...(errorsByEvent.get(event.eventId) || [])];
    let status = "EXECUTION_CANDIDATE";
    const reasons = [];
    if (manifestErrors.length) {
      status = "MANIFEST_INVALID";
      reasons.push(...manifestErrors.map(error => ({ code: error.code, detail: error.message })));
    } else if (event.specificationStatus !== "EXECUTABLE") {
      status = "SPECIFICATION_BLOCKED";
      reasons.push({ code: "SPECIFICATION_NOT_EXECUTABLE", detail: `specificationStatus=${event.specificationStatus}` });
      for (const item of event.unresolvedItems || []) reasons.push({ code: item.code || "UNRESOLVED", detail: item.source || item.confirmationMethod || "unresolved" });
    } else {
      const unsatisfied = dependencyIds(event).filter(id => !completed.has(id));
      if (unsatisfied.length) {
        status = "DEPENDENCY_BLOCKED";
        reasons.push({ code: "DEPENDENCY_UNSATISFIED", detail: unsatisfied.join(","), dependencyEventIds: unsatisfied });
      }
    }
    return {
      eventId: event.eventId,
      eventIndex,
      status,
      candidate: status === "EXECUTION_CANDIDATE",
      businessExecutionAllowed: false,
      reasons,
      deferredRuntimeChecks: ["AUTHENTICATION", "DEV_ENVIRONMENT", "TEST_FIXTURE", "TIME_TRIP"]
    };
  });
}

module.exports = {
  DEFAULT_MANIFEST_PATH,
  ManifestValidationError,
  loadManifest,
  validateManifest,
  evaluateExecutionGates
};
