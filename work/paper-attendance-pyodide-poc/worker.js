'use strict';
const PYODIDE_BASE='https://cdn.jsdelivr.net/pyodide/v0.27.7/full/';
self.onmessage=async event=>{
  try{
    postMessage({type:'progress',message:'PyodideとNumPy/Pillowを読み込んでいます…'});
    importScripts(`${PYODIDE_BASE}pyodide.js`);
    const pyodide=await loadPyodide({indexURL:PYODIDE_BASE});
    await pyodide.loadPackage(['numpy','pillow']);
    postMessage({type:'progress',message:'最終評価版アルゴリズムを実行しています…'});
    pyodide.FS.mkdirTree('/work/output');
    pyodide.FS.writeFile('/work/input.jpg',new Uint8Array(event.data.bytes));
    pyodide.FS.writeFile('/work/algorithm.py',new TextEncoder().encode(event.data.algorithm));
    const started=performance.now();
    await pyodide.runPythonAsync("import runpy,sys\nsys.argv=['/work/algorithm.py','/work/input.jpg','/work/output']\nrunpy.run_path('/work/algorithm.py',run_name='__main__')");
    const elapsedMs=Math.round(performance.now()-started);
    const manifest=JSON.parse(new TextDecoder().decode(pyodide.FS.readFile('/work/output/manifest.json')));
    const corrected=pyodide.FS.readFile('/work/output/02-mesh-normalized.jpg').slice().buffer;
    const selectedCards=[361,362,381,382].map(number=>{const item=manifest.cards.find(x=>x.number===number);return{number,bytes:pyodide.FS.readFile(`/work/output/${item.file}`).slice().buffer};});
    const transfers=[corrected,...selectedCards.map(x=>x.bytes)];
    postMessage({type:'result',elapsedMs,wasmHeapBytes:pyodide._module.HEAP8.buffer.byteLength,manifest,corrected,selectedCards},transfers);
  }catch(error){postMessage({type:'error',message:String(error?.stack||error)});}
};
