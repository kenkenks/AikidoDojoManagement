import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const file = new URL("../gas/13_MonthlyIntegrationRunner.js", import.meta.url);
const source = fs.readFileSync(file, "utf8");

new vm.Script(source, { filename: file.pathname });

for (const entrance of [
  "runner_story_integration_902_preflight",
  "runner_story_integration_902"
]) {
  assert.match(source, new RegExp(`function\\s+${entrance}\\s*\\(`));
}

for (const productionService of [
  "billingMonthlyAccept",
  "registerAttendanceBatchLocked_",
  "billingExtraEnsureInvoice",
  "paymentEvidence_request",
  "paymentEvidence_record",
  "paymentEvidence_post",
  "paymentReception_getScopeSummary",
  "paymentStatusTeacher_get"
]) {
  assert.match(source, new RegExp(`\\b${productionService}\\s*\\(`));
}

assert.match(source, /const STORY_902_INTEGRATION_MONTH = "2099-07";/);
assert.match(source, /read_only:\s*true/);
assert.match(source, /master_writes:\s*0/);

const cleanupSheets = [...source.matchAll(/monthlyIntegration902_deleteRows_\("([^"]+)"/g)]
  .map((match) => match[1]);
assert.deepEqual(cleanupSheets.sort(), [
  "04_月次選択",
  "05_請求明細",
  "06_入金ログ",
  "07_出席ログ",
  "09_決済エビデンス",
  "20_会費状態View"
].sort());
assert.equal(cleanupSheets.some((name) => name.includes("マスタ")), false);

console.log("PASS verify-monthly-integration-runner");
