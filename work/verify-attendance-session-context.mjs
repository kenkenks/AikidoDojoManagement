import fs from "node:fs";

const files = [
  "web/qr/attendance.html",
  "web/qr/attendanceCheck.html"
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const file of files) {
  const source = fs.readFileSync(new URL("../" + file, import.meta.url), "utf8");
  assert(source.includes("context.location_id"), file + ": Sessionのlocation_idを復元していません。");
  assert(source.includes("context.billing_block_id"), file + ": Sessionのbilling_block_idを復元していません。");
  assert(source.includes("function persistAttendanceContext()"), file + ": Context保存関数がありません。");
  assert(source.includes("DojoVirtualSession.setContext({"), file + ": SessionへContextを保存していません。");
  assert(source.includes('query.get("location_id") || context.location_id'), file + ": URL優先・Session補完になっていません。");
  assert(source.includes('query.get("billing_block_id") || context.billing_block_id'), file + ": 課金枠がURL優先・Session補完になっていません。");
  assert(source.includes("persistAttendanceContext();\n        renderKeys();"), file + ": QR読取後にContextを保存していません。");
  assert(source.includes("currentBillingBlockId = data.billing_block_id;\n        currentSlots = data.slots || [];\n        persistAttendanceContext();"), file + ": 自動確定した課金枠を保存していません。");
}

console.log("PASS: Attendance画面のURL優先・Session補完・Context保存");
