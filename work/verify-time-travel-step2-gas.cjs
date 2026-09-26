const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

function sheet(rows){
  return {rows,
    getDataRange:()=>({getValues:()=>rows.map(r=>[...r])}),
    getLastRow:()=>rows.length,
    getRange(r,c,h=1,w=1){return {
      setNumberFormat(){return this;},
      setValue(v){while(rows.length<r)rows.push([]);rows[r-1][c-1]=v;return this;},
      setValues(values){for(let i=0;i<h;i++)for(let j=0;j<w;j++){while(rows.length<r+i)rows.push([]);rows[r+i-1][c+j-1]=values[i][j];}return this;}
    };}
  };
}
const settings=sheet([['key','value'],['TIME_TRAVEL_ENABLED','FALSE'],['DEBUG','TRUE']]);
const ss={getSheetByName:name=>name==='99_設定'?settings:null};
const box={Date,Intl,console,SpreadsheetApp:{getActiveSpreadsheet:()=>ss}};
vm.createContext(box);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../.build/portable-timetravel-step2-gas/DojoTimeTravelStep2.js'),'utf8'),box);
const app=box.DojoTimeTravelStep2.createApplication({
  spreadsheet:ss,
  timezone:'Asia/Tokyo',
  clock:()=>new Date('2026-09-26T06:00:00Z')
});
assert.equal(app.getTimeTravel().enabled,false);
const enabled=app.saveTimeTravel({enabled:true,now:'2099-07-09T10:00:00+09:00',target_month:'2099-07'});
assert.equal(enabled.ok,true);
assert.equal(enabled.effective.system_now,'2099-07-09 10:00:00');
assert.equal(enabled.effective.target_month,'2099-07');
assert.equal(app.getTimeTravel().target_month,'2099-07');
const updated=app.saveTimeTravel({enabled:true,now:'2099-07-10T10:00:00+09:00',target_month:'2099-08'});
assert.equal(updated.effective.target_month,'2099-08');
assert.equal(settings.rows.filter(r=>r[0]==='TIME_TRAVEL_ENABLED').length,1);
assert.equal(settings.rows.filter(r=>r[0]==='DEBUG_DATE').length,1);
assert.equal(settings.rows.filter(r=>r[0]==='DEBUG_TARGET_MONTH').length,1);
const disabled=app.saveTimeTravel({enabled:false});
assert.equal(disabled.ok,true);
assert.equal(disabled.effective.time_travel_enabled,false);
assert.equal(settings.rows.find(r=>r[0]==='DEBUG')[1],'TRUE');
console.log('TIME-TRAVEL-STEP2 GAS VERIFY PASS');
console.log('READ UPSERT_CREATE UPSERT_UPDATE READ_AGAIN DISABLE PASS');
