import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const names=['Flow','DAO_Definition_Setting.generated','DAO_Business_Setting','SystemContext','TimeTravel','TimeApplicationCore','AttendanceEnvironment'];
const sources=Object.fromEntries(names.map(name=>['./'+name+'.js',fs.readFileSync(path.join(root,'shared',name+'.js'),'utf8')]));
sources['./DAO_Core_Firestore.cjs']=fs.readFileSync(path.join(root,'cloud/member-read/DAO_Core_Firestore.cjs'),'utf8');
sources['./DAO_Core_Values.cjs']=fs.readFileSync(path.join(root,'cloud/member-read/DAO_Core_Values.cjs'),'utf8');
const modules=Object.entries(sources).map(([name,source])=>JSON.stringify(name)+':function(module,exports,require){\n'+source+'\n}').join(',\n');
// Extend the existing artifact with the unchanged canonical GAS implementation.
// No alternate Core, copied business implementation or new build entry point.
const gasNames = ['00_Job','01_Commom','02_SheetAccess','DAO_Composition',
  'DAO_Business_Member','DAO_Business_Attendance','DAO_Business_Billing',
  'DAO_Business_View','DAO_Business_AttendanceProgress',
  '03_Billing','03_BillingCore','03_BillingMonthly','03_BillingRecord','03_BillingUsage',
  '04_Attendance','04_AttendanceCore','04_AttendanceProgress',
  '20_PaymentStatusView','20_PaymentStatusTeacher','09_PaymentEvidenceRequest','06_PaymentReceptionScope'];
const gasSources = gasNames.map(name => fs.readFileSync(path.join(root,'gas',name+'.js'),'utf8'));
const {createHash} = await import('node:crypto');
const gasSourceHashes = Object.fromEntries(gasNames.map((name,index) =>
  ['gas/'+name+'.js',createHash('sha256').update(gasSources[index]).digest('hex')]));
const environmentNames = Object.keys((await import('../shared/AttendanceEnvironment.js')).createAttendanceEnvironment(
  {daoCore:{},timezone:'Asia/Tokyo'}, {uuid:()=>''}));
const attendanceFactory = `function createAttendanceRegistration(ctx, dependencies) {
const {${environmentNames.join(',')}}=require('./AttendanceEnvironment.js').createAttendanceEnvironment(ctx,dependencies);
const getSheetRows=(_context,name)=>{if(name!=='20_会費状態View'||!Array.isArray(ctx.receptionViews))throw Error('BILLING_READ_UNAVAILABLE');return ctx.receptionViews;};
${gasSources.join('\n')}
return {register: input => registerAttendanceBatchLocked_(input,ctx),
projectReceptionSources({invoices,payments,attendances}) {
  return {invoices:paymentStatusView_makeInvoiceItems_(invoices),
    payments:payments.map(row=>paymentStatusView_makePaymentDetailFromRow_(row)),
    attendances:attendances.filter(isActiveMasterRow_).map(paymentStatusView_makeAttendanceDetailFromRow_)};
},
readReceptionSummary: input=>paymentReception_getScopeSummary(input,ctx),
readMemberInfo(memberId,month,view) {
  if(view){
    const template=paymentStatusView_schemaTemplate_();
    for(const key of Object.keys(template)){
      if(!Object.prototype.hasOwnProperty.call(view,key))throw Error('INVALID_FEE_VIEW');
      if(typeof template[key]==='number'&&(!Number.isFinite(view[key])||view[key]<0))throw Error('INVALID_FEE_VIEW');
      if(typeof template[key]==='boolean'&&![true,false,'TRUE','FALSE'].includes(view[key]))throw Error('INVALID_FEE_VIEW');
      if(typeof template[key]==='string'&&key!=='更新日時'&&typeof view[key]!=='string')throw Error('INVALID_FEE_VIEW');
      if(key.endsWith('_json')){let parsed;try{parsed=JSON.parse(view[key]);}catch{throw Error('INVALID_FEE_VIEW');}
        if(!Array.isArray(parsed)||parsed.some(item=>!item||typeof item!=='object'||Array.isArray(item)))throw Error('INVALID_FEE_VIEW');
        const identity={invoice_items_json:'invoice_id',unpaid_invoice_items_json:'invoice_id',reception_payments_json:'payment_id',attendance_items_json:'attendance_id'}[key];
        if(parsed.some(item=>typeof item[identity]!=='string'||!item[identity]||
          (key!=='attendance_items_json'&&(!Number.isFinite(item.amount)||item.amount<0))))throw Error('INVALID_FEE_VIEW');}
    }
  }
  const facts=paymentStatusView_collectContext(memberId,month,ctx);
  if(!facts||facts.ok!==true)throw Error('FEE_SOURCE_UNAVAILABLE');
  const row=paymentStatusView_buildRow(memberId,month,facts);
  return paymentStatusView_convertResponse(row,ctx);
}};
}`;
// Reuse the GAS overview and scope filter without adding a second business implementation.
const teacherFactory = `function createTeacherAttendanceOverview({rows,summaries,date}) {
const Job=class {}, ensureSheetContext=x=>x, daoContext_=x=>x;
const normalizeId_=v=>String(v??'').trim();
const parseAttendanceDate_=v=>v||date, formatAttendanceDate_=v=>String(v||date).slice(0,10);
const daoCore_=()=>({readAttendanceScopeRows:()=>rows});
const attendanceCore_findRowsForScope_= (params,ctx)=>daoAttendanceFindRowsForScope_(params,ctx);
const attendanceProgress_getMemberSummaries=()=>summaries;
${fs.readFileSync(path.join(root,'gas/DAO_Business_Attendance.js'),'utf8')}
${fs.readFileSync(path.join(root,'gas/04_AttendanceTeacher.js'),'utf8')}
return params=>attendanceTeacherGetTodayOverview(params,{});
}`;
const output=`/* TimeTrip Firestore generated artifact. Do not edit. */
const DojoTimeTravelFirestore=(function(){const modules={${modules}};const cache={};function require(name){if(!Object.prototype.hasOwnProperty.call(modules,name))throw new Error(name);if(!cache[name]){const m={exports:{}};cache[name]=m;modules[name](m,m.exports,require);}return cache[name].exports;}
const {createFirestoreCore}=require("./DAO_Core_Firestore.cjs");
const {createSettingDao}=require("./DAO_Business_Setting.js");
const {settingDefinition}=require("./DAO_Definition_Setting.generated.js");
const {createApplication}=require("./TimeApplicationCore.js");
${attendanceFactory}
${teacherFactory}
return {createApplication(config={},dependencies={}){const core=createFirestoreCore(config,dependencies);const dao=createSettingDao(core,'firestore',settingDefinition);return createApplication(dao,dependencies);},createAttendanceRegistration,createTeacherAttendanceOverview,gasSourceHashes:${JSON.stringify(gasSourceHashes)}};})();
module.exports=DojoTimeTravelFirestore;
`;
const outDir=path.join(root,'.build','portable-timetravel-firestore');
fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(path.join(outDir,'DojoTimeTravelFirestore.cjs'),output);
console.log('Generated .build/portable-timetravel-firestore/DojoTimeTravelFirestore.cjs');
