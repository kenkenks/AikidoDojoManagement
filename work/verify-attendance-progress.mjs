import fs from "node:fs";
import vm from "node:vm";

const code = fs.readFileSync(new URL("../gas/04_AttendanceProgress.js", import.meta.url), "utf8");

globalThis.ensureSheetContext = value => value || {};
globalThis.normalizeId_ = value => String(value || "").trim();
globalThis.isActiveMasterRow_ = row => row["状態"] !== "取消" && row["状態"] !== "退会";
globalThis.formatAttendanceDate_ = value => String(value || "").slice(0, 10);
globalThis.parseAttendanceDate_ = value => value;
globalThis.examinationStandard_getMap = () => ({
  "成人二級": { next_rank: "成人一級", required_training_count: 60, progress_display_enabled: true, note: "" },
  "成人初段": { next_rank: "成人二段", required_training_count: 200, progress_display_enabled: true, note: "" }
});
globalThis.rankMaster_getOptionMap = () => ({
  "成人二級": { rank_id: "ADULT_KYU_2", sort_order: 1050 },
  "成人初段": { rank_id: "ADULT_DAN_1", sort_order: 1070 }
});
globalThis.getMembers = () => [{
  member_id: "M001",
  "氏名": "テスト会員",
  "現在級段位": "成人二級",
  "級段位登録元": "本人申告",
  "級段位起算日": "2026-06-01",
  "繰越稽古数": 4,
  "審査可能稽古数": 10,
  "状態": "有効"
}, {
  member_id: "M002",
  "氏名": "マスタ参照会員",
  "現在級段位": "成人初段",
  "級段位起算日": "2026-06-01",
  "審査可能稽古数": "",
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
if (summary.current_rank !== "成人二級") throw new Error("rank mismatch");
if (summary.recorded_training_count !== 3) throw new Error("each same-day training slot must count once");
if (summary.training_count !== 7) throw new Error("carried count was not added");
if (summary.remaining_training_count !== 3) throw new Error("remaining count mismatch");

const masterSummary = globalThis.attendanceProgress_getMemberSummary("M002", {});
if (masterSummary.next_rank !== "成人二段") throw new Error("next rank master linkage mismatch");
if (masterSummary.required_training_count !== 200) throw new Error("required count master fallback mismatch");
if (masterSummary.required_training_count_source !== "審査基準マスタ") throw new Error("required count source mismatch");
if (summary.required_training_count_source !== "会員個別") throw new Error("member override priority mismatch");

console.log("Attendance progress summary: OK");
console.log("Same-day training slots count separately: OK");
console.log("Carry-over and remaining count: OK");
console.log("Examination standard fallback and member override: OK");
