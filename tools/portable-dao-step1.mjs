import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function buildPortableDaoStep1(target) {
  if(!['gas','firestore'].includes(target)) throw new Error('Target must be gas or firestore');
  const output=path.join(root,'.build','portable-dao-step1-'+target);
  fs.mkdirSync(output,{recursive:true});
  const names=['StorageId.js','Flow.js','DAO_Definitions.js','DAO_Business.js'];
  const sources=Object.fromEntries(names.map(name=>['./'+name,fs.readFileSync(path.join(root,'shared',name),'utf8')]));
  sources['./DAO_Core.js']=fs.readFileSync(path.join(root,'adapters',target,'DAO_Core.js'),'utf8');
  if(target==='firestore') {
    for(const name of ['DAO_Core_Firestore.cjs','DAO_Core_Values.cjs']) sources['./'+name]=fs.readFileSync(path.join(root,'cloud/member-read',name),'utf8');
  }
  const hashes=Object.fromEntries(Object.entries(sources).map(([name,source])=>[name,crypto.createHash('sha256').update(source).digest('hex')]));
  const modules=Object.entries(sources).map(([name,source])=>JSON.stringify(name)+':function(module,exports,require){\n'+source+'\n}').join(',\n');
  const bundle='/* Step 1 Portable DAO generated artifact. Do not edit. */\n'+
    '(function(rootFactory){const api=rootFactory();if(typeof module!=="undefined"&&module.exports)module.exports=api;else globalThis.DojoPortableDao=api;})(function(){\n'+
    'const modules={'+modules+'};const cache={};function require(name){if(!Object.hasOwn(modules,name))throw new Error("Unknown module "+name);if(!cache[name]){const m={exports:{}};cache[name]=m;modules[name](m,m.exports,require);}return cache[name].exports;}\n'+
    'const {createDao}=require("./DAO_Business.js");const adapter=require("./DAO_Core.js");return {backend:adapter.backend,create(config,dependencies,registry){return createDao(adapter.createCore(config,dependencies),adapter.backend,registry);}};\n'+
    '});\n';
  const outName=target==='gas'?'DojoPortableDao.js':'DojoPortableDao.cjs';
  fs.writeFileSync(path.join(output,outName),bundle);
  fs.writeFileSync(path.join(output,'sources.json'),JSON.stringify({target,sources:hashes},null,2)+'\n');
  return output;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) console.log(buildPortableDaoStep1(process.argv[2]));
