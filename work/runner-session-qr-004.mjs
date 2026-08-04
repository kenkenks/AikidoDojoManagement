import fs from "node:fs";
import vm from "node:vm";

const story = "SESSION-QR-004";
const task = "TASK-DEV-023";
const sessionSource = fs.readFileSync(new URL("../web/qr/virtual_session.js", import.meta.url), "utf8");
const payPayHtml = fs.readFileSync(new URL("../web/qr/paypay_code.html", import.meta.url), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractLoadCallbackBody(source) {
  const markers = [
    'window.addEventListener("load", function() {',
    "window.addEventListener('load', function() {"
  ];
  const marker = markers.find(candidate => source.includes(candidate));
  assert(marker, "paypay_code.html のload起動処理が見つかりません。");

  const start = source.indexOf(marker);
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
      if (depth === 0) return source.slice(brace + 1, index);
    }
  }
  throw new Error("paypay_code.html のload起動処理終端が見つかりません。");
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

const loadCallbackBody = extractLoadCallbackBody(payPayHtml);
const values = new Map();
const events = [];
const elements = new Map();
const logs = [];
let startCallCount = 0;

const sessionStorage = {
  getItem: key => values.has(key) ? values.get(key) : null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key)
};

const location = {
  search: "",
  href: "https://example.invalid/paypay_code"
};

const window = {
  location,
  dispatchEvent(event) { events.push(event); }
};

const document = {
  getElementById(id) {
    if (!elements.has(id)) {
      elements.set(id, {
        value: "",
        textContent: "",
        className: "",
        style: { display: "" },
        innerHTML: ""
      });
    }
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
  addLog(message) { logs.push(String(message)); },
  startPayPayCode() { startCallCount += 1; }
};

vm.createContext(sandbox);
vm.runInContext(sessionSource, sandbox);
sandbox.DojoVirtualSession = sandbox.window.DojoVirtualSession;

function runPayPayEntry(search) {
  sandbox.window.location.search = search;
  sandbox.location.search = search;
  vm.runInContext(`(() => { ${loadCallbackBody} })();`, sandbox);
  return {
    member_id: document.getElementById("memberId").value,
    plan_id: document.getElementById("planId").value,
    start_call_count: startCallCount,
    logs: [...logs]
  };
}

const startedAt = Date.now();
const steps = [];
const memberId = "M001";
const planId = "P001";

runStep(steps, "Prepare", "既存の仮想Sessionを初期化する", function() {
  sandbox.DojoVirtualSession.logout();
  return {
    ok: sandbox.DojoVirtualSession.get() === null,
    observation_scope: {
      subject: "MEMBER",
      session: "MEMBER active",
      context: "Payment plan",
      business: "PayPay entry",
      view: "paypay_code"
    },
    message: "Sessionを未ログイン状態にしました。"
  };
});

runStep(steps, "Entry", "月謝袋QRと同じURLでPayPayコード画面を起動する", function() {
  const result = runPayPayEntry(`?member_id=${memberId}&plan_id=${planId}`);
  return {
    ok: true,
    route: `/paypay_code?member_id=${memberId}&plan_id=${planId}`,
    page_result: result,
    message: "月謝袋QR起動ルートを実行しました。"
  };
});

runStep(steps, "Verify", "会員Sessionと支払Contextが分離して保持されることを検証する", function() {
  const session = sandbox.DojoVirtualSession.get();
  const pageMemberId = document.getElementById("memberId").value;
  const pagePlanId = document.getElementById("planId").value;
  const planMixedIntoSubject = Boolean(session && (
    Object.prototype.hasOwnProperty.call(session, "plan_id") ||
    session.subject_id === planId ||
    session.member_id === planId
  ));

  const checks = [
    {
      name: "session_created",
      ok: session !== null,
      expected: "MEMBER session",
      actual: session
    },
    {
      name: "role_member",
      ok: Boolean(session && session.role === "MEMBER"),
      expected: "MEMBER",
      actual: session ? session.role : null
    },
    {
      name: "member_id_preserved",
      ok: Boolean(session && session.member_id === memberId && session.subject_id === memberId),
      expected: memberId,
      actual: session ? { member_id: session.member_id, subject_id: session.subject_id } : null
    },
    {
      name: "teacher_id_empty",
      ok: Boolean(session && !session.teacher_id),
      expected: "empty",
      actual: session ? session.teacher_id : null
    },
    {
      name: "payment_context_member_id",
      ok: pageMemberId === memberId,
      expected: memberId,
      actual: pageMemberId
    },
    {
      name: "payment_context_plan_id",
      ok: pagePlanId === planId,
      expected: planId,
      actual: pagePlanId
    },
    {
      name: "plan_id_not_mixed_into_subject",
      ok: Boolean(session && !planMixedIntoSubject),
      expected: "plan_id is Payment Context only",
      actual: session
    },
    {
      name: "payment_view_ready",
      ok: startCallCount === 1,
      expected: 1,
      actual: startCallCount
    }
  ];

  const ok = checks.every(check => check.ok);
  return {
    ok,
    checks,
    session,
    payment_context: {
      member_id: pageMemberId,
      plan_id: pagePlanId
    },
    expected_flow: "monthly envelope QR -> MEMBER session + Payment Context -> paypay_code",
    message: ok
      ? "月謝袋QR起動で会員Sessionと支払Contextが分離して保持されました。"
      : "月謝袋QR起動で会員Sessionまたは支払Contextの契約が成立していません。"
  };
});

const failed = steps.filter(step => !step.ok).length;
const summary = {
  ok: failed === 0,
  story,
  task,
  runner_mode: "BROWSER_ENTRY_CONTRACT",
  pattern: "PAYMENT_ENVELOPE_QR_PAYPAY_ENTRY",
  total: steps.length,
  success: steps.length - failed,
  failed,
  elapsed_ms: Date.now() - startedAt,
  steps,
  message: failed === 0 ? `${story} PASS` : `${story} FAIL`
};

console.log(JSON.stringify(summary, null, 2));
if (!summary.ok) process.exitCode = 1;
