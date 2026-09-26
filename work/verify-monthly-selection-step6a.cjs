'use strict';
const assert=require('node:assert/strict');
const cp=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
cp.execFileSync(process.execPath,[path.join(root,'tools','build-portable-dao-monthly-selection-gas-runtime.mjs')],{stdio:'inherit'});
class Range { constructor(sheet,r,c,nr=1,nc=1){Object.assign(this,{sheet,r,c,nr,nc});} getValues(){return Array.from({length:this.nr},(_,ri)=>Array.from({length:this.nc},(_,ci)=>this.sheet.rows[this.r-1+ri]?.[this.c-1+ci]??''));} setValues(values){for(let ri=0;ri<values.length;ri++){while(this.sheet.rows.length<this.r+ri)this.sheet.rows.push([]);for(let ci=0;ci<values[ri].length;ci++)this.sheet.rows[this.r-1+ri][this.c-1+ci]=values[ri][ci];}return this;} setValue(v){return this.setValues([[v]]);} setNumberFormat(){return this;} }
class Sheet { constructor(rows){this.rows=rows.map(r=>r.slice());} getDataRange(){return new Range(this,1,1,this.rows.length,this.getLastColumn());} getRange(r,c,nr=1,nc=1){return new Range(this,r,c,nr,nc);} getLastRow(){return this.rows.length;} getLastColumn(){return Math.max(0,...this.rows.map(r=>r.length));} }
const headers=['target_month','member_id','billing_group_id','plan_id','宣言日','状態','備考','guard'];
const sheet=new Sheet([headers,['2099-06','M000','G000','P001','2099-06-01','有効','old','KEEP']]);
global.SpreadsheetApp={getActiveSpreadsheet(){return {getSheetByName(name){return name==='04_月次選択'?sheet:null;}}}};
const api=require(path.join(root,'gas','DojoPortableDaoMonthlySelection.js'));
const dao=api.create({}, {spreadsheet:SpreadsheetApp.getActiveSpreadsheet()});
assert.equal(dao.readAll('monthlySelection').length,1);
const result=dao.appendRecord('monthlySelection',{target_month:'2099-07',member_id:'M001',billing_group_id:'G001',plan_id:'P001',宣言日:'2099-07-01',状態:'有効',備考:'STEP6A'});
assert.deepEqual(result,{appended:true});
const rows=dao.readAll('monthlySelection');
assert.equal(rows.length,2);
assert.deepEqual(rows[1],{target_month:'2099-07',member_id:'M001',billing_group_id:'G001',plan_id:'P001',宣言日:'2099-07-01',状態:'有効',備考:'STEP6A'});
assert.equal(sheet.rows[2][7],'');
assert.equal(sheet.getLastRow(),3);
console.log('MONTHLY-SELECTION-STEP6A LOCAL VERIFY PASS');
console.log('READ_ALL APPEND_RECORD READ_AGAIN PRESERVE_UNMENTIONED_COLUMN NO_OVERWRITE PASS');
