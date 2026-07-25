import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const checks = [
  ["gas/WebConnect.js", 'params.action === "attendance_saved_state"'],
  ["gas/WebConnect.js", "getAttendanceSavedState(params, ctx)"],
  ["web/qr/attendanceCheck.html", 'savedOnly ? "attendance_saved_state" : "member_attendance_state"'],
  ["web/qr/attendanceCheck.html", "attempt > 1,\n          true"],
  ["web/qr/attendance.html", 'savedOnly ? "attendance_saved_state" : "member_attendance_state"'],
  ["web/qr/attendance.html", "attempt > 1,\n          true"],
  ["aikidouDojoQRScan/public/index.html", 'savedOnly ? "attendance_saved_state" : "member_attendance_state"'],
  ["aikidouDojoQRScan/public/index.html", "expectedByMember[candidate.member_id] || [],\n          true"]
];
let failed=false;
for (const [file,text] of checks) {
  const full=path.join(root,file);
  if (!fs.existsSync(full) || !fs.readFileSync(full,"utf8").includes(text)) {
    console.error(`NG: ${file} missing ${JSON.stringify(text)}`); failed=true;
  }
}
if (failed) process.exit(1);
console.log("Attendance saved-state route: OK");
