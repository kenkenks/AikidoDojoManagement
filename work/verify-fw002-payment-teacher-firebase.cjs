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
  const context = html.indexOf('src="system_context.js"');
  assert.ok(runtime >= 0 && runtime < auth && auth < client && client < context);
  assert.match(html, /const IS_FIREBASE = RUNTIME_CONFIG\.runtime === "firebase"/);
  assert.match(html, /DOJO_FIREBASE_AUTH\.create/);
  assert.match(html, /DOJO_API_CLIENT\.create/);
});

test('Firebase WebConnect reads use bearer GET and never JSONP fallback', () => {
  const firebaseRead = functionBody('firebaseWebConnectRead');
  const routedRead = functionBody('webConnectRead');
  assert.match(firebaseRead, /dojoApiClient\.request\(url, \{ method:"GET", cache:"no-store" \}\)/);
  assert.match(firebaseRead, /\/api\/webconnect\?/);
  assert.doesNotMatch(firebaseRead, /jsonp\s*\(/);
  assert.doesNotMatch(firebaseRead, /method\s*:\s*"POST"/);
  assert.match(routedRead, /IS_FIREBASE \? firebaseWebConnectRead\(params\) : jsonp\(GAS_URL, params\)/);
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

test('Firebase write controls and every write entry point are blocked', () => {
  for (const name of ['confirmPayment', 'sendPaymentsToGas', 'postConfirmedPayments', 'postSelectedConfirmedEvidences']) {
    assert.match(functionBody(name), /^\s*if \(firebaseWriteBlocked\(/, `${name} must reject Firebase first`);
  }
  const disabled = functionBody('disableFirebaseWriteControls');
  for (const id of ['completePaymentsButton', 'postConfirmedPaymentsButton', 'postSelectedConfirmedEvidencesButton']) {
    assert.match(disabled, new RegExp(id));
  }
});

test('Firebase cannot fall through to migrated-out member reads or GAS POST', () => {
  assert.match(functionBody('loadMemberForPayment'), /^\s*if \(IS_FIREBASE\)/);
  assert.match(functionBody('loadMemberForPayment_fetch'), /^\s*if \(IS_FIREBASE\)/);
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
