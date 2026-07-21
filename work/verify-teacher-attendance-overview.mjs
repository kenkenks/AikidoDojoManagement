import fs from "node:fs";
import vm from "node:vm";

const code = fs.readFileSync(new URL("../gas/04_AttendanceTeacher.js", import.meta.url), "utf8");

globalThis.ensureSheetContext = value => value || {};
globalThis.normalizeId_ = value => String(value || "").trim();
globalThis.parseAttendanceDate_ = value => value;
globalThis.formatAttendanceDate_ = value => String(value || "").slice(0, 10);
globalThis.attendanceCore_findRowsForScope_ = () => [
  { member_id:"M001", slot_id:"S1", "状態":"確認済" },
  { member_id:"M001", slot_id:"S2", "状態":"確認済" },
  { member_id:"M002", slot_id:"S1", "状態":"確認待ち" }
];
globalThis.attendanceProgress_getMemberSummaries = () => ({
  M001:{ member_name:"会員一", current_rank:"2級", training_count:58, required_training_count:60, remaining_training_count:2, examination_ready:false },
  M002:{ member_name:"会員二", current_rank:"初段", training_count:70, required_training_count:70, remaining_training_count:0, examination_ready:true }
});

vm.runInThisContext(code);

const result = globalThis.attendanceTeacherGetTodayOverview({
  attendance_date:"2026-07-21", location_id:"HONBU", billing_block_id:"B1"
}, {});
if (!result.ok || result.member_count !== 2) throw new Error("member aggregation mismatch");
if (result.attendance_items[0].slot_ids.length !== 2) throw new Error("slot aggregation mismatch");
if (result.attendance_items[1].examination_ready !== true) throw new Error("progress join mismatch");

console.log("Teacher attendance overview aggregation: OK");
console.log("Attendance progress join: OK");
