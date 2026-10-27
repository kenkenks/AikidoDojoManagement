const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const css = fs.readFileSync(path.join(root, "web", "qr", "common.css"), "utf8");
const memberHome = fs.readFileSync(path.join(root, "web", "qr", "member_home.html"), "utf8");

test("page width classes are opt-in and use the agreed maximum widths", () => {
  assert.match(css, /body\.page-standard\s*\{\s*max-width:\s*760px;\s*\}/);
  assert.match(css, /body\.page-workflow\s*\{\s*max-width:\s*920px;\s*\}/);
  assert.match(css, /body\.page-wide\s*\{\s*max-width:\s*1200px;\s*\}/);
  assert.match(css, /body\.page-standard,[\s\S]*width:\s*100%;[\s\S]*margin-left:\s*auto;[\s\S]*margin-right:\s*auto;/);
});

test("member home opts into the standard width without changing its theme", () => {
  assert.match(memberHome, /<body class="member page-standard">/);
});

test("member menu and parameter-aware progress link remain intact", () => {
  const expectedLinks = [
    'href="attendance.html"',
    'id="attendanceSummaryLink" href="attendance_summary.html"',
    'href="paper_attendance_member.html"',
    'href="paypay_code.html"',
  ];
  expectedLinks.forEach((link) => assert.ok(memberHome.includes(link), link));
  assert.match(memberHome, /attendance_summary\.html\?member_id=" \+ encodeURIComponent\(memberId\)/);
});

test("page width classes are limited to approved responsive pages", () => {
  const qrDir = path.join(root, "web", "qr");
  const approvedPages = ["member_home.html", "teacher_home.html", "attendance_summary.html", "attendance.html"];
  const unexpected = fs.readdirSync(qrDir)
    .filter((name) => name.endsWith(".html") && !approvedPages.includes(name))
    .filter((name) => /\bpage-(?:standard|workflow|wide)\b/.test(
      fs.readFileSync(path.join(qrDir, name), "utf8"),
    ));
  assert.deepEqual(unexpected, []);
  const teacherHome = fs.readFileSync(path.join(qrDir, "teacher_home.html"), "utf8");
  assert.match(teacherHome, /<body class="teacher page-standard">/);
  const attendanceSummary = fs.readFileSync(path.join(qrDir, "attendance_summary.html"), "utf8");
  assert.match(attendanceSummary, /<body class="member page-standard">/);
  assert.match(attendanceSummary, /id="backLink">会員ホームへ戻る<\/a>/);
  const attendance = fs.readFileSync(path.join(qrDir, "attendance.html"), "utf8");
  assert.match(attendance, /<link rel="stylesheet" href="common\.css">/);
  assert.match(attendance, /<body class="page-workflow">/);
  assert.match(attendance, /id="memberCandidates"/);
  assert.match(attendance, /id="sendButton"[^>]+onclick="sendCandidatesToGas\(\)"/);
  assert.match(attendance, /<a href="member_home\.html">会員ホーム<\/a>/);
});
