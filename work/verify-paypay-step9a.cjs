'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'gas','paypay_code.js'),'utf8');
const dao=fs.readFileSync(path.join(root,'gas','DAO_Portable_PaymentEvidence.js'),'utf8');
function body(name){
  const start=src.indexOf('function '+name+'(');
  if(start<0) throw new Error('MISSING_FUNCTION '+name);
  const brace=src.indexOf('{',start); let depth=0;
  for(let i=brace;i<src.length;i++){
    if(src[i]==='{') depth++;
    else if(src[i]==='}' && --depth===0) return src.slice(start,i+1);
  }
  throw new Error('UNCLOSED '+name);
}
const record=body('paypayCode_record');
const repair=body('paypayCode_repairReusableEvidenceScope_');
for(const [name,text] of [['record',record],['repair',repair]]){
  if(!text.includes('daoPortablePaymentEvidence_findForPayPay_')) throw new Error(name+' READ_NOT_PORTABLE');
  if(!text.includes('daoPortablePaymentEvidence_updateForPayPay_')) throw new Error(name+' UPDATE_NOT_PORTABLE');
  if(/rowNumber|paymentEvidence_updateColumnsAtomic_|paymentEvidence_updateColumns_/.test(text)) throw new Error(name+' ROW_NUMBER_DEPENDENCY_REMAINS');
}
if(!dao.includes('daoPortablePaymentEvidence_findById_')) throw new Error('PORTABLE_READ_BOUNDARY_MISSING');
if(!dao.includes('daoPortablePaymentEvidence_updateById_')) throw new Error('PORTABLE_UPDATE_BOUNDARY_MISSING');
console.log('PAYPAY-STEP9A LOCAL VERIFY PASS');
console.log('RECORD_KEY_READ_UPDATE REPAIR_KEY_READ_UPDATE NO_ROWNUMBER PASS');
