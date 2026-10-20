'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const WebConnectCore=require('../shared/WebConnectCore.js');
const {validatePaperOcrInput}=require('../cloud/attendance/paper-ocr-document-ai.cjs');
const {createPaperOcrGemini,PAPER_OCR_GEMINI_PROMPT}=require('../cloud/attendance/paper-ocr-gemini.cjs');
const {createAdminApi}=require('../cloud/api/admin-api.cjs');
const {readJsonBody,STANDARD_JSON_LIMIT,PAPER_OCR_JSON_LIMIT}=require('../cloud/api/request-body.cjs');
let passed=0;async function test(name,fn){await fn();passed++;console.log('PASS',name);}
function png(width=100,height=100){const b=Buffer.alloc(24);b.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);b.writeUInt32BE(width,16);b.writeUInt32BE(height,20);return b.toString('base64');}
function handler(options={}){return createAdminApi({verifyIdToken:async()=>options.user||{uid:'u',admin:true},getSystemContext:async()=>({ok:true}),getTimeTravel:async()=>null,saveTimeTravel:async()=>null,readMember:async()=>null,readMembers:async()=>[],readPaperAttendanceOcr:options.ocr||(async()=>({ok:true,candidates:[]})),resolveDojoPrincipal:options.principal?(async()=>options.principal):undefined,isActiveTeacher:async()=>true});}
(async()=>{
 await test('WebConnect resolves read-only OCR operation',()=>{assert.deepEqual(WebConnectCore.resolve('paper_attendance_ocr',{x:1}),{operation:'attendance.paperOcr',input:{x:1}});});
 await test('validates image without persistence',()=>{const value=validatePaperOcrInput({mime_type:'image/png',image_base64:png()});assert.equal(value.size.width,100);assert.equal(value.buffer.length,24);});
 await test('rejects invalid and oversized input',()=>{assert.throws(()=>validatePaperOcrInput({mime_type:'text/plain',image_base64:'QQ=='}),/INVALID_PAPER_OCR_INPUT/);assert.throws(()=>validatePaperOcrInput({mime_type:'image/png',image_base64:Buffer.alloc(4*1024*1024+1).toString('base64')}),/PAPER_OCR_IMAGE_TOO_LARGE/);});
 await test('Vertex Gemini adapter returns direct grid candidates without personal data',async()=>{
   let request;
   const model={grid:{rows:20,columns:20,printed_row_top:20,printed_row_bottom:1,column_direction:'left-to-right'},suspected_cells:[{printed_row:20,column:1,status:'recognized',date:'9/23',candidate_dates:[],confidence:.9,review_reason:'',sequence_check:'ok'},{printed_row:19,column:1,status:'review',date:'',candidate_dates:['9/21','9/27'],confidence:.5,review_reason:'末尾が不明瞭',sequence_check:'要確認'}],notes:['氏名は除外']};
   const read=createPaperOcrGemini({project:'dojo-management-dev',location:'global',model:'gemini-2.5-flash',getAccessToken:async()=>'secret',fetchImpl:async(url,init)=>{request={url,init};return{ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(model)}]}}]})};}});
   const result=await read({mime_type:'image/png',image_base64:png()});
   assert.equal(result.engine,'vertex-gemini');assert.equal(result.candidates.length,2);assert.deepEqual([result.candidates[0].printed_row,result.candidates[0].column,result.candidates[0].text],[20,1,'9/23']);assert.equal(result.candidates[1].status,'review');assert.match(request.url,/aiplatform\.googleapis\.com.*gemini-2\.5-flash:generateContent/);assert.match(request.init.headers.Authorization,/Bearer secret/);assert.match(request.init.body,/responseSchema/);assert.doesNotMatch(JSON.stringify(result),/氏名/);
 });
 await test('Gemini prompt preserves the verified round-2 grid and chronology contract',()=>{assert.match(PAPER_OCR_GEMINI_PROMPT,/最上段は20、最下段は1/);assert.match(PAPER_OCR_GEMINI_PROMPT,/各列の下から上/);assert.match(PAPER_OCR_GEMINI_PROMPT,/同じ日の2枠/);assert.match(PAPER_OCR_GEMINI_PROMPT,/画像にない出席や日付を追加してはならない/);});
 await test('admin is allowed',async()=>{const result=await handler()({operation:'attendance.paperOcr',method:'POST',authorization:'Bearer token',input:{}});assert.equal(result.status,200);});
 await test('active teacher is allowed',async()=>{const result=await handler({user:{uid:'t'},principal:{teacher_id:'T001'}})({operation:'attendance.paperOcr',method:'POST',authorization:'Bearer token',input:{}});assert.equal(result.status,200);});
 await test('unauthenticated and unrelated user are rejected',async()=>{assert.equal((await handler()({operation:'attendance.paperOcr',method:'POST',input:{}})).status,401);assert.equal((await handler({user:{uid:'x'}})({operation:'attendance.paperOcr',method:'POST',authorization:'Bearer token',input:{}})).status,403);});
 await test('large transport is isolated from existing 64KiB actions',()=>{const server=fs.readFileSync(path.join(__dirname,'../cloud/api/server.cjs'),'utf8');assert.equal(STANDARD_JSON_LIMIT,64*1024);assert.equal(PAPER_OCR_JSON_LIMIT,6*1024*1024);assert.match(server,/paperOcrTransport\?PAPER_OCR_JSON_LIMIT:STANDARD_JSON_LIMIT/);assert.match(server,/body\?\.action!==['"]paper_attendance_ocr/);});
 await test('server selects Vertex Gemini while retaining the existing WebConnect action',()=>{const server=fs.readFileSync(path.join(__dirname,'../cloud/api/server.cjs'),'utf8'),profile=JSON.parse(fs.readFileSync(path.join(__dirname,'../targets/dev-firebase.json'),'utf8'));assert.match(server,/createPaperOcrGemini/);assert.equal(profile.paperAttendanceOcr.model,'gemini-2.5-flash');assert.equal(profile.paperAttendanceOcr.location,'global');assert.equal(profile.paperAttendanceOcr.processor,undefined);});
 await test('stream limit works without Content-Length',async()=>{const req={headers:{},async *[Symbol.asyncIterator](){yield Buffer.alloc(40*1024,0x20);yield Buffer.alloc(30*1024,0x20);}};await assert.rejects(()=>readJsonBody(req,STANDARD_JSON_LIMIT),error=>error.code==='BODY_TOO_LARGE');});
 await test('stream limit defeats understated Content-Length',async()=>{const req={headers:{'content-length':'2'},async *[Symbol.asyncIterator](){yield Buffer.alloc(65*1024,0x20);}};await assert.rejects(()=>readJsonBody(req,STANDARD_JSON_LIMIT),error=>error.code==='BODY_TOO_LARGE');});
 await test('oversized declared Content-Length rejects before reading',async()=>{let read=false;const req={headers:{'content-length':String(PAPER_OCR_JSON_LIMIT+1)},async *[Symbol.asyncIterator](){read=true;yield Buffer.from('{}');}};await assert.rejects(()=>readJsonBody(req,PAPER_OCR_JSON_LIMIT),error=>error.code==='BODY_TOO_LARGE');assert.equal(read,false);});
 console.log('RESULT',passed,'passed');
})().catch(error=>{console.error(error);process.exit(1);});
