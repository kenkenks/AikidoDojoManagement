import fs from "node:fs";
import vm from "node:vm";

const sessionSource = fs.readFileSync(new URL("../web/qr/virtual_session.js", import.meta.url), "utf8");
const attendanceHtml = fs.readFileSync(new URL("../web/qr/attendance.html", import.meta.url), "utf8");
const paymentHtml = fs.readFileSync(new URL("../web/qr/payment_teacher.html", import.meta.url), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert(start >= 0, `${name} が見つかりません。`);
  const brace = source.indexOf("{", start);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let i = brace; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`${name} の終端が見つかりません。`);
}

const attendanceInitialize = extractFunction(attendanceHtml, "initializeAttendanceContext");
const attendancePersist = extractFunction(attendanceHtml, "persistAttendanceContext");
const paymentSave = extractFunction(paymentHtml, "saveReceptionScopeToSession");
const paymentInitialize = extractFunction(paymentHtml, "initializeReceptionScopeFromUrl");

const values = new Map();
const events = [];
const elements = new Map();
const sessionStorage = {
  getItem: key => values.has(key) ? values.get(key) : null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key)
};
const window = {
  location: { search: "" },
  dispatchEvent(event) { events.push(event); }
};
const document = {
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, { textContent: "", className: "" });
    return elements.get(id);
  }
};
const sandbox = {
  window,
  location: window.location,
  document,
  sessionStorage,
  URLSearchParams,
  CustomEvent: function(type, options) { this.type = type; this.detail = options.detail; },
  Date,
  console,
  renderKeys() {},
  addLog() {},
  loadAttendanceSessionInfo() {},
  updateReceptionScope() {}
};
vm.createContext(sandbox);
vm.runInContext(sessionSource, sandbox);
sandbox.DojoVirtualSession = sandbox.window.DojoVirtualSession;

function runAttendance(search) {
  sandbox.window.location.search = search;
  sandbox.location.search = search;
  vm.runInContext(`
    (() => {
      let currentLocationId = "";
      let currentTeacherId = "";
      let currentBillingBlockId = "";
      ${attendancePersist}
      ${attendanceInitialize}
      initializeAttendanceContext();
      attendanceResult = { currentLocationId, currentTeacherId, currentBillingBlockId };
    })();
  `, sandbox);
  return structuredClone(sandbox.attendanceResult);
}

function runPayment(search) {
  sandbox.window.location.search = search;
  sandbox.location.search = search;
  vm.runInContext(`
    (() => {
      let currentLocationId = "";
      let currentTeacherId = "";
      let currentBillingBlockId = "";
      ${paymentSave}
      ${paymentInitialize}
      initializeReceptionScopeFromUrl();
      paymentResult = { currentLocationId, currentTeacherId, currentBillingBlockId };
    })();
  `, sandbox);
  return structuredClone(sandbox.paymentResult);
}

console.log("STEP 1: 先生ログイン");
const login = sandbox.DojoVirtualSession.loginTeacher("T001", "STORY_RUNNER");
assert(login.role === "TEACHER" && login.teacher_id === "T001", "先生ログインに失敗しました。");
console.log("PASS: T001でSession生成");

console.log("STEP 2: Attendanceで道場・課金枠を確定");
const attendance = runAttendance("?location_id=HONBU&billing_block_id=B_KYO_MON_1030_1230");
assert(attendance.currentTeacherId === "T001", "Attendanceで先生Sessionを利用できません。");
assert(attendance.currentLocationId === "HONBU", "Attendanceで道場を確定できません。");
assert(attendance.currentBillingBlockId === "B_KYO_MON_1030_1230", "Attendanceで課金枠を確定できません。");
let stored = sandbox.DojoVirtualSession.get();
assert(stored.context.location_id === "HONBU", "Attendanceの道場Contextが保存されていません。");
assert(stored.context.billing_block_id === "B_KYO_MON_1030_1230", "Attendanceの課金枠Contextが保存されていません。");
console.log("PASS: AttendanceからSession Contextへ保存");

console.log("STEP 3: PaymentでAttendance Contextを継承");
const payment = runPayment("");
assert(payment.currentTeacherId === "T001", "Paymentで先生を継承できません。");
assert(payment.currentLocationId === "HONBU", "Paymentで道場を継承できません。");
assert(payment.currentBillingBlockId === "B_KYO_MON_1030_1230", "Paymentで課金枠を継承できません。");
console.log("PASS: Paymentが同一先生のContextを継承");

console.log("STEP 4: URLで別先生へ切替");
const switched = runPayment("?teacher_id=T002");
assert(switched.currentTeacherId === "T002", "別先生へ切り替えできません。");
assert(switched.currentLocationId === "", "別先生へ旧道場Contextを引き継いでいます。");
assert(switched.currentBillingBlockId === "", "別先生へ旧課金枠Contextを引き継いでいます。");
stored = sandbox.DojoVirtualSession.get();
assert(stored.teacher_id === "T002", "Session主体がT002へ切り替わっていません。");
assert(stored.context.location_id === "" && stored.context.billing_block_id === "", "主体切替後のContextが空ではありません。");
console.log("PASS: 主体切替で旧Contextを分離");

console.log("STEP 5: Logout");
sandbox.DojoVirtualSession.logout();
assert(sandbox.DojoVirtualSession.get() === null, "Logout後もSessionが残っています。");
assert(events.some(event => event.detail === null), "Logoutイベントが発行されていません。");
console.log("PASS: Session破棄");

console.log("PASS: Session Story 001 先生ログイン→Attendance→Payment→別先生切替→Logout");
