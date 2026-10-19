'use strict';
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const imagePath=process.argv[2];
if(!imagePath)throw Error('IMAGE_PATH_REQUIRED');
const previousPath=path.resolve('work/paper-attendance-gemini-result-20261019.json');
const outPath=path.resolve('work/paper-attendance-gemini-round2-result-20261019.json');
const project='dojo-management-dev',location='global',model='gemini-2.5-flash';
// Source truth uses image top-to-bottom rows. Convert once, before scoring, to the
// visible printed row numbers requested for round 2 (top=20, bottom=1).
const sourceTruth=new Map([
  ['1,1','10/5'],['2,1','10/3'],['3,1','9/30'],['4,1','9/28'],['5,1','9/26'],['6,1','9/26'],
  ['7,1','9/15'],['8,1','9/25'],['9,1','9/23'],['10,1','9/23'],['11,1','9/21'],['12,1','9/21'],
  ['13,1','9/19'],['14,1','9/19'],['14,2','10/16'],['15,1','9/18'],['15,2','10/16'],
  ['16,1','9/16'],['16,2','10/12'],['17,1','9/14'],['17,2','10/12'],['18,1','9/14'],['18,2','10/1'],
  ['19,1','9/12'],['19,2','10/10'],['20,1','9/12'],['20,2','10/10']
]);
const truth=new Map([...sourceTruth].map(([key,value])=>{const [r,c]=key.split(',').map(Number);return[`${21-r},${c}`,value];}));
const prompt=`定型の出席管理表を解析してください。個人名、級段位、取得日、右側の受験資格表は読み取っても出力せず、中央左の20行×20列の出席記録グリッドだけを対象にしてください。

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
const schema={type:'OBJECT',properties:{grid:{type:'OBJECT',properties:{rows:{type:'INTEGER'},columns:{type:'INTEGER'},printed_row_top:{type:'INTEGER'},printed_row_bottom:{type:'INTEGER'},column_direction:{type:'STRING'}},required:['rows','columns','printed_row_top','printed_row_bottom','column_direction']},suspected_cells:{type:'ARRAY',items:{type:'OBJECT',properties:{printed_row:{type:'INTEGER'},column:{type:'INTEGER'},status:{type:'STRING',enum:['recognized','review']},date:{type:'STRING'},candidate_dates:{type:'ARRAY',items:{type:'STRING'}},confidence:{type:'NUMBER'},review_reason:{type:'STRING'},sequence_check:{type:'STRING'}},required:['printed_row','column','status','date','candidate_dates','confidence','review_reason','sequence_check']}},notes:{type:'ARRAY',items:{type:'STRING'}}},required:['grid','suspected_cells','notes']};
function token(){const command=process.platform==='win32'?'cmd.exe':'gcloud',args=process.platform==='win32'?['/d','/s','/c','gcloud.cmd auth application-default print-access-token --quiet']:['auth','application-default','print-access-token','--quiet'];const r=spawnSync(command,args,{encoding:'utf8'});if(r.status!==0)throw Error('ADC_TOKEN_UNAVAILABLE');return r.stdout.trim();}
function md(v){const m=String(v||'').match(/(?:\d{4}[-/])?(\d{1,2})[/.\-](\d{1,2})/);return m?`${Number(m[1])}/${Number(m[2])}`:'';}
function validDate(v){const m=md(v).split('/').map(Number);return m.length===2&&m[0]>=1&&m[0]<=12&&m[1]>=1&&m[1]<=31;}
(async()=>{
 const image=fs.readFileSync(imagePath),previous=JSON.parse(fs.readFileSync(previousPath,'utf8'));
 const body={contents:[{role:'user',parts:[{text:prompt},{inlineData:{mimeType:'image/jpeg',data:image.toString('base64')}}]}],generationConfig:{temperature:0,maxOutputTokens:16384,responseMimeType:'application/json',responseSchema:schema,thinkingConfig:{thinkingBudget:0}}};
 const url=`https://aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`,started=Date.now();
 const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token()}`,'Content-Type':'application/json'},body:JSON.stringify(body)}),raw=await response.json();
 if(!response.ok)throw Error(`VERTEX_HTTP_${response.status}:${raw.error?.status||'UNKNOWN'}`);
 const text=(raw.candidates?.[0]?.content?.parts||[]).map(x=>x.text||'').join('');let parsed;try{parsed=JSON.parse(text);}catch{throw Error('INVALID_MODEL_JSON');}
 const unique=new Map();for(const c of parsed.suspected_cells||[]){if(Number.isInteger(c.printed_row)&&c.printed_row>=1&&c.printed_row<=20&&Number.isInteger(c.column)&&c.column>=1&&c.column<=20)unique.set(`${c.printed_row},${c.column}`,c);}
 const detected=[...unique.keys()],trueDetected=detected.filter(k=>truth.has(k)),missed=[...truth.keys()].filter(k=>!unique.has(k)),falsePositive=detected.filter(k=>!truth.has(k));
 const details=[...truth].map(([cell,expected])=>{const c=unique.get(cell),actual=c?.status==='recognized'?md(c.date):'';return{cell,expected,detected:!!c,status:c?.status||'missing',actual,candidate_dates:c?.candidate_dates||[],exact:actual===expected,valid_date:c?.status!=='recognized'||validDate(c.date),reason:c?.review_reason||'',sequence_check:c?.sequence_check||''};});
 const exact=details.filter(x=>x.exact).length,invalid=detected.filter(k=>{const c=unique.get(k);return c.status==='recognized'&&!validDate(c.date);}),review=detected.filter(k=>unique.get(k).status==='review');
 const human=new Set([...missed,...falsePositive,...details.filter(x=>x.detected&&!x.exact).map(x=>x.cell),...review]);
 // Previous raw rows coincided with printed row numbers. Compare the 12 cells that
 // remained wrong after the prior report's row-direction interpretation.
 const prev=new Map((previous.model_result.suspected_cells||[]).map(c=>[`${c.row},${c.column}`,md(c.date)]));
 const priorWrong=[...truth].filter(([cell,expected])=>prev.has(cell)&&prev.get(cell)!==expected).map(([cell,expected])=>{const before=prev.get(cell),now=unique.get(cell),after=now?.status==='recognized'?md(now.date):'';let change;if(after===expected)change='improved';else if(!now)change='worsened_to_missing';else if(now.status==='review')change='improved_to_review';else if(after===before)change='unchanged';else change='changed_but_wrong';return{cell,expected,before,after,status:now?.status||'missing',change};});
 const artifact={experiment:{date:'2026-10-19',round:2,project,location,model,requests:1,image_bytes:image.length,elapsed_ms:Date.now()-started,coordinate_contract:'printed row number: top=20, bottom=1; column left-to-right=1..20'},prompt_conditions:{target_area:'central-left 20x20 attendance grid only',privacy_exclusions:['member name','rank','acquisition date','examination requirement table'],coordinates:['printed_row is the number printed at the left edge','top printed_row=20','bottom printed_row=1','columns are left-to-right 1..20'],business_rules:['one cell equals one one-hour practice attendance','duplicate dates in separate cells remain separate','entries normally progress bottom-to-top within a column','after a column fills, entries continue from the bottom of the next column','dates normally progress from past to future','same-date consecutive entries are allowed for two practice slots','month boundaries are allowed','actual entry order can have exceptions'],uncertainty_rules:['image evidence takes priority over sequence','do not invent attendance or dates','ambiguous, invalid, or sequence-conflicting readings must be review','review cells use empty date plus candidates and reason','confidence is not an acceptance criterion','lines, shadows, folds, and stains alone are blank'],schedule_reference:{used:false,reason:'The repository did not provide evidence that identifies this sheet with a specific dojo and weekday; no schedule was invented.'},ground_truth_leakage:{used_in_prompt:false,reason:'Concrete correct date sequences were excluded so recognition accuracy could be evaluated.'}},usage:raw.usageMetadata||{},model_result:parsed,metrics:{ground_truth_written:truth.size,ground_truth_blank:400-truth.size,detected_cells:detected.length,correct_written_detected:trueDetected.length,missed_written:missed.length,false_positive_blank:falsePositive.length,detection_recall:trueDetected.length/truth.size,date_exact:exact,date_exact_rate:exact/truth.size,invalid_recognized_dates:invalid.length,review_cells:review.length,human_correction_or_confirmation_cells:human.size},truth_details:details,missed_cells:missed.map(cell=>({cell,expected:truth.get(cell)})),false_positive_cells:falsePositive.map(cell=>({cell,...unique.get(cell)})),invalid_date_cells:invalid.map(cell=>({cell,date:unique.get(cell).date})),previous_12_error_comparison:priorWrong};
 fs.writeFileSync(outPath,JSON.stringify(artifact,null,2)+'\n','utf8');
 console.log(JSON.stringify({outPath,experiment:artifact.experiment,usage:artifact.usage,metrics:artifact.metrics,missed_cells:artifact.missed_cells,false_positive_cells:falsePositive,invalid_date_cells:artifact.invalid_date_cells,previous_12_error_comparison:priorWrong},null,2));
})().catch(e=>{console.error(e.message);process.exit(1);});
