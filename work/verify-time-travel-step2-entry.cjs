const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

function format(date,timezone,pattern) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
    timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
  }).formatToParts(date).map(p=>[p.type,p.value]));
  return pattern.replace(/yyyy|MM|dd|HH|mm|ss/g,t=>parts[{yyyy:'year',MM:'month',dd:'day',HH:'hour',mm:'minute',ss:'second'}[t]]);
}
function sheet(rows){return {rows,
  getDataRange:()=>({getValues:()=>rows.map(r=>[...r])}),
  getLastRow:()=>rows.length,
  getRange(r,c,h=1,w=1){return {
    setNumberFormat(){return this;},
    setValue(v){while(rows.length<r)rows.push([]);rows[r-1][c-1]=v;return this;},
    setValues(values){for(let i=0;i<h;i++)for(let j=0;j<w;j++){while(rows.length<r+i)rows.push([]);rows[r+i-1][c+j-1]=values[i][j];}return this;}
  };}
};}

function setup(){
  const original=sheet([['key','value'],['TIME_TRAVEL_ENABLED','FALSE'],['DEBUG','TRUE']]);
  const ss={getSheetByName:name=>name==='99_設定'?original:null};
  const createSheetContext=()=>({
    ss,
    settings:Object.fromEntries(original.rows.slice(1).map(r=>[r[0],r[1]]))
  });
  const box={
    Date,Intl,console,
    SpreadsheetApp:{getActiveSpreadsheet:()=>ss},
    Session:{getScriptTimeZone:()=> 'Asia/Tokyo'},
    Utilities:{formatDate:format,getUuid:()=> 'test-12345'},
    createSheetContext,
    ensureSheetContext:ctx=>ctx,
    normalizeMonth:value=>String(value).trim(),
    HtmlService:{createHtmlOutputFromFile:()=>({setWidth(){return this;},setHeight(){return this;}})}
  };
  vm.createContext(box);
  for(const name of ['DojoTimeTravelStep2.js','DojoTimeTravelStep2Entry.js','sup_timeTravel.js'])
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../gas',name),'utf8'),box);
  return {box,original,createSheetContext};
}

test('existing sup_timeTravel admin entry uses Step2 Portable DAO',()=>{
  const {box,original}=setup();
  assert.equal(box.sup_timeTravel_getAdminSetting().enabled,false);

  const enabled=box.sup_timeTravel_saveAdminSetting({
    enabled:true,now:'2099-07-09T10:00:00+09:00',target_month:'2099-07'
  });
  assert.equal(enabled.ok,true);
  assert.equal(enabled.effective.system_now,'2099-07-09 10:00:00');
  assert.equal(enabled.effective.target_month,'2099-07');

  const ctx=box.createSheetContext();
  assert.equal(box.sup_today(ctx),'2099-07-09');
  assert.equal(box.sup_targetMonth(ctx),'2099-07');
  assert.equal(box.sup_timeTravel_getSystemContext(ctx).target_month,'2099-07');

  const disabled=box.sup_timeTravel_saveAdminSetting({enabled:false});
  assert.equal(disabled.effective.time_travel_enabled,false);
  assert.equal(original.rows.find(r=>r[0]==='DEBUG')[1],'TRUE');
});
