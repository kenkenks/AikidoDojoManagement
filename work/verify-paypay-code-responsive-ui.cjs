'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('web/qr/paypay_code.html','utf8');

test('PayPay form is centered and bounded on desktop',()=>{
  assert.match(html,/body\.member \{ max-width:760px; margin:0 auto;/);
  assert.match(html,/#memberId \{ max-width:360px; \}/);
  assert.match(html,/\.card input \{ display:block; max-width:520px; \}/);
});

test('PayPay form keeps touch targets and prevents form overflow on phones',()=>{
  assert.match(html,/@media \(max-width:600px\)/);
  assert.match(html,/\.card input, #memberId \{ width:100%; max-width:none; min-width:0; \}/);
  assert.match(html,/\.card button \{ width:100%;[^}]*padding:12px 14px;/);
  assert.match(html,/\.card button \{ min-height:44px;/);
});

test('screen structure, home navigation, log and business handlers remain intact',()=>{
  assert.match(html,/<h1>📲 PayPay決済コード登録<\/h1>\s*<p class="note"><a href="member_home\.html">← 会員ホームへ戻る<\/a><\/p>/);
  assert.match(html,/id="memberId"/);
  assert.match(html,/onclick="startPayPayCode\(\)"/);
  assert.match(html,/onclick="recordPayPayCode\(\)"/);
  assert.match(html,/<ul id="log"><\/ul>/);
});
