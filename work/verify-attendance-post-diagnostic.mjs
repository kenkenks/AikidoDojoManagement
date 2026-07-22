import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const runner = read("gas/14_AttendanceSlotSyncDiagnostic.js");
const connect = read("gas/WebConnect.js");
const html = read("web/qr/post_diagnostic.html");
new vm.Script(runner);
new vm.Script(connect);
assert.match(runner, /function runner_diagnostic_attendance_slot_sync_902\s*\(/);
assert.match(runner, /registerAttendanceBatchLocked_/);
assert.match(connect, /params\.action === "diagnostic_post_result"/);
assert.match(connect, /params\.action === "post_receipt"/);
assert.match(connect, /data\.mode === "diagnostic_ping"/);
assert.match(connect, /CacheService\.getScriptCache\(\)\.put/);
assert.match(html, /mode:"diagnostic_ping"/);
assert.match(html, /action:"diagnostic_post_result"/);
for (const page of ["attendance.html", "attendanceCheck.html"]) {
  const source = read(`web/qr/${page}`);
  assert.match(source, /request_id:\s*"ATTREQ-/);
  assert.match(source, /postJsonViaForm\(GAS_URL, payload\)/);
  assert.match(source, /waitForPostReceipt\(payload\.request_id, 1\)/);
  assert.doesNotMatch(source, /mode:\s*"no-cors"/);
}
for (const match of html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(match[1]);
console.log("PASS verify-attendance-post-diagnostic");
