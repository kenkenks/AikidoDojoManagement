import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../web/qr/virtual_session.js", import.meta.url), "utf8");
const values = new Map();
const events = [];
const sessionStorage = {
  getItem: key => values.has(key) ? values.get(key) : null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key)
};
const window = { dispatchEvent(event) { events.push(event); } };
const context = {
  window,
  sessionStorage,
  CustomEvent: function(type, options) { this.type = type; this.detail = options.detail; },
  Date
};
vm.runInNewContext(source, context);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const teacher = window.DojoVirtualSession.loginTeacher(" T001 ", "TEST");
assert(teacher.role === "TEACHER", "先生ロールを保存できません。");
assert(teacher.teacher_id === "T001" && teacher.member_id === "", "先生IDの正規化に失敗しました。");
assert(teacher.context.location_id === "", "初期コンテキストが空ではありません。");

const scoped = window.DojoVirtualSession.setContext({
  location_id: " HONBU ",
  billing_block_id: "B_KYO_MON_1030_1230"
});
assert(scoped.context.location_id === "HONBU", "道場コンテキストを保持できません。");
assert(scoped.context.billing_block_id === "B_KYO_MON_1030_1230", "課金枠コンテキストを保持できません。");
assert(scoped.teacher_id === "T001", "コンテキスト更新でログイン主体が壊れました。");

let rejected = false;
try {
  window.DojoVirtualSession.setContext({ member_id: "M001" });
} catch (error) {
  rejected = /保持対象外/.test(error.message);
}
assert(rejected, "責任範囲外の項目を拒否できません。");

const cleared = window.DojoVirtualSession.clearContext();
assert(cleared.context.location_id === "" && cleared.context.billing_block_id === "", "業務コンテキストを解除できません。");

const member = window.DojoVirtualSession.loginMember("M001", "TEST");
assert(member.role === "MEMBER" && member.member_id === "M001" && member.teacher_id === "", "会員セッションへ切り替えできません。");
assert(member.context.location_id === "", "主体切替時に旧コンテキストが残っています。");
assert(member.logged_in_at && member.last_accessed_at, "将来のタイムアウト用時刻がありません。");

values.set("aikido_dojo_virtual_session_v1", "{broken-json");
assert(window.DojoVirtualSession.get() === null, "破損セッションを無効化できません。");
assert(!values.has("aikido_dojo_virtual_session_v1"), "破損セッションがStorageに残っています。");

window.DojoVirtualSession.loginMember("M001", "TEST");
window.DojoVirtualSession.logout();
assert(window.DojoVirtualSession.get() === null, "ログアウト後もセッションが残っています。");
assert(events.length >= 5, "セッション変更イベントが不足しています。");

console.log("PASS: 仮想ログインの保持・コンテキスト更新・破損復旧・ログアウト");
