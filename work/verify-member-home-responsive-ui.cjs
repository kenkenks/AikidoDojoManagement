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

test("page width classes are not automatically applied to other QR pages", () => {
  const qrDir = path.join(root, "web", "qr");
  const unexpected = fs.readdirSync(qrDir)
    .filter((name) => name.endsWith(".html") && name !== "member_home.html")
    .filter((name) => /\bpage-(?:standard|workflow|wide)\b/.test(
      fs.readFileSync(path.join(qrDir, name), "utf8"),
    ));
  assert.deepEqual(unexpected, []);
});
