const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('teacher standard pages use the approved centered width without changing navigation', () => {
  const evidence = read('web/qr/paymentEvidence.html');
  const attendance = read('web/qr/teacher_attendance.html');
  assert.match(evidence, /<body class="teacher page-standard">/);
  assert.match(evidence, /href="teacher_home\.html">← 先生ホームへ戻る<\/a>/);
  assert.match(evidence, /id="memberId"/);
  assert.match(evidence, /id="paypayCode"/);
  assert.match(attendance, /<body class="teacher page-standard">/);
  assert.match(attendance, /href="teacher_home\.html">先生ホーム<\/a>/);
  assert.match(attendance, /id="reader"/);
  assert.match(attendance, /id="saveButton" onclick="saveAttendance\(\)"/);
});

test('payment status preserves 820px desktop width and collapses controls on phones', () => {
  const html = read('web/qr/payment_status.html');
  assert.match(html, /@media \(min-width:700px\) \{ body \{ max-width:820px; margin:0 auto; \} \}/);
  assert.match(html, /input \{ box-sizing:border-box; width:100%; max-width:100%/);
  assert.match(html, /@media \(max-width:520px\)[\s\S]*\.filters, \.summary-grid, \.amounts \{ grid-template-columns:1fr; \}/);
  assert.match(html, /href="teacher_home\.html">先生ホーム<\/a>/);
  assert.match(html, /onclick="loadStatus\(\)"/);
});

test('QR generator retains responsive screen width and isolated B5 print layout', () => {
  const html = read('web/qr/qr_generator.html');
  assert.match(html, /@media \(min-width:700px\)[\s\S]*body \{ max-width:760px; margin:0 auto; \}/);
  assert.match(html, /@media print[\s\S]*html, body \{ width:257mm; height:182mm;/);
  assert.match(html, /body > :not\(#printDocument\) \{ display:none !important; \}/);
  assert.match(html, /id="printDocument"/);
  assert.match(html, /href="teacher_home\.html">先生ホームへ戻る<\/a>/);
});

test('examination prototype keeps its 1150px desktop width and contains mobile overflow', () => {
  const html = read('web/qr/examination/index.html');
  assert.match(html, /\.wrap\{max-width:1150px;margin:auto;/);
  assert.match(html, /html,body\{max-width:100%;overflow-x:hidden\}/);
  assert.match(html, /\.tablebox\{max-width:100%;overflow-x:auto;overscroll-behavior-inline:contain\}/);
  assert.match(html, /@media\(max-width:600px\)[\s\S]*\.summary\{grid-template-columns:1fr;/);
  assert.match(html, /\.filters\{width:100%;align-items:stretch\}/);
  assert.match(html, /href="\.\.\/teacher_home\.html"[^>]*>← 先生ホームへ戻る<\/a>/);
  assert.match(html, /id="gradeTile"/);
  assert.match(html, /id="danTile"/);
  assert.match(html, /id="rows"/);
});
