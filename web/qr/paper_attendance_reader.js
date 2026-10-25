(function(root){
  "use strict";

  const ROWS=20,COLS=20,INK_CELL_WIDTH=300,INK_CELL_HEIGHT=160,INK_THRESHOLD=3500;
  const IDEAL_CORNERS=[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
  const DEFAULT_CORNERS=[
    {x:270/4284,y:1622/5712},{x:3255/4284,y:1622/5712},
    {x:3255/4284,y:3754/5712},{x:270/4284,y:3754/5712}
  ];

  function validateGridCorners(value){
    if(!Array.isArray(value)||value.length!==4)throw Error("INVALID_GRID_CORNERS");
    const points=value.map(point=>({x:Number(point?.x),y:Number(point?.y)}));
    if(points.some(point=>!Number.isFinite(point.x)||!Number.isFinite(point.y)||point.x<0||point.x>1||point.y<0||point.y>1))throw Error("INVALID_GRID_CORNERS");
    let sign=0,twiceArea=0;
    for(let index=0;index<4;index++){
      const a=points[index],b=points[(index+1)%4],c=points[(index+2)%4];
      const cross=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
      if(Math.abs(cross)<1e-6)throw Error("INVALID_GRID_CORNERS");
      const nextSign=Math.sign(cross);
      if(sign&&nextSign!==sign)throw Error("INVALID_GRID_CORNERS");
      sign=nextSign;twiceArea+=a.x*b.y-b.x*a.y;
    }
    if(Math.abs(twiceArea)/2<.01)throw Error("INVALID_GRID_CORNERS");
    return points;
  }

  function normalizeImageScale(value){
    const numeric=Number(value);
    if(!Number.isFinite(numeric))return 100;
    return Math.max(50,Math.min(100,Math.round(numeric/5)*5));
  }

  function normalizePaperDetection(result){
    if(!result||!Array.isArray(result.corners)||result.corners.length!==4)throw Error("PAPER_NOT_FOUND");
    let corners=result.corners.map(point=>({x:Number(point[0]),y:Number(point[1])}));
    let rotation=0,aspect=Number(result.aspectRatio||0);
    if(aspect>0&&aspect<1){corners=[corners[1],corners[2],corners[3],corners[0]];rotation=-90;aspect=1/aspect;}
    return{...result,corners:validateGridCorners(corners),aspectRatio:aspect,documentRotationDegrees:rotation};
  }

  function blankCells(){
    return Array.from({length:ROWS*COLS},(_,i)=>({row:Math.floor(i/COLS)+1,column:i%COLS+1,raw:"",date:"",confidence:0,inkScore:0,status:"empty",confirmed:false,manual:false}));
  }

  function normalizeDate(value){
    const text=String(value||"").normalize("NFKC").trim().replace(/[.／]/g,"/");
    let match=/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(text);
    if(match)return match[1]+"-"+match[2].padStart(2,"0")+"-"+match[3].padStart(2,"0");
    match=/^(\d{2})(\d{2})$/.exec(text);
    if(match&&+match[1]>=1&&+match[1]<=12&&+match[2]>=1&&+match[2]<=31)return +match[1]+"/"+(+match[2]);
    match=/^(\d{1,2})\/(\d{1,2})$/.exec(text);
    return match&&+match[1]>=1&&+match[1]<=12&&+match[2]>=1&&+match[2]<=31?+match[1]+"/"+(+match[2]):"";
  }

  function center(candidate){
    const points=Array.isArray(candidate?.polygon)?candidate.polygon:[];
    if(points.length)return{x:points.reduce((sum,point)=>sum+Number(point.x||0),0)/points.length,y:points.reduce((sum,point)=>sum+Number(point.y||0),0)/points.length};
    return{x:Number(candidate?.x),y:Number(candidate?.y)};
  }

  function matrix(corners){
    const[p0,p1,p2,p3]=corners,dx1=p1.x-p2.x,dx2=p3.x-p2.x,dx3=p0.x-p1.x+p2.x-p3.x,dy1=p1.y-p2.y,dy2=p3.y-p2.y,dy3=p0.y-p1.y+p2.y-p3.y,det=dx1*dy2-dx2*dy1;
    let g=0,h=0;
    if(Math.abs(dx3)>1e-9||Math.abs(dy3)>1e-9){if(Math.abs(det)<1e-9)throw Error("INVALID_GRID_CORNERS");g=(dx3*dy2-dx2*dy3)/det;h=(dx1*dy3-dx3*dy1)/det;}
    return[p1.x-p0.x+g*p1.x,p3.x-p0.x+h*p3.x,p0.x,p1.y-p0.y+g*p1.y,p3.y-p0.y+h*p3.y,p0.y,g,h,1];
  }

  function perspective(corners){
    const m=matrix(corners),[a,b,c,d,e,f,q,r,i]=m,A=e*i-f*r,B=c*r-b*i,C=b*f-c*e,D=f*q-d*i,E=a*i-c*q,F=c*d-a*f,G=d*r-e*q,H=b*q-a*r,I=a*e-b*d,den=a*A+b*D+c*G;
    if(Math.abs(den)<1e-10)throw Error("INVALID_GRID_CORNERS");
    return[A/den,B/den,C/den,D/den,E/den,F/den,G/den,H/den,I/den];
  }

  function toUnit(point,corners){const m=perspective(corners),z=m[6]*point.x+m[7]*point.y+m[8];return{x:(m[0]*point.x+m[1]*point.y+m[2])/z,y:(m[3]*point.x+m[4]*point.y+m[5])/z};}
  function fromUnit(u,v,corners){const m=matrix(corners),z=m[6]*u+m[7]*v+m[8];return{x:(m[0]*u+m[1]*v+m[2])/z,y:(m[3]*u+m[4]*v+m[5])/z};}
  function cellIndexForPoint(point,corners=DEFAULT_CORNERS){let unit;try{unit=toUnit(point,corners);}catch{return-1;}if(unit.x<0||unit.x>=1||unit.y<0||unit.y>=1)return-1;return Math.floor(unit.y*ROWS)*COLS+Math.floor(unit.x*COLS);}
  function cellIndexForCandidate(candidate,corners=DEFAULT_CORNERS){const printedRow=Number(candidate?.printed_row),column=Number(candidate?.column);if(Number.isInteger(printedRow)&&printedRow>=1&&printedRow<=ROWS&&Number.isInteger(column)&&column>=1&&column<=COLS)return(ROWS-printedRow)*COLS+column-1;return cellIndexForPoint(center(candidate),corners);}

  function mapOcr(payload,corners=DEFAULT_CORNERS,manualEdits=new Map(),detectedIndices=new Set(),inkScores=new Map()){
    const cells=blankCells(),candidates=Array.isArray(payload?.candidates)?payload.candidates:Array.isArray(payload?.date_candidates)?payload.date_candidates:[];
    for(const candidate of candidates){
      const index=cellIndexForCandidate(candidate,corners);if(index<0)continue;
      const cell=cells[index],raw=String(candidate.text||candidate.date||"").trim(),date=normalizeDate(candidate.date||raw),confidence=Number(candidate.confidence||0),requestedReview=candidate.status==="review";
      cell.raw=[cell.raw,raw].filter(Boolean).join(" | ");cell.confidence=Math.max(cell.confidence,confidence);cell.date=cell.date||date;cell.status=!requestedReview&&date&&!cell.raw.includes("|")?"recognized":"review";
    }
    for(const index of detectedIndices)if(cells[index]&&cells[index].status==="empty")cells[index]={...cells[index],status:"detected",inkScore:Number(inkScores.get(index)||0)};
    for(const[index,value]of manualEdits)if(cells[index])cells[index]={...cells[index],...value,row:cells[index].row,column:cells[index].column,manual:true};
    return cells;
  }

  function aggregate(cells){const counts=new Map();for(const cell of cells)if(cell.date)counts.set(cell.date,(counts.get(cell.date)||0)+1);return[...counts].map(([date,count])=>({date,count})).sort((a,b)=>a.date.localeCompare(b.date,"ja"));}
  function nextPendingIndex(cells,current=-1){for(let offset=1;offset<=cells.length;offset++){const index=(current+offset)%cells.length,cell=cells[index];if(!cell.confirmed&&["detected","review","recognized"].includes(cell.status))return index;}return-1;}

  function fullDate(value,year){
    const normalized=normalizeDate(value);if(/^\d{4}-\d{2}-\d{2}$/.test(normalized))return normalized;
    const match=/^(\d{1,2})\/(\d{1,2})$/.exec(normalized),numericYear=Number(year);
    if(!match||!Number.isInteger(numericYear)||numericYear<1900||numericYear>2200)return"";
    const result=String(numericYear)+"-"+match[1].padStart(2,"0")+"-"+match[2].padStart(2,"0"),date=new Date(result+"T00:00:00Z");
    return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===result?result:"";
  }

  function paperCellSequence(cell,rowCount=ROWS){return(Number(cell.column)-1)*rowCount+(rowCount-Number(cell.row));}
  function clearCellsFromPaperOrder(sourceCells,startIndex){
    if(!Array.isArray(sourceCells)||!Number.isInteger(startIndex)||startIndex<0||startIndex>=sourceCells.length)throw Error("INVALID_CELL_INDEX");
    const rowCount=Math.max(...sourceCells.map(cell=>Number(cell?.row)||0)),startSequence=paperCellSequence(sourceCells[startIndex],rowCount),updates=new Map();
    sourceCells.forEach((cell,index)=>{if(paperCellSequence(cell,rowCount)>=startSequence)updates.set(index,{...cell,raw:"",date:"",confidence:0,inkScore:0,status:"empty",confirmed:true,manual:true});});
    return updates;
  }
  function confirmTrailingEmptyCells(sourceCells,startIndex){return clearCellsFromPaperOrder(sourceCells,startIndex);}
  function paperOwnerKey(uid,memberId){return String(uid||"").trim()+"|"+String(memberId||"").trim();}

  function normalizeAttendanceByDate(value){
    if(!Array.isArray(value))throw Error("INVALID_ATTENDANCE_BY_DATE");
    return value.map(row=>{const attendanceDate=String(row?.attendance_date||"").trim(),trainingMinutes=Number(row?.training_minutes);if(!/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate)||!Number.isFinite(trainingMinutes)||trainingMinutes<=0)throw Error("INVALID_ATTENDANCE_BY_DATE");return{attendance_date:attendanceDate,training_minutes:trainingMinutes,training_hours:trainingMinutes/60};}).sort((a,b)=>a.attendance_date.localeCompare(b.attendance_date));
  }

  function minutesByDate(sourceCells,year){
    const minutes=new Map(),pendingDates=new Set();let unresolvedReviewCount=0,invalidDateCount=0;
    for(const cell of Array.isArray(sourceCells)?sourceCells:[]){
      const written=cell?.status!=="empty"||!!cell?.date||!!String(cell?.raw||"").trim();if(!written)continue;
      const date=fullDate(cell.date,year);
      if(date){minutes.set(date,(minutes.get(date)||0)+60);if(!cell.confirmed)pendingDates.add(date);}
      else if(cell.date)invalidDateCount++;else if(!cell.confirmed)unresolvedReviewCount++;
    }
    return{minutes,pendingDates,unresolvedReviewCount,invalidDateCount};
  }

  function buildAttendanceDifferencePlan({confirmedByDate=[],ocrCells=[],desiredCells=[],year,confirmedState="ready"}={}){
    const confirmed=new Map(),ocr=minutesByDate(ocrCells,year),desired=minutesByDate(desiredCells,year);
    if(confirmedState==="ready")for(const item of normalizeAttendanceByDate(confirmedByDate))confirmed.set(item.attendance_date,item.training_minutes);
    const dates=[...new Set([...confirmed.keys(),...ocr.minutes.keys(),...desired.minutes.keys()])].sort((a,b)=>a.localeCompare(b));
    const hasUndatedReview=desired.unresolvedReviewCount>0||desired.invalidDateCount>0;
    const rows=dates.map(attendanceDate=>{
      const confirmedMinutes=confirmed.get(attendanceDate)||0,ocrMinutes=ocr.minutes.get(attendanceDate)||0,desiredMinutes=desired.minutes.get(attendanceDate)||0,addMinutes=confirmedState==="ready"?Math.max(desiredMinutes-confirmedMinutes,0):null;
      const afterMinutes=addMinutes==null?null:confirmedMinutes+addMinutes;let status="unchanged",statusLabel="変更なし",reason="登録済み時間と紙の記録・修正後の合計が同じため、追加はありません。";
      if(confirmedState!=="ready"){status="review";statusLabel="要確認";reason="登録済み出席を取得できないため、追加時間を確定できません。";}
      else if(desiredMinutes>480){status="error";statusLabel="8時間超過";reason="紙の記録・修正後の合計が1日8時間を超えています。";}
      else if(hasUndatedReview||desired.pendingDates.has(attendanceDate)||(addMinutes>0&&addMinutes%60!==0)){status="review";statusLabel="要確認";reason="未確認セル、日付不明セル、または60分単位で表せない差分があります。";}
      else if(addMinutes>0){status="additional";statusLabel="追加あり";reason="紙の記録・修正後の合計に足りない分だけ追加します。";}
      else if(confirmedMinutes>desiredMinutes){status="existing";statusLabel="登録済みを優先";reason="登録済み時間の方が多いため、既存の出席を保持し、追加・削除はしません。";}
      return{attendance_date:attendanceDate,confirmedMinutes,ocrMinutes,desiredMinutes,addMinutes,afterMinutes,status,statusLabel,reason};
    });
    return{rows,confirmedReady:confirmedState==="ready",unresolvedReviewCount:desired.unresolvedReviewCount,invalidDateCount:desired.invalidDateCount,hasError:rows.some(row=>row.status==="error"),hasReview:rows.some(row=>row.status==="review")||hasUndatedReview};
  }

  function buildRegistrationRecords(sourceCells,{memberId,year}={}){
    const id=String(memberId||"").trim();if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id))throw Error("MEMBER_REQUIRED");
    if(!Array.isArray(sourceCells)||sourceCells.some(cell=>!cell.confirmed))throw Error("CELLS_NOT_CONFIRMED");
    const occurrence=new Map(),records=[];
    for(let index=0;index<sourceCells.length;index++){const cell=sourceCells[index];if(!cell.date)continue;const date=fullDate(cell.date,year);if(!date)throw Error("INVALID_ATTENDANCE_DATE");const count=(occurrence.get(date)||0)+1;occurrence.set(date,count);records.push({key:[id,date,count].join("|"),cell_index:index,member_id:id,attendance_date:date,occurrence:count});}
    return records;
  }

  function buildDifferenceRegistrationRecords(sourceCells,{memberId,year,confirmedByDate,confirmedState="ready"}={}){
    buildRegistrationRecords(sourceCells,{memberId,year});
    const plan=buildAttendanceDifferencePlan({confirmedByDate,desiredCells:sourceCells,year,confirmedState});
    if(!plan.confirmedReady)throw Error("CONFIRMED_ATTENDANCE_UNAVAILABLE");if(plan.hasError)throw Error("DAILY_TRAINING_LIMIT_EXCEEDED");if(plan.hasReview)throw Error("DIFFERENCE_REQUIRES_REVIEW");
    return plan.rows.filter(row=>row.addMinutes>0).map(row=>({...row,member_id:String(memberId),key:String(memberId)+"|"+row.attendance_date+"|desired:"+row.desiredMinutes}));
  }

  async function registerSequential({records,successfulKeys=new Set(),readState,register,scope,onProgress=()=>{},requestId=()=>"PAPER-"+Date.now()}={}){
    if(!Array.isArray(records)||typeof readState!=="function"||typeof register!=="function")throw Error("INVALID_REGISTRATION_EXECUTOR");
    const result={success:0,duplicate:0,failed:0,skipped:0,items:[]},slots=Array.isArray(scope?.slots)?scope.slots:[];
    if(!scope?.teacher_id||!scope?.location_id||!scope?.billing_block_id||!slots.length)throw Error("REGISTRATION_SCOPE_REQUIRED");
    for(const record of records){
      if(successfulKeys.has(record.key)){result.skipped++;continue;}
      try{const state=await readState(record),selected=[...new Set(Array.isArray(state?.selected_slot_ids)?state.selected_slot_ids:[])];if(selected.length>=record.occurrence){successfulKeys.add(record.key);result.duplicate++;result.items.push({...record,status:"duplicate"});onProgress(result,record);continue;}const free=slots.map(slot=>slot.slot_id).filter(id=>!selected.includes(id));if(!free.length)throw Error("ATTENDANCE_SLOT_CAPACITY_EXCEEDED");const slotId=free[0],input={mode:"attendance_batch",request_id:requestId(record),attendance_session_id:String(scope.attendance_session_id||"PAPER_IMPORT").slice(0,128),attendance_date:record.attendance_date,teacher_id:scope.teacher_id,location_id:scope.location_id,billing_block_id:scope.billing_block_id,attendance_items:[{member_id:record.member_id,current_rank:String(state.current_rank||""),plan_id:"",slot_ids:[...selected,slotId]}],source:"paper_attendance_review",skip_billing:true};await register(input,record);successfulKeys.add(record.key);result.success++;result.items.push({...record,status:"success",slot_id:slotId});}
      catch(error){result.failed++;result.items.push({...record,status:"failed",error:String(error?.message||error)});}onProgress(result,record);
    }
    return result;
  }

  async function registerDifferencePlan({desiredCells,memberId,year,scope,successfulKeys=new Set(),readProgress,readState,register,onProgress=()=>{},requestId=()=>"PAPER-"+Date.now()}={}){
    if(typeof readProgress!=="function"||typeof readState!=="function"||typeof register!=="function")throw Error("INVALID_REGISTRATION_EXECUTOR");
    const slots=Array.isArray(scope?.slots)?scope.slots:[];if(!scope?.teacher_id||!scope?.location_id||!scope?.billing_block_id||slots.length<8)throw Error("REGISTRATION_SCOPE_REQUIRED");
    const initial=await readProgress(),records=buildDifferenceRegistrationRecords(desiredCells,{memberId,year,confirmedByDate:initial.attendance_by_date,confirmedState:"ready"}),result={success:0,duplicate:0,failed:0,skipped:0,items:[]};
    for(const record of records)while(true){
      try{const latest=normalizeAttendanceByDate((await readProgress()).attendance_by_date),confirmed=latest.find(row=>row.attendance_date===record.attendance_date)?.training_minutes||0;if(confirmed>=record.desiredMinutes){result.duplicate++;result.items.push({...record,status:"already_satisfied",confirmedMinutes:confirmed});break;}const gap=record.desiredMinutes-confirmed;if(gap%60!==0)throw Error("DIFFERENCE_REQUIRES_REVIEW");const targetMinutes=confirmed+60,key=String(memberId)+"|"+record.attendance_date+"|target:"+targetMinutes;if(successfulKeys.has(key)){result.skipped++;result.items.push({...record,key,status:"awaiting_confirmation",confirmedMinutes:confirmed});break;}const state=await readState(record),selected=[...new Set(Array.isArray(state?.selected_slot_ids)?state.selected_slot_ids:[])],free=slots.map(slot=>slot.slot_id).filter(id=>!selected.includes(id));if(!free.length)throw Error("ATTENDANCE_SLOT_CAPACITY_EXCEEDED");const slotId=free[0],writeRecord={...record,key,targetMinutes},input={mode:"attendance_batch",request_id:requestId(writeRecord),attendance_session_id:String(scope.attendance_session_id||"PAPER_IMPORT").slice(0,128),attendance_date:record.attendance_date,teacher_id:scope.teacher_id,location_id:scope.location_id,billing_block_id:scope.billing_block_id,attendance_items:[{member_id:String(memberId),current_rank:String(state.current_rank||""),plan_id:"",slot_ids:[...selected,slotId]}],source:"paper_attendance_review",skip_billing:true};await register(input,writeRecord);successfulKeys.add(key);result.success++;result.items.push({...writeRecord,status:"success",slot_id:slotId});onProgress(result,writeRecord);}
      catch(error){result.failed++;result.items.push({...record,status:"failed",error:String(error?.message||error)});onProgress(result,record);break;}
    }
    return result;
  }

  async function registerPendingDifferencePlan({desiredCells,memberId,year,scope,successfulKeys=new Set(),readProgress,readState,register,onProgress=()=>{},requestId=()=>"PAPER-MEMBER-"+Date.now()}={}){
    if(typeof readProgress!=="function"||typeof readState!=="function"||typeof register!=="function")throw Error("INVALID_REGISTRATION_EXECUTOR");
    const slots=Array.isArray(scope?.slots)?scope.slots:[];if(!scope?.location_id||!scope?.billing_block_id||slots.length<8)throw Error("REGISTRATION_SCOPE_REQUIRED");
    const initial=await readProgress(),records=buildDifferenceRegistrationRecords(desiredCells,{memberId,year,confirmedByDate:initial.attendance_by_date,confirmedState:"ready"}),result={success:0,duplicate:0,failed:0,skipped:0,items:[]};
    for(const record of records){
      const key=String(memberId)+"|"+record.attendance_date+"|pending-target:"+record.desiredMinutes;
      try{
        if(successfulKeys.has(key)){result.skipped++;result.items.push({...record,key,status:"awaiting_confirmation"});onProgress(result,record);continue;}
        const state=await readState(record),selected=[...new Set(Array.isArray(state?.selected_slot_ids)?state.selected_slot_ids:[])],pending=[...new Set(Array.isArray(state?.pending_slot_ids)?state.pending_slot_ids:[])];
        const requiredCount=record.addMinutes/60;
        if(pending.length>=requiredCount){successfulKeys.add(key);result.duplicate++;result.items.push({...record,key,status:"already_pending"});onProgress(result,record);continue;}
        const free=slots.map(slot=>slot.slot_id).filter(id=>!selected.includes(id)),needed=requiredCount-pending.length;
        if(free.length<needed)throw Error("ATTENDANCE_SLOT_CAPACITY_EXCEEDED");
        const additions=free.slice(0,needed),input={mode:"attendance_batch",request_id:requestId({...record,key}),attendance_session_id:String(scope.attendance_session_id||"PAPER_MEMBER").slice(0,128),attendance_date:record.attendance_date,teacher_id:"",location_id:scope.location_id,billing_block_id:scope.billing_block_id,attendance_items:[{member_id:String(memberId),current_rank:String(state.current_rank||""),plan_id:"",slot_ids:[...selected,...additions]}],source:"paper_attendance_member",skip_billing:true};
        await register(input,record);successfulKeys.add(key);result.success+=additions.length;result.items.push({...record,key,status:"pending",slot_ids:additions});
      }catch(error){result.failed++;result.items.push({...record,key,status:"failed",error:String(error?.message||error)});}onProgress(result,record);
    }
    return result;
  }

  function inkScorePixels(data,width,height){
    const x0=Math.floor(width*.09),x1=Math.ceil(width*.91),y0=Math.floor(height*.1),y1=Math.ceil(height*.9);let sum=0,count=0;
    for(let y=y0;y<y1;y+=2)for(let x=x0;x<x1;x+=2){const index=(y*width+x)*4;sum+=(data[index]*299+data[index+1]*587+data[index+2]*114)/1000;count++;}
    const mean=sum/Math.max(1,count);let dark=0;
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const index=(y*width+x)*4,gray=(data[index]*299+data[index+1]*587+data[index+2]*114)/1000;if(gray<mean-34&&gray<155)dark++;}
    return dark;
  }

  const api={ROWS,COLS,INK_CELL_WIDTH,INK_CELL_HEIGHT,INK_THRESHOLD,IDEAL_CORNERS,DEFAULT_CORNERS,validateGridCorners,normalizeImageScale,normalizePaperDetection,blankCells,normalizeDate,fullDate,buildAttendanceDifferencePlan,buildDifferenceRegistrationRecords,buildRegistrationRecords,registerDifferencePlan,registerPendingDifferencePlan,registerSequential,paperOwnerKey,normalizeAttendanceByDate,perspective,toUnit,fromUnit,cellIndexForPoint,cellIndexForCandidate,mapOcr,aggregate,nextPendingIndex,paperCellSequence,clearCellsFromPaperOrder,confirmTrailingEmptyCells,inkScorePixels};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.DOJO_PAPER_ATTENDANCE_READER=api;
})(typeof window!=="undefined"?window:globalThis);
