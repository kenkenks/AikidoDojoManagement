import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const sources={
  './DAO_Definitions.js':read('shared/DAO_Definitions.js'),
  './DAO_Business.js':read('shared/DAO_Business.js'),
  './StorageId.js':read('shared/StorageId.js'),
  './Flow.js':read('shared/Flow.js'),
  './AttendanceNative.js':read('shared/AttendanceNative.js'),
  './ApplicationAttendanceNative.js':read('shared/ApplicationAttendanceNative.js'),
  './DAO_Core.js':read('adapters/gas/DAO_Core.js')
};
const modules=Object.entries(sources)
  .map(([name,source])=>JSON.stringify(name)+':function(module,exports,require){\n'+source+'\n}')
  .join(',\n');
const bundle='/* Generated Native GAS Attendance artifact. */\nvar DojoAttendanceNative=(function(){const modules={'+modules+'};const cache={};function require(n){if(!Object.hasOwn(modules,n))throw new Error("Unknown module "+n);if(!cache[n]){const m={exports:{}};cache[n]=m;modules[n](m,m.exports,require);}return cache[n].exports;}return require("./ApplicationAttendanceNative.js");})();\n';
const out=path.join(root,'gas','DojoAttendanceNative.js');
fs.writeFileSync(out,bundle);
console.log('Generated '+path.relative(root,out));
