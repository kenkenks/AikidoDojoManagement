'use strict';

const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {applicationDefault}=require('firebase-admin/app');
const {createPaperOcrDocumentAi}=require('../cloud/attendance/paper-ocr-document-ai.cjs');

const imagePath=process.argv[2];
if(!imagePath) throw new Error('usage: node work/verify-paper-attendance-contact-sheet.cjs <image>');
const tempDir=path.resolve('.tmp-gcloud');
fs.mkdirSync(tempDir,{recursive:true});
const sheetPath=path.join(tempDir,'paper-contact-sheet.jpg');
const fullPath=path.join(tempDir,'paper-full-page.jpg');

const truth=new Map([
  ['1,1','10/5'],['2,1','10/3'],['3,1','9/30'],['4,1','9/28'],['5,1','9/26'],['6,1','9/26'],
  ['7,1','9/15'],['8,1','9/25'],['9,1','9/23'],['10,1','9/23'],['11,1','9/21'],['12,1','9/21'],
  ['13,1','9/19'],['14,1','9/19'],['14,2','10/16'],['15,1','9/18'],['15,2','10/16'],
  ['16,1','9/16'],['16,2','10/12'],['17,1','9/14'],['17,2','10/12'],['18,1','9/14'],['18,2','10/1'],
  ['19,1','9/12'],['19,2','10/10'],['20,1','9/12'],['20,2','10/10']
]);
function normalize(value){return String(value||'').normalize('NFKC').replace(/[.\-／]/g,'/').replace(/\s+/g,'');}
function center(polygon){return {x:polygon.reduce((s,p)=>s+p.x,0)/polygon.length,y:polygon.reduce((s,p)=>s+p.y,0)/polygon.length};}
function add(map,key,text){if(!map.has(key))map.set(key,[]);map.get(key).push(normalize(text));}
function score(readings){
  let exact=0;const details=[];
  for(const [key,expected] of truth){const values=readings.get(key)||[],ok=values.includes(expected);if(ok)exact++;details.push({cell:key,expected,readings:values,exact:ok});}
  return {exact,wrong_or_missing:truth.size-exact,details};
}
async function main(){
  const ps=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.resolve('work/build-paper-attendance-contact-sheet.ps1'),'-ImagePath',path.resolve(imagePath),'-OutputPath',sheetPath,'-FullPageOutputPath',fullPath,'-InkThreshold','3500'],{encoding:'utf8',maxBuffer:4*1024*1024});
  if(ps.status!==0)throw new Error('CONTACT_SHEET_BUILD_FAILED '+String(ps.stderr||'').slice(0,300));
  const build=JSON.parse(ps.stdout.trim());
  const selected=build.selected.map(x=>({row:x.row,column:x.column,ink_score:x.ink_score}));
  const credential=applicationDefault();
  const reader=createPaperOcrDocumentAi({
    processor:'projects/374758850136/locations/asia-southeast1/processors/ddd2ebdc689bfb82',
    version:'pretrained-ocr-v2.1.1-2025-01-31',
    getAccessToken:async()=>(await credential.getAccessToken()).access_token
  });
  const readFile=async file=>reader({mime_type:'image/jpeg',image_base64:fs.readFileSync(file).toString('base64')});
  const full=await readFile(fullPath),contact=await readFile(sheetPath);

  const fullReadings=new Map(),x0=270/4284,x1=3255/4284,y0=1622/5712,y1=3754/5712;
  for(const candidate of full.candidates){const p=center(candidate.polygon);if(p.x<x0||p.x>=x1||p.y<y0||p.y>=y1)continue;const column=Math.floor((p.x-x0)/(x1-x0)*20)+1,row=Math.floor((p.y-y0)/(y1-y0)*20)+1;add(fullReadings,`${row},${column}`,candidate.text);}

  const contactReadings=new Map(),sheetCols=Math.round(build.sheet_width/build.tile_width);
  for(const candidate of contact.candidates){const p=center(candidate.polygon),tileColumn=Math.min(sheetCols-1,Math.floor(p.x*build.sheet_width/build.tile_width)),tileRow=Math.floor(p.y*build.sheet_height/build.tile_height),index=tileRow*sheetCols+tileColumn,item=selected[index];if(item)add(contactReadings,`${item.row},${item.column}`,candidate.text);}

  const selectedKeys=new Set(selected.map(x=>`${x.row},${x.column}`));
  const trueSelected=[...truth.keys()].filter(x=>selectedKeys.has(x)).length;
  const integratedKeys=new Set([...selectedKeys,...fullReadings.keys()]);
  const integratedTruth=[...truth.keys()].filter(x=>integratedKeys.has(x)).length;
  const result={
    ground_truth:{written_cells:truth.size,blank_cells:400-truth.size},
    occupancy:{threshold:build.threshold,selected_cells:selected.length,detected_written:trueSelected,missed_written:truth.size-trueSelected,false_positive_blank:selected.length-trueSelected,recall:trueSelected/truth.size},
    whole_page:{image_bytes:fs.statSync(fullPath).size,elapsed_ms:full.elapsed_ms,candidate_count:full.candidates.length,...score(fullReadings)},
    integrated:{candidate_cells:integratedKeys.size,detected_written:integratedTruth,missed_written:truth.size-integratedTruth,false_positive_blank:integratedKeys.size-integratedTruth},
    contact_sheet:{image_bytes:fs.statSync(sheetPath).size,elapsed_ms:contact.elapsed_ms,candidate_count:contact.candidates.length,...score(contactReadings)},
    false_positive_cells:selected.filter(x=>!truth.has(`${x.row},${x.column}`)),
  };
  console.log(JSON.stringify(result,null,2));
}
main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;}).finally(()=>{for(const file of [sheetPath,fullPath])try{fs.unlinkSync(file);}catch{}});
