import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../web/qr/payment_teacher.html", import.meta.url), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = html.indexOf(marker);
  assert(start >= 0, `${name} が見つかりません。`);
  const brace = html.indexOf("{", start);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let i = brace; i < html.length; i += 1) {
    const ch = html[i];
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
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error(`${name} の終端が見つかりません。`);
}

const saveSource = extractFunction("saveReceptionScopeToSession");
const initSource = extractFunction("initializeReceptionScopeFromUrl");

assert(/saveReceptionScopeToSession\(\);\s*updateReceptionScope\(\)/.test(html), "道場・課金枠QR後にContextを保存していません。");
assert(/loginTeacher\(currentTeacherId, "SCREEN_QR"\);\s*saveReceptionScopeToSession\(\)/.test(html), "先生QR後にContextを保存していません。");
assert(/params\.get\("location_id"\) \|\| sessionContext\.location_id/.test(initSource), "location_id のURL優先・Session補完がありません。");
assert(/params\.get\("billing_block_id"\) \|\| sessionContext\.billing_block_id/.test(initSource), "billing_block_id のURL優先・Session補完がありません。");
assert(/teacherSession\.teacher_id === urlTeacherId/.test(initSource), "別先生SessionのContext流用防止がありません。");

function runInitialize({ search, session }) {
  let storedSession = session ? structuredClone(session) : null;
  const writes = [];
  const elements = new Map();
  const sandbox = {
    URLSearchParams,
    location: { search },
    currentLocationId: "",
    currentTeacherId: "",
    currentBillingBlockId: "",
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, { textContent: "", className: "" });
        return elements.get(id);
      }
    },
    DojoVirtualSession: {
      get() { return storedSession ? structuredClone(storedSession) : null; },
      loginTeacher(teacherId, source) {
        storedSession = {
          role: "TEACHER",
          subject_id: teacherId,
          teacher_id: teacherId,
          member_id: "",
          source,
          context: { location_id: "", teacher_id: "", billing_block_id: "" }
        };
        return storedSession;
      },
      setContext(patch) {
        if (!storedSession) throw new Error("no session");
        storedSession.context = { ...storedSession.context, ...patch };
        writes.push(structuredClone(patch));
        return storedSession;
      }
    },
    updateReceptionScope() {}
  };
  const source = `
    let currentLocationId = "";
    let currentTeacherId = "";
    let currentBillingBlockId = "";
    ${saveSource}
    ${initSource}
    initializeReceptionScopeFromUrl();
    result = { currentLocationId, currentTeacherId, currentBillingBlockId };
  `;
  sandbox.result = null;
  vm.runInNewContext(source, sandbox);
  return { result: sandbox.result, storedSession, writes };
}

const baseSession = {
  role: "TEACHER",
  subject_id: "T001",
  teacher_id: "T001",
  member_id: "",
  context: {
    location_id: "HONBU",
    teacher_id: "T001",
    billing_block_id: "B_SESSION"
  }
};

const supplemented = runInitialize({ search: "", session: baseSession });
assert(supplemented.result.currentLocationId === "HONBU", "Sessionから道場を補完できません。" );
assert(supplemented.result.currentTeacherId === "T001", "Sessionから先生を補完できません。" );
assert(supplemented.result.currentBillingBlockId === "B_SESSION", "Sessionから課金枠を補完できません。" );

const urlPriority = runInitialize({
  search: "?location_id=KYO&billing_block_id=B_URL",
  session: baseSession
});
assert(urlPriority.result.currentLocationId === "KYO", "URLの道場がSessionより優先されていません。" );
assert(urlPriority.result.currentBillingBlockId === "B_URL", "URLの課金枠がSessionより優先されていません。" );

const switched = runInitialize({
  search: "?teacher_id=T002",
  session: baseSession
});
assert(switched.result.currentTeacherId === "T002", "URLの先生へ切り替えできません。" );
assert(switched.result.currentLocationId === "", "別先生へ旧道場Contextを引き継いでいます。" );
assert(switched.result.currentBillingBlockId === "", "別先生へ旧課金枠Contextを引き継いでいます。" );
assert(switched.storedSession.context.teacher_id === "T002", "切替後の先生Contextを保存できません。" );

console.log("PASS: Payment画面のURL優先・Session補完・別先生Context分離・Context保存");
