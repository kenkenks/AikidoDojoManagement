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
  const approvedPages = [
    "member_home.html", "teacher_home.html", "attendance_summary.html", "attendance.html",
    "paper_attendance_member.html", "paymentEvidence.html", "teacher_attendance.html",
    "member_management.html", "attendanceCheck.html", "payment_teacher.html",
    "paper_attendance_review.html", "index.html"
  ];
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
  assert.match(attendanceSummary, /id="backLink">← 会員ホームへ戻る<\/a>/);
  const attendance = fs.readFileSync(path.join(qrDir, "attendance.html"), "utf8");
  assert.match(attendance, /<link rel="stylesheet" href="common\.css">/);
  assert.match(attendance, /<body class="member page-workflow">/);
  assert.match(attendance, /id="memberCandidates"/);
  assert.match(attendance, /id="sendButton"[^>]+onclick="sendCandidatesToGas\(\)"/);
  assert.match(attendance, /<a href="member_home\.html">← 会員ホームへ戻る<\/a>/);
  const paperAttendance = fs.readFileSync(path.join(qrDir, "paper_attendance_member.html"), "utf8");
  assert.match(paperAttendance, /<body class="member page-wide">/);
  assert.match(paperAttendance, /class="cell-grid-wrap"><div id="cellGrid" class="cell-grid">/);
  assert.match(paperAttendance, /\.cell-grid-wrap\{overflow:auto;max-width:100%/);
  assert.match(paperAttendance, /\.sheet-image\{[^}]*width:auto;height:auto;max-width:100%;max-height:70vh/);
  assert.match(paperAttendance, /id="homeTopLink" href="member_home\.html">← 会員ホームへ戻る<\/a>/);
  const memberManagement = fs.readFileSync(path.join(qrDir, "member_management.html"), "utf8");
  assert.match(memberManagement, /<body class="teacher page-workflow">/);
  assert.match(memberManagement, /\.form-grid\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(220px,1fr\)\)/);
  assert.match(memberManagement, /\.choice-list\{[^}]*max-height:320px;overflow:auto/);
  assert.match(memberManagement, /id="teacherHomeTopLink" href="teacher_home\.html">← 先生ホームへ戻る<\/a>/);
  const attendanceCheck = fs.readFileSync(path.join(qrDir, "attendanceCheck.html"), "utf8");
  assert.match(attendanceCheck, /<body class="teacher page-workflow">/);
  assert.match(attendanceCheck, /body \{ padding:10px; max-width:920px; margin:auto; \}/);
  assert.match(attendanceCheck, /<a href="teacher_home\.html">← 先生ホームへ戻る<\/a>/);
  assert.match(attendanceCheck, /id="memberCandidates"/);
  const paymentTeacher = fs.readFileSync(path.join(qrDir, "payment_teacher.html"), "utf8");
  assert.match(paymentTeacher, /<body class="teacher page-workflow">/);
  assert.match(paymentTeacher, /body \{ padding: 10px; max-width: 920px; margin: auto; \}/);
  assert.match(paymentTeacher, /class="scope-strip card"/);
  assert.match(paymentTeacher, /<a href="teacher_home\.html">← 先生ホームへ戻る<\/a>/);
  const paperAttendanceReview = fs.readFileSync(path.join(qrDir, "paper_attendance_review.html"), "utf8");
  assert.match(paperAttendanceReview, /<body class="teacher page-wide">/);
  assert.match(paperAttendanceReview, /\.source-layout\{display:grid;grid-template-columns:minmax\(0,1\.2fr\) minmax\(260px,\.8fr\)/);
  assert.match(paperAttendanceReview, /\.cell-grid-wrap\{overflow:auto;max-width:100%;overscroll-behavior-inline:contain\}/);
  assert.match(paperAttendanceReview, /\.sheet-image\{display:block;width:auto;height:auto;max-width:100%;max-height:70vh/);
  assert.match(paperAttendanceReview, /@media\(max-width:760px\)\{\.source-layout,\.detail-grid\{grid-template-columns:1fr\}/);
});
