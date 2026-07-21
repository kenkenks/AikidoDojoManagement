import fs from "node:fs";
import vm from "node:vm";

const code = fs.readFileSync(new URL("../gas/04_AttendanceProgress.js", import.meta.url), "utf8");

globalThis.ensureSheetContext = value => value || {};
globalThis.normalizeId_ = value => String(value || "").trim();
globalThis.isActiveMasterRow_ = row => row["状態"] !== "取消" && row["状態"] !== "退会";
globalThis.formatAttendanceDate_ = value => String(value || "").slice(0, 10);
globalThis.parseAttendanceDate_ = value => value;
globalThis.getMembers = () => [{
  member_id: "M001",
  "氏名": "テスト会員",
  "現在級段位": "2級",
  "級段位登録元": "本人申告",
  "級段位起算日": "2026-06-01",
  "繰越稽古数": 4,
  "審査可能稽古数": 10,
  "状態": "有効"
}];
globalThis.getAttendances = () => [
  { member_id: "M001", "稽古日": "2026-05-31", "状態": "有効", slot_id: "S1" },
  { member_id: "M001", "稽古日": "2026-06-01", "状態": "有効", slot_id: "S1" },
  { member_id: "M001", "稽古日": "2026-06-01", "状態": "有効", slot_id: "S2" },
  { member_id: "M001", "稽古日": "2026-06-03", "状態": "有効", slot_id: "S1" },
  { member_id: "M001", "稽古日": "2026-06-04", "状態": "取消", slot_id: "S1" }
];

vm.runInThisContext(code);

const summary = globalThis.attendanceProgress_getMemberSummary("M001", {});
if (!summary.ok) throw new Error("summary was not created");
if (summary.current_rank !== "2級") throw new Error("rank mismatch");
if (summary.recorded_training_count !== 2) throw new Error("same-day slots were not deduplicated");
if (summary.training_count !== 6) throw new Error("carried count was not added");
if (summary.remaining_training_count !== 4) throw new Error("remaining count mismatch");

console.log("Attendance progress summary: OK");
console.log("Same-day slot deduplication: OK");
console.log("Carry-over and remaining count: OK");
