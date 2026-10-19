'use strict';
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const imagePath=process.argv[2];
if(!imagePath)throw Error('IMAGE_PATH_REQUIRED');
const round2Path=path.resolve('work/paper-attendance-gemini-round2-result-20261019.json');
const round3Path=path.resolve('work/paper-attendance-gemini-round3-retry-result-20261019.json');
const outPath=path.resolve('work/paper-attendance-gemini-round4-result-20261019.json');
const failurePath=path.resolve('work/paper-attendance-gemini-round4-failure-20261019.json');
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
- 手書き日付を判別するときは、画像の文字形状と前後の日付の流れを同時に参考にする。両者を別々の工程として扱う必要はない。ただし、時系列だけを根拠に日付を創作しない。

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
 const image=fs.readFileSync(imagePath),round2=JSON.parse(fs.readFileSync(round2Path,'utf8')),round3=JSON.parse(fs.readFileSync(round3Path,'utf8'));
 const body={contents:[{role:'user',parts:[{text:prompt},{inlineData:{mimeType:'image/jpeg',data:image.toString('base64')}}]}],generationConfig:{temperature:0,maxOutputTokens:16384,responseMimeType:'application/json',responseSchema:schema,thinkingConfig:{thinkingBudget:0}}};
 const url=`https://aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`,started=Date.now();
 const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token()}`,'Content-Type':'application/json'},body:JSON.stringify(body)}),raw=await response.json();
 if(!response.ok){const failure={experiment:{date:'2026-10-19',round:4,project,location,model,requests:1},http_status:response.status,error_status:raw.error?.status||'UNKNOWN',error_message:raw.error?.message||'',retry_after:response.headers.get('retry-after'),quota_details:raw.error?.details||[]};fs.writeFileSync(failurePath,JSON.stringify(failure,null,2)+'\n','utf8');throw Error(`VERTEX_HTTP_${response.status}:${raw.error?.status||'UNKNOWN'}`);}
 const text=(raw.candidates?.[0]?.content?.parts||[]).map(x=>x.text||'').join('');let parsed;try{parsed=JSON.parse(text);}catch{throw Error('INVALID_MODEL_JSON');}
 const unique=new Map();for(const c of parsed.suspected_cells||[]){if(Number.isInteger(c.printed_row)&&c.printed_row>=1&&c.printed_row<=20&&Number.isInteger(c.column)&&c.column>=1&&c.column<=20)unique.set(`${c.printed_row},${c.column}`,c);}
 const detected=[...unique.keys()],trueDetected=detected.filter(k=>truth.has(k)),missed=[...truth.keys()].filter(k=>!unique.has(k)),falsePositive=detected.filter(k=>!truth.has(k));
 const details=[...truth].map(([cell,expected])=>{const c=unique.get(cell),actual=c?.status==='recognized'?md(c.date):'';return{cell,expected,detected:!!c,status:c?.status||'missing',actual,candidate_dates:c?.candidate_dates||[],exact:actual===expected,valid_date:c?.status!=='recognized'||validDate(c.date),reason:c?.review_reason||'',sequence_check:c?.sequence_check||''};});
 const exact=details.filter(x=>x.exact).length,invalid=detected.filter(k=>{const c=unique.get(k);return c.status==='recognized'&&!validDate(c.date);}),review=detected.filter(k=>unique.get(k).status==='review');
 const human=new Set([...missed,...falsePositive,...details.filter(x=>x.detected&&!x.exact).map(x=>x.cell),...review]);
 const round2Map=new Map(round2.truth_details.map(x=>[x.cell,x]));
 const round3Map=new Map(round3.truth_details.map(x=>[x.cell,x]));
 const comparison=details.map(x=>{const r2=round2Map.get(x.cell)||{},r3=round3Map.get(x.cell)||{};return{cell:x.cell,expected:x.expected,round2:r2.actual||'',round2_exact:!!r2.exact,round2_review:r2.status==='review',round3:r3.actual||'',round3_exact:!!r3.exact,round3_review:!!r3.model_needs_review,round4:x.actual,round4_exact:x.exact,round4_review:x.status==='review'};});
 const worsenedInRound3=['20,1','19,1','5,1'].map(cell=>comparison.find(x=>x.cell===cell));
 const artifact={experiment:{date:'2026-10-19',round:4,project,location,model,requests:1,image_bytes:image.length,elapsed_ms:Date.now()-started,coordinate_contract:'printed row number: top=20, bottom=1; column left-to-right=1..20'},prompt_conditions:{baseline:'Round 2 prompt and response schema',added_in_round4:'When distinguishing a handwritten date, consider the visual character shapes and the surrounding date sequence at the same time. They need not be separate stages. Do not invent a date from chronology alone.',removed_from_round3:['mandatory visual_reading-first stage','prohibition on revising visual_reading after sequence inspection','candidate_dates-only use of neighboring dates','visual_reading/candidate_dates split response schema'],retained_constraints:['do not invent attendance or dates from chronology alone','do not add records absent from the image','invalid dates must be review','conflicts between character shape and chronology must be review'],ground_truth_leakage:{used_in_prompt:false,reason:'Correct dates were excluded from the prompt.'}},usage:raw.usageMetadata||{},model_result:parsed,metrics:{ground_truth_written:truth.size,ground_truth_blank:400-truth.size,detected_cells:detected.length,correct_written_detected:trueDetected.length,missed_written:missed.length,false_positive_blank:falsePositive.length,detection_recall:trueDetected.length/truth.size,date_exact:exact,date_exact_rate:exact/truth.size,invalid_recognized_dates:invalid.length,review_cells:review.length,human_correction_or_confirmation_cells:human.size},truth_details:details,missed_cells:missed.map(cell=>({cell,expected:truth.get(cell)})),false_positive_cells:falsePositive.map(cell=>({cell,...unique.get(cell)})),invalid_date_cells:invalid.map(cell=>({cell,date:unique.get(cell).date})),round2_round3_round4_comparison:comparison,round3_worsened_three_cells:worsenedInRound3};
 fs.writeFileSync(outPath,JSON.stringify(artifact,null,2)+'\n','utf8');
 console.log(JSON.stringify({outPath,experiment:artifact.experiment,usage:artifact.usage,metrics:artifact.metrics,missed_cells:artifact.missed_cells,false_positive_cells:falsePositive,invalid_date_cells:artifact.invalid_date_cells,round3_worsened_three_cells:worsenedInRound3},null,2));
})().catch(e=>{console.error(e.message);process.exit(1);});
