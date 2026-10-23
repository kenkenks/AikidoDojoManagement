"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const paypay = fs.readFileSync(path.join(root, "web/qr/paypay_code.html"), "utf8");
const teacher = fs.readFileSync(path.join(root, "web/qr/payment_teacher.html"), "utf8");

function includesInOrder(source, values, label) {
  let cursor = -1;
  values.forEach((value) => {
    const next = source.indexOf(value, cursor + 1);
    assert(next > cursor, label + ": missing/out of order: " + value);
    cursor = next;
  });
}

for (const [name, source] of [["paypay_code", paypay], ["payment_teacher", teacher]]) {
  includesInOrder(source, [
    'src="firebase_auth.js"',
    'src="auth_gate.js"',
    'src="page_initialization_manager.js"',
    'src="system_context_adapter.js"'
  ], name + " common scripts");
  assert.match(source, /DOJO_AUTH_GATE\.create/);
  assert.match(source, /DOJO_PAGE_INITIALIZATION_MANAGER\.create/);
  assert.match(source, /authentication_lost/);
  assert.match(source, /authenticated_user_changed/);
  assert.match(source, /authorization_lost/);
  assert.match(source, /isOperationCurrent\(generation\)/);
}

assert.match(paypay, /dependencies:\[\{ name:"auth", run:function\(\)\{ return authGate\.requireAuthenticated\(\); \} \}\]/);
assert.match(paypay, /optionalTasks:\[\{/);
assert.match(paypay, /capability:"systemContext"/);
assert.match(paypay, /systemContextAdapter\.getCurrent\(\)/);
assert.match(paypay, /pendingStartRequestId \|\| \(pendingStartRequestId = createRequestId\("PAYPAY_START"\)\)/);
assert.match(paypay, /pendingRecordRequestId \|\| \(pendingRecordRequestId = createRequestId\("PAYPAY_RECORD"\)\)/);
assert.match(paypay, /if \(authUid && uid && uid !== authUid\)/);
assert.doesNotMatch(paypay, /pendingStartRequestId\s*=\s*"";\s*\n\s*\}\.catch/);

assert.match(teacher, /systemContextAdapter\.dependency\("systemContext"\)/);
assert.match(teacher, /name:"receptionScope"/);
assert.match(teacher, /return updateReceptionScope\(context, true\)/);
assert.match(teacher, /state\.status === "INITIALIZING"[\s\S]*setScopeAcquisitionEnabled\(true\)/);
assert.match(teacher, /initializationManager\.retry\("reception_scope_changed"\)/);
assert.match(teacher, /action: "attendance_session_info"/);
assert.match(teacher, /return loadPaymentScreenRead\(\{ managerContext:managerContext, requiredInitialization:requiredInitialization \}\)/);
assert.match(teacher, /if \(initializationManager\.getState\(\)\.status === "READY" && initializedContextKey && nextKey !== initializedContextKey\)/);
assert.match(teacher, /if \(authUid && uid && uid !== authUid\)/);
assert.match(teacher, /if \(!isOperationCurrent\(generation\)\) return null;/);
assert.match(teacher, /pendingPayPayPost = \{ids:ids, scope:scope, input:\{/);
assert.match(teacher, /if \(paypayPostInFlight\) return;/);
assert.match(teacher, /if \(!error\.outcomeUnknown\) pendingPayPayPost = null;/);
assert.match(teacher, /firebaseCashAcceptClient\.execute\(input\)/);
assert.match(teacher, /loadFirebaseMemberForPayment\(memberId, planId\)/);

console.log("Initialization step 8C contracts: PASS");
