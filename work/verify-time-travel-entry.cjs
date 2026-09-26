const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {format}=require('../shared/TimeTravel.js');
function sheet(rows){return {rows,getDataRange:()=>({getValues:()=>rows.map(r=>[...r])}),getLastRow:()=>rows.length,getRange(r,c,h=1,w=1){return {setNumberFormat(){return this;},setValue(v){while(rows.length<r)rows.push([]);rows[r-1][c-1]=v;return this;},setValues(values){for(let i=0;i<h;i++)for(let j=0;j<w;j++){while(rows.length<r+i)rows.push([]);rows[r+i-1][c+j-1]=values[i][j];}return this;}};}};}
function setup(){
  const original=sheet([['key','value'],['TIME_TRAVEL_ENABLED','FALSE'],['DEBUG','TRUE']]);
  const sheets=new Map([['99_設定',original]]);
  const ss={getSheetByName:name=>sheets.get(name),insertSheet(name){const s=sheet([]);sheets.set(name,s);return s;},deleteSheet(s){for(const [name,value]of sheets)if(value===s)sheets.delete(name);}};
  const box={Date,Intl,SpreadsheetApp:{getActiveSpreadsheet:()=>ss},Session:{getScriptTimeZone:()=> 'Asia/Tokyo'},Utilities:{formatDate:format,getUuid:()=> 'test-12345'},createSheetContext:()=>({ss,settings:Object.fromEntries(original.rows.slice(1))}),ensureSheetContext:ctx=>ctx,normalizeMonth:value=>String(value).trim()};
  vm.createContext(box);for(const name of ['DojoTimeTravel.js','DojoTimeTravelEntry.js','sup_timeTravel.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../gas',name),'utf8'),box);
  return {box,sheets,original};
}
test('existing UI entry saves through common DAO and existing clock observes it',()=>{
  const {box,original}=setup();
  assert.equal(box.sup_timeTravel_getAdminSetting().enabled,false);
  const result=box.sup_timeTravel_saveAdminSetting({enabled:true,now:'2099-07-09T10:00:00+09:00',target_month:'2099-07'});
  assert.equal(result.effective.system_now,'2099-07-09 10:00:00');
  assert.equal(box.sup_today(box.createSheetContext()),'2099-07-09');
  assert.equal(box.sup_timeTravel_getSystemContext(box.createSheetContext()).target_month,'2099-07');
  assert.equal(box.sup_timeTravel_saveAdminSetting({enabled:false}).effective.time_travel_enabled,false);
  assert.equal(original.rows.find(r=>r[0]==='DEBUG')[1],'TRUE');
});
test('physical IO smoke cleans up temporary sheet and leaves real settings intact',()=>{
  const {box,sheets,original}=setup(),before=JSON.stringify(original.rows);
  assert.equal(box.runner_timeTravelPortable_smoke().message,'TIME-TRAVEL-PORTABLE PASS');
  assert.equal(JSON.stringify(original.rows),before);assert.equal(sheets.size,1);
});
