import fs from "node:fs";
import vm from "node:vm";

function readProjectFile(candidates) {
  for (const candidate of candidates) {
    const url = new URL(candidate, import.meta.url);
    if (fs.existsSync(url)) return fs.readFileSync(url, "utf8");
  }
  throw new Error(`project file not found: ${candidates.join(", ")}`);
}

const html = readProjectFile([
  "../web/qr/payment.html",
  "../QR_MultReadTRNS/payment.html",
  "../WebCamera/QR_MultReadTRNS/payment.html"
]);
const scriptStart = html.lastIndexOf("<script>") + "<script>".length;
const scriptEnd = html.indexOf("</script>", scriptStart);
if (scriptStart < "<script>".length || scriptEnd < 0) throw new Error("payment inline script not found");
new Function(html.slice(scriptStart, scriptEnd));

globalThis.getMemberInfoForPayment = memberId => ({
  success: true,
  memberId,
  memberName: "テスト会員"
});
globalThis.getPaymentStatus = () => ({
  ok: true,
  billingGroupId: "G001",
  targetMonth: "2026-06",
  planType: "月会費",
  billedTotal: 7500,
  paidTotal: 2000,
  unpaidAmount: 5500,
  isPaid: false,
  status: "未払い"
});

const code = readProjectFile([
  "../gas/Code.js",
  "../AikidoDojoManagement-review/AikidoDojoManagement-main/Code.js",
  "../clasp_道場サポ/Code.js"
]);
vm.runInThisContext(code);
const result = globalThis.getMemberPaymentInfo_("M001");

if (
  result.success !== true ||
  result.billingGroupId !== "G001" ||
  result.amount !== 5500 ||
  result.feeType !== "月会費"
) throw new Error("payment info mapping mismatch");

console.log("Payment page script syntax: OK");
console.log("Payment status mapping: OK");
