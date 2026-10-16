const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const html = readFileSync(join(__dirname, '../web/qr/payment_teacher.html'), 'utf8');

function functionBody(name) {
  const marker = `function ${name}(`;
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, `${name} must exist`);
  const open = html.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = open; index < html.length; index += 1) {
    const char = html[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    if (char === '}' && --depth === 0) return html.slice(open + 1, index);
  }
  throw new Error(`unterminated function ${name}`);
}

test('runtime reuses existing Firebase auth and bearer API client in safe script order', () => {
  const runtime = html.indexOf('src="runtime_config.js"');
  const auth = html.indexOf('src="firebase_auth.js"');
  const client = html.indexOf('src="dojo_api_client.js"');
  const cashClient = html.indexOf('src="payment_cash_accept_client.js"');
  const context = html.indexOf('src="system_context.js"');
  assert.ok(runtime >= 0 && runtime < auth && auth < client && client < cashClient && cashClient < context);
  assert.match(html, /const IS_FIREBASE = RUNTIME_CONFIG\.runtime === "firebase"/);
  assert.match(html, /DOJO_FIREBASE_AUTH\.create/);
  assert.match(html, /DOJO_API_CLIENT\.create/);
});

test('Firebase WebConnect reads use bearer GET and never JSONP fallback', () => {
  const firebaseUrl = functionBody('buildFirebaseWebConnectUrl');
  const firebaseRead = functionBody('firebaseWebConnectRead');
  const routedRead = functionBody('webConnectRead');
  assert.match(firebaseRead, /dojoApiClient\.request\(url, \{ method:"GET", cache:"no-store" \}\)/);
  assert.match(firebaseUrl, /\/api\/webconnect\?/);
  assert.doesNotMatch(firebaseRead, /jsonp\s*\(/);
  assert.doesNotMatch(firebaseRead, /method\s*:\s*"POST"/);
  assert.match(routedRead, /IS_FIREBASE \? firebaseWebConnectRead\(params\) : jsonp\(GAS_URL, params\)/);
});

test('strict Firebase billing reads omit cache-buster while attendance session keeps it', () => {
  const buildUrl = new Function(
    'RUNTIME_CONFIG',
    'URLSearchParams',
    'Date',
    `"use strict"; return function(params) {${functionBody('buildFirebaseWebConnectUrl')}};`
  )(
    { apiBaseUrl: 'https://dojo-time-travel-admin.example.test/' },
    URLSearchParams,
    { now: () => 1720000000000 }
  );
  const paymentUrl = new URL(buildUrl({
    action: 'payment_screen_read',
    reception_date: '2026-10-16',
    location_id: 'L_KYO',
    billing_block_id: 'B_KYO_MON_1030_1230',
    payment_method: 'PAYPAY'
  }));
  assert.equal(paymentUrl.pathname, '/api/webconnect');
  assert.deepEqual(Object.fromEntries(paymentUrl.searchParams), {
    action: 'payment_screen_read',
    reception_date: '2026-10-16',
    location_id: 'L_KYO',
    billing_block_id: 'B_KYO_MON_1030_1230',
    payment_method: 'PAYPAY'
  });
  assert.equal(paymentUrl.searchParams.has('_ts'), false);

  const memberUrl = new URL(buildUrl({
    action: 'getMemberInfo',
    member_id: 'M001'
  }));
  assert.deepEqual(Object.fromEntries(memberUrl.searchParams), {
    action: 'getMemberInfo',
    member_id: 'M001'
  });
  assert.equal(memberUrl.searchParams.has('_ts'), false);

  const sessionUrl = new URL(buildUrl({
    action: 'attendance_session_info',
    location_id: 'L_KYO',
    billing_block_id: 'B_KYO_MON_1030_1230'
  }));
  assert.equal(sessionUrl.searchParams.get('_ts'), '1720000000000');
});

test('Firebase member read sends member_id only and never uses JSONP or POST', () => {
  const read = functionBody('loadFirebaseMemberForPayment');
  assert.match(read, /action:"getMemberInfo"/);
  assert.match(read, /member_id:memberId/);
  assert.doesNotMatch(read, /plan_id/);
  assert.doesNotMatch(read, /jsonp\s*\(/);
  assert.doesNotMatch(read, /fetch\s*\(/);
  assert.doesNotMatch(read, /method\s*:\s*["']POST["']/);
  assert.match(read, /paymentList\.some/);
  assert.match(read, /billingGroupId === normalized\.billingGroupId/);
});

test('Firebase member DTO supports normal, matching-plan, paid and unpaid display', () => {
  const normalize = new Function(
    `"use strict"; return function(result, memberId, requestedPlanId) {${functionBody('normalizeFirebaseMemberPayment')}};`
  )();
  const base = {
    ok:true, memberId:'M001', memberName:'会員一', billingGroupId:'G001',
    targetMonth:'2026-10', planType:'P_MONTHLY', status:'未払い',
    unpaidAmount:1500, invoiceIds:['I001'], invoiceCount:1,
    invoiceSummary:'月会費 2000円', invoiceItems:[{ invoice_id:'I001', amount:2000 }]
  };
  const normal = normalize(base, 'M001', '');
  assert.equal(normal.ok, true);
  assert.equal(normal.payment.amount, 1500);
  assert.equal(normal.payment.planId, 'P_MONTHLY');
  assert.equal(normal.payment.billingGroupId, 'G001');
  assert.equal(normal.payment.invoiceItems.length, 1);
  assert.equal(normalize(base, 'M001', 'P_MONTHLY').ok, true);
  const paid = normalize({ ...base, status:'支払済', unpaidAmount:0 }, 'M001', '');
  assert.equal(paid.ok, true);
  assert.equal(paid.payment.amount, 0);
});

test('Firebase member DTO stops on plan mismatch, undeclared month and missing invoice', () => {
  const normalize = new Function(
    `"use strict"; return function(result, memberId, requestedPlanId) {${functionBody('normalizeFirebaseMemberPayment')}};`
  )();
  const base = {ok:true,memberId:'M001',memberName:'会員一',billingGroupId:'G001',targetMonth:'2026-10',planType:'P_MONTHLY',status:'未払い',unpaidAmount:1500};
  assert.match(normalize(base, 'M001', 'P_OTHER').message, /一致しません/);
  assert.match(normalize({...base,status:'未宣言',planType:'',message:''}, 'M001', '').message, /未登録/);
  assert.match(normalize({...base,status:'請求なし',unpaidAmount:0,message:''}, 'M001', '').message, /作成されていません/);
  assert.equal(normalize({...base,planType:''}, 'M001', 'P_MONTHLY').ok, false);
});

test('scope resolution uses attendance_session_info and screen read requires business scope', () => {
  const scope = functionBody('updateReceptionScope');
  const screen = functionBody('loadPaymentScreenRead');
  assert.match(scope, /action: "attendance_session_info"/);
  assert.match(scope, /webConnectRead\(params\)/);
  assert.match(scope, /DOJO_SYSTEM_CONTEXT && window\.DOJO_SYSTEM_CONTEXT\.system_now/);
  assert.match(screen, /!currentLocationId \|\| !currentBillingBlockId/);
  assert.match(screen, /const receptionDate = todayValue\(\)/);
  assert.match(screen, /SystemContextの業務日/);
  assert.match(screen, /action: "payment_screen_read"/);
  assert.match(screen, /webConnectRead\(\{/);
});

test('Firebase refreshes only the combined payment screen DTO', () => {
  assert.match(functionBody('loadRegisteredScopeSummary'), /^\s*if \(IS_FIREBASE\) return loadPaymentScreenRead\(\);/);
  assert.match(functionBody('loadPaymentEvidenceLists'), /^\s*if \(IS_FIREBASE\) return loadPaymentScreenRead\(\);/);
  const screen = functionBody('loadPaymentScreenRead');
  for (const field of ['summary', 'confirmed', 'posted']) assert.match(screen, new RegExp(`result\\.${field}`));
  assert.doesNotMatch(screen, /\.sort\s*\(/);
});

test('Firebase cash uses its Command while unrelated write entry points stay blocked', () => {
  for (const name of ['sendPaymentsToGas', 'postConfirmedPayments', 'postSelectedConfirmedEvidences']) {
    assert.match(functionBody(name), /^\s*if \(firebaseWriteBlocked\(/, `${name} must reject Firebase first`);
  }
  assert.match(functionBody('confirmPayment'), /^\s*if \(IS_FIREBASE\) return acceptFirebaseCashPayment\(payType\);/);
  const disabled = functionBody('disableFirebaseWriteControls');
  for (const id of ['completePaymentsButton', 'postConfirmedPaymentsButton', 'postSelectedConfirmedEvidencesButton']) {
    assert.match(disabled, new RegExp(id));
  }
});

test('Firebase cash POST uses existing WebConnect and refreshes member and screen DTOs',()=>{
  const send=functionBody('sendFirebaseCashAccept');
  assert.match(send,/method:"POST"/);
  assert.match(send,/action:"payment_cash_accept"/);
  assert.match(send,/dojoApiClient\.request/);
  assert.doesNotMatch(send,/GAS_URL/);
  const accept=functionBody('acceptFirebaseCashPayment');
  assert.match(accept,/firebaseCashAcceptClient\.execute\(input\)/);
  assert.match(accept,/loadFirebaseMemberForPayment\(memberId, planId\)/);
  assert.match(accept,/loadPaymentScreenRead\(\)/);
  assert.match(accept,/結果が不明/);
});

test('Firebase cannot fall through to GAS member reads or GAS POST', () => {
  assert.match(functionBody('loadMemberForPayment'), /if \(IS_FIREBASE\) return loadFirebaseMemberForPayment\(memberId, planId\);/);
  assert.match(functionBody('loadMemberForPayment_fetch'), /^\s*if \(IS_FIREBASE\)/);
  assert.match(functionBody('loadMemberForPayment'), /jsonp\(GAS_URL, \{\s*action: "getPaymentInfo"/);
  const batch = functionBody('sendPaymentsToGas');
  const evidencePost = functionBody('postSelectedConfirmedEvidences');
  assert.ok(batch.indexOf('firebaseWriteBlocked') < batch.indexOf('fetch(GAS_URL'));
  assert.ok(evidencePost.indexOf('firebaseWriteBlocked') < evidencePost.indexOf('fetch(GAS_URL'));
  assert.match(batch, /mode: "no-cors"/);
  assert.match(evidencePost, /mode: "no-cors"/);
});

test('GAS transport and visible Firebase error states remain explicit', () => {
  assert.match(functionBody('jsonp'), /document\.createElement\("script"\)/);
  assert.match(functionBody('firebaseReadError'), /HTTP 401/);
  assert.match(functionBody('firebaseReadError'), /HTTP 403/);
  assert.match(functionBody('firebaseWebConnectRead'), /Firebaseとの通信に失敗しました/);
  assert.match(html, /id="firebaseAccessStatus"/);
  assert.match(html, /evidences\) \? confirmedResult\.evidences : \[\]/);
  assert.match(html, /evidences\) \? postedResult\.evidences : \[\]/);
});

test('empty evidence arrays render as zero without reordering', () => {
  assert.match(functionBody('renderConfirmedEvidences'), /confirmedEvidences\.forEach/);
  assert.match(functionBody('renderPostedEvidences'), /postedEvidences\.forEach/);
  assert.match(functionBody('renderConfirmedEvidences'), /confirmedEvidences\.length/);
  assert.match(functionBody('renderPostedEvidences'), /postedEvidences\.length/);
});
