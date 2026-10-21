'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'paper-attendance-pyodide-poc'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),worker=fs.readFileSync(path.join(root,'worker.js'),'utf8');
assert.match(worker,/pyodide\/v0\.27\.7/);assert.match(worker,/loadPackage\(\['numpy','pillow'\]\)/);assert.match(html,/paper-attendance-preprocess-prototype/);assert.match(worker,/runpy\.run_path/);assert.match(html,/baseline_changed_cards/);assert.match(html,/written_truth_detected/);assert.match(html,/361,362,381,382/);assert.doesNotMatch(html+worker,/api\/webconnect|paper_attendance_ocr|Firestore/i);console.log('PASS independent Pyodide PoC contract');
