const assert=require('node:assert/strict');
const docs=new Map([
  ['settings/TIME_TRAVEL_ENABLED',{key:'TIME_TRAVEL_ENABLED',value:'FALSE'}],
  ['settings/DEBUG',{key:'DEBUG',value:'TRUE'}]
]);
function encodeFields(row){return Object.fromEntries(Object.entries(row).map(([k,v])=>[k,{stringValue:String(v)}]));}
function response(status,body){return {status,ok:status>=200&&status<300,async json(){return body;}};}
async function fetchImpl(url,options={}){
  const u=new URL(url), tail=u.pathname.split('/documents/')[1];
  const parts=tail.split('/').map(decodeURIComponent), key=parts[0]+'/'+parts[1];
  const method=options.method||'GET';
  if(method==='GET'){
    if(!docs.has(key)) return response(404,{error:{status:'NOT_FOUND'}});
    return response(200,{name:`projects/demo-dojo/databases/(default)/documents/${key}`,fields:encodeFields(docs.get(key))});
  }
  if(method==='PATCH'){
    const exists=u.searchParams.get('currentDocument.exists')==='true';
    if(exists&&!docs.has(key)) return response(404,{error:{status:'NOT_FOUND'}});
    if(!exists&&docs.has(key)) return response(409,{error:{status:'ALREADY_EXISTS'}});
    const body=JSON.parse(options.body), next={...(docs.get(key)||{})};
    for(const [field,value] of Object.entries(body.fields||{})) next[field]=value.stringValue;
    docs.set(key,next);
    return response(200,{name:`projects/demo-dojo/databases/(default)/documents/${key}`,fields:encodeFields(next)});
  }
  return response(405,{error:{status:'METHOD_NOT_ALLOWED'}});
}
(async()=>{
  const {createApplication}=require('../.build/portable-timetravel-step2-firestore/DojoTimeTravelStep2.cjs');
  const app=createApplication(
    {mode:'emulator',projectId:'demo-dojo',host:'127.0.0.1:8080'},
    {fetchImpl,timezone:'Asia/Tokyo',clock:()=>new Date('2026-09-26T06:00:00Z')}
  );
  assert.equal((await app.getTimeTravel()).enabled,false);
  const enabled=await app.saveTimeTravel({enabled:true,now:'2099-07-09T10:00:00+09:00',target_month:'2099-07'});
  assert.equal(enabled.ok,true); assert.equal(enabled.effective.system_now,'2099-07-09 10:00:00');
  assert.equal(enabled.effective.target_month,'2099-07');
  assert.equal((await app.getTimeTravel()).target_month,'2099-07');
  const updated=await app.saveTimeTravel({enabled:true,now:'2099-07-10T10:00:00+09:00',target_month:'2099-08'});
  assert.equal(updated.effective.target_month,'2099-08');
  assert.equal(docs.get('settings/DEBUG').value,'TRUE');
  const disabled=await app.saveTimeTravel({enabled:false});
  assert.equal(disabled.ok,true); assert.equal(disabled.effective.time_travel_enabled,false);
  assert.equal(docs.get('settings/DEBUG').value,'TRUE');
  console.log('TIME-TRAVEL-STEP2 FIRESTORE VERIFY PASS');
  console.log('READ CREATE UPDATE READ_AGAIN DISABLE PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
