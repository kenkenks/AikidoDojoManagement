'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');

function build(target) {
  const result = spawnSync(process.execPath, [path.join(root,'tools','portable-dao-step1.mjs'), target], {cwd:root, encoding:'utf8'});
  assert.equal(result.status, 0, result.stderr || result.stdout);
}
function loadArtifact(target) {
  const file = target === 'gas'
    ? path.join(root,'.build','portable-dao-step1-gas','DojoPortableDao.js')
    : path.join(root,'.build','portable-dao-step1-firestore','DojoPortableDao.cjs');
  delete require.cache[require.resolve(file)];
  return require(file);
}
function makeGasSpreadsheet() {
  const rows = [['key','value','guard'],['STEP4B_UPDATE','before','KEEP']];
  const sheet = {
    getDataRange(){ return {getValues(){ return rows.map(r=>r.slice()); }}; },
    getLastRow(){ return rows.length; },
    getRange(row,col){ return {
      setNumberFormat(){ return this; },
      setValue(value){ while(rows.length < row) rows.push([]); rows[row-1][col-1]=value; return this; }
    }; }
  };
  return { spreadsheet:{getSheetByName(name){ return name === '99_設定' ? sheet : null; }}, rows };
}
function jsonResponse(status, body) {
  return {ok:status>=200&&status<300,status,async json(){return body;}};
}
function makeFirestore() {
  const docs = new Map();
  async function fetchImpl(url, options={}) {
    const u = new URL(url);
    const parts = u.pathname.split('/documents/')[1].split('/').map(decodeURIComponent);
    const collection=parts[0], id=parts[1], key=collection+'/'+id;
    if ((options.method||'GET') === 'GET') {
      if(!docs.has(key)) return jsonResponse(404,{error:{status:'NOT_FOUND'}});
      return jsonResponse(200,{name:`projects/demo-portable-dao/databases/(default)/documents/${key}`,fields:docs.get(key)});
    }
    if(options.method === 'PATCH') {
      const existsParam = u.searchParams.get('currentDocument.exists');
      const exists = existsParam === null ? null : existsParam === 'true';
      if(exists === true && !docs.has(key)) return jsonResponse(404,{error:{status:'NOT_FOUND'}});
      if(exists === false && docs.has(key)) return jsonResponse(409,{error:{status:'ALREADY_EXISTS'}});
      const body=JSON.parse(options.body); const previous=docs.get(key)||{};
      docs.set(key,{...previous,...body.fields});
      return jsonResponse(200,{name:`projects/demo-portable-dao/databases/(default)/documents/${key}`,fields:docs.get(key)});
    }
    return jsonResponse(405,{error:{status:'METHOD_NOT_ALLOWED'}});
  }
  return {docs,fetchImpl};
}
async function verifyGas() {
  build('gas');
  const artifact=loadArtifact('gas');
  assert.equal(artifact.backend,'gas');
  const mock=makeGasSpreadsheet();
  const dao=artifact.create({}, {spreadsheet:mock.spreadsheet});
  assert.deepEqual(dao.updateByKey('setting','STEP4B_UPDATE',{value:'after'}),{found:true});
  assert.equal(mock.rows[1][1],'after');
  assert.equal(mock.rows[1][2],'KEEP');
  const beforeMissing=mock.rows.length;
  assert.deepEqual(dao.updateByKey('setting','STEP4B_MISSING',{value:'must-not-append'}),{found:false});
  assert.equal(mock.rows.length,beforeMissing);
  assert.deepEqual(dao.upsertByKey('setting','STEP1_VERIFY',{value:'created'}),{created:true,updated:false});
  assert.deepEqual(dao.readById('setting','STEP1_VERIFY'),{key:'STEP1_VERIFY',value:'created'});
  assert.deepEqual(dao.upsertByKey('setting','STEP1_VERIFY',{value:'updated'}),{created:false,updated:true});
  assert.deepEqual(dao.readById('setting','STEP1_VERIFY'),{key:'STEP1_VERIFY',value:'updated'});
  mock.rows.splice(1); // mock cleanup only; Step 1 DAO has no delete contract.
}
async function verifyFirestore() {
  build('firestore');
  const artifact=loadArtifact('firestore');
  assert.equal(artifact.backend,'firestore');
  const mock=makeFirestore();
  const dao=artifact.create({mode:'emulator',projectId:'demo-portable-dao',host:'127.0.0.1:8080'},{fetchImpl:mock.fetchImpl});
  mock.docs.set('settings/STEP4B_UPDATE',{key:{stringValue:'STEP4B_UPDATE'},value:{stringValue:'before'},guard:{stringValue:'KEEP'}});
  assert.deepEqual(await dao.updateByKey('setting','STEP4B_UPDATE',{value:'after'}),{found:true});
  assert.equal(mock.docs.get('settings/STEP4B_UPDATE').value.stringValue,'after');
  assert.equal(mock.docs.get('settings/STEP4B_UPDATE').guard.stringValue,'KEEP');
  const beforeMissing=mock.docs.size;
  assert.deepEqual(await dao.updateByKey('setting','STEP4B_MISSING',{value:'must-not-append'}),{found:false});
  assert.equal(mock.docs.size,beforeMissing);
  assert.deepEqual(await dao.upsertByKey('setting','STEP1_VERIFY',{value:'created'}),{upserted:true});
  assert.deepEqual(await dao.readById('setting','STEP1_VERIFY'),{key:'STEP1_VERIFY',value:'created'});
  assert.deepEqual(await dao.upsertByKey('setting','STEP1_VERIFY',{value:'updated'}),{upserted:true});
  assert.deepEqual(await dao.readById('setting','STEP1_VERIFY'),{key:'STEP1_VERIFY',value:'updated'});
  mock.docs.clear(); // mock cleanup only; Step 1 DAO has no delete contract.
}
(async()=>{
  await verifyGas();
  await verifyFirestore();
  console.log('PORTABLE-DAO-STEP1 VERIFY PASS');
  console.log('GAS: UPDATE_PARTIAL PRESERVE MISSING_FALSE UPSERT_CREATE READ UPSERT_UPDATE READ_AGAIN CLEANUP(mock) PASS');
  console.log('FIRESTORE: UPDATE_PARTIAL PRESERVE MISSING_FALSE UPSERT_CREATE READ UPSERT_UPDATE READ_AGAIN CLEANUP(mock) PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
