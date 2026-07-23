import fs from "node:fs";

const core = fs.readFileSync(new URL("../gas/16_TeacherAttendance.js", import.meta.url), "utf8");
const web = fs.readFileSync(new URL("../gas/WebConnect.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../web/qr/teacher_attendance.html", import.meta.url), "utf8");
const systemContext = fs.readFileSync(new URL("../web/qr/system_context.js", import.meta.url), "utf8");
const context = fs.readFileSync(new URL("../gas/sheetContext.js", import.meta.url), "utf8");

const checks = [
  [core.includes('const TEACHER_ATTENDANCE_SHEET = "16_先生出席ログ"'), "先生出席を会員出席と別シートへ保存する"],
  [core.includes('"担当区分"'), "主先生・副先生を記録する"],
  [core.includes('"状態":"有効"'), "有効・取消履歴方式である"],
  [core.includes("teacherAttendance_validateWeekday_"), "稽古日と課金枠の曜日を検証する"],
  [core.includes("member_id:normalizeId_(teacher"), "先生と会員の任意リンクを保存する"],
  [core.includes("main_count") && core.includes("sub_count"), "月次で主先生・副先生を分けて数える"],
  [context.includes("function getTeacherAttendances"), "先生出席DAOがある"],
  [web.includes('data.mode === "teacher_attendance_sync"'), "POST入口がある"],
  [web.includes('params.action === "teacher_attendance_state"'), "状態取得入口がある"],
  [web.includes('params.action === "teacher_attendance_identity"'), "会員IDから先生IDを解決する入口がある"],
  [html.includes("先生出席を登録"), "専用画面がある"],
  [html.includes("member_id") && html.includes("setTeacherIdentity"), "会員QRを先生IDへ解決する"],
  [html.includes("dateWithWeekday"), "日付に曜日を表示する"],
  [html.includes("scriptErrorObserved=true"), "iPhoneの先行script errorでJSONPを即終了しない"],
  [!html.includes("initializeWithSystemContext()},4000"), "実時刻への4秒フォールバックを行わない"],
  [systemContext.includes("scriptErrorObserved = true"), "システム時刻JSONPもiPhoneの先行errorを待機する"]
];

const failed = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error("FAIL\n- " + failed.join("\n- "));
  process.exit(1);
}
console.log("PASS: 先生出席の登録・取消・曜日検証・月次集計契約");
