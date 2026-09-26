'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'..','gas','DAO_Business_Payment.js'),'utf8');
const start=source.indexOf('function daoPaymentAppend_');
const end=source.indexOf('\n\n\n// 支払状態更新用',start);
if(start<0||end<0) throw new Error('daoPaymentAppend_ not found');
const fnSource=source.slice(start,end);
let received=null, invalidates=0;
const ctx={ss:{tag:'SS'}};
const sandbox={
 daoContext_:x=>x,
 invalidatePayments:x=>{if(x!==ctx)throw new Error('CTX');invalidates++;},
 DojoPortableDaoPaymentLog:{create:(c,d)=>({
   appendRecord:(name,row)=>{if(name!=='paymentLog')throw new Error('NAME');received=row;return {appended:true};}
 })}
};
vm.createContext(sandbox);vm.runInContext(fnSource,sandbox);
const payment={
 payment_id:'PAY-X',日時:'2099-07-09T02:00:00Z',target_month:'2099-07',
 billing_group_id:'G001',invoice_id:'INV-X',member_id:'M001',支払方法:'現金',
 入金額:7500,決済ID:'CASH-X',location_id:'HONBU',
 billing_block_id:'B1',teacher_id:'T001',reception_session_id:'S1',
 reception_date:'2099-07-09',備考:'FIX1'
};
sandbox.daoPaymentAppend_(ctx,payment);
const persisted=['payment_id','日時','target_month','billing_group_id','invoice_id','支払方法','入金額','決済ID','備考'];
const businessOnly=['member_id','reception_date','location_id','billing_block_id','teacher_id','reception_session_id'];
for(const k of persisted) if(received[k]!==payment[k]) throw new Error('MISSING_PERSISTED '+k);
for(const k of businessOnly) if(Object.prototype.hasOwnProperty.call(received,k)) throw new Error('BUSINESS_ONLY_LEAK '+k);
if(invalidates!==1) throw new Error('CACHE_INVALIDATION');
console.log('PAYMENT-LOG-STEP7B FIX1 VERIFY PASS');
console.log('PHYSICAL_SCHEMA_9_FIELDS BUSINESS_OBJECT_FIELDS_EXCLUDED CACHE_INVALIDATION PASS');
