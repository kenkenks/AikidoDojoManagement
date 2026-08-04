import fs from "node:fs";
import vm from "node:vm";

const story = "SESSION-QR-002";
const task = "TASK-DEV-023";
const sessionSource = fs.readFileSync(new URL("../web/qr/virtual_session.js", import.meta.url), "utf8");
const attendanceCheckHtml = fs.readFileSync(new URL("../web/qr/attendanceCheck.html", import.meta.url), "utf8");

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

  for (let index = brace; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`${name} の終端が見つかりません。`);
}

function runStep(steps, phase, title, fn) {
  const startedAt = Date.now();
  try {
    const result = fn() || {};
    steps.push({
      ok: result.ok !== false,
      phase,
      title,
      elapsed_ms: Date.now() - startedAt,
      result
    });
  } catch (error) {
    steps.push({
      ok: false,
      phase,
      title,
      elapsed_ms: Date.now() - startedAt,
      result: {
        ok: false,
        message: error.message,
        stack: error.stack || ""
      }
    });
  }
}

const initializeFromPageUrl = extractFunction(attendanceCheckHtml, "initializeFromPageUrl");
const persistAttendanceContext = extractFunction(attendanceCheckHtml, "persistAttendanceContext");

const values = new Map();
const events = [];
const elements = new Map();
const logs = [];
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
  loadAttendanceSessionInfo() {},
  addLog(message, className) { logs.push({ message, className: className || "" }); }
};
vm.createContext(sandbox);
vm.runInContext(sessionSource, sandbox);
sandbox.DojoVirtualSession = sandbox.window.DojoVirtualSession;

function runAttendanceCheckEntry(search) {
  sandbox.window.location.search = search;
  sandbox.location.search = search;
  vm.runInContext(`
    (() => {
      let currentLocationId = "";
      let currentTeacherId = "";
      let currentBillingBlockId = "";
      ${persistAttendanceContext}
      ${initializeFromPageUrl}
      initializeFromPageUrl();
      attendanceCheckEntryResult = {
        currentLocationId,
        currentTeacherId,
        currentBillingBlockId
      };
    })();
  `, sandbox);
  return structuredClone(sandbox.attendanceCheckEntryResult);
}

const startedAt = Date.now();
const steps = [];
const teacherId = "T001";

runStep(steps, "Prepare", "既存の仮想Sessionを初期化する", function() {
  sandbox.DojoVirtualSession.logout();
  return {
    ok: sandbox.DojoVirtualSession.get() === null,
    message: "Sessionを未ログイン状態にしました。"
  };
});

runStep(steps, "Entry", "先生QRと同じURLでAttendanceCheckを起動する", function() {
  const result = runAttendanceCheckEntry(`?teacher_id=${teacherId}`);
  return {
    ok: true,
    route: `/attendanceCheck?teacher_id=${teacherId}`,
    page_result: result,
    message: "先生QR起動ルートを実行しました。"
  };
});

runStep(steps, "Verify", "先生主体のSessionが生成・保持されることを検証する", function() {
  const session = sandbox.DojoVirtualSession.get();
  const checks = [
    {
      name: "session_created",
      ok: session !== null,
      expected: "TEACHER session",
      actual: session
    },
    {
      name: "role_teacher",
      ok: Boolean(session && session.role === "TEACHER"),
      expected: "TEACHER",
      actual: session ? session.role : null
    },
    {
      name: "teacher_id_preserved",
      ok: Boolean(session && session.teacher_id === teacherId && session.subject_id === teacherId),
      expected: teacherId,
      actual: session ? { teacher_id: session.teacher_id, subject_id: session.subject_id } : null
    },
    {
      name: "member_id_empty",
      ok: Boolean(session && !session.member_id),
      expected: "empty",
      actual: session ? session.member_id : null
    },
    {
      name: "context_teacher_id_preserved",
      ok: Boolean(session && session.context && session.context.teacher_id === teacherId),
      expected: teacherId,
      actual: session && session.context ? session.context.teacher_id : null
    }
  ];
  const ok = checks.every(check => check.ok);
  return {
    ok,
    checks,
    session,
    expected_flow: "teacher QR -> TEACHER session -> attendanceCheck",
    message: ok
      ? "先生QR起動で先生SessionとContextが保持されました。"
      : "先生QR起動で先生SessionまたはContextが生成・保持されていません。"
  };
});

const failed = steps.filter(step => !step.ok).length;
const summary = {
  ok: failed === 0,
  story,
  task,
  runner_mode: "BROWSER_ENTRY_CONTRACT",
  pattern: "TEACHER_QR_ATTENDANCE_CHECK_ENTRY",
  total: steps.length,
  success: steps.length - failed,
  failed,
  elapsed_ms: Date.now() - startedAt,
  steps,
  message: failed === 0 ? `${story} PASS` : `${story} FAIL`
};

console.log(JSON.stringify(summary, null, 2));
if (!summary.ok) process.exitCode = 1;
