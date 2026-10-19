'use strict';
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');

const imagePath=process.argv[2];
if(!imagePath)throw Error('IMAGE_PATH_REQUIRED');
const outPath=path.resolve('work/paper-attendance-gemini-result-20261019.json');
const project='dojo-management-dev',location='global',model='gemini-2.5-flash';
const truth=new Map([
  ['1,1','10/5'],['2,1','10/3'],['3,1','9/30'],['4,1','9/28'],['5,1','9/26'],['6,1','9/26'],
  ['7,1','9/15'],['8,1','9/25'],['9,1','9/23'],['10,1','9/23'],['11,1','9/21'],['12,1','9/21'],
  ['13,1','9/19'],['14,1','9/19'],['14,2','10/16'],['15,1','9/18'],['15,2','10/16'],
  ['16,1','9/16'],['16,2','10/12'],['17,1','9/14'],['17,2','10/12'],['18,1','9/14'],['18,2','10/1'],
  ['19,1','9/12'],['19,2','10/10'],['20,1','9/12'],['20,2','10/10']
]);
const prompt=`あなたは定型帳票の画像理解評価器です。画像内の個人名・級段位・取得日・右側の受験資格表は出力せず、中央左の20行×20列の出席記録グリッドだけを解析してください。

座標規則:
- rowは画像上のグリッド最上段を1、最下段を20とする（紙面左端に印刷された20～1の番号とは逆方向）。
- columnは日付記入領域の左端を1、右端を20とする。
- 同じ日付が別セルにあれば別々に返す。

業務上の補助情報:
- 1セルは1時間の稽古1枠である。
- 同日に2枠の場合、同じ日付または同日の記録が隣接セルに現れることがある。
- この用紙では出席日が時系列に並ぶ傾向があるが、画像にない記録を規則だけから創作してはならない。
- 日付は主にM/D形式の手書きである。年は出力不要。

判定:
- 手書きが見えるセルは、日付を確信できなくても必ず返す。
- 日付を確定できない場合はstatusをreviewにし、dateは空文字、candidate_datesとreasonを返す。
- 印刷線、汚れ、影だけのセルは返さない。
- 空白400セルを列挙せず、suspected_cellsには記入あり又は要確認のセルだけを返す。
- 出力は指定JSONだけ。説明文やMarkdownは禁止。
`;
const schema={type:'OBJECT',properties:{grid:{type:'OBJECT',properties:{rows:{type:'INTEGER'},columns:{type:'INTEGER'},row_direction:{type:'STRING'},column_direction:{type:'STRING'}},required:['rows','columns','row_direction','column_direction']},suspected_cells:{type:'ARRAY',items:{type:'OBJECT',properties:{row:{type:'INTEGER'},column:{type:'INTEGER'},status:{type:'STRING',enum:['recognized','review']},date:{type:'STRING'},candidate_dates:{type:'ARRAY',items:{type:'STRING'}},confidence:{type:'NUMBER'},reason:{type:'STRING'}},required:['row','column','status','date','candidate_dates','confidence','reason']}},notes:{type:'ARRAY',items:{type:'STRING'}}},required:['grid','suspected_cells','notes']};
function token(){const command=process.platform==='win32'?'cmd.exe':'gcloud',args=process.platform==='win32'?['/d','/s','/c','gcloud.cmd auth application-default print-access-token --quiet']:['auth','application-default','print-access-token','--quiet'];const r=spawnSync(command,args,{encoding:'utf8'});if(r.status!==0)throw Error('ADC_TOKEN_UNAVAILABLE');return r.stdout.trim();}
function md(v){const m=String(v||'').match(/(?:\d{4}[-/])?(\d{1,2})[/.\-](\d{1,2})/);return m?`${Number(m[1])}/${Number(m[2])}`:'';}
(async()=>{
  const image=fs.readFileSync(imagePath);
  const body={contents:[{role:'user',parts:[{text:prompt},{inlineData:{mimeType:'image/jpeg',data:image.toString('base64')}}]}],generationConfig:{temperature:0,maxOutputTokens:16384,responseMimeType:'application/json',responseSchema:schema,thinkingConfig:{thinkingBudget:0}}};
  const url=`https://aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;
  const started=Date.now();
  const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token()}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const raw=await response.json();
  if(!response.ok)throw Error(`VERTEX_HTTP_${response.status}:${raw.error?.status||'UNKNOWN'}`);
  const text=(raw.candidates?.[0]?.content?.parts||[]).map(x=>x.text||'').join('');
  let parsed;try{parsed=JSON.parse(text);}catch{throw Error('INVALID_MODEL_JSON');}
  const unique=new Map();
  for(const c of parsed.suspected_cells||[]){if(Number.isInteger(c.row)&&c.row>=1&&c.row<=20&&Number.isInteger(c.column)&&c.column>=1&&c.column<=20)unique.set(`${c.row},${c.column}`,c);}
  const detected=[...unique.keys()],trueDetected=detected.filter(k=>truth.has(k)),missed=[...truth.keys()].filter(k=>!unique.has(k)),falsePositive=detected.filter(k=>!truth.has(k));
  const truthDetails=[...truth].map(([cell,expected])=>{const c=unique.get(cell);const actual=md(c?.date);return{cell,expected,detected:!!c,status:c?.status||'missing',actual,candidate_dates:c?.candidate_dates||[],exact:actual===expected,reason:c?.reason||''};});
  const exact=truthDetails.filter(x=>x.exact).length,wrong=truthDetails.filter(x=>x.detected&&!x.exact),review=detected.filter(k=>unique.get(k).status==='review');
  const humanCells=new Set([...missed,...falsePositive,...wrong.map(x=>x.cell),...review]);
  const artifact={experiment:{date:'2026-10-19',project,location,model,requests:1,image_bytes:image.length,elapsed_ms:Date.now()-started},usage:raw.usageMetadata||{},model_result:parsed,metrics:{ground_truth_written:truth.size,ground_truth_blank:400-truth.size,detected_cells:detected.length,correct_written_detected:trueDetected.length,missed_written:missed.length,false_positive_blank:falsePositive.length,detection_recall:trueDetected.length/truth.size,date_exact:exact,date_exact_rate:exact/truth.size,review_cells:review.length,human_correction_or_confirmation_cells:humanCells.size},truth_details:truthDetails,false_positive_cells:falsePositive.map(cell=>({cell,...unique.get(cell)})),missed_cells:missed.map(cell=>({cell,expected:truth.get(cell)})),wrong_or_uncertain_cells:wrong};
  fs.writeFileSync(outPath,JSON.stringify(artifact,null,2)+'\n','utf8');
  process.stdout.write(JSON.stringify({outPath,experiment:artifact.experiment,usage:artifact.usage,metrics:artifact.metrics,missed_cells:artifact.missed_cells,false_positive_cells:artifact.false_positive_cells.map(x=>x.cell),wrong_or_uncertain_cells:artifact.wrong_or_uncertain_cells.map(x=>({cell:x.cell,expected:x.expected,actual:x.actual,status:x.status}))},null,2));
})().catch(e=>{console.error(e.message);process.exit(1);});
