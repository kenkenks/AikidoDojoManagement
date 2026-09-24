import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const requests=[];
const invoices=[{invoice_id:'I1',member_id:'M1',billing_group_id:'G1',target_month:'2099-07',請求予定額:7500,支払状態:'未払い'}, {invoice_id:'I2',member_id:'M1',billing_group_id:'G1',target_month:'2099-07',請求予定額:2000,支払状態:'未払い'}];
const b={normalizeId_:x=>String(x??'').trim(),normalizeMonth:x=>String(x),ensureSheetContext:x=>x,getInvoices:()=>invoices,getPayments:()=>[{invoice_id:'I1',入金額:1000},{invoice_id:'OTHER',入金額:99999}],getInvoice:id=>invoices.find(x=>x.invoice_id===id),existsActivePaymentEvidence:()=>false,sup_today:()=> '2099-07-09',paymentEvidence_normalizeReceptionDate_:x=>x,paymentEvidence_record:()=>({ok:true}),paymentEvidence_post:()=>({ok:true})};
vm.createContext(b);
b.getSheetRows = () => [];
for(const f of ['09_PaymentEvidenceRequest.js','13_MonthlyIntegrationRunner.js'])vm.runInContext(fs.readFileSync(new URL('../gas/'+f,import.meta.url),'utf8'),b);
// 実Collectで入力契約を検証し、実シートへ保存する部分のみ代役にする。
b.paymentEvidence_request=(input,ctx)=>{const collected=b.paymentEvidenceRequest_collect(input,ctx);requests.push(collected);return {ok:true,evidence_id:'E'+requests.length};};
for(const method of ['CASH','PAYPAY']){
 requests.length=0;
 const result=b.monthlyIntegration902_payMember_({member_id:'M1',billing_group_id:'G1'},method,{location_id:'L1',billing_block_id:'B1',teacher_id:'T1'},'TEST',{});
 assert.equal(result.ok,true);
 assert.deepEqual(requests.map(x=>x.amount),[6500,2000]);
 assert.ok(requests.every(x=>x.payment_method===method&&x.reception_session_id==='TEST'));
}
assert.throws(()=>b.paymentEvidenceRequest_collect({invoice_id:'I1',member_id:'M1',payment_method:'CASH'},{}),/amount は1円以上/);
console.log('PASS integration Runner: invoice-specific outstanding amounts, CASH/PAYPAY, missing amount rejected');
