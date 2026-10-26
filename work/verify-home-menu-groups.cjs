const assert = require("node:assert/strict");
const fs = require("node:fs");

const teacher = fs.readFileSync("web/qr/teacher_home.html", "utf8");
const member = fs.readFileSync("web/qr/member_home.html", "utf8");

function group(html, heading) {
  const start = html.indexOf(`<h2>${heading}</h2>`);
  assert.notEqual(start, -1, `missing group: ${heading}`);
  const end = html.indexOf("</section>", start);
  assert.notEqual(end, -1, `unclosed group: ${heading}`);
  return html.slice(start, end);
}

function assertLinksInOrder(html, links) {
  let cursor = -1;
  for (const [href, label] of links) {
    const marker = `href="${href}">${label}</a>`;
    const index = html.indexOf(marker);
    assert.ok(index > cursor, `missing or out of order: ${label}`);
    cursor = index;
  }
}

const teacherGroups = [
  ["🥋 稽古・出席", [
    ["attendanceCheck.html", "📅 出席確認"],
    ["teacher_attendance.html", "🥋 先生出席"],
    ["../examination/member_progress.html", "📈 稽古・審査進捗"],
    ["paper_attendance_review.html", "📷 紙の出席記録取込"]
  ]],
  ["👥 会員・審査", [
    ["member_management.html", "👥 会員管理"],
    ["examination/index.html", "📋 審査管理（画面試作）"],
    ["qr_generator.html", "🔳 QR生成"]
  ]],
  ["💴 会費・決済", [
    ["payment_teacher.html", "💴 会費受付"],
    ["payment_status.html", "💰 会費状況"],
    ["paymentEvidence.html", "📲 決済コード確認（仮ページ）"]
  ]],
  ["⚙️ その他", [
    ["#", "📊 月次処理（準備中）"],
    ["#", "📢 お知らせ（準備中）"]
  ]]
];

const memberGroups = [
  ["🥋 稽古・審査", [
    ["attendance.html", "🥋 出席登録"],
    ["attendance_summary.html", "📅 出席・審査進捗"],
    ["paper_attendance_member.html", "📷 紙の出席記録読取"]
  ]],
  ["💴 会費・決済", [
    ["paypay_code.html", "📲 PayPay決済コード登録"],
    ["#", "💰 会費状況（準備中）"]
  ]],
  ["📢 お知らせ", [["#", "📢 お知らせ（準備中）"]]]
];

for (const [heading, links] of teacherGroups) assertLinksInOrder(group(teacher, heading), links);
for (const [heading, links] of memberGroups) assertLinksInOrder(group(member, heading), links);

assert.equal((teacher.match(/class="button teacher-link"/g) || []).length, 12);
assert.equal((member.match(/class="button member-link"/g) || []).length, 6);
assert.match(member, /id="attendanceSummaryLink" href="attendance_summary\.html"/);
assert.match(member, /attendance_summary\.html\?member_id=/);
for (const html of [teacher, member]) {
  assert.match(html, /id="gasResponseTime" class="note">応答：計測中\.\.\.<\/span>/);
  assert.match(html, /root\.textContent = "応答：" \+ label/);
  assert.doesNotMatch(html, /GAS応答：/);
  assert.ok(html.includes('"TIMEOUT (" + (elapsedMs / 1000).toFixed(2) + "秒)"'));
}

console.log("PASS teacher/member grouped home menu contract");
