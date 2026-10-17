/*
 * TASK-QR-002 simple runner
 * Run: node tests/qr_generator.runner.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Qr = require("../web/qr/qr_generator.js");
const generatorHtml = fs.readFileSync(
  path.join(__dirname, "../web/qr/qr_generator.html"),
  "utf8"
);

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
  assert.strictEqual(query(url).has("location_id"), false);
});

test("TEACHER + DOJO: teacher_id + location_id", () => {
  const url = Qr.buildQrTargetUrl(
    Qr.QR_TYPES.TEACHER,
    { teacher_id: "T001", location_id: "L001" },
    { baseUrl: "https://example.invalid/qr/", routes: { TEACHER: "teacher_home.html" } }
  );
  assert.strictEqual(new URL(url).pathname, "/qr/teacher_home.html");
  assert.strictEqual(query(url).get("teacher_id"), "T001");
  assert.strictEqual(query(url).get("location_id"), "L001");
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

test("print list: preserves order and duplicates", () => {
  const items = [{ id: "A" }, { id: "A" }, { id: "B" }];
  const pages = Qr.paginate(items, 8);
  assert.deepStrictEqual(pages, [items]);
});

test("B5 layout: 8 cards per page and ninth card starts page 2", () => {
  const items = Array.from({ length: 9 }, (_, index) => ({ id: String(index + 1) }));
  const pages = Qr.paginate(items, 8);
  assert.strictEqual(pages.length, 2);
  assert.strictEqual(pages[0].length, 8);
  assert.strictEqual(pages[1].length, 1);
  assert.strictEqual(pages[1][0].id, "9");
});

test("paginate rejects invalid page size", () => {
  assert.throws(() => Qr.paginate([1], 0), /positive integer/);
});

test("B5 landscape print uses 4 columns x 2 rows", () => {
  assert.match(generatorHtml, /@page\s*\{\s*size:B5 landscape;/);
  assert.match(generatorHtml, /grid-template-columns:repeat\(4, 1fr\)/);
  assert.match(generatorHtml, /grid-template-rows:repeat\(2, 1fr\)/);
  assert.match(generatorHtml, /width:257mm/);
  assert.match(generatorHtml, /height:182mm/);
});

test("printed cards reuse existing card stylesheet at calculated 8-up size", () => {
  assert.match(generatorHtml, /href="assets\/qr-sheet\.css" media="print"/);
  assert.match(generatorHtml, /width:60\.61mm/);
  assert.match(generatorHtml, /height:86mm/);
  assert.match(generatorHtml, /page:auto/);
  assert.match(generatorHtml, /transform:scale\(\.819047619\)/);
  assert.match(generatorHtml, /qr-sheet qr-sheet--teacher/);
  assert.match(generatorHtml, /selectedDojo\.location_name/);
});

test("print list supports add, individual delete, clear and PDF print", () => {
  assert.match(generatorHtml, /id="addToPrintListButton"/);
  assert.match(generatorHtml, /data-print-index/);
  assert.match(generatorHtml, /id="clearPrintListButton"/);
  assert.match(generatorHtml, /window\.print\(\)/);
});

test("print QR uses high resolution and error correction", () => {
  assert.match(generatorHtml, /size:"720x720", ecc:"M"/);
});

console.log("\nTASK-QR-002 runner completed.");
