import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const names=['Flow','StorageId','DAO_Definitions','DAO_Business','SystemContext','TimeTravel','TimeApplicationStep2'];
const sources=Object.fromEntries(names.map(name=>['./'+name+'.js',fs.readFileSync(path.join(root,'shared',name+'.js'),'utf8')]));
sources['./DAO_Core.js']=fs.readFileSync(path.join(root,'adapters/gas/DAO_Core.js'),'utf8');
const modules=Object.entries(sources).map(([name,source])=>JSON.stringify(name)+':function(module,exports,require){\n'+source+'\n}').join(',\n');
const output='/* Step 2AB TimeTrip GAS generated artifact. Do not edit. */\nvar DojoTimeTravelStep2=(function(){const modules={'+modules+'};const cache={};function require(name){if(!Object.prototype.hasOwnProperty.call(modules,name))throw new Error(name);if(!cache[name]){const m={exports:{}};cache[name]=m;modules[name](m,m.exports,require);}return cache[name].exports;}return require("./TimeApplicationStep2.js");})();\n';
const outDir=path.join(root,'.build','portable-timetravel-step2-gas');
fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(path.join(outDir,'DojoTimeTravelStep2.js'),output);
console.log('Generated .build/portable-timetravel-step2-gas/DojoTimeTravelStep2.js');
