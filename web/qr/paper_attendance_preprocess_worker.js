'use strict';
const PYODIDE_BASE='https://cdn.jsdelivr.net/pyodide/v0.27.7/full/';
self.onmessage=async event=>{
  try{
    postMessage({type:'progress',stage:'runtime',percent:1,message:'画像処理環境を読み込んでいます'});
    importScripts(`${PYODIDE_BASE}pyodide.js`);
    const pyodide=await loadPyodide({indexURL:PYODIDE_BASE});
    postMessage({type:'progress',stage:'packages',percent:3,message:'NumPyとPillowを読み込んでいます'});
    await pyodide.loadPackage(['numpy','pillow']);
    const [algorithmResponse,runnerResponse]=await Promise.all([
      fetch('./paper_attendance_preprocess.py',{cache:'no-store'}),
      fetch('./paper_attendance_preprocess_runner.py',{cache:'no-store'})
    ]);
    if(!algorithmResponse.ok||!runnerResponse.ok)throw Error('PAPER_PREPROCESS_ASSET_UNAVAILABLE');
    const [algorithm,runner]=await Promise.all([algorithmResponse.text(),runnerResponse.text()]);
    pyodide.FS.mkdirTree('/work/output');
    pyodide.FS.writeFile('/work/input.jpg',new Uint8Array(event.data.bytes));
    pyodide.FS.writeFile('/work/algorithm.py',new TextEncoder().encode(algorithm));
    pyodide.FS.writeFile('/work/runner.py',new TextEncoder().encode(runner));
    const corners=event.data.corners;
    if(corners!==undefined)pyodide.FS.writeFile('/work/grid-hint.json',new TextEncoder().encode(JSON.stringify({corners})));
    const started=performance.now();
    await pyodide.runPythonAsync("import runpy,sys\nsys.argv=['/work/runner.py','/work/algorithm.py','/work/input.jpg','/work/output','half-fast','/work/grid-hint.json' if __import__('os').path.exists('/work/grid-hint.json') else '']\nrunpy.run_path('/work/runner.py',run_name='__main__')");
    if(pyodide.FS.analyzePath('/work/output/error.json').exists){
      const failure=JSON.parse(new TextDecoder().decode(pyodide.FS.readFile('/work/output/error.json')));
      postMessage({type:'error',...failure});return;
    }
    const manifest=JSON.parse(new TextDecoder().decode(pyodide.FS.readFile('/work/output/manifest.json')));
    const selectedCards=[361,362,381,382].map(number=>({number,bytes:pyodide.FS.readFile(`/work/output/cards/card-${String(number).padStart(3,'0')}.png`).slice().buffer}));
    const quadrants=[1,2].flatMap(row=>[1,2].map(column=>({row,column,bytes:pyodide.FS.readFile(`/work/output/quadrant-${row}-${column}.jpg`).slice().buffer})));
    const transfers=[...selectedCards.map(item=>item.bytes),...quadrants.map(item=>item.bytes)];
    postMessage({type:'result',elapsedMs:Math.round(performance.now()-started),wasmHeapBytes:pyodide._module.HEAP8.buffer.byteLength,manifest,selectedCards,quadrants},transfers);
  }catch(error){
    const message=String(error?.message||error||'PAPER_PREPROCESS_FAILED');
    postMessage({type:'error',stage:'runtime',code:String(error?.name||'PAPER_PREPROCESS_FAILED'),message,detail:String(error||message),jsStack:String(error?.stack||'')});
  }
};
