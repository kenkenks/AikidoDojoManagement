'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const review=require('../web/qr/paper_attendance_review.js');
let passed=0;function test(name,fn){fn();passed++;console.log('PASS',name);}
test('20x20 cells',()=>{const cells=review.blankCells();assert.equal(cells.length,400);assert.deepEqual([cells[0].row,cells[0].column,cells[399].row,cells[399].column],[1,1,20,20]);});
test('date normalization',()=>{assert.equal(review.normalizeDate('９／２３'),'9/23');assert.equal(review.normalizeDate('2026/10/19'),'2026-10-19');assert.equal(review.normalizeDate('99/99'),'');});
test('perspective coordinate mapping',()=>{const first=review.fromUnit(.01,.01,review.DEFAULT_CORNERS),last=review.fromUnit(.99,.99,review.DEFAULT_CORNERS),round=review.toUnit(review.fromUnit(.37,.64,review.DEFAULT_CORNERS),review.DEFAULT_CORNERS);assert.equal(review.cellIndexForPoint(first),0);assert.equal(review.cellIndexForPoint(last),399);assert.ok(Math.abs(round.x-.37)<1e-8&&Math.abs(round.y-.64)<1e-8);});
test('OCR status mapping',()=>{const a=review.fromUnit(.01,.01,review.DEFAULT_CORNERS),b=review.fromUnit(.06,.01,review.DEFAULT_CORNERS),cells=review.mapOcr({candidates:[{text:'9/23',polygon:[a,a,a],confidence:.95},{text:'9/?',polygon:[b,b,b],confidence:.5}]});assert.equal(cells[0].status,'recognized');assert.equal(cells[1].status,'review');assert.equal(cells[2].status,'empty');});
test('manual edits survive remapping',()=>{const point=review.fromUnit(.01,.01,review.DEFAULT_CORNERS),edits=new Map([[0,{date:'10/1',status:'recognized',confirmed:true}]]),moved=review.DEFAULT_CORNERS.map((p,i)=>({x:p.x+(i<2?.01:0),y:p.y})),cells=review.mapOcr({candidates:[{text:'9/23',polygon:[point,point,point],confidence:.9}]},moved,edits);assert.equal(cells[0].date,'10/1');assert.equal(cells[0].confirmed,true);assert.equal(cells[0].manual,true);});
test('duplicates remain separate and aggregate',()=>{const cells=review.blankCells();cells[0].date='9/23';cells[1].date='9/23';assert.deepEqual(review.aggregate(cells),[{date:'9/23',count:2}]);});
test('screen has OCR controls without Firestore',()=>{const html=fs.readFileSync(path.join(__dirname,'../web/qr/paper_attendance_review.html'),'utf8'),js=fs.readFileSync(path.join(__dirname,'../web/qr/paper_attendance_review.js'),'utf8');assert.match(html,/20×20/);assert.match(html,/maxDimension/);assert.match(js,/paper_attendance_ocr/);assert.doesNotMatch(html+js,/getFirestore|collection\s*\(/i);});
test('teacher home link exists',()=>{const html=fs.readFileSync(path.join(__dirname,'../web/qr/teacher_home.html'),'utf8');assert.match(html,/paper_attendance_review\.html/);});
console.log('RESULT',passed,'passed');
