'use strict';
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const imagePath=process.argv[2];if(!imagePath)throw Error('IMAGE_PATH_REQUIRED');
const previousPath=path.resolve('work/paper-attendance-gemini-round2-result-20261019.json');
const outPath=path.resolve('work/paper-attendance-gemini-round3-result-20261019.json');
const project='dojo-management-dev',location='global',model='gemini-2.5-flash';
const sourceTruth=new Map([
 ['1,1','10/5'],['2,1','10/3'],['3,1','9/30'],['4,1','9/28'],['5,1','9/26'],['6,1','9/26'],
 ['7,1','9/15'],['8,1','9/25'],['9,1','9/23'],['10,1','9/23'],['11,1','9/21'],['12,1','9/21'],
 ['13,1','9/19'],['14,1','9/19'],['14,2','10/16'],['15,1','9/18'],['15,2','10/16'],
 ['16,1','9/16'],['16,2','10/12'],['17,1','9/14'],['17,2','10/12'],['18,1','9/14'],['18,2','10/1'],
 ['19,1','9/12'],['19,2','10/10'],['20,1','9/12'],['20,2','10/10']]);
const truth=new Map([...sourceTruth].map(([key,value])=>{const[r,c]=key.split(',').map(Number);return[`${21-r},${c}`,value];}));
const retainedConditions={target_area:'central-left 20x20 attendance grid only',privacy_exclusions:['member name','rank','acquisition date','examination requirement table'],coordinates:['row is the number printed at the left edge','top row=20','bottom row=1','columns left-to-right 1..20'],business_rules:['one cell equals one one-hour attendance','duplicate dates remain separate','entries normally progress bottom-to-top within a column','after a column fills entries continue from bottom of next column','dates normally progress past-to-future','same-date consecutive entries are allowed','month boundaries and entry-order exceptions are allowed'],uncertainty_rules:['image evidence takes priority over sequence','do not invent attendance or dates','ambiguous, invalid, or sequence-conflicting readings require review','confidence is not an acceptance criterion','lines, shadows, folds, and stains alone are blank']};
const addedConditions={separate_visual_from_inference:true,visual_reading_rule:'transcribe image first and never rewrite it to fit chronology',neighbor_analysis:'use previous and next entries only to propose candidates',invalid_date_rule:'invalid dates such as 10/0 must be needs_review',output_changes:['visual_reading','candidate_dates','reason','unclear_parts','needs_review','sequence_assessment'],confidence_removed:true,program_review:'independent validation of date validity and chronology after model output'};
const prompt=`定型の出席管理表を解析してください。個人名、級段位、取得日、右側の受験資格表は出力せず、中央左の20行×20列の出席記録グリッドだけを対象にします。

【維持する帳票条件】
- rowは紙面左端に印刷された行番号そのもの。最上段20、最下段1。columnは左から1～20。
- 1セルは1時間の稽古1回。別セルの同じ日付を統合しない。
- 記録は通常、各列の下から上（row 1→20）、列が埋まると右隣列のrow 1から続く。
- 日付はM/D形式で、基本的に古いものから新しいものへ進む。同日の2枠では同一日付が連続してよい。月替わりや記入順の例外もあり得る。
- 画像を時系列より優先し、画像にない出席や日付を作らない。印刷線、影、折り目、汚れだけなら空白。

【第3回で追加する解析手順】
1. 推定の前に、各セルで画像から見えた文字をvisual_readingへそのまま転記する。時系列に合わせてvisual_readingを書き換えない。
2. 次に記録順の前後セルを調べ、別の読み方があり得る場合だけcandidate_datesを返す。前後と矛盾しないだけでは確定しない。
3. 月日として不正（例10/0）、複数解釈、文字不鮮明、時系列逆行の場合は必ずneeds_review=trueとする。
4. reasonには読み取り根拠、unclear_partsには不明瞭な文字部分、sequence_assessmentには前後関係の評価を書く。
5. confidence数値は返さない。
6. 手書きが見えるセルは、確定不能でも必ず返す。空白セルは返さない。

JSONだけを返し、説明文やMarkdownは禁止。`;
const schema={type:'OBJECT',properties:{grid:{type:'OBJECT',properties:{rows:{type:'INTEGER'},columns:{type:'INTEGER'},row_top:{type:'INTEGER'},row_bottom:{type:'INTEGER'}},required:['rows','columns','row_top','row_bottom']},suspected_cells:{type:'ARRAY',items:{type:'OBJECT',properties:{row:{type:'INTEGER'},col:{type:'INTEGER'},visual_reading:{type:'STRING'},candidate_dates:{type:'ARRAY',items:{type:'STRING'}},reason:{type:'STRING'},unclear_parts:{type:'STRING'},needs_review:{type:'BOOLEAN'},sequence_assessment:{type:'STRING'}},required:['row','col','visual_reading','candidate_dates','reason','unclear_parts','needs_review','sequence_assessment']}},notes:{type:'ARRAY',items:{type:'STRING'}}},required:['grid','suspected_cells','notes']};
function token(){const command=process.platform==='win32'?'cmd.exe':'gcloud',args=process.platform==='win32'?['/d','/s','/c','gcloud.cmd auth application-default print-access-token --quiet']:['auth','application-default','print-access-token','--quiet'];const r=spawnSync(command,args,{encoding:'utf8'});if(r.status!==0)throw Error('ADC_TOKEN_UNAVAILABLE');return r.stdout.trim();}
function md(v){const m=String(v||'').match(/(?:\d{4}[-/])?(\d{1,2})[/.\-](\d{1,2})/);return m?`${Number(m[1])}/${Number(m[2])}`:'';}
function parts(v){const m=md(v).split('/').map(Number);return m.length===2?m:null;}
function valid(v){const p=parts(v);return!!p&&p[0]>=1&&p[0]<=12&&p[1]>=1&&p[1]<=31;}
function ordinal(v){const p=parts(v);return valid(v)?p[0]*100+p[1]:null;}
(async()=>{
 const image=fs.readFileSync(imagePath),previous=JSON.parse(fs.readFileSync(previousPath,'utf8'));
 const body={contents:[{role:'user',parts:[{text:prompt},{inlineData:{mimeType:'image/jpeg',data:image.toString('base64')}}]}],generationConfig:{temperature:0,maxOutputTokens:16384,responseMimeType:'application/json',responseSchema:schema,thinkingConfig:{thinkingBudget:0}}};
 const url=`https://aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`,started=Date.now();
 const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token()}`,'Content-Type':'application/json'},body:JSON.stringify(body)}),raw=await response.json();
 if(!response.ok)throw Error(`VERTEX_HTTP_${response.status}:${raw.error?.status||'UNKNOWN'}`);
 const text=(raw.candidates?.[0]?.content?.parts||[]).map(x=>x.text||'').join('');let parsed;try{parsed=JSON.parse(text);}catch{throw Error('INVALID_MODEL_JSON');}
 const unique=new Map();for(const c of parsed.suspected_cells||[]){if(Number.isInteger(c.row)&&c.row>=1&&c.row<=20&&Number.isInteger(c.col)&&c.col>=1&&c.col<=20)unique.set(`${c.row},${c.col}`,c);}
 const ordered=[...unique.entries()].sort((a,b)=>{const[ar,ac]=a[0].split(',').map(Number),[br,bc]=b[0].split(',').map(Number);return ac-bc||ar-br;});
 const programReasons=new Map();const add=(k,r)=>{const a=programReasons.get(k)||[];if(!a.includes(r))a.push(r);programReasons.set(k,a);};
 for(const[k,c]of ordered){if(!valid(c.visual_reading))add(k,'invalid_or_missing_date');}
 for(let i=1;i<ordered.length;i++){const[pk,pc]=ordered[i-1],[ck,cc]=ordered[i],pv=ordinal(pc.visual_reading),cv=ordinal(cc.visual_reading);if(pv!==null&&cv!==null&&cv<pv){add(pk,'sequence_regression_pair');add(ck,'sequence_regression_pair');}}
 const detected=[...unique.keys()],trueDetected=detected.filter(k=>truth.has(k)),missed=[...truth.keys()].filter(k=>!unique.has(k)),fp=detected.filter(k=>!truth.has(k));
 const details=[...truth].map(([cell,expected])=>{const c=unique.get(cell),actual=md(c?.visual_reading),exact=actual===expected;return{cell,expected,detected:!!c,visual_reading:c?.visual_reading||'',actual,exact,model_needs_review:!!c?.needs_review,program_needs_review:programReasons.has(cell),program_review_reasons:programReasons.get(cell)||[],candidate_dates:c?.candidate_dates||[],reason:c?.reason||'',unclear_parts:c?.unclear_parts||'',sequence_assessment:c?.sequence_assessment||''};});
 const exact=details.filter(x=>x.exact).length,modelReview=detected.filter(k=>unique.get(k).needs_review),programReview=[...programReasons.keys()],invalid=detected.filter(k=>!valid(unique.get(k).visual_reading));
 const currentWrong=details.filter(x=>x.detected&&!x.exact),wrongFlaggedModel=currentWrong.filter(x=>x.model_needs_review),wrongFlaggedProgram=currentWrong.filter(x=>x.program_needs_review),correctFlaggedModel=details.filter(x=>x.exact&&x.model_needs_review),correctFlaggedProgram=details.filter(x=>x.exact&&x.program_needs_review);
 const prev=new Map(previous.truth_details.map(x=>[x.cell,{exact:x.exact,actual:x.actual,status:x.status}]));
 const changes=details.map(x=>{const p=prev.get(x.cell)||{exact:false,actual:'',status:'missing'};let change;if(!p.exact&&x.exact)change='improved';else if(p.exact&&!x.exact)change='worsened';else if(p.exact&&x.exact)change='correct_unchanged';else if(p.actual===x.actual)change='wrong_unchanged';else change='changed_but_wrong';return{cell:x.cell,expected:x.expected,round2:p.actual,round3:x.actual,round2_exact:p.exact,round3_exact:x.exact,change};});
 const human=new Set([...missed,...fp,...currentWrong.map(x=>x.cell),...modelReview,...programReview]);
 const artifact={experiment:{date:'2026-10-19',round:3,project,location,model,requests:1,image_bytes:image.length,elapsed_ms:Date.now()-started,coordinate_contract:'printed row number: top=20, bottom=1; columns left-to-right'},prompt_conditions:{retained_from_round2:retainedConditions,added_in_round3:addedConditions,schedule_reference:{used:false,reason:'No repository evidence identified this sheet with a specific dojo and weekday.'},ground_truth_leakage:{used_in_prompt:false,reason:'Correct dates and example answer sequences were excluded.'}},usage:raw.usageMetadata||{},model_result:parsed,program_review:{algorithm:['invalid or missing M/D','local chronology regression in column-major, bottom-to-top order; both cells in a conflicting pair are flagged'],cells:programReview.map(cell=>({cell,reasons:programReasons.get(cell)}))},metrics:{ground_truth_written:truth.size,ground_truth_blank:400-truth.size,detected_cells:detected.length,correct_written_detected:trueDetected.length,missed_written:missed.length,false_positive_blank:fp.length,detection_recall:trueDetected.length/truth.size,date_exact:exact,date_exact_rate:exact/truth.size,invalid_visual_dates:invalid.length,model_review_cells:modelReview.length,program_review_cells:programReview.length,wrong_cells:currentWrong.length,wrong_cells_flagged_by_model:wrongFlaggedModel.length,wrong_cells_flagged_by_program:wrongFlaggedProgram.length,correct_cells_unnecessarily_flagged_by_model:correctFlaggedModel.length,correct_cells_unnecessarily_flagged_by_program:correctFlaggedProgram.length,human_correction_or_confirmation_cells:human.size},truth_details:details,missed_cells:missed.map(cell=>({cell,expected:truth.get(cell)})),false_positive_cells:fp.map(cell=>({cell,...unique.get(cell)})),invalid_date_cells:invalid.map(cell=>({cell,visual_reading:unique.get(cell).visual_reading})),round2_comparison:changes};
 fs.writeFileSync(outPath,JSON.stringify(artifact,null,2)+'\n','utf8');
 console.log(JSON.stringify({outPath,experiment:artifact.experiment,usage:artifact.usage,metrics:artifact.metrics,missed_cells:artifact.missed_cells,false_positive_cells:fp,invalid_date_cells:artifact.invalid_date_cells,round2_changed:changes.filter(x=>!['correct_unchanged','wrong_unchanged'].includes(x.change)),round2_wrong_unchanged:changes.filter(x=>x.change==='wrong_unchanged').map(x=>x.cell)},null,2));
})().catch(e=>{console.error(e.message);process.exit(1);});
