"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const { DEFAULT_MANIFEST_PATH, loadManifest } = require("./story902-manifest-loader.cjs");
const { createResultIndex, evaluateContinuationGates } = require("./story902-continuation-gate.cjs");

const source = loadManifest().manifest;
const clone = () => structuredClone(source);

function executableDependentManifest() {
  const manifest = clone();
  const event = manifest.events[1];
  event.specificationStatus = "EXECUTABLE";
  event.unresolvedItems = [];
  event.dependencies.businessData = ["902-E010"];
  event.dependencies.executionOrder = [];
  event.dependencies.candidates = [];
  return manifest;
}

test("loads the current 47-event manifest", () => {
  assert.equal(source.events.length, 47);
});

test("current manifest yields only E010 as continuation candidate", () => {
  const result = evaluateContinuationGates(source, {});
  assert.equal(result.manifestValid, true);
  assert.equal(result.resultsValid, true);
  assert.deepEqual(result.gates.filter(gate => gate.candidate).map(gate => gate.eventId), ["902-E010"]);
  assert.equal(result.gates.filter(gate => gate.status === "SPECIFICATION_BLOCKED").length, 46);
  assert(result.gates.every(gate => gate.businessExecutionAllowed === false));
});

for (const [dependencyStatus, expectedCode] of [
  ["FAIL", "DEPENDENCY_FAILED"],
  ["BLOCKED", "DEPENDENCY_BLOCKED"],
  ["UNKNOWN", "DEPENDENCY_UNKNOWN"]
]) {
  test(`dependency ${dependencyStatus} blocks continuation`, () => {
    const result = evaluateContinuationGates(executableDependentManifest(), { "902-E010": dependencyStatus });
    const gate = result.gates.find(item => item.eventId === "902-E020");
    assert.equal(gate.status, "DEPENDENCY_RESULT_BLOCKED");
    assert(gate.reasons.some(reason => reason.code === expectedCode && reason.resultStatus === dependencyStatus));
    assert.equal(gate.businessExecutionAllowed, false);
  });
}

test("all confirmed dependency results PASS permits continuation candidacy", () => {
  const result = evaluateContinuationGates(executableDependentManifest(), { "902-E010": "PASS" });
  const gate = result.gates.find(item => item.eventId === "902-E020");
  assert.equal(gate.status, "CONTINUATION_CANDIDATE");
  assert.equal(gate.candidate, true);
  assert.equal(gate.businessExecutionAllowed, false);
});

test("missing dependency result is distinct from UNKNOWN", () => {
  const missing = evaluateContinuationGates(executableDependentManifest(), {});
  const missingGate = missing.gates.find(item => item.eventId === "902-E020");
  assert(missingGate.reasons.some(reason => reason.code === "DEPENDENCY_RESULT_MISSING" && reason.resultStatus === null));
  const unknown = evaluateContinuationGates(executableDependentManifest(), { "902-E010": "UNKNOWN" });
  const unknownGate = unknown.gates.find(item => item.eventId === "902-E020");
  assert(unknownGate.reasons.some(reason => reason.code === "DEPENDENCY_UNKNOWN" && reason.resultStatus === "UNKNOWN"));
});

test("provisional dependency candidates are not promoted to confirmed dependencies", () => {
  const manifest = executableDependentManifest();
  const event = manifest.events[1];
  event.dependencies.businessData = [];
  event.dependencies.candidates = [{ eventId: "902-E010", status: "PROVISIONAL" }];
  const gate = evaluateContinuationGates(manifest, { "902-E010": "PASS" }).gates.find(item => item.eventId === "902-E020");
  assert.equal(gate.status, "DEPENDENCY_DEFINITION_BLOCKED");
  assert.equal(gate.candidate, false);
});

test("missing dependency ID makes the whole manifest invalid", () => {
  const manifest = executableDependentManifest();
  manifest.events[1].dependencies.businessData = ["902-E999"];
  const result = evaluateContinuationGates(manifest, {});
  assert.equal(result.manifestValid, false);
  assert(result.gates.every(gate => gate.status === "MANIFEST_INVALID" && !gate.candidate));
});

test("dependency cycle makes the whole manifest invalid", () => {
  const manifest = executableDependentManifest();
  manifest.events[0].dependencies.executionOrder = ["902-E020"];
  const result = evaluateContinuationGates(manifest, { "902-E010": "PASS", "902-E020": "PASS" });
  assert.equal(result.manifestValid, false);
  assert(result.gates.every(gate => gate.status === "MANIFEST_INVALID" && gate.businessExecutionAllowed === false));
});

test("any other manifest error blocks every event", () => {
  const manifest = clone();
  manifest.events[3] = null;
  const result = evaluateContinuationGates(manifest, {});
  assert.equal(result.manifestValid, false);
  assert.equal(result.gates.length, 47);
  assert(result.gates.every(gate => gate.status === "MANIFEST_INVALID"));
});

test("result model accepts only PASS FAIL BLOCKED UNKNOWN", () => {
  const valid = createResultIndex({ "902-E010": "PASS", "902-E020": "UNKNOWN" });
  assert.equal(valid.valid, true);
  const invalid = createResultIndex({ "902-E010": "SUCCESS" });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.errors[0].code, "RESULT_STATUS");
  const result = evaluateContinuationGates(source, { "902-E010": "SUCCESS" });
  assert(result.gates.every(gate => gate.status === "RESULT_MODEL_INVALID"));
});

test("result for an event outside the manifest blocks every event", () => {
  const result = evaluateContinuationGates(source, {
    "902-E010": "PASS",
    "902-E999": "PASS"
  });
  assert.equal(result.manifestValid, true);
  assert.equal(result.resultsValid, false);
  assert(result.resultErrors.some(error => error.code === "RESULT_EVENT_UNKNOWN" && error.eventId === "902-E999"));
  assert.equal(result.gates.length, 47);
  assert(result.gates.every(gate => gate.status === "RESULT_MODEL_INVALID"));
  assert(result.gates.every(gate => gate.candidate === false));
  assert(result.gates.every(gate => gate.businessExecutionAllowed === false));
});

test("known PASS result remains valid and current manifest still yields only E010", () => {
  const result = evaluateContinuationGates(source, { "902-E010": "PASS" });
  assert.equal(result.resultsValid, true);
  assert.deepEqual(result.gates.filter(gate => gate.candidate).map(gate => gate.eventId), ["902-E010"]);
  assert(result.gates.every(gate => gate.businessExecutionAllowed === false));
});

test("continuation module has no business or infrastructure side-effect client", () => {
  const implementation = fs.readFileSync(require.resolve("./story902-continuation-gate.cjs"), "utf8");
  for (const forbidden of ["fetch(", "firebase-admin", "attendance_batch", "TimeTrip", "setTimeTrip", "firestore()"])
    assert.equal(implementation.includes(forbidden), false, forbidden);
});
