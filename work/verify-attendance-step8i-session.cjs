'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {createAdminApi} = require('../cloud/api/admin-api.cjs');
const {createDispatch} = require('../cloud/api/webConnect.cjs');
const make = (principal, admin=false) => createDispatch(createAdminApi({
 verifyIdToken: async () => ({uid:'uid1',admin}),
 getTimeTravel:async()=>({}),saveTimeTravel:async()=>({}),
 getSystemContext:async()=>({ok:true,system_now:'2026-10-14',target_month:'2026-10',time_travel_enabled:false}),
 readMember:async()=>null,readMembers:async()=>[],
 readAttendanceSavedState:async p=>({ok:true,member_id:p.member_id}),
 readAttendanceSessionInfo:async p=>({ok:true,location_id:p.location_id,slots:[]}),
 resolveDojoPrincipal:async()=>principal
}));
const call = (d,input) => d({action:'attendance_session_info',input,context:{authorization:'Bearer token'}});
test('linked member can read existing session info',async()=>{
 const r=await call(make({uid:'uid1',member_id:'M001'}),{location_id:'L1'});
 assert.equal(r.status,200);assert.equal(r.body.location_id,'L1');
});
test('unlinked member and teacher-only identity cannot read session info',async()=>{
 for (const principal of [null,{uid:'uid1',teacher_id:'T1'}])
  assert.equal((await call(make(principal),{location_id:'L1'})).status,403);
});
test('member cannot override server time for session lookup',async()=>{
 assert.equal((await call(make({uid:'uid1',member_id:'M001'}),{location_id:'L1',at:'2025-01-01'})).status,403);
 assert.equal((await call(make(null,true),{location_id:'L1',at:'2025-01-01'})).status,200);
});
test('member and admin restrictions on other actions remain unchanged',async()=>{
 const d=make({uid:'uid1',member_id:'M001'});
 assert.equal((await d({action:'member_read',input:{member_id:'M001'},context:{authorization:'Bearer token'}})).status,403);
 assert.notEqual((await d({action:'attendance_batch',input:{},context:{authorization:'Bearer token'}})).status,200);
});
test('browser routes session read to existing dispatcher and blocks unsupported actions',async()=>{
 const code=fs.readFileSync(require.resolve('../web/qr/attendance_firebase_read.js'),'utf8');
 const ctx={URL,Set};ctx.globalThis=ctx;vm.runInNewContext(code,ctx);
 let requested;
 const args={runtimeConfig:{runtime:'firebase',apiBaseUrl:'https://example.com'},authClient:{ready:Promise.resolve(),getCurrentUser:()=>({uid:'uid1'})},apiClient:{request:async url=>{requested=url;return {ok:true,json:async()=>({ok:true})}}}};
 await ctx.DOJO_ATTENDANCE_FIREBASE_READ.request({...args,action:'attendance_session_info',params:{location_id:'L1'}});
 assert.equal(new URL(requested).searchParams.get('action'),'attendance_session_info');
 await assert.rejects(()=>ctx.DOJO_ATTENDANCE_FIREBASE_READ.request({...args,action:'attendance_batch'}),/未接続/);
});
