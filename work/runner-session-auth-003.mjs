import fs from "node:fs";
import vm from "node:vm";

const story = "SESSION-AUTH-003";
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
const redirects = [];
let attendanceLoadCount = 0;

const sessionStorage = {
  getItem: key => values.has(key) ? values.get(key) : null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key)
};

const location = {
  search: "",
  href: "https://example.invalid/attendanceCheck",
  replace(target) {
    redirects.push(String(target));
    this.href = String(target);
  },
  assign(target) {
    redirects.push(String(target));
    this.href = String(target);
  }
};

const window = {
  location,
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
  location,
  document,
  sessionStorage,
  URLSearchParams,
  CustomEvent: function(type, options) { this.type = type; this.detail = options.detail; },
  Date,
  console,
  renderKeys() {},
  loadAttendanceSessionInfo() { attendanceLoadCount += 1; },
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
const memberId = "M001";

runStep(steps, "Prepare", "会員Sessionを生成する", function() {
  sandbox.DojoVirtualSession.logout();
  const session = sandbox.DojoVirtualSession.loginMember(memberId, "RUNNER_PREPARE");
  return {
    ok: Boolean(session && session.role === "MEMBER" && session.member_id === memberId),
    session,
    message: "会員Sessionを準備しました。"
  };
});

runStep(steps, "Entry", "会員Sessionのまま先生画面へアクセスする", function() {
  const result = runAttendanceCheckEntry("");
  return {
    ok: true,
    route: "/attendanceCheck",
    page_result: result,
    redirects: [...redirects],
    message: "会員Sessionで先生画面ルートを実行しました。"
  };
});

runStep(steps, "Verify", "先生画面への遷移拒否と会員Session保持を検証する", function() {
  const session = sandbox.DojoVirtualSession.get();
  const redirectTarget = redirects.length > 0 ? redirects[redirects.length - 1] : "";
  const redirectedToIndex = /(^|\/)(index(?:\.html)?(?:[?#].*)?$)/i.test(redirectTarget) || redirectTarget === "/" || redirectTarget === "./";
  const checks = [
    {
      name: "authority_denied",
      ok: redirects.length > 0,
      expected: "DENY and redirect",
      actual: redirects.length > 0 ? { redirects: [...redirects] } : "no redirect"
    },
    {
      name: "redirect_index",
      ok: redirectedToIndex,
      expected: "index",
      actual: redirectTarget || null
    },
    {
      name: "session_preserved",
      ok: Boolean(session && session.role === "MEMBER" && session.member_id === memberId),
      expected: { role: "MEMBER", member_id: memberId },
      actual: session
    },
    {
      name: "teacher_identity_not_granted",
      ok: Boolean(session && !session.teacher_id && session.subject_id === memberId),
      expected: { teacher_id: "", subject_id: memberId },
      actual: session ? { teacher_id: session.teacher_id, subject_id: session.subject_id } : null
    },
    {
      name: "teacher_business_not_loaded",
      ok: attendanceLoadCount === 0,
      expected: 0,
      actual: attendanceLoadCount
    }
  ];
  const ok = checks.every(check => check.ok);
  return {
    ok,
    checks,
    session,
    authority: ok ? "DENY" : "NOT_ENFORCED",
    expected_flow: "MEMBER session -> attendanceCheck -> DENY -> index; MEMBER session preserved",
    message: ok
      ? "会員Sessionの先生画面遷移が拒否され、Sessionは保持されました。"
      : "会員Sessionで先生画面へ遷移できる状態です。権限制御が成立していません。"
  };
});

const failed = steps.filter(step => !step.ok).length;
const summary = {
  ok: failed === 0,
  story,
  task,
  runner_mode: "BROWSER_AUTHORITY_CONTRACT",
  pattern: "MEMBER_SESSION_TO_TEACHER_PAGE_DENY",
  total: steps.length,
  success: steps.length - failed,
  failed,
  elapsed_ms: Date.now() - startedAt,
  steps,
  message: failed === 0 ? `${story} PASS` : `${story} FAIL`
};

console.log(JSON.stringify(summary, null, 2));
if (!summary.ok) process.exitCode = 1;
