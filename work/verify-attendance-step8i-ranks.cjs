'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createAttendanceRankOptions } = require('../cloud/attendance/rank-options.cjs');
const { createAdminApi } = require('../cloud/api/admin-api.cjs');
const { createDispatch } = require('../cloud/api/webConnect.cjs');
const stub = { verifyIdToken: async token => ({uid:token,admin:token==='admin'}), getSystemContext:async()=>({ok:true,system_now:'2026-10-14',target_month:'2026-10',time_travel_enabled:false}),getTimeTravel:async()=>({}),saveTimeTravel:async()=>({}),readMember:async()=>null,readMembers:async()=>[], resolveDojoPrincipal:async user=>user.uid==='member'?{member_id:'M001'}:null,readAttendanceRankOptions:async()=>({ok:true,rank_options:[{rank_id:'R1'}]}) };
test('rank master projection excludes inactive and keeps GAS field contract', async()=>{
 const read=createAttendanceRankOptions({masterDao:{readPage:async()=>({documents:[{id:'R1',fields:{'状態':'有効','表示名':'初段','表示順':2}},{id:'R2',fields:{'状態':'無効','表示名':'二段'}}],nextPageToken:null})}});
 assert.deepEqual(await read(),{ok:true,rank_options:[{rank_id:'R1',display_name:'初段',official_name:'',qualification_system:'',sort_order:2}]});
});
test('rank GET uses dispatcher and linked member or admin only',async()=>{
 const dispatch=createDispatch(createAdminApi(stub));
 for(const token of ['member','admin']) assert.equal((await dispatch({action:'attendance_rank_options',input:{},context:{authorization:'Bearer '+token}})).status,200);
 for(const token of ['unlinked','teacher']) assert.equal((await dispatch({action:'attendance_rank_options',input:{},context:{authorization:'Bearer '+token}})).status,403);
 assert.equal((await dispatch({action:'attendance_rank_options',input:{},context:{}})).status,401);
});
test('rank reader fails closed on malformed storage',async()=>{
 const read=createAttendanceRankOptions({masterDao:{readPage:async()=>({documents:[{id:'R1',fields:{rank_id:'R2','状態':'有効','表示名':'初段'}}]})}});
 await assert.rejects(read(),/RANK_ID_MISMATCH/);
});
test('Firebase rank call uses existing WebConnect, never GAS fallback',()=>{
 const html=fs.readFileSync('web/qr/attendance.html','utf8');
 const client=fs.readFileSync('web/qr/attendance_firebase_read.js','utf8');
 assert.match(html,/jsonp\(GAS_URL, \{ action: "attendance_rank_options" \}\)/);
 assert.match(client,/attendance_rank_options/);
 assert.match(client,/api\/webconnect/);
});
