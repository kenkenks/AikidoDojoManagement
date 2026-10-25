"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadManifest } = require("./story902-manifest-loader.cjs");
const { createCommand, createE010BusinessAdapter, readExpected } = require("./story902-e010-business-adapter.cjs");

const manifest = loadManifest().manifest;
const fixture = Object.freeze({
  source_member_id: "M001",
  member_id: "STORY902_M001",
  teacher_id: "STORY902_T001",
  location_id: "STORY902_L001",
  billing_block_id: "STORY902_B001",
  slot_id: "STORY902_S001",
  current_rank: "成人無級"
});
const base = Object.freeze({
  eventId: "902-E010",
  eventResults: {},
  runId: "STORY902-C2-20261025-001",
  requestId: "STORY902_C2_REQ_001",
  sessionId: "STORY902_C2_SESSION_001",
  fixture
});

function successBody(overrides = {}) {
  return {
    ok: true,
    registered_count: 1,
    cancelled_count: 0,
    usage_billing: [{ member_id: fixture.member_id, charge_count: 1, planned_amount: 1500 }],
    results: [{ member_id: fixture.member_id, registered_slot_ids: [fixture.slot_id], cancelled_slot_ids: [] }],
    ...overrides
  };
}

function mockTransport(options = {}) {
  const calls = [];
  return {
    kind: "STORY902_MOCK_TRANSPORT",
    calls,
    async send(command) {
      calls.push({ type: "send", command });
      if (options.sendError) throw options.sendError;
      return Object.prototype.hasOwnProperty.call(options, "response")
        ? options.response
        : { status: 200, body: successBody() };
    },
    async read(request) {
      calls.push({ type: "read", request });
      if (options.readError) throw options.readError;
      if (request.action === "member_attendance_state") return options.attendance || {
        ok: true,
        member_id: fixture.member_id,
        selected_slot_ids: [fixture.slot_id],
        billing_plan_selected: true,
        billing_plan_id: "P002"
      };
      if (request.action === "getMemberInfo") return options.billing || {
        ok: true,
        memberId: fixture.member_id,
        targetMonth: "2027-07",
        billedTotal: 1500
      };
      throw new Error("UNEXPECTED_MOCK_READ");
    }
  };
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("E010 manifest contains the confirmed structured Expected", () => {
  const event = manifest.events.find(item => item.eventId === "902-E010");
  assert.deepEqual(readExpected(event), {
    registered_count: 1,
    cancelled_count: 0,
    charge_count: 1,
    planned_amount: 1500
  });
});

test("E010 command uses only manifest and supplied fixture values", () => {
  const ready = createCommand({ manifest, ...base });
  assert.equal(ready.status, "READY");
  assert.equal(ready.command.method, "POST");
  assert.equal(ready.command.action, "attendance_batch");
  assert.equal(ready.command.input.attendance_date, "2027-07-02");
  assert.equal(ready.command.input.attendance_items[0].plan_id, "P002");
  assert.deepEqual(ready.command.input.attendance_items[0].slot_ids, [fixture.slot_id]);
  assert.equal(ready.businessExecutionAllowed, false);
});

test("events other than E010 are blocked without transport", async () => {
  const transport = mockTransport();
  const adapter = createE010BusinessAdapter({ manifest, transport });
  const value = await adapter.execute({ ...base, eventId: "902-E020" });
  assert.equal(value.status, "BLOCKED");
  assert.equal(value.reason.code, "EVENT_NOT_SUPPORTED");
  assert.equal(transport.calls.length, 0);
});

test("a specification-blocked E010 is not sent", async () => {
  const copy = structuredClone(manifest);
  copy.events.find(item => item.eventId === "902-E010").specificationStatus = "PROVISIONAL";
  const transport = mockTransport();
  const value = await createE010BusinessAdapter({ manifest: copy, transport }).execute(base);
  assert.equal(value.status, "BLOCKED");
  assert.equal(value.reason.code, "CONTINUATION_NOT_ESTABLISHED");
  assert.equal(transport.calls.length, 0);
});

test("missing required inputs are blocked without transport", async () => {
  for (const patch of [
    { runId: "" },
    { requestId: "" },
    { sessionId: "" },
    { fixture: { ...fixture, member_id: "" } },
    { fixture: { ...fixture, source_member_id: "M999" } },
    { fixture: { ...fixture, slot_id: "" } },
    { fixture: { ...fixture, current_rank: "" } }
  ]) {
    const transport = mockTransport();
    const value = await createE010BusinessAdapter({ manifest, transport }).execute({ ...base, ...patch });
    assert.equal(value.status, "BLOCKED");
    assert.equal(value.businessExecutionAllowed, false);
    assert.equal(transport.calls.length, 0);
  }
});

test("normal mock response and read-after-write evidence produce mock-only PASS", async () => {
  const transport = mockTransport();
  const value = await createE010BusinessAdapter({ manifest, transport }).execute(base);
  assert.equal(value.status, "PASS");
  assert.equal(value.evidenceKind, "MOCK_ONLY");
  assert.equal(value.businessExecutionAllowed, false);
  assert.equal(value.autoRetryAllowed, false);
  assert.deepEqual(value.actual, value.expected);
  assert.deepEqual(transport.calls.map(call => call.type), ["send", "read", "read"]);
});

test("Expected mismatch is FAIL and values are not repaired", async () => {
  const transport = mockTransport({ response: { status: 200, body: successBody({ registered_count: 0 }) } });
  const value = await createE010BusinessAdapter({ manifest, transport }).execute(base);
  assert.equal(value.status, "FAIL");
  assert.equal(value.actual.registered_count, 0);
  assert.equal(value.checks.find(item => item.name === "registered_count").status, "FAIL");
});

test("read-after-write mismatch is FAIL", async () => {
  const transport = mockTransport({ attendance: {
    ok: true, member_id: fixture.member_id, selected_slot_ids: [], billing_plan_selected: true, billing_plan_id: "P002"
  } });
  const value = await createE010BusinessAdapter({ manifest, transport }).execute(base);
  assert.equal(value.status, "FAIL");
  assert.equal(value.readAfterWrite.status, "FAIL");
});

test("explicit business error is FAIL", async () => {
  const transport = mockTransport({ response: { status: 400, body: { ok: false, message: "fixture rejected" } } });
  const value = await createE010BusinessAdapter({ manifest, transport }).execute(base);
  assert.equal(value.status, "FAIL");
  assert.equal(value.reason.code, "BUSINESS_ERROR");
});

test("authorization errors are BLOCKED", async () => {
  for (const status of [401, 403]) {
    const transport = mockTransport({ response: { status, body: { error: "FORBIDDEN" } } });
    const value = await createE010BusinessAdapter({ manifest, transport }).execute({ ...base, runId: `STORY902-C2-AUTH-${status}` });
    assert.equal(value.status, "BLOCKED");
    assert.equal(value.reason.code, "AUTHORIZATION_DENIED");
  }
});

test("network failure is UNKNOWN", async () => {
  const error = Object.assign(new Error("network unavailable"), { code: "NETWORK_ERROR" });
  const value = await createE010BusinessAdapter({ manifest, transport: mockTransport({ sendError: error }) }).execute(base);
  assert.equal(value.status, "UNKNOWN");
  assert.equal(value.reason.code, "NETWORK_ERROR");
});

test("timeout is UNKNOWN", async () => {
  const error = Object.assign(new Error("timeout"), { code: "ETIMEDOUT" });
  const value = await createE010BusinessAdapter({ manifest, transport: mockTransport({ sendError: error }) }).execute(base);
  assert.equal(value.status, "UNKNOWN");
  assert.equal(value.reason.code, "ETIMEDOUT");
});

test("malformed successful response is UNKNOWN", async () => {
  for (const response of [null, { status: 200, body: null }, { status: 200, body: { ok: true } }]) {
    const transport = mockTransport({ response });
    const value = await createE010BusinessAdapter({ manifest, transport }).execute(base);
    assert.equal(value.status, "UNKNOWN");
  }
});

test("lost response after a possible write is UNKNOWN", async () => {
  const error = Object.assign(new Error("response lost after commit"), { code: "RESPONSE_LOST_AFTER_COMMIT" });
  const value = await createE010BusinessAdapter({ manifest, transport: mockTransport({ sendError: error }) }).execute(base);
  assert.equal(value.status, "UNKNOWN");
  assert.equal(value.reason.code, "RESPONSE_LOST_AFTER_COMMIT");
});

test("UNKNOWN run cannot be automatically resent", async () => {
  const transport = mockTransport({ sendError: Object.assign(new Error("lost"), { code: "NETWORK_ERROR" }) });
  const adapter = createE010BusinessAdapter({ manifest, transport });
  assert.equal((await adapter.execute(base)).status, "UNKNOWN");
  const second = await adapter.execute(base);
  assert.equal(second.status, "BLOCKED");
  assert.equal(second.reason.code, "AUTOMATIC_RETRY_PROHIBITED");
  assert.equal(transport.calls.filter(call => call.type === "send").length, 1);
});

test("the same E010 cannot be resent with a different Run ID", async () => {
  const transport = mockTransport();
  const adapter = createE010BusinessAdapter({ manifest, transport });
  assert.equal((await adapter.execute(base)).status, "PASS");
  const retry = await adapter.execute({ ...base, runId: "STORY902-C2-20261025-002" });
  assert.equal(retry.status, "BLOCKED");
  assert.equal(retry.reason.code, "EVENT_REEXECUTION_PROHIBITED");
  assert.equal(transport.calls.filter(call => call.type === "send").length, 1);
});

test("the same E010 cannot be resent with a different request ID", async () => {
  const transport = mockTransport();
  const adapter = createE010BusinessAdapter({ manifest, transport });
  assert.equal((await adapter.execute(base)).status, "PASS");
  const retry = await adapter.execute({
    ...base,
    runId: "STORY902-C2-20261025-003",
    requestId: "STORY902_C2_REQ_999"
  });
  assert.equal(retry.status, "BLOCKED");
  assert.equal(retry.reason.code, "EVENT_REEXECUTION_PROHIBITED");
  assert.equal(transport.calls.filter(call => call.type === "send").length, 1);
});

test("the same E010 cannot be resent with a different fixture", async () => {
  const transport = mockTransport();
  const adapter = createE010BusinessAdapter({ manifest, transport });
  assert.equal((await adapter.execute(base)).status, "PASS");
  const retry = await adapter.execute({
    ...base,
    runId: "STORY902-C2-20261025-004",
    fixture: { ...fixture, teacher_id: "STORY902_T999" }
  });
  assert.equal(retry.status, "BLOCKED");
  assert.equal(retry.reason.code, "EVENT_REEXECUTION_PROHIBITED");
  assert.equal(transport.calls.filter(call => call.type === "send").length, 1);
});

test("HTTP 500 is UNKNOWN even when the body says the operation failed", async () => {
  const transport = mockTransport({ response: { status: 500, body: { ok: false, message: "internal error" } } });
  const value = await createE010BusinessAdapter({ manifest, transport }).execute(base);
  assert.equal(value.status, "UNKNOWN");
  assert.equal(value.reason.code, "WRITE_OUTCOME_UNCERTAIN");
});

test("HTTP 408 and 429 are UNKNOWN", async () => {
  for (const status of [408, 429]) {
    const transport = mockTransport({ response: { status, body: { ok: false, message: "retry later" } } });
    const value = await createE010BusinessAdapter({ manifest, transport }).execute(base);
    assert.equal(value.status, "UNKNOWN");
    assert.equal(value.reason.code, "WRITE_OUTCOME_UNCERTAIN");
  }
});

test("read-after-write transport failure is UNKNOWN and cannot be retried", async () => {
  const transport = mockTransport({ readError: new Error("read failed") });
  const adapter = createE010BusinessAdapter({ manifest, transport });
  const first = await adapter.execute(base);
  assert.equal(first.status, "UNKNOWN");
  assert.equal(first.reason.code, "READ_AFTER_WRITE_UNAVAILABLE");
  assert.equal((await adapter.execute(base)).reason.code, "AUTOMATIC_RETRY_PROHIBITED");
});

test("all modeled terminal outcomes keep business execution disabled", async () => {
  const variants = [
    mockTransport(),
    mockTransport({ response: { status: 400, body: { ok: false } } }),
    mockTransport({ response: { status: 403, body: { error: "FORBIDDEN" } } }),
    mockTransport({ sendError: new Error("network") }),
    mockTransport({ response: { status: 200, body: { ok: true } } })
  ];
  for (const [index, transport] of variants.entries()) {
    const value = await createE010BusinessAdapter({ manifest, transport }).execute({ ...base, runId: `STORY902-C2-PATH-${index}` });
    assert.equal(value.businessExecutionAllowed, false);
    assert.equal(value.autoRetryAllowed, false);
  }
});

test("adapter requires an explicitly marked mock and contains no infrastructure client", () => {
  assert.throws(() => createE010BusinessAdapter({ manifest, transport: { send() {}, read() {} } }), /MOCK_TRANSPORT_REQUIRED/);
  const source = fs.readFileSync(path.join(__dirname, "story902-e010-business-adapter.cjs"), "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(|firebase-admin|@google-cloud\/firestore|https:\/\//);
});

(async () => {
  let passed = 0;
  for (const item of tests) {
    try {
      await item.fn();
      passed += 1;
      process.stdout.write(`PASS ${item.name}\n`);
    } catch (error) {
      process.stderr.write(`FAIL ${item.name}\n${error.stack}\n`);
      process.exitCode = 1;
    }
  }
  process.stdout.write(`\n${passed}/${tests.length} PASS\n`);
})();
