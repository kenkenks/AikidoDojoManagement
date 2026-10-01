import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const names=['Flow','DAO_Definition_Setting.generated','DAO_Business_Setting','SystemContext','TimeTravel','TimeApplicationCore'];
const sources=Object.fromEntries(names.map(name=>['./'+name+'.js',fs.readFileSync(path.join(root,'shared',name+'.js'),'utf8')]));
sources['./DAO_Core_Firestore.cjs']=fs.readFileSync(path.join(root,'cloud/member-read/DAO_Core_Firestore.cjs'),'utf8');
sources['./DAO_Core_Values.cjs']=fs.readFileSync(path.join(root,'cloud/member-read/DAO_Core_Values.cjs'),'utf8');
const modules=Object.entries(sources).map(([name,source])=>JSON.stringify(name)+':function(module,exports,require){\n'+source+'\n}').join(',\n');
const output=`/* TimeTrip Firestore generated artifact. Do not edit. */
const DojoTimeTravelFirestore=(function(){const modules={${modules}};const cache={};function require(name){if(!Object.prototype.hasOwnProperty.call(modules,name))throw new Error(name);if(!cache[name]){const m={exports:{}};cache[name]=m;modules[name](m,m.exports,require);}return cache[name].exports;}
const {createFirestoreCore}=require("./DAO_Core_Firestore.cjs");
const {createSettingDao}=require("./DAO_Business_Setting.js");
const {settingDefinition}=require("./DAO_Definition_Setting.generated.js");
const {createApplication}=require("./TimeApplicationCore.js");
return {createApplication(config={},dependencies={}){const core=createFirestoreCore(config,dependencies);const dao=createSettingDao(core,'firestore',settingDefinition);return createApplication(dao,dependencies);}};})();
module.exports=DojoTimeTravelFirestore;
`;
const outDir=path.join(root,'.build','portable-timetravel-firestore');
fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(path.join(outDir,'DojoTimeTravelFirestore.cjs'),output);
console.log('Generated .build/portable-timetravel-firestore/DojoTimeTravelFirestore.cjs');
