"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const {
  DEFAULT_MANIFEST_PATH,
  loadManifest,
  validateManifest,
  evaluateExecutionGates
} = require("./story902-manifest-loader.cjs");

const source = JSON.parse(fs.readFileSync(DEFAULT_MANIFEST_PATH, "utf8"));
const clone = () => structuredClone(source);
const codes = result => new Set(result.errors.map(error => error.code));

test("loads and validates all 47 existing events", () => {
  const loaded = loadManifest();
  assert.equal(loaded.validation.valid, true);
  assert.equal(loaded.manifest.events.length, 47);
});

test("detects duplicate event IDs", () => {
  const manifest = clone();
  manifest.events[1].eventId = manifest.events[0].eventId;
  assert(codes(validateManifest(manifest)).has("EVENT_ID_DUPLICATE"));
});

test("detects a missing required field", () => {
  const manifest = clone();
  delete manifest.events[0].expected;
  assert(codes(validateManifest(manifest)).has("REQUIRED_FIELD"));
});

test("detects an unknown event type", () => {
  const manifest = clone();
  manifest.events[0].eventType = "INVENTED_OPERATION";
  assert(codes(validateManifest(manifest)).has("EVENT_TYPE_UNKNOWN"));
});

test("detects invalid dates and datetimes", () => {
  const manifest = clone();
  manifest.events[0].sourceDate = "2027-02-30";
  manifest.events[0].executionDateTime = "tomorrow";
  const result = validateManifest(manifest);
  assert(codes(result).has("SOURCE_DATE"));
  assert(codes(result).has("EXECUTION_DATETIME"));
});

test("detects a missing dependency event", () => {
  const manifest = clone();
  manifest.events[0].dependencies.businessData.push("902-E999");
  assert(codes(validateManifest(manifest)).has("DEPENDENCY_MISSING"));
});

test("detects a confirmed dependency cycle", () => {
  const manifest = clone();
  manifest.events[0].dependencies.businessData.push(manifest.events[1].eventId);
  manifest.events[1].dependencies.businessData.push(manifest.events[0].eventId);
  assert(codes(validateManifest(manifest)).has("DEPENDENCY_CYCLE"));
});

test("current manifest gates E010 as the only execution candidate", () => {
  const gates = evaluateExecutionGates(source);
  assert.deepEqual(gates.filter(gate => gate.candidate).map(gate => gate.eventId), ["902-E010"]);
  assert.equal(gates.filter(gate => gate.status === "SPECIFICATION_BLOCKED").length, 46);
  assert(gates.every(gate => gate.businessExecutionAllowed === false));
});

test("an executable event remains blocked until confirmed dependencies pass", () => {
  const manifest = clone();
  manifest.events[0].dependencies.businessData.push(manifest.events[1].eventId);
  const blocked = evaluateExecutionGates(manifest).find(gate => gate.eventId === "902-E010");
  assert.equal(blocked.status, "DEPENDENCY_BLOCKED");
  const candidate = evaluateExecutionGates(manifest, { completedEventIds: [manifest.events[1].eventId] })
    .find(gate => gate.eventId === "902-E010");
  assert.equal(candidate.status, "EXECUTION_CANDIDATE");
});

test("one invalid event blocks candidate classification for the whole manifest", () => {
  const manifest = clone();
  manifest.events[1].eventType = "UNKNOWN";
  const gates = evaluateExecutionGates(manifest);
  assert.equal(gates.length, 47);
  assert(gates.every(gate => gate.status === "MANIFEST_INVALID"));
  assert(gates.every(gate => gate.candidate === false));
  assert(gates.every(gate => gate.businessExecutionAllowed === false));
});

test("null event is diagnosed by index without throwing", () => {
  const manifest = clone();
  manifest.events[7] = null;
  const gates = evaluateExecutionGates(manifest);
  assert.equal(gates.length, 47);
  assert.equal(gates[7].eventId, null);
  assert.equal(gates[7].eventIndex, 7);
  assert.equal(gates[7].status, "MANIFEST_INVALID");
  assert(gates[7].reasons.some(reason => reason.code === "EVENT_TYPE" && reason.eventIndex === 7));
  assert(gates.every(gate => gate.businessExecutionAllowed === false));
});

test("invalid event ID is diagnosed without throwing and blocks every event", () => {
  const manifest = clone();
  manifest.events[9].eventId = 902010;
  const gates = evaluateExecutionGates(manifest);
  assert.equal(gates[9].eventId, null);
  assert.equal(gates[9].eventIndex, 9);
  assert(gates[9].reasons.some(reason => reason.code === "EVENT_ID_FORMAT" && reason.eventIndex === 9));
  assert(gates.every(gate => gate.status === "MANIFEST_INVALID"));
  assert(gates.every(gate => gate.businessExecutionAllowed === false));
});

test("loader and gate are static and contain no business side-effect clients", () => {
  const implementation = fs.readFileSync(require.resolve("./story902-manifest-loader.cjs"), "utf8");
  for (const forbidden of ["fetch(", "firebase-admin", "attendance_batch", "TimeTrip", "setTimeTrip", "firestore()"])
    assert.equal(implementation.includes(forbidden), false, forbidden);
});
