'use strict';
const fs=require('fs');
const vm=require('vm');
const path=require('path');

const source=fs.readFileSync(path.join(__dirname,'..','gas','DAO_Business_Payment.js'),'utf8');
const start=source.indexOf('function daoPaymentAppend_');
const end=source.indexOf('function daoPaymentLoadInvoiceStatusRows_',start);
if(start<0||end<0) throw new Error('daoPaymentAppend_ not found');
const fnSource=source.slice(start,end);

let createCalls=0, appendCalls=0, invalidates=0;
let received=null;
const ctx={ss:{tag:'REAL_SPREADSHEET'}};
const sandbox={
  daoContext_: value => value,
  invalidatePayments: value => { if(value!==ctx) throw new Error('INVALIDATE_CTX_MISMATCH'); invalidates++; },
  DojoPortableDaoPaymentLog:{
    create:(config,deps)=>{
      createCalls++;
      if(!deps||deps.spreadsheet!==ctx.ss) throw new Error('SPREADSHEET_DEPENDENCY_MISMATCH');
      return {
        appendRecord:(name,record)=>{
          appendCalls++;
          if(name!=='paymentLog') throw new Error('DAO_NAME_MISMATCH');
          received=record;
          return {appended:true};
        }
      };
    }
  }
};
vm.createContext(sandbox);
vm.runInContext(fnSource,sandbox);

const payment={
  payment_id:'PAY-STEP7B',
  日時:'2099-07-09T02:00:00Z',
  target_month:'2099-07',
  billing_group_id:'G001',
  invoice_id:'INV-STEP7B',
  member_id:'M001',
  支払方法:'現金',
  入金額:7500,
  決済ID:'CASH-STEP7B',
  location_id:'HONBU',
  billing_block_id:'B_KYO_MON_1030_1230',
  teacher_id:'T001',
  reception_session_id:'RUN-STEP7B',
  reception_date:'2099-07-09',
  備考:'STEP7B'
};
const result=sandbox.daoPaymentAppend_(ctx,payment);
if(!result||result.appended!==true) throw new Error('RESULT_CONTRACT_FAILED');
if(createCalls!==1||appendCalls!==1) throw new Error('PORTABLE_ROUTE_FAILED');
if(invalidates!==1) throw new Error('CACHE_INVALIDATION_FAILED');
for(const [key,value] of Object.entries(payment)) {
  if(key==='member_id') continue;
  if(received[key]!==value) throw new Error('FIELD_MAPPING_FAILED '+key);
}
if(Object.prototype.hasOwnProperty.call(received,'member_id')) throw new Error('MEMBER_ID_MUST_NOT_BE_PERSISTED');
if(fnSource.includes('daoCore_(ctx).append("payments"')) throw new Error('LEGACY_APPEND_STILL_PRESENT');

console.log('PAYMENT-LOG-STEP7B EXISTING ENTRY VERIFY PASS');
console.log('PORTABLE_ROUTE FIELD_MAPPING CACHE_INVALIDATION NO_LEGACY_APPEND PASS');
