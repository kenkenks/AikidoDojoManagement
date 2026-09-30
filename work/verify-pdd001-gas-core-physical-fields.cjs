const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

function sheet(rows){
  return {
    rows,
    getDataRange:()=>({getValues:()=>rows.map(r=>[...r])}),
    getLastRow:()=>rows.length,
    getRange(r,c){
      return {
        setNumberFormat(){return this;},
        setValue(v){while(rows.length<r)rows.push([]);rows[r-1][c-1]=v;return this;}
      };
    }
  };
}
function setup(rows){
  const target=sheet(rows);
  const ss={getSheetByName:name=>name==='99_設定'?target:null};
  const sourceText=fs.readFileSync(path.join(__dirname,'../adapters/gas/DAO_Core.js'),'utf8');
  const module={exports:{}};
  const box={module,exports:module.exports,SpreadsheetApp:{getActiveSpreadsheet:()=>ss},require:name=>name==='./DAO_Definitions.js'?{tableDefinitions:{}}:require(name)};
  vm.runInNewContext(sourceText,box,{filename:'DAO_Core.js'});
  const {createCore}=module.exports;
  const source={sheet:'99_設定',keyColumn:1,valueColumn:2,keyField:'キー',fields:{key:'キー',value:'値'}};
  return {core:createCore({}),source,target};
}

test('GAS Core upsertByKey creates a row using mapped physical field names',()=>{
  const {core,source,target}=setup([['キー','値']]);
  const result=core.upsertByKey(source,'DEBUG_TARGET_MONTH',{'キー':'DEBUG_TARGET_MONTH','値':'2099-07'});
  assert.equal(result.created,true); assert.equal(result.updated,false);
  assert.deepEqual(target.rows,[['キー','値'],['DEBUG_TARGET_MONTH','2099-07']]);
});

test('GAS Core upsertByKey updates a row using mapped physical field names',()=>{
  const {core,source,target}=setup([['キー','値'],['DEBUG_TARGET_MONTH','2026-09']]);
  const result=core.upsertByKey(source,'DEBUG_TARGET_MONTH',{'キー':'DEBUG_TARGET_MONTH','値':'2099-07'});
  assert.equal(result.created,false); assert.equal(result.updated,true);
  assert.deepEqual(target.rows,[['キー','値'],['DEBUG_TARGET_MONTH','2099-07']]);
});
