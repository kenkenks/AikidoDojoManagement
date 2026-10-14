"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "web/qr/attendance.html"), "utf8");
const script = fs.readFileSync(path.join(root, "web/qr/attendance_firebase_read.js"), "utf8");
function create() { const ctx = { URL, globalThis:null };ctx.globalThis=ctx;vm.runInNewContext(script,ctx);return ctx.DOJO_ATTENDANCE_FIREBASE_READ; }
test("Firebase branch never falls back to GAS and disables writes", () => {
  assert.match(html, /IS_FIREBASE_ATTENDANCE \|\| waitingForTeacher/);
  assert.match(html, /sendButton.disabled = IS_FIREBASE_ATTENDANCE/);
  assert.match(html, /if \(IS_FIREBASE_ATTENDANCE\) \{\s*addLog\("Firebase版の出席登録/);
  assert.match(html, /DOJO_ATTENDANCE_FIREBASE_READ\.request/);
});
test("unsupported actions reject without a network request", async () => {
  const client=create();let calls=0;
  for (const action of ["post_receipt", "attendance_batch"]) {
    await assert.rejects(client.request({action,apiClient:{request:()=>{calls++;}},runtimeConfig:{runtime:"firebase"}}),/未接続/);
  }
  assert.equal(calls,0);
});
test("missing login rejects without network request", async () => {
  let calls=0;await assert.rejects(create().request({action:"attendance_saved_state",runtimeConfig:{runtime:"firebase",apiBaseUrl:"https://example.com"},authClient:{ready:Promise.resolve(),getCurrentUser:()=>null},apiClient:{request:()=>{calls++;}}}),/ログイン/);assert.equal(calls,0);
});
test("saved state uses authenticated dispatcher GET", async () => {
  let received;const result=await create().request({action:"attendance_saved_state",params:{member_id:"M001",location_id:"L001",callback:"evil"},runtimeConfig:{runtime:"firebase",apiBaseUrl:"https://api.example.com/"},authClient:{ready:Promise.resolve(),getCurrentUser:()=>({uid:"u1"})},apiClient:{request:async (url,init)=>{received={url,init};return {ok:true,json:async()=>({ok:true,selected_slot_ids:[]})};}}});
  const url=new URL(received.url);assert.equal(url.pathname,"/api/webconnect");assert.equal(url.searchParams.get("member_id"),"M001");assert.equal(url.searchParams.has("callback"),false);assert.equal(received.init.method,"GET");assert.equal(result.ok,true);
});
test("HTTP denial propagates and no alternate endpoint is tried", async () => {
  let calls=0;await assert.rejects(create().request({action:"attendance_saved_state",params:{member_id:"M002"},runtimeConfig:{runtime:"firebase",apiBaseUrl:"https://api.example.com"},authClient:{ready:Promise.resolve(),getCurrentUser:()=>({uid:"u1"})},apiClient:{request:async()=>{calls++;return {ok:false,status:403};}}}),/403/);assert.equal(calls,1);
});

test("member attendance state uses authenticated GET with required fields", async () => {
  let received;
  await create().request({action:"member_attendance_state",params:{member_id:"M001",location_id:"L001",billing_block_id:"B001",attendance_date:"2026-10-14"},runtimeConfig:{runtime:"firebase",apiBaseUrl:"https://api.example.com"},authClient:{ready:Promise.resolve(),getCurrentUser:()=>({uid:"u1"})},apiClient:{request:async(url,init)=>{received={url,init};return {ok:true,json:async()=>({ok:true})};}}});
  const url = new URL(received.url);
  assert.equal(url.searchParams.get("action"),"member_attendance_state");
  assert.equal(url.searchParams.get("billing_block_id"),"B001");
  assert.equal(received.init.method,"GET");
});
