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

test('Firebase reception scope exposes dojo and billing-block selectors', () => {
  assert.match(html, /id="locationChoice"[^>]+onchange="selectReceptionLocation\(this\.value\)"/);
  assert.match(html, /id="billingBlockChoice"[^>]+onchange="selectReceptionBillingBlock\(this\.value\)"/);
  assert.match(html, /\.scope-choice \{[^}]*width:100%/);
});

test('initialization reuses member options and preserves URL or session scope priority', () => {
  assert.match(functionBody('loadReceptionLocationOptions'), /action:"attendance_member_options"/);
  assert.match(html, /loadReceptionLocationOptions\(context, true\)[\s\S]*currentLocationId \? updateReceptionScope\(context, true\) : true/);
  const initialize = functionBody('initializeReceptionScopeFromUrl');
  assert.match(initialize, /params\.get\("location_id"\) \|\| sessionContext\.location_id/);
  assert.match(initialize, /params\.get\("billing_block_id"\) \|\| sessionContext\.billing_block_id/);
});

test('member options request matches its action-only Firebase API contract', () => {
  const buildUrl = new Function(
    'RUNTIME_CONFIG',
    'URLSearchParams',
    'Date',
    `"use strict"; return function(params) {${functionBody('buildFirebaseWebConnectUrl')}};`
  )(
    { apiBaseUrl:'https://dojo-time-travel-admin.example.test/' },
    URLSearchParams,
    { now:() => 1720000000000 }
  );
  const url = new URL(buildUrl({ action:'attendance_member_options' }));
  assert.equal(url.pathname, '/api/webconnect');
  assert.deepEqual(Object.fromEntries(url.searchParams), { action:'attendance_member_options' });
});

test('manual dojo selection clears the old billing scope and persists the new context', () => {
  const select = functionBody('selectReceptionLocation');
  assert.match(select, /currentLocationId = locationId/);
  assert.match(select, /currentBillingBlockId = ""/);
  assert.match(select, /currentBillingBlockName = ""/);
  assert.match(select, /saveReceptionScopeToSession\(\)/);
  assert.match(select, /requestReceptionScopeRefresh\(\)/);
});

test('billing candidates come only from attendance_session_info and selected value is revalidated', () => {
  const update = functionBody('updateReceptionScope');
  const select = functionBody('selectReceptionBillingBlock');
  assert.match(update, /action: "attendance_session_info"/);
  assert.match(update, /result\.billing_block_candidates/);
  assert.match(update, /renderReceptionBillingBlockChoices/);
  assert.match(select, /currentBillingBlockId = billingBlockId/);
  assert.match(select, /saveReceptionScopeToSession\(\)/);
  assert.match(select, /requestReceptionScopeRefresh\(\)/);
  assert.doesNotMatch(select, /start_time|end_time|is_current|is_nearby/);
});

test('existing payment, PayPay and TimeTrip business paths remain unchanged', () => {
  assert.match(html, /action:"payment_cash_accept"/);
  assert.match(html, /action:"payment_paypay_post_selected"/);
  assert.match(html, /action: "payment_screen_read"/);
  assert.match(html, /DOJO_SYSTEM_CONTEXT && window\.DOJO_SYSTEM_CONTEXT\.system_now/);
});
