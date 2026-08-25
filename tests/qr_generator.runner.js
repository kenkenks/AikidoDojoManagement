/*
 * TASK-QR-002 simple runner
 * Run: node tests/qr_generator.runner.js
 */
const assert = require("assert");
const Qr = require("../web/qr/qr_generator.js");

function query(url) {
  return new URL(url).searchParams;
}

function test(name, fn) {
  try {
    fn();
    console.log("PASS:", name);
  } catch (e) {
    console.error("FAIL:", name);
    throw e;
  }
}

test("MEMBER_CARD: member_id", () => {
  const url = Qr.buildQrTargetUrl(Qr.QR_TYPES.MEMBER_CARD, { member_id: "M001" });
  assert.strictEqual(new URL(url).pathname.endsWith("/attendance"), true);
  assert.strictEqual(query(url).get("member_id"), "M001");
});

test("PAYMENT_MONTHLY: member_id + plan_id", () => {
  const url = Qr.buildQrTargetUrl(
    Qr.QR_TYPES.PAYMENT_MONTHLY,
    { member_id: "M001", plan_id: "PLAN-MONTHLY" }
  );
  assert.strictEqual(query(url).get("member_id"), "M001");
  assert.strictEqual(query(url).get("plan_id"), "PLAN-MONTHLY");
});

test("PAYMENT_ONETIME: member_id + plan_id", () => {
  const url = Qr.buildQrTargetUrl(
    Qr.QR_TYPES.PAYMENT_ONETIME,
    { member_id: "M001", plan_id: "PLAN-ONETIME" }
  );
  assert.strictEqual(query(url).get("member_id"), "M001");
  assert.strictEqual(query(url).get("plan_id"), "PLAN-ONETIME");
});

test("DOJO: location_id", () => {
  const url = Qr.buildQrTargetUrl(Qr.QR_TYPES.DOJO, { location_id: "L001" });
  assert.strictEqual(query(url).get("location_id"), "L001");
});

test("TEACHER: teacher_id", () => {
  const url = Qr.buildQrTargetUrl(Qr.QR_TYPES.TEACHER, { teacher_id: "T001" });
  assert.strictEqual(query(url).get("teacher_id"), "T001");
});

test("QR image URL contains encoded target URL", () => {
  const target = Qr.buildQrTargetUrl(Qr.QR_TYPES.MEMBER_CARD, { member_id: "M001" });
  const image = Qr.buildQrImageUrl(target, { size: "200x200" });
  const parsed = new URL(image);
  assert.strictEqual(parsed.hostname, "api.qrserver.com");
  assert.strictEqual(parsed.searchParams.get("size"), "200x200");
  assert.strictEqual(parsed.searchParams.get("data"), target);
});

test("route can be overridden without changing generator", () => {
  const url = Qr.buildQrTargetUrl(
    Qr.QR_TYPES.PAYMENT_MONTHLY,
    { member_id: "M001", plan_id: "P001" },
    { routes: { PAYMENT_MONTHLY: "qr/payment.html" } }
  );
  assert.strictEqual(new URL(url).pathname.endsWith("/qr/payment.html"), true);
});

test("required value validation", () => {
  assert.throws(
    () => Qr.buildQrTargetUrl(Qr.QR_TYPES.MEMBER_CARD, {}),
    /member_id is required/
  );
});

console.log("\nTASK-QR-002 runner completed.");
