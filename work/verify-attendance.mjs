import fs from "node:fs";
import vm from "node:vm";

function readProjectFile(candidates) {
  for (const candidate of candidates) {
    const url = new URL(candidate, import.meta.url);
    if (fs.existsSync(url)) return fs.readFileSync(url, "utf8");
  }
  throw new Error(`project file not found: ${candidates.join(", ")}`);
}

const html = readProjectFile([
  "../web/qr/index.html",
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
vm.runInContext(inlineScript, browserContext);
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

const attendanceCode = readProjectFile([
  "../gas/04_Attendance.js",
  "../AikidoDojoManagement-review/AikidoDojoManagement-main/04_Attendance.js",
  "../clasp_道場サポ/04_Attendance.js"
]);
vm.runInThisContext(attendanceCode);

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
globalThis.getTeachers = () => [{ teacher_id: "T001", "出席受付可": true, "状態": "有効" }];
globalThis.getLocations = () => [{ location_id: "HONBU", "状態": "有効" }];
globalThis.getMembers = () => [{ member_id: "M001", "状態": "有効" }];
globalThis.getTrainingSlots = () => [
  { slot_id: "S1", location_id: "HONBU", billing_block_id: "B1", "開始時刻": "10:30", "終了時刻": "11:30", "稽古時間分": 60, "状態": "有効" },
  { slot_id: "S2", location_id: "HONBU", billing_block_id: "B1", "開始時刻": "11:30", "終了時刻": "12:30", "稽古時間分": 60, "状態": "有効" }
];
globalThis.getActiveAttendanceRowsForScope = () => [
  { _rowNumber: 2, member_id: "M001", slot_id: "S1", "状態": "有効" }
];
let appendedRows = [];
let cancelledRows = [];
globalThis.appendAttendanceRows = (ctx, rows) => { appendedRows = rows; };
globalThis.cancelAttendanceRows = (ctx, rows) => { cancelledRows = rows; };

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
if (clearRegistration.registered_count !== 0 || clearRegistration.cancelled_count !== 1 || appendedRows.length !== 0) {
  throw new Error("clear attendance synchronization mismatch");
}
console.log("Attendance clear synchronization: OK (no selection => cancel active slots)");

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
