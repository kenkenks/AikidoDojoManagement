import fs from "node:fs";
import vm from "node:vm";

const story = "SESSION-QR-005";
const task = "TASK-DEV-023";
const sessionSource = fs.readFileSync(new URL("../web/qr/virtual_session.js", import.meta.url), "utf8");
const indexHtml = fs.readFileSync(new URL("../web/qr/index.html", import.meta.url), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractInlineScript(source) {
  const scripts = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1])
    .filter(body => body.trim());
  assert(scripts.length > 0, "index.html のインライン起動処理が見つかりません。");
  return scripts[scripts.length - 1];
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

const sharedValues = new Map();
const indexScript = extractInlineScript(indexHtml);

const sharedSessionStorage = {
  getItem: key => sharedValues.has(key) ? sharedValues.get(key) : null,
  setItem: (key, value) => sharedValues.set(key, String(value)),
  removeItem: key => sharedValues.delete(key),
  clear: () => sharedValues.clear(),
  key: index => [...sharedValues.keys()][index] ?? null,
  get length() { return sharedValues.size; }
};

function createPage(search = "") {
  const elements = new Map();
  const events = [];
  const redirects = [];

  const location = {
    search,
    pathname: "/",
    href: `https://example.invalid/${search}`,
    assign(value) { redirects.push(String(value)); this.href = String(value); },
    replace(value) { redirects.push(String(value)); this.href = String(value); }
  };

  const window = {
    location,
    dispatchEvent(event) { events.push(event); },
    addEventListener() {}
  };

  const document = {
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, {
          id,
          value: "",
          textContent: "",
          className: "",
          innerHTML: "",
          style: { display: "" }
        });
      }
      return elements.get(id);
    }
  };

  const history = {
    replaceState() {},
    pushState() {}
  };

  const sandbox = {
    window,
    location,
    document,
    history,
    sessionStorage: sharedSessionStorage,
    URL,
    URLSearchParams,
    CustomEvent: function(type, options) { this.type = type; this.detail = options?.detail; },
    Date,
    console,
    setTimeout(fn) { if (typeof fn === "function") fn(); return 1; },
    clearTimeout() {},
    Html5Qrcode: function() {}
  };

  vm.createContext(sandbox);
  vm.runInContext(sessionSource, sandbox);
  sandbox.DojoVirtualSession = sandbox.window.DojoVirtualSession;
  vm.runInContext(indexScript, sandbox);

  return { sandbox, elements, events, redirects };
}

function findLocationId(value) {
  if (!value) return "";
  if (typeof value === "object") {
    if (typeof value.location_id === "string" && value.location_id.trim()) {
      return value.location_id.trim();
    }
    for (const nested of Object.values(value)) {
      const found = findLocationId(nested);
      if (found) return found;
    }
  }
  return "";
}

function observeStoredLocation() {
  for (const [key, rawValue] of sharedValues.entries()) {
    if (/location/i.test(key) && String(rawValue).trim() && !String(rawValue).trim().startsWith("{")) {
      return String(rawValue).trim();
    }
    try {
      const found = findLocationId(JSON.parse(rawValue));
      if (found) return found;
    } catch (error) {
      // JSON以外の保持形式も許容するため無視する。
    }
  }
  return "";
}

const startedAt = Date.now();
const steps = [];
const memberLocationId = "HONBU";
const changedTeacherLocationId = "BRANCH_TEST";

runStep(steps, "Prepare", "道場ContextとSessionを初期化する", function() {
  sharedSessionStorage.clear();
  return {
    ok: sharedValues.size === 0,
    observation_scope: {
      subject: "none / MEMBER / TEACHER",
      session: "subject preserved",
      context: "location_id",
      business: "none",
      view: "index"
    },
    message: "SessionStorageを初期化しました。"
  };
});

runStep(steps, "MemberLocationEntry", "未ログインで道場QRからLocation Contextを保持する", function() {
  const page = createPage(`?location_id=${memberLocationId}`);
  const session = page.sandbox.DojoVirtualSession.get();
  const storedLocationId = observeStoredLocation();
  return {
    ok: true,
    route: `/?location_id=${memberLocationId}`,
    session,
    stored_location_id: storedLocationId,
    redirects: page.redirects,
    message: "未ログイン状態で道場QR起動ルートを実行しました。"
  };
});

runStep(steps, "MemberVerify", "会員ログイン後も道場Contextが継承されることを検証する", function() {
  const beforeLoginLocationId = observeStoredLocation();
  const page = createPage("");
  const beforeLoginSession = page.sandbox.DojoVirtualSession.get();
  page.sandbox.DojoVirtualSession.loginMember("M001", "MEMBER_CARD_QR");
  const session = page.sandbox.DojoVirtualSession.get();

  const checks = [
    {
      name: "location_context_created_without_subject",
      ok: beforeLoginLocationId === memberLocationId,
      expected: memberLocationId,
      actual: beforeLoginLocationId
    },
    {
      name: "subject_not_created_by_dojo_qr",
      ok: beforeLoginSession === null,
      expected: "no subject session",
      actual: beforeLoginSession
    },
    {
      name: "member_session_created_after_member_qr",
      ok: Boolean(session && session.role === "MEMBER" && session.member_id === "M001"),
      expected: { role: "MEMBER", member_id: "M001" },
      actual: session
    },
    {
      name: "member_location_context_preserved",
      ok: Boolean(session && session.context?.location_id === memberLocationId),
      expected: memberLocationId,
      actual: session?.context?.location_id ?? null
    }
  ];

  const ok = checks.every(check => check.ok);
  return {
    ok,
    checks,
    session,
    expected_flow: "dojo QR -> pending Location Context -> member QR -> MEMBER session + same location",
    message: ok
      ? "会員運用で道場Contextが主体生成前後を通して保持されました。"
      : "会員運用で道場Contextの保持または会員Sessionへの継承が成立していません。"
  };
});

runStep(steps, "TeacherEntry", "先生Sessionのまま道場Contextを変更する", function() {
  sharedSessionStorage.clear();
  const loginPage = createPage("");
  loginPage.sandbox.DojoVirtualSession.loginTeacher("T001", "TEACHER_QR");

  const firstPage = createPage(`?location_id=${memberLocationId}`);
  const firstSession = firstPage.sandbox.DojoVirtualSession.get();

  const secondPage = createPage(`?location_id=${changedTeacherLocationId}`);
  const changedSession = secondPage.sandbox.DojoVirtualSession.get();

  return {
    ok: true,
    first_session: firstSession,
    changed_session: changedSession,
    routes: [
      `/?location_id=${memberLocationId}`,
      `/?location_id=${changedTeacherLocationId}`
    ],
    message: "先生Sessionで道場QRを2回読み取りました。"
  };
});

runStep(steps, "TeacherVerify", "先生主体を維持したままLocation Contextだけ変更されることを検証する", function() {
  const page = createPage("");
  const session = page.sandbox.DojoVirtualSession.get();
  const checks = [
    {
      name: "teacher_session_preserved",
      ok: Boolean(session && session.role === "TEACHER" && session.teacher_id === "T001" && session.subject_id === "T001"),
      expected: { role: "TEACHER", teacher_id: "T001" },
      actual: session
    },
    {
      name: "member_identity_not_granted",
      ok: Boolean(session && !session.member_id),
      expected: "empty",
      actual: session?.member_id ?? null
    },
    {
      name: "teacher_location_context_changed",
      ok: Boolean(session && session.context?.location_id === changedTeacherLocationId),
      expected: changedTeacherLocationId,
      actual: session?.context?.location_id ?? null
    },
    {
      name: "teacher_subject_not_changed_by_location",
      ok: Boolean(session && session.subject_id === "T001" && session.teacher_id === "T001"),
      expected: "T001",
      actual: session ? { subject_id: session.subject_id, teacher_id: session.teacher_id } : null
    }
  ];

  const ok = checks.every(check => check.ok);
  return {
    ok,
    checks,
    session,
    expected_flow: "TEACHER session -> dojo QR -> location change only; teacher subject preserved",
    message: ok
      ? "先生運用で主体を維持したまま道場Contextを変更できました。"
      : "先生運用で道場Context変更または先生主体維持の契約が成立していません。"
  };
});

const failed = steps.filter(step => !step.ok).length;
const summary = {
  ok: failed === 0,
  story,
  task,
  runner_mode: "BROWSER_CONTEXT_CONTRACT",
  pattern: "DOJO_QR_LOCATION_CONTEXT",
  total: steps.length,
  success: steps.length - failed,
  failed,
  elapsed_ms: Date.now() - startedAt,
  steps,
  message: failed === 0 ? `${story} PASS` : `${story} FAIL`
};

console.log(JSON.stringify(summary, null, 2));
if (!summary.ok) process.exitCode = 1;
