const fs = require("node:fs");

let failed = false;
function check(file, fragments) {
  const source = fs.readFileSync(file, "utf8");
  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      console.error("NG: " + file + " missing " + JSON.stringify(fragment));
      failed = true;
    }
  }
}

check("web/qr/attendance.html", ['clearCandidates(true);', 'authenticated_user_changed']);
check("web/qr/attendanceCheck.html", ['clearCandidates(true);', 'authenticated_user_changed']);
check("web/qr/attendance_summary.html", ['isolateSummaryForDifferentUid();']);
check("web/qr/time_travel.html", ['isolateTimeTravelForDifferentUid();']);
check("web/qr/member_management.html", ['isolateMemberManagementForDifferentUid();']);
check("web/qr/qr_generator.html", ['const qrStateByUid = new Map();', 'switchQrOwner(qrAuthUid,uid);']);
check("web/qr/paper_attendance_review.js", ['const paperStateByUid=new Map();', 'switchPaperOwner(authUid,uid);']);
check("web/qr/paypay_code.html", [
  'const payPayStateByUid = new Map();',
  'switchPayPayOwner(authUid, uid);',
  'pendingStartRequestId:pendingStartRequestId',
  'pendingRecordRequestId:pendingRecordRequestId'
]);
check("web/qr/payment_teacher.html", [
  'const paymentStateByOwnerScope = new Map();',
  'return [authUid, todayValue(), currentLocationId, currentBillingBlockId, currentTeacherId].join("|");',
  'pendingPayPayPost:pendingPayPayPost',
  'cashClientByOwnerScope.set(activePaymentOwnerScope, firebaseCashAcceptClient);',
  'activatePaymentOwnerScope(paymentOwnerScopeKey());',
  '会費受付スキップ: 受付スコープが未確定です。'
]);

if (failed) process.exit(1);
console.log("Initialization step 9.1 state ownership contracts: OK");
