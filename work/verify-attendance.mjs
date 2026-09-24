import fs from "node:fs";
import vm from "node:vm";
import { declaration } from "./source-extract.mjs";

function readProjectFile(candidates) {
  for (const candidate of candidates) {
    const url = new URL(candidate, import.meta.url);
    if (fs.existsSync(url)) return fs.readFileSync(url, "utf8");
  }
  throw new Error(`project file not found: ${candidates.join(", ")}`);
}

const html = readProjectFile([
  "../web/qr/attendance.html",
  "../QR_MultReadTRNS/index.html",
  "../WebCamera/QR_MultReadTRNS/index.html"
]);
const scriptStart = html.lastIndexOf("<script>") + "<script>".length;
const scriptEnd = html.indexOf("</script>", scriptStart);
if (scriptStart < "<script>".length || scriptEnd < 0) throw new Error("inline script not found");
const inlineScript = html.slice(scriptStart, scriptEnd);
new Function(inlineScript);

const fakeElements = {};
const fakeDocument = {
  getElementById(id) {
    if (!fakeElements[id]) {
      fakeElements[id] = {
        textContent: "",
        className: "",
        disabled: false,
        hidden: false,
        innerHTML: "",
        prepend() {},
        appendChild() {}
      };
    }
    return fakeElements[id];
  },
  createElement() {
    return { remove() {}, appendChild() {}, setAttribute() {} };
  },
  head: { appendChild() {} }
};
const browserContext = vm.createContext({
  document: fakeDocument,
  window: { crypto: { randomUUID: () => "test-session" } },
  navigator: {},
  URL,
  URLSearchParams,
  Promise,
  Set,
  Date,
  Math,
  Array,
  String,
  Number,
  console
});
vm.runInContext(declaration(html, "normalizeSlotIds") + "\n" + declaration(html, "slotIdsEqual"), browserContext);
if (
  browserContext.slotIdsEqual(["S2", "S1", "S1"], ["S1", "S2"]) !== true ||
  browserContext.slotIdsEqual(["S1"], ["S2"]) !== false
) throw new Error("slot state comparison mismatch");

globalThis.Utilities = {
  getUuid: () => "test-uuid",
  formatDate(value, zone, pattern) {
    const date = new Date(value);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    if (pattern === "yyyy-MM") return `${yyyy}-${mm}`;
    if (pattern === "yyyy-MM-dd") return `${yyyy}-${mm}-${dd}`;
    if (pattern === "HH:mm") return `${hh}:${min}`;
    if (pattern === "u") return String(date.getDay() === 0 ? 7 : date.getDay());
    return "";
  }
};
globalThis.Session = { getScriptTimeZone: () => "Asia/Tokyo" };
globalThis.ensureSheetContext = value => value;
globalThis.normalizeMonth = value => String(value).trim();

const blocks = [
  { billing_block_id: "B1", location_id: "HONBU", "1課金あたり枠数": 2, "状態": "有効" },
  { billing_block_id: "B2", location_id: "HONBU", "1課金あたり枠数": 2, "状態": "有効" }
];
const attendances = [
  { member_id: "M001", target_month: "2026-06", "稽古日": "2026-06-01", billing_block_id: "B1", slot_id: "S1", "状態": "有効" },
  { member_id: "M001", target_month: "2026-06", "稽古日": "2026-06-01", billing_block_id: "B1", slot_id: "S2", "状態": "有効" },
  { member_id: "M001", target_month: "2026-06", "稽古日": "2026-06-02", billing_block_id: "B1", slot_id: "S1", "状態": "有効" },
  { member_id: "M001", target_month: "2026-06", "稽古日": "2026-06-02", billing_block_id: "B1", slot_id: "S2", "状態": "有効" },
  { member_id: "M001", target_month: "2026-06", "稽古日": "2026-06-02", billing_block_id: "B1", slot_id: "S3", "状態": "有効" },
  { member_id: "M001", target_month: "2026-06", "稽古日": "2026-06-03", billing_block_id: "B2", slot_id: "S4", "状態": "取消" }
];
globalThis.getBillingBlocks = () => blocks;
globalThis.getAttendances = () => attendances;
globalThis.getSheetRows = (ctx, name) => {
  if (name === '01_会員マスタ') return globalThis.getMembers();
  if (name === '12_稽古枠マスタ') return globalThis.getTrainingSlots();
  if (name === '07_出席ログ') return attendances;
  if (name === '13_課金枠マスタ') return blocks;
  throw new Error('unexpected table: ' + name);
};
for (const file of ['DAO_Composition.js', 'DAO_Core_Sheets.js', 'DAO_Business_Attendance.js']) {
  vm.runInThisContext(readProjectFile(['../gas/' + file]));
}

const attendanceCode = readProjectFile([
  "../gas/04_Attendance.js",
  "../AikidoDojoManagement-review/AikidoDojoManagement-main/04_Attendance.js",
  "../clasp_道場サポ/04_Attendance.js"
]);
vm.runInThisContext(attendanceCode);
vm.runInThisContext(readProjectFile(["../gas/04_AttendanceCore.js"]));

const result = globalThis.calculateAttendanceChargeCount("M001", "2026-06", {});
if (result.charge_count !== 3) {
  throw new Error(`charge count mismatch: expected 3, received ${result.charge_count}`);
}

let invalidDateRejected = false;
try { globalThis.parseAttendanceDate_("2026-02-31"); } catch { invalidDateRejected = true; }
if (!invalidDateRejected) throw new Error("invalid date was accepted");

console.log("QR script syntax: OK");
console.log("Attendance charge aggregation: OK (2 slots => 1, 3 slots => 2)");
console.log("Invalid date validation: OK");

globalThis.createSheetContext = () => ({});
globalThis.sup_targetMonth = () => "2026-06";
globalThis.sup_now = () => new Date("2026-06-23T10:30:00+09:00");
globalThis.getFees = () => [{ plan_id: "P001", 状態: "有効" }];
globalThis.billingCoreGetMonthlySelection_ = () => ({ plan_id: "P001" });
// 本検証は出席同期が対象。隣接する請求・級段・Viewは外部書込みのない代役。
globalThis.billingMonthlyAccept = () => ({ ok: true, skipped: true, idempotent: true });
globalThis.billingUsageSyncFromAttendance_ = () => ({ ok: true, skipped: true });
globalThis.attendanceProgress_updateSelfDeclaredRanks_ = () => [];
let projected = null;
globalThis.paymentStatusView_projectAttendances_ = (added, cancelled) => { projected = { added, cancelled }; };
globalThis.getTeachers = () => [{ teacher_id: "T001", "出席受付可": true, "状態": "有効" }];
globalThis.getLocations = () => [{ location_id: "HONBU", "状態": "有効" }];
globalThis.getMembers = () => [{ member_id: "M001", "請求グループID": "G001", "状態": "有効" }];
globalThis.getTrainingSlots = () => [
  { slot_id: "S1", location_id: "HONBU", billing_block_id: "B1", "開始時刻": "10:30", "終了時刻": "11:30", "稽古時間分": 60, "状態": "有効" },
  { slot_id: "S2", location_id: "HONBU", billing_block_id: "B1", "開始時刻": "11:30", "終了時刻": "12:30", "稽古時間分": 60, "状態": "有効" }
];
globalThis.getActiveAttendanceRowsForScope = () => [
  { _rowNumber: 2, member_id: "M001", slot_id: "S1", "状態": "有効" }
];
const searchedScopes = [];
globalThis.attendanceCore_findRowsForScope_ = params => {
  searchedScopes.push(params);
  return globalThis.getActiveAttendanceRowsForScope();
};
let appendedRows = [];
let cancelledRows = [];
globalThis.appendAttendanceRows = (rows, ctx) => { appendedRows = rows; };
globalThis.cancelAttendanceRows = (rows, teacherId, reason, ctx) => { cancelledRows = rows; };

const registration = globalThis.registerAttendanceBatchLocked_({
  teacher_id: "T001",
  location_id: "HONBU",
  billing_block_id: "B1",
  attendance_date: "2026-06-23",
  attendance_items: [{ member_id: "M001", slot_ids: ["S2"] }]
});
if (registration.registered_count !== 1 || registration.cancelled_count !== 1 || appendedRows[0].slot_id !== "S2" || cancelledRows[0].slot_id !== "S1") {
  throw new Error("attendance synchronization mismatch");
}
console.log("Attendance screen synchronization: OK (add S2, cancel S1)");

appendedRows = [];
cancelledRows = [];
const clearRegistration = globalThis.registerAttendanceBatchLocked_({
  teacher_id: "T001",
  location_id: "HONBU",
  billing_block_id: "B1",
  attendance_date: "2026-06-23",
  attendance_items: [{ member_id: "M001", slot_ids: [] }]
});
const clearMatches = clearRegistration.registered_count === 0 && clearRegistration.cancelled_count === 1 && appendedRows.length === 0;
if (clearMatches) console.log("Attendance clear synchronization: OK (no selection => cancel active slots)");
else console.error("FAIL: 全選択解除の契約不一致 " + JSON.stringify({ expected: { registered_count: 0, cancelled_count: 1 }, actual: clearRegistration }));

const clearScope = searchedScopes[searchedScopes.length - 1];
if (clearScope.member_id !== "M001" || clearScope.attendance_date !== "2026-06-23" || clearScope.location_id !== "HONBU" || clearScope.billing_block_id !== "B1") throw new Error("clear scope must include member/date/location/block");
if (clearRegistration.results.some(item => item.errors.length)) throw new Error("clear must not return item errors");
if (projected.added.length !== 0 || projected.cancelled.length !== 1 || projected.cancelled[0].slot_id !== "S1") throw new Error("clear must project cancellation to View");

const findExisting = globalThis.getActiveAttendanceRowsForScope;
globalThis.getActiveAttendanceRowsForScope = () => [];
const repeatedClear = globalThis.registerAttendanceBatchLocked_({ teacher_id: "T001", location_id: "HONBU", billing_block_id: "B1", attendance_date: "2026-06-23", attendance_items: [{ member_id: "M001", slot_ids: [] }] }, {});
if (repeatedClear.registered_count !== 0 || repeatedClear.cancelled_count !== 0 || repeatedClear.results[0].errors.length) throw new Error("repeat clear must be idempotent");
globalThis.getActiveAttendanceRowsForScope = findExisting;

// 同期以外の空登録、配列欠落、無効な枠は取消に転化させない。
for (const [label, item, sync] of [
  ["non-sync empty", { member_id: "M001", slot_ids: [] }, false],
  ["missing slots", { member_id: "M001" }, true],
  ["invalid slot", { member_id: "M001", slot_ids: ["UNKNOWN"] }, true]
]) {
  appendedRows = []; cancelledRows = [];
  const before = searchedScopes.length;
  const rejected = globalThis.attendanceCore_registerBatch_({ teacher_id: "T001", location_id: "HONBU", billing_block_id: "B1", attendance_date: "2026-06-23", require_teacher: true, sync_unselected: sync, attendance_items: [item] }, {});
  if (!rejected.results[0].errors.length || cancelledRows.length || appendedRows.length || searchedScopes.length !== before) throw new Error("invalid selection caused a write: " + label);
}
console.log("Attendance clear scope and invalid-selection protection: OK");

blocks[0]["曜日"] = "月曜日";
blocks[0]["表示名"] = "月曜午前";
const inferredSession = globalThis.getAttendanceSessionInfo({
  location_id: "HONBU",
  at: "2026-06-22T11:00:00+09:00"
});
if (!inferredSession.ok || inferredSession.billing_block_id !== "B1" || inferredSession.inferred !== true) {
  throw new Error("billing block inference mismatch");
}
console.log("Billing block time inference: OK");
if (!clearMatches) process.exitCode = 1;
