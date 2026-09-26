import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const dependencies=['ensureSheetContext','Utilities','Session','sup_now','sup_today','sup_targetMonth','getMembers','getTeachers','getLocations','getBillingBlocks','getTrainingSlots','daoContext_','daoCore_','cancelAttendanceRows','appendAttendanceRows','paymentStatusView_projectAttendances_'];
const legacy=['gas/04_Attendance.js','gas/04_AttendanceCore.js','gas/DAO_Business_Attendance.js'].map(read).join('\n');
const sources={
 './DAO_Definitions.js':read('shared/DAO_Definitions.js'),'./DAO_Business.js':read('shared/DAO_Business.js'),'./StorageId.js':read('shared/StorageId.js'),'./Flow.js':read('shared/Flow.js'),
 './SystemContext.js':read('shared/SystemContext.js'),'./TimeTravel.js':read('shared/TimeTravel.js'),'./Attendance.js':read('shared/Attendance.js'),
 './ApplicationStep3.js':read('shared/ApplicationStep3.js'),'./DAO_Core.js':read('adapters/gas/DAO_Core.js'),
 './LegacyAttendance.js':'exports.createAttendanceLogic=function(deps){const {'+dependencies.join(',')+'}=deps;\n'+legacy+'\nreturn attendanceCore_registerBatch_;\n};'
};
const modules=Object.entries(sources).map(([n,s])=>JSON.stringify(n)+':function(module,exports,require){\n'+s+'\n}').join(',\n');
const bundle='/* Generated Step 3 GAS Attendance artifact. */\nvar DojoAttendanceStep3=(function(){const modules={'+modules+'};const cache={};function require(n){if(!Object.hasOwn(modules,n))throw new Error("Unknown module "+n);if(!cache[n]){const m={exports:{}};cache[n]=m;modules[n](m,m.exports,require);}return cache[n].exports;}return require("./ApplicationStep3.js");})();\n';
const out=path.join(root,'gas','DojoAttendanceStep3.js'); fs.writeFileSync(out,bundle); console.log('Generated '+path.relative(root,out));
