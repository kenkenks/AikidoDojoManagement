'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('web/qr/teacher_attendance.html','utf8');
const scripts=[...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match=>match[1]).filter(Boolean);
assert.equal(scripts.length,1,'teacher_attendance inline script');

function boot(search,existing){
  let stored=existing||null;
  const calls=[];
  const elements=new Map();
  const element=id=>{
    if(!elements.has(id))elements.set(id,{id,textContent:'',className:'',disabled:false,value:'主先生',innerHTML:''});
    return elements.get(id);
  };
  const DojoVirtualSession={
    get:()=>stored,
    loginTeacher(id,origin){calls.push(['loginTeacher',id,origin]);stored={role:'TEACHER',teacher_id:id,context:{location_id:'',teacher_id:'',billing_block_id:''}};return stored},
    setContext(patch){calls.push(['setContext',patch]);stored.context={...stored.context,...patch};return stored}
  };
  const sandbox={
    console,URL,URLSearchParams,location:{search},DojoVirtualSession,
    window:{DOJO_RUNTIME_CONFIG:{apiBaseUrl:'https://example.invalid'},addEventListener(){}},
    document:{getElementById:element,body:{append(){}}},
    setTimeout(){},clearTimeout(){},Date,Promise,Html5Qrcode:function(){}
  };
  vm.createContext(sandbox);
  vm.runInContext(scripts[0],sandbox);
  return {calls,stored,elements};
}

{
  const result=boot('?teacher_id=T001&location_id=HONBU');
  assert.deepEqual(result.calls[0],['loginTeacher','T001','PAGE_URL']);
  assert.equal(JSON.stringify(result.calls[1]),JSON.stringify(['setContext',{teacher_id:'T001',location_id:'HONBU'}]));
  assert.equal(result.stored.role,'TEACHER');
  assert.equal(result.stored.teacher_id,'T001');
  assert.equal(result.stored.context.location_id,'HONBU');
  assert.equal(result.elements.get('teacherId').textContent,'T001');
  assert.equal(result.elements.get('locationId').textContent,'HONBU');
}

{
  const existing={role:'TEACHER',teacher_id:'T002',context:{location_id:'TENROKU',teacher_id:'T002',billing_block_id:'B1'}};
  const result=boot('',existing);
  assert.equal(result.calls.length,0,'URL指定なしでは既存ログインを書き換えない');
  assert.equal(result.elements.get('teacherId').textContent,'T002');
  assert.equal(result.elements.get('locationId').textContent,'TENROKU');
  assert.equal(result.elements.get('billingBlockId').textContent,'B1');
}

assert.match(fs.readFileSync('web/qr/sheets/teacher.html','utf8'),/routes\s*=\s*\{\s*TEACHER:\s*"teacher_attendance\.html"\s*\}/);
assert.match(fs.readFileSync('web/qr/attendanceCheck.html','utf8'),/DojoVirtualSession\.loginTeacher\(urlTeacherId,\s*"PAGE_URL"\)/);

function bootIndex(search){
  const html=fs.readFileSync('web/qr/index.html','utf8');
  const inline=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match=>match[1]).filter(Boolean);
  assert.equal(inline.length,1,'index inline script');
  let stored=null;
  const calls=[];
  const nodes=new Map();
  const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',innerHTML:'',className:''});return nodes.get(id)};
  const location={search,href:'https://dojo-management-dev.web.app/qr/index.html'+search};
  const DojoVirtualSession={
    setEntryContext(patch){calls.push(['setEntryContext',patch])},
    loginTeacher(id,origin){calls.push(['loginTeacher',id,origin]);stored={role:'TEACHER',subject_id:id,teacher_id:id};return stored},
    loginMember(id,origin){calls.push(['loginMember',id,origin]);stored={role:'MEMBER',subject_id:id,member_id:id};return stored},
    get:()=>stored,logout(){stored=null}
  };
  const sandbox={console,URL,URLSearchParams,location,DojoVirtualSession,window:{Html5Qrcode:null},document:{getElementById:node},Promise};
  vm.createContext(sandbox);vm.runInContext(inline[0],sandbox);
  return {calls,stored,location};
}

{
  const result=bootIndex('?teacher_id=T003&location_id=HONBU');
  assert.equal(JSON.stringify(result.calls),JSON.stringify([
    ['setEntryContext',{location_id:'HONBU'}],['loginTeacher','T003','PAGE_URL']
  ]));
  assert.equal(result.stored.teacher_id,'T003');
  assert.equal(result.location.href,'teacher_home.html');
}

console.log('FW004 teacher QR login: PASS (index/direct Firebase login, existing session, GAS compatibility)');
