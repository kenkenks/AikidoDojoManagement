import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const verifyInlineScripts = (path) => {
  const html = read(path);
  const pattern = /<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  let index = 0;
  while ((match = pattern.exec(html))) {
    new vm.Script(match[1], { filename:`${path}#${++index}` });
  }
};
const gas = read("gas/sup_timeTravel.js");
const connect = read("gas/WebConnect.js");
new vm.Script(gas, { filename:"sup_timeTravel.js" });
new vm.Script(connect, { filename:"WebConnect.js" });

for (const entrance of [
  "sup_timeTravel_getSystemContext",
  "sup_timeTravel_getAdminSetting",
  "sup_timeTravel_saveAdminSetting",
  "showTimeTravelDialog"
]) assert.match(gas, new RegExp(`function\\s+${entrance}\\s*\\(`));

assert.match(connect, /params\.action === "system_context"/);
assert.match(connect, /e\.parameter && e\.parameter\.payload/);
assert.match(gas, /if \(setting\.enabled && setting\.targetMonth\)/);
assert.match(gas, /result\.targetMonth = normalizeMonth\(s\.DEBUG_TARGET_MONTH\)/);
assert.match(gas, /setNumberFormat\("@"\)\.setValue\(String\(updates\[key\]\)\)/);
assert.doesNotMatch(connect, /params\.action === "time_travel_save"/);

for (const page of [
  "teacher_home.html", "member_home.html", "attendance.html",
  "attendanceCheck.html", "payment_teacher.html", "payment_status.html",
  "attendance_summary.html"
]) {
  assert.match(read(`web/qr/${page}`), /system_context\.js/, `${page}に時刻表示がありません`);
  verifyInlineScripts(`web/qr/${page}`);
}
verifyInlineScripts("gas/time_travel.html");

assert.match(read("web/qr/payment_status.html"), /dojo-system-context/);
assert.match(read("web/qr/attendance.html"), /currentAttendanceDate\(\)/);
assert.match(read("web/qr/attendanceCheck.html"), /currentAttendanceDate\(\)/);
assert.match(read("web/qr/attendance.html"), /callback:\s*callbackName,\s*_ts:\s*Date\.now\(\)/);
assert.match(read("web/qr/attendanceCheck.html"), /callback:\s*callbackName,\s*_ts:\s*Date\.now\(\)/);
assert.match(read("web/qr/attendance.html"), /postJsonViaForm\(GAS_URL, payload\)/);
assert.match(read("web/qr/attendanceCheck.html"), /postJsonViaForm\(GAS_URL, payload\)/);
assert.doesNotMatch(read("web/qr/attendance.html"), /mode:\s*"no-cors"/);
assert.doesNotMatch(read("web/qr/attendanceCheck.html"), /mode:\s*"no-cors"/);
assert.match(read("web/qr/payment_teacher.html"), /DOJO_SYSTEM_CONTEXT/);

console.log("PASS verify-time-travel-ui");
