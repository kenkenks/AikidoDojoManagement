'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {projectAttendanceProgress}=require('../cloud/attendance/progress-summary.cjs');
const base=()=>({
 member:{member_id:'M001',member_name:'テスト',status:'有効',current_rank:'成人一級',rank_start_date:'2026-01-01',carried_training_count:0},
 standard:{next_rank:'成人初段',required_training_count:4,required_training_days:3,progress_display_enabled:true},
 rankOption:{rank_id:'R1',sort_order:1},
 attendanceRows:[
 {member_id:'M001',状態:'有効',稽古日:'2026-01-02',slot_id:'S1'},
 {member_id:'M001',状態:'有効',稽古日:'2026-01-02',slot_id:'S2'},
 {member_id:'M001',状態:'有効',稽古日:'2026-01-03',slot_id:'S1'},
 {member_id:'M001',状態:'有効',稽古日:'2026-01-03',slot_id:'S1'},
 ]});
test('distinct days independent from slots; neither condition alone is ready',()=>{
 const r=projectAttendanceProgress(base());
 assert.equal(r.training_count,3);assert.equal(r.training_days,2);
 assert.equal(r.remaining_training_count,1);assert.equal(r.remaining_training_days,1);
 assert.equal(r.examination_ready,false);
});
test('count reached but days short is not ready',()=>{
 const a=base();a.attendanceRows.push({member_id:'M001',状態:'有効',稽古日:'2026-01-02',slot_id:'S3'});
 const r=projectAttendanceProgress(a);assert.equal(r.training_count,4);assert.equal(r.training_days,2);assert.equal(r.examination_ready,false);
});
test('days reached but count short is not ready',()=>{
 const a=base();a.attendanceRows=a.attendanceRows.filter(x=>x.slot_id==='S1');a.attendanceRows.push({member_id:'M001',状態:'有効',稽古日:'2026-01-04',slot_id:'S1'});
 const r=projectAttendanceProgress(a);assert.equal(r.training_days,3);assert.equal(r.training_count,3);assert.equal(r.examination_ready,false);
});
test('both reached yields quantity-only ready',()=>{
 const a=base();a.attendanceRows.push({member_id:'M001',状態:'有効',稽古日:'2026-01-04',slot_id:'S1'});
 const r=projectAttendanceProgress(a);assert.equal(r.examination_ready,true);
});
