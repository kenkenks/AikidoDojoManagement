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
  '20_PaymentStatusView','20_PaymentStatusTeacher','09_PaymentEvidenceRequest'];
const gasSources = gasNames.map(name => fs.readFileSync(path.join(root,'gas',name+'.js'),'utf8'));
const {createHash} = await import('node:crypto');
const gasSourceHashes = Object.fromEntries(gasNames.map((name,index) =>
  ['gas/'+name+'.js',createHash('sha256').update(gasSources[index]).digest('hex')]));
const environmentNames = Object.keys((await import('../shared/AttendanceEnvironment.js')).createAttendanceEnvironment(
  {daoCore:{},timezone:'Asia/Tokyo'}, {uuid:()=>''}));
const attendanceFactory = `function createAttendanceRegistration(ctx, dependencies) {
const {${environmentNames.join(',')}}=require('./AttendanceEnvironment.js').createAttendanceEnvironment(ctx,dependencies);
${gasSources.join('\n')}
return {register: input => registerAttendanceBatchLocked_(input,ctx)};
}`;
const output=`/* TimeTrip Firestore generated artifact. Do not edit. */
const DojoTimeTravelFirestore=(function(){const modules={${modules}};const cache={};function require(name){if(!Object.prototype.hasOwnProperty.call(modules,name))throw new Error(name);if(!cache[name]){const m={exports:{}};cache[name]=m;modules[name](m,m.exports,require);}return cache[name].exports;}
const {createFirestoreCore}=require("./DAO_Core_Firestore.cjs");
const {createSettingDao}=require("./DAO_Business_Setting.js");
const {settingDefinition}=require("./DAO_Definition_Setting.generated.js");
const {createApplication}=require("./TimeApplicationCore.js");
${attendanceFactory}
return {createApplication(config={},dependencies={}){const core=createFirestoreCore(config,dependencies);const dao=createSettingDao(core,'firestore',settingDefinition);return createApplication(dao,dependencies);},createAttendanceRegistration,gasSourceHashes:${JSON.stringify(gasSourceHashes)}};})();
module.exports=DojoTimeTravelFirestore;
`;
const outDir=path.join(root,'.build','portable-timetravel-firestore');
fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(path.join(outDir,'DojoTimeTravelFirestore.cjs'),output);
console.log('Generated .build/portable-timetravel-firestore/DojoTimeTravelFirestore.cjs');
