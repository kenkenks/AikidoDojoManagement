'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const cp=require('node:child_process');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
cp.execFileSync(process.execPath,[path.join(root,'tools/build-time-travel-firestore.mjs')],{cwd:root});
const artifact=path.join(root,'.build/portable-timetravel-firestore/DojoTimeTravelFirestore.cjs');
const {createApplication}=require(artifact);

function response(status,body){return {ok:status>=200&&status<300,status,async json(){return body;}};}

test('Firestore TimeTrip uses Setting business port without generic portable DAO', async()=>{
  const docs=new Map([
    ['TIME_TRAVEL_ENABLED',{key:'TIME_TRAVEL_ENABLED',value:'FALSE'}],
    ['DEBUG_DATE',{key:'DEBUG_DATE',value:''}],
    ['DEBUG_TARGET_MONTH',{key:'DEBUG_TARGET_MONTH',value:''}],
    ['DEBUG',{key:'DEBUG',value:'FALSE'}]
  ]);
  const fetchImpl=async(url,options={})=>{
    const id=decodeURIComponent(url.split('/').pop().split('?')[0]);
    if ((options.method||'GET')==='GET') {
      if (!docs.has(id)) return response(404,{error:{status:'NOT_FOUND'}});
      const fields=Object.fromEntries(Object.entries(docs.get(id)).map(([k,v])=>[k,{stringValue:v}]));
      return response(200,{name:`projects/demo-dojo/databases/(default)/documents/settings/${id}`,fields});
    }
    const body=JSON.parse(options.body);
    const values=Object.fromEntries(Object.entries(body.fields).map(([k,v])=>[k,v.stringValue]));
    docs.set(id,{...(docs.get(id)||{}),...values});
    return response(200,{name:`projects/demo-dojo/databases/(default)/documents/settings/${id}`,fields:body.fields});
  };
  const app=createApplication({projectId:'demo-dojo',mode:'emulator',host:'127.0.0.1:8080'},{fetchImpl,clock:()=>new Date('2026-10-02T00:00:00Z')});
  assert.equal((await app.getTimeTravel()).enabled,false);
  const saved=await app.saveTimeTravel({enabled:true,now:'2099-07-09T10:00:00+09:00',target_month:'2099-07'});
  assert.equal(saved.ok,true);
  assert.equal(saved.effective.time_travel_enabled,true);
  assert.equal(saved.effective.target_month,'2099-07');
  assert.equal(docs.get('TIME_TRAVEL_ENABLED').value,'TRUE');
});
