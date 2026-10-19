'use strict';
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const imagePath=process.argv[2]||path.resolve('work/paper-attendance-round5-column2-rows1-7-crops.png');
const outPath=path.resolve('work/paper-attendance-gemini-round5-result-20261019.json');
const failurePath=path.resolve('work/paper-attendance-gemini-round5-failure-20261019.json');
const project='dojo-management-dev',location='global',model='gemini-2.5-flash';
const truth=new Map([['1,2','10/10'],['2,2','10/10'],['3,2','10/1'],['4,2','10/12'],['5,2','10/12'],['6,2','10/16'],['7,2','10/16']]);
const prompt=`同じ出席管理表から切り出した7件の手書き日付を解析してください。画像内の見出し「印刷行N・列2」を各切り出しの座標として使い、印刷行1～7をそれぞれ1件ずつ返してください。

第2回から維持する規則:
- 1セルは1時間の稽古1回。別セルの同じ日付を統合しない。
- 日付はM/D形式。記録は通常、各列の下から上（印刷行1→7）へ進み、古い日付から新しい日付へ進む。同日2枠では同一日付が連続してよい。
- 時系列は文字候補の比較に使えるが、画像にない日付を追加してはならない。実際の記入順には例外があり得る。
- 前後関係と矛盾するときは画像を優先して再確認し、矛盾を消すために文字を書き換えない。
- 画像だけで確定できない、複数候補がある、不正な月日になる、時系列と矛盾する場合はstatus=reviewとする。
- reviewではdateを空文字にし、candidate_datesとreview_reasonを返す。
- confidenceは参考値にすぎず、高confidenceだけで曖昧な文字を確定しない。

手書き日付の読み取りに関する追加知識:
- 日付は「月/日」の形式。
- スラッシュの直後に細い縦線がある場合、それが日の十の位の「1」である可能性を検討する。
- スラッシュと「1」が接近していても、別々の文字である可能性がある。
- すべての日付を2桁に補正してはならず、画像の文字形状を確認する。
- 前後の日付の流れも参考にし、複数の読み方が可能な場合は候補を示す。

正解値は与えられていない。画像に見える文字だけを解析し、JSON以外の説明やMarkdownは返さない。`;
const schema={type:'OBJECT',properties:{cells:{type:'ARRAY',items:{type:'OBJECT',properties:{printed_row:{type:'INTEGER'},column:{type:'INTEGER'},status:{type:'STRING',enum:['recognized','review']},date:{type:'STRING'},candidate_dates:{type:'ARRAY',items:{type:'STRING'}},confidence:{type:'NUMBER'},review_reason:{type:'STRING'},shape_observation:{type:'STRING'},sequence_check:{type:'STRING'}},required:['printed_row','column','status','date','candidate_dates','confidence','review_reason','shape_observation','sequence_check']}},notes:{type:'ARRAY',items:{type:'STRING'}}},required:['cells','notes']};
function token(){const command=process.platform==='win32'?'cmd.exe':'gcloud',args=process.platform==='win32'?['/d','/s','/c','gcloud.cmd auth application-default print-access-token --quiet']:['auth','application-default','print-access-token','--quiet'];const r=spawnSync(command,args,{encoding:'utf8'});if(r.status!==0)throw Error('ADC_TOKEN_UNAVAILABLE');return r.stdout.trim();}
function md(v){const m=String(v||'').match(/(?:\d{4}[-/])?(\d{1,2})[/.-](\d{1,2})/);return m?`${Number(m[1])}/${Number(m[2])}`:'';}
(async()=>{
 const image=fs.readFileSync(imagePath);
 const body={contents:[{role:'user',parts:[{text:prompt},{inlineData:{mimeType:'image/png',data:image.toString('base64')}}]}],generationConfig:{temperature:0,maxOutputTokens:8192,responseMimeType:'application/json',responseSchema:schema,thinkingConfig:{thinkingBudget:0}}};
 const url=`https://aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`,started=Date.now();
 const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token()}`,'Content-Type':'application/json'},body:JSON.stringify(body)}),raw=await response.json();
 if(!response.ok){const failure={experiment:{date:'2026-10-19',round:5,project,location,model,requests:1},http_status:response.status,error_status:raw.error?.status||'UNKNOWN',error_message:raw.error?.message||'',retry_after:response.headers.get('retry-after'),quota_details:raw.error?.details||[]};fs.writeFileSync(failurePath,JSON.stringify(failure,null,2)+'\n','utf8');throw Error(`VERTEX_HTTP_${response.status}:${raw.error?.status||'UNKNOWN'}`);}
 const text=(raw.candidates?.[0]?.content?.parts||[]).map(x=>x.text||'').join('');let parsed;try{parsed=JSON.parse(text);}catch{throw Error('INVALID_MODEL_JSON');}
 const unique=new Map();for(const c of parsed.cells||[]){if(Number.isInteger(c.printed_row)&&c.printed_row>=1&&c.printed_row<=7&&c.column===2)unique.set(`${c.printed_row},2`,c);}
 const details=[...truth].map(([cell,expected])=>{const c=unique.get(cell),actual=c?.status==='recognized'?md(c.date):'';return{cell,expected,detected:!!c,status:c?.status||'missing',actual,candidate_dates:c?.candidate_dates||[],exact:actual===expected,review_reason:c?.review_reason||'',shape_observation:c?.shape_observation||'',sequence_check:c?.sequence_check||''};});
 const exact=details.filter(x=>x.exact).length,review=details.filter(x=>x.status==='review').length,missed=details.filter(x=>!x.detected).map(x=>x.cell);
 const artifact={experiment:{date:'2026-10-19',round:5,project,location,model,requests:1,image_bytes:image.length,elapsed_ms:Date.now()-started,target:'printed rows 1-7, column 2, enlarged crops'},prompt_conditions:{baseline:'Round 2 recognition and uncertainty rules adapted to seven labeled crops',added_knowledge:['consider a thin vertical stroke immediately after the slash as a possible tens digit 1','slash and 1 may be separate even when close','do not force all days to two digits','use character shape and sequence, and keep multiple candidates when ambiguous'],ground_truth_leakage:{used_in_prompt:false}},usage:raw.usageMetadata||{},model_result:parsed,metrics:{target_cells:truth.size,detected_cells:details.filter(x=>x.detected).length,missed_cells:missed.length,date_exact:exact,date_exact_rate:exact/truth.size,review_cells:review,human_correction_or_confirmation_cells:new Set([...missed,...details.filter(x=>!x.exact).map(x=>x.cell),...details.filter(x=>x.status==='review').map(x=>x.cell)]).size},truth_details:details,missed_cells:missed};
 fs.writeFileSync(outPath,JSON.stringify(artifact,null,2)+'\n','utf8');
 console.log(JSON.stringify({outPath,experiment:artifact.experiment,usage:artifact.usage,metrics:artifact.metrics,truth_details:details},null,2));
})().catch(e=>{console.error(e.message);process.exit(1);});
