'use strict';

const {validatePaperOcrInput}=require('./paper-ocr-document-ai.cjs');

const MODEL_ID=/^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/;
const PROJECT_ID=/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/;
const LOCATION_ID=/^[a-z0-9-]{2,32}$/;
const PROMPT=`定型の出席管理表を解析してください。個人名、級段位、取得日、右側の受験資格表は読み取っても出力せず、中央左の20行×20列の出席記録グリッドだけを対象にしてください。

座標契約（必ず守る）:
- printed_rowは紙面左端に実際に印刷されている行番号そのものを返す。最上段は20、最下段は1。画像上からの連番へ変換しない。
- columnは日付記入領域の左から1～20。
- 出力前に各セルの左端の印刷行番号を再確認する。

帳票と業務の規則:
- 1セルは1時間の稽古1回。別セルの同じ日付を統合しない。
- 記録は通常、各列の下から上、つまりprinted_row 1→20へ進む。列が埋まると右隣列のprinted_row 1から続く。
- 日付はM/D形式で、基本的に古い日付から新しい日付へ進む。同じ日の2枠では同一日付が連続してよい。月替わりもあり得る。
- 時系列は文字候補の比較に使えるが、画像にない出席や日付を追加してはならない。実際の記入順には例外があり得る。
- 前後関係と矛盾するときは画像を優先して再確認し、矛盾を消すために文字を書き換えない。

不確実性:
- 手書きが見えるセルは、日付を確定できなくても必ず返す。
- 画像だけで確定できない、複数候補がある、不正な月日になる、時系列と矛盾する場合はstatus=reviewとする。
- reviewではdateを空文字にし、candidate_datesとreview_reasonを返す。
- confidenceは参考値にすぎない。高confidenceを理由に曖昧な文字を確定しない。
- 印刷線、影、折り目、汚れだけのセルは返さない。
- 空白セルは列挙せず、suspected_cellsには記入あり又は要確認だけを返す。
- JSON以外の説明やMarkdownは禁止。`;

const RESPONSE_SCHEMA={type:'OBJECT',properties:{grid:{type:'OBJECT',properties:{rows:{type:'INTEGER'},columns:{type:'INTEGER'},printed_row_top:{type:'INTEGER'},printed_row_bottom:{type:'INTEGER'},column_direction:{type:'STRING'}},required:['rows','columns','printed_row_top','printed_row_bottom','column_direction']},suspected_cells:{type:'ARRAY',items:{type:'OBJECT',properties:{printed_row:{type:'INTEGER'},column:{type:'INTEGER'},status:{type:'STRING',enum:['recognized','review']},date:{type:'STRING'},candidate_dates:{type:'ARRAY',items:{type:'STRING'}},confidence:{type:'NUMBER'},review_reason:{type:'STRING'},sequence_check:{type:'STRING'}},required:['printed_row','column','status','date','candidate_dates','confidence','review_reason','sequence_check']}},notes:{type:'ARRAY',items:{type:'STRING'}}},required:['grid','suspected_cells','notes']};

function fail(code,status=400){const error=new Error(code);error.code=code;error.status=status;throw error;}
function normalizedDate(value){const match=String(value||'').normalize('NFKC').trim().replace(/[.／]/g,'/').match(/^(\d{1,2})\/(\d{1,2})$/);if(!match)return'';const month=Number(match[1]),day=Number(match[2]);return month>=1&&month<=12&&day>=1&&day<=31?`${month}/${day}`:'';}
function parseModelJson(payload){const text=(payload?.candidates?.[0]?.content?.parts||[]).map(part=>String(part?.text||'')).join('');try{return JSON.parse(text);}catch{fail('PAPER_OCR_INVALID_MODEL_RESPONSE',503);}}
function normalizeCandidates(parsed){const byCell=new Map();for(const item of Array.isArray(parsed?.suspected_cells)?parsed.suspected_cells:[]){const printedRow=Number(item?.printed_row),column=Number(item?.column);if(!Number.isInteger(printedRow)||printedRow<1||printedRow>20||!Number.isInteger(column)||column<1||column>20)continue;const requestedStatus=item?.status==='recognized'?'recognized':'review',date=normalizedDate(item?.date),status=requestedStatus==='recognized'&&date?'recognized':'review',candidateDates=[...new Set((Array.isArray(item?.candidate_dates)?item.candidate_dates:[]).map(normalizedDate).filter(Boolean))];byCell.set(`${printedRow},${column}`,{printed_row:printedRow,column,status,text:status==='recognized'?date:'',date:status==='recognized'?date:'',candidate_dates:candidateDates,confidence:Number(Math.max(0,Math.min(1,Number(item?.confidence)||0)).toFixed(4)),review_reason:String(item?.review_reason||'').slice(0,240),sequence_check:String(item?.sequence_check||'').slice(0,240)});}return[...byCell.values()].sort((a,b)=>b.printed_row-a.printed_row||a.column-b.column);}

function createPaperOcrGemini(options={}){
  const project=String(options.project||''),location=String(options.location||'global'),model=String(options.model||'gemini-2.5-flash'),getAccessToken=options.getAccessToken,fetchImpl=options.fetchImpl||globalThis.fetch;
  if(!PROJECT_ID.test(project)||!LOCATION_ID.test(location)||!MODEL_ID.test(model)||typeof getAccessToken!=='function'||typeof fetchImpl!=='function')throw new Error('PAPER_OCR_CONFIGURATION_REQUIRED');
  const url=`https://aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;
  return async function readPaperOcr(input){
    const started=Date.now(),{buffer,size,mimeType}=validatePaperOcrInput(input);input.image_base64='';
    const request={contents:[{role:'user',parts:[{text:PROMPT},{inlineData:{mimeType,data:buffer.toString('base64')}}]}],generationConfig:{temperature:0,maxOutputTokens:16384,responseMimeType:'application/json',responseSchema:RESPONSE_SCHEMA,thinkingConfig:{thinkingBudget:0}}};
    const token=await getAccessToken(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
    try{const response=await fetchImpl(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(request),signal:controller.signal});if(!response.ok)fail('PAPER_OCR_UPSTREAM_FAILED',503);const parsed=parseModelJson(await response.json()),candidates=normalizeCandidates(parsed);return{ok:true,engine:'vertex-gemini',model,elapsed_ms:Date.now()-started,image_width:size.width,image_height:size.height,candidates};}catch(error){if(error?.code)throw error;fail('PAPER_OCR_UPSTREAM_FAILED',503);}finally{clearTimeout(timer);}
  };
}

module.exports={createPaperOcrGemini,normalizePaperOcrGeminiCandidates:normalizeCandidates,PAPER_OCR_GEMINI_PROMPT:PROMPT};
