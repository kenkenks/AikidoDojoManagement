'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const read=path=>fs.readFileSync(path,'utf8');

test('time travel uses AuthGate with an auth-only required setting task',()=>{
  const html=read('web/qr/time_travel.html');
  for(const asset of ['auth_gate.js','page_initialization_manager.js'])assert.match(html,new RegExp(asset.replace('.','\\.')));
  assert.doesNotMatch(html,/system_context_adapter\.js/);
  assert.match(html,/dependencies:\[\{ name:"auth", run:function\(\)\{ return authGate\.requireAuthenticated\(\); \} \}\]/);
  assert.match(html,/requiredTasks:\[\{ name:"timeTravelSetting", run:function\(context\)\{ return loadSetting\("", context, true\); \} \}\]/);
  assert.match(html,/if \(!settingDirty\) \{/);
  assert.match(html,/if \(!isOperationCurrent\(generation\)\) return false/);
  assert.match(html,/initializationManager\.accessLost\("authorization_lost"\)/);
  assert.doesNotMatch(html,/firebaseAuthClient\.signInWithGoogle\(/);
  const inline=[...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)];
  for(const [index,match] of inline.entries())assert.doesNotThrow(()=>new vm.Script(match[1],{filename:'time_travel.html#'+(index+1)}));
});

test('time travel preserves GAS save and restore while Firebase API stays manager-gated',()=>{
  const html=read('web/qr/time_travel.html');
  assert.match(html,/if \(!IS_FIREBASE\) return jsonp\(GAS_URL, \{ action:"time_travel_admin" \}\)/);
  assert.match(html,/fetch\(GAS_URL, \{/);
  assert.match(html,/mode:"no-cors"/);
  assert.match(html,/dojoApiClient\.request\(firebaseApiUrl\("\/api\/system\/admin\/time-travel"\)/);
  assert.match(html,/settingDirty = false/);
});

test('paper attendance keeps OCR as required auth capability and registration data as optional',()=>{
  const html=read('web/qr/paper_attendance_review.html'),js=read('web/qr/paper_attendance_review.js');
  for(const asset of ['auth_gate.js','page_initialization_manager.js'])assert.match(html,new RegExp(asset.replace('.','\\.')));
  assert.match(js,/dependencies:\[\{name:"auth",run:\(\)=>authGate\.requireAuthenticated\(\)\}\]/);
  assert.match(js,/requiredTasks:\[\{name:"ocrReady"/);
  assert.match(js,/optionalTasks:\[\{name:"registrationPreparation",capability:"registrationPreparation"/);
  assert.match(js,/registrationCapability=state\.capabilities\.registrationPreparation===true/);
  assert.match(js,/画像確認とOCRは利用できます/);
  assert.match(js,/registrationRead\("attendance_member_options"\)/);
  assert.match(js,/registrationRead\("system_context"\)/);
  assert.doesNotMatch(html,/system_context_adapter\.js/);
});

test('paper attendance rejects stale OCR and registration results without clearing work',()=>{
  const js=read('web/qr/paper_attendance_review.js');
  assert.match(js,/if\(!isOperationCurrent\(generation\)\)throw Error\("INITIALIZATION_STALE"\)/);
  assert.match(js,/if\(!isOperationCurrent\(generation\)\)return/);
  assert.match(js,/initializationManager\.accessLost\("authorization_lost"\)/);
  assert.match(js,/successfulKeys:successfulRegistrationKeys/);
  const initializer=js.slice(js.indexOf('async function initializeRegistration'),js.indexOf('function prepareRegistration'));
  assert.doesNotMatch(initializer,/manualEdits\s*=|successfulRegistrationKeys\.clear|registrationRequestIds\.clear/);
  assert.match(initializer,/else if\(prior\)preparedRecords=\[\]/);
  assert.match(initializer,/const select=byId\("registrationMember"\),prior=select\.value/);
  assert.match(js,/if\(authUid&&uid&&uid!==authUid\)/);
  assert.doesNotMatch(js,/auth\.signInWithGoogle\(/);
});
