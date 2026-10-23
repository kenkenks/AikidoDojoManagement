import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = process.cwd();
let failed = false;

function fail(message) {
  console.error("NG: " + message);
  failed = true;
}

function extractFunction(source, name) {
  const start = source.indexOf("function " + name + "(");
  if (start < 0) throw new Error(name + " not found");
  const body = source.indexOf("{", start);
  let depth = 0;
  for (let index = body; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(name + " is not closed");
}

const webConnect = fs.readFileSync(path.join(root, "gas/WebConnect.js"), "utf8");
if (!webConnect.includes('params.action === "attendance_saved_state"') ||
    !webConnect.includes("getAttendanceSavedState(params, ctx)")) {
  fail("GAS attendance_saved_state route is missing");
}

for (const file of ["web/qr/attendance.html", "web/qr/attendanceCheck.html"]) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  if (!source.includes('savedOnly ? "attendance_saved_state" : "member_attendance_state"')) {
    fail(file + " does not map savedOnly to the two actions");
    continue;
  }
  const refreshSource = extractFunction(source, "refreshAllMemberStates");
  for (const firebase of [false, true]) {
    const calls = [];
    const context = vm.createContext({
      IS_FIREBASE_ATTENDANCE:firebase,
      memberCandidates:[{ member_id:"M001", loaded:true, load_error:"" }],
      renderCandidates() {},
      addLog() {},
      window:{ setTimeout(callback) { callback(); } },
      loadMemberAttendanceState(...args) {
        calls.push(args);
        return Promise.resolve({ ok:true, matches:true, member_id:args[0] });
      },
      Promise,
      Set
    });
    vm.runInContext(refreshSource, context);
    await context.refreshAllMemberStates({ M001:{ slot_ids:[] } }, 2);
    const savedOnly = calls[0] && calls[0][3];
    const selectedAction = savedOnly ? "attendance_saved_state" : "member_attendance_state";
    const expectedAction = firebase ? "member_attendance_state" : "attendance_saved_state";
    if (selectedAction !== expectedAction) {
      fail(file + " selected " + selectedAction + " for " + (firebase ? "Firebase" : "GAS"));
    }
  }
}

if (failed) process.exit(1);
console.log("Attendance saved-state route: GAS=attendance_saved_state, Firebase=member_attendance_state OK");
