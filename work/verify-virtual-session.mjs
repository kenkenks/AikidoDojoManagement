import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../web/qr/virtual_session.js", import.meta.url), "utf8");
const values = new Map();
const sessionStorage = {
  getItem: key => values.has(key) ? values.get(key) : null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key)
};
const window = { dispatchEvent() {} };
const context = {
  window,
  sessionStorage,
  CustomEvent: function(type, options) { this.type = type; this.detail = options.detail; },
  Date
};
vm.runInNewContext(source, context);

const teacher = window.DojoVirtualSession.loginTeacher("T001", "TEST");
if (teacher.role !== "TEACHER" || teacher.teacher_id !== "T001" || teacher.member_id !== "") {
  throw new Error("先生セッションを保存できません。");
}
const member = window.DojoVirtualSession.loginMember("M001", "TEST");
if (member.role !== "MEMBER" || member.member_id !== "M001" || member.teacher_id !== "") {
  throw new Error("会員セッションへ切り替えできません。");
}
if (!member.logged_in_at || !member.last_accessed_at) {
  throw new Error("将来のタイムアウト用時刻がありません。");
}
window.DojoVirtualSession.logout();
if (window.DojoVirtualSession.get() !== null) {
  throw new Error("ログアウト後もセッションが残っています。");
}

console.log("PASS: 仮想ログインの保持・切替・ログアウト");
