'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const {estimateProgressForecast}=require('../cloud/attendance/progress-forecast.cjs');
const summary={member_id:'M1',current_rank:'成人無級',next_rank:'5級',required_training_count:20,remaining_training_count:10};
const row=(date,slot,status='確認済')=>({member_id:'M1','稽古日':date,slot_id:slot,'状態':status});

test('90-day confirmed unique slots produce weekly frequency and remaining weeks',()=>{
  const result=estimateProgressForecast({summary,asOfDate:'2026-10-25',attendanceRows:[
    row('2026-08-01','S1'),row('2026-08-01','S2'),row('2026-09-01','S1'),row('2026-10-01','S1'),row('2026-10-20','S1')]});
  assert.equal(result.forecast_status,'ESTIMATED');assert.equal(result.recent_training_days,4);assert.equal(result.recent_training_slots,5);
  assert.equal(result.weekly_training_slots,0.389);assert.equal(result.forecast_weeks,26);assert.equal(result.forecast_label,'約6か月後');
});
test('pending, cancelled, duplicate, old and future rows do not affect forecast',()=>{
  const rows=[row('2026-08-01','S1'),row('2026-08-01','S1'),row('2026-09-01','S1'),row('2026-10-01','S1'),
    row('2026-10-02','S2','確認待ち'),row('2026-10-03','S3','取消'),row('2026-07-01','S4'),row('2026-10-26','S5')];
  const result=estimateProgressForecast({summary:{...summary,remaining_training_count:1},asOfDate:'2026-10-25',attendanceRows:rows});
  assert.equal(result.recent_training_days,3);assert.equal(result.recent_training_slots,3);assert.equal(result.forecast_weeks,5);
});
test('fewer than three attendance dates is unavailable',()=>{
  const result=estimateProgressForecast({summary,asOfDate:'2026-10-25',attendanceRows:[row('2026-10-01','S1'),row('2026-10-02','S1'),row('2026-10-02','S2')]});
  assert.equal(result.forecast_label,'算出不可');assert.equal(result.forecast_reason,'HISTORY_INSUFFICIENT');
});
test('zero confirmed slots in the period is unavailable',()=>{
  const result=estimateProgressForecast({summary,asOfDate:'2026-10-25',attendanceRows:[row('2026-10-01','S1','確認待ち')]});
  assert.equal(result.forecast_label,'算出不可');assert.equal(result.forecast_reason,'ZERO_FREQUENCY');
});
test('achieved requirement is reported without forcing a forecast',()=>{
  const result=estimateProgressForecast({summary:{...summary,remaining_training_count:0},asOfDate:'2026-10-25',attendanceRows:[]});
  assert.equal(result.forecast_status,'ACHIEVED');assert.equal(result.forecast_label,'必要枠達成');
});
test('missing requirement or rank condition is unavailable',()=>{
  assert.equal(estimateProgressForecast({summary:{...summary,required_training_count:0,remaining_training_count:null},asOfDate:'2026-10-25',attendanceRows:[]}).forecast_reason,'REQUIRED_UNSET');
  assert.equal(estimateProgressForecast({summary:{...summary,next_rank:''},asOfDate:'2026-10-25',attendanceRows:[]}).forecast_reason,'RANK_CONDITION_UNAVAILABLE');
});
