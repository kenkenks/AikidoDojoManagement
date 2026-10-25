'use strict';
const BASE='https://cdn.jsdelivr.net/pyodide/v0.27.7/full/';
self.onmessage=async event=>{
  const started=performance.now(),memory=[];
  try{
    importScripts(`${BASE}pyodide.js`);
    const pyodide=await loadPyodide({indexURL:BASE});
    memory.push({stage:'runtime',wasmHeapBytes:pyodide._module.HEAP8.buffer.byteLength});
    await pyodide.loadPackage(['numpy','pillow']);
    memory.push({stage:'packages',wasmHeapBytes:pyodide._module.HEAP8.buffer.byteLength});
    const [runner,algorithm]=await Promise.all([
      fetch('./runner.py',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('RUNNER_UNAVAILABLE');return r.text();}),
      fetch('/web/qr/paper_attendance_preprocess.py',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('ALGORITHM_UNAVAILABLE');return r.text();})
    ]);
    pyodide.FS.mkdirTree('/work/output');
    pyodide.FS.writeFile('/work/input.jpg',new Uint8Array(event.data.bytes));
    pyodide.FS.writeFile('/work/runner.py',new TextEncoder().encode(runner));
    pyodide.FS.writeFile('/work/algorithm.py',new TextEncoder().encode(algorithm));
    pyodide.FS.writeFile('/work/corners.json',new TextEncoder().encode(JSON.stringify({paper_corners:event.data.paperCorners})));
    memory.push({stage:'input',wasmHeapBytes:pyodide._module.HEAP8.buffer.byteLength});
    await pyodide.runPythonAsync("import runpy,sys\nsys.argv=['/work/runner.py','/work/algorithm.py','/work/input.jpg','/work/output','/work/corners.json']\nrunpy.run_path('/work/runner.py',run_name='__main__')");
    memory.push({stage:'completed',wasmHeapBytes:pyodide._module.HEAP8.buffer.byteLength});
    const report=JSON.parse(new TextDecoder().decode(pyodide.FS.readFile('/work/output/report.json')));
    const cardFiles=pyodide.FS.readdir('/work/output/pipeline/cards').filter(name=>name.endsWith('.png'));
    postMessage({type:'result',browserElapsedMs:Math.round(performance.now()-started),memory,report,cardFileCount:cardFiles.length});
  }catch(error){
    postMessage({type:'error',message:String(error?.message||error),stack:String(error?.stack||'')});
  }
};
