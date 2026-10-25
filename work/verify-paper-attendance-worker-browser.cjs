'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');

const root=path.resolve(__dirname,'..');
const chromeCandidates=[
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];
const browser=chromeCandidates.find(fs.existsSync);
assert.ok(browser,'Chrome or Edge is required for the browser Worker regression test');

const html=`<!doctype html><meta charset="utf-8"><pre id="result">RUNNING</pre><script>
const seen=[];let cachePassed=false;const worker=new Worker('/worker.js');
async function verifyCache(){const oldValue=await fetch('/asset.py').then(r=>r.text());await fetch('/switch');const staleValue=await fetch('/asset.py').then(r=>r.text());const freshValue=await fetch('/asset.py',{cache:'no-store'}).then(r=>r.text());cachePassed=oldValue==='OLD'&&staleValue==='OLD'&&freshValue==='NEW';finish();}
function finish(){if(cachePassed&&['progress','result','error'].every(type=>seen.includes(type))){document.querySelector('#result').textContent='PASS '+seen.join(',')+',cache';worker.terminate();}}
worker.onmessage=event=>{let data=event.data;if(typeof data==='string')data=JSON.parse(data);seen.push(data.type);finish();};
worker.onerror=event=>{document.querySelector('#result').textContent='FAIL '+event.message;};
verifyCache().catch(error=>document.querySelector('#result').textContent='FAIL '+error);
</script>`;
const worker=`'use strict';
const BASE='https://cdn.jsdelivr.net/pyodide/v0.27.7/full/';
self.onmessage=()=>{};
(async()=>{try{
  importScripts(BASE+'pyodide.js');
  const pyodide=await loadPyodide({indexURL:BASE});
  await pyodide.loadPackage(['numpy','pillow']);
  const runner=await fetch('/runner.py').then(response=>{if(!response.ok)throw Error('RUNNER_FETCH_FAILED');return response.text();});
  pyodide.FS.writeFile('/runner.py',new TextEncoder().encode(runner));
  await pyodide.runPythonAsync("import runpy\\nns=runpy.run_path('/runner.py',run_name='browser_progress_test')\\nns['notify']('browser',37,'進捗テスト')");
  postMessage({type:'result',ok:true});
  postMessage({type:'error',message:'EXPECTED_TEST_ERROR'});
}catch(error){postMessage({type:'test-failure',message:String(error?.stack||error)});}})();`;

let assetVersion='OLD';
const server=http.createServer((request,response)=>{
  const pathname=new URL(request.url,'http://127.0.0.1').pathname;
  if(pathname==='/'){response.setHeader('Content-Type','text/html; charset=utf-8');response.end(html);return;}
  if(pathname==='/worker.js'){response.setHeader('Content-Type','text/javascript; charset=utf-8');response.end(worker);return;}
  if(pathname==='/runner.py'){response.setHeader('Content-Type','text/x-python; charset=utf-8');response.end(fs.readFileSync(path.join(root,'web/qr/paper_attendance_preprocess_runner.py')));return;}
  if(pathname==='/asset.py'){response.setHeader('Content-Type','text/x-python');response.setHeader('Cache-Control','max-age=3600');response.end(assetVersion);return;}
  if(pathname==='/switch'){assetVersion='NEW';response.setHeader('Cache-Control','no-store');response.end('OK');return;}
  response.writeHead(404).end();
});

server.listen(0,'127.0.0.1',()=>{
  const {port}=server.address(),profile=fs.mkdtempSync(path.join(os.tmpdir(),'paper-worker-browser-'));
  const child=spawn(browser,[
    '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
    `--user-data-dir=${profile}`,'--remote-debugging-port=0',`http://127.0.0.1:${port}/`
  ],{windowsHide:true});
  let stderr='',finished=false;
  const finish=error=>{if(finished)return;finished=true;child.kill();server.close();setTimeout(()=>{try{fs.rmSync(profile,{recursive:true,force:true});}catch(_){}},250);if(error){console.error(stderr);console.error(error);process.exitCode=1;}else console.log('PASS browser Pyodide progress/result/error structured-clone paths');};
  child.stderr.on('data',async chunk=>{
    stderr+=chunk;
    const match=stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
    if(!match||child.cdpStarted)return;child.cdpStarted=true;
    try{
      const targets=await fetch(`http://127.0.0.1:${match[1]}/json/list`).then(response=>response.json());
      const target=targets.find(item=>item.url===`http://127.0.0.1:${port}/`);assert.ok(target,'browser test page target');
      const socket=new WebSocket(target.webSocketDebuggerUrl);let nextId=1;const pending=new Map();
      socket.onmessage=event=>{const message=JSON.parse(event.data);if(message.id&&pending.has(message.id)){pending.get(message.id)(message);pending.delete(message.id);}};
      await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
      const evaluate=expression=>new Promise(resolve=>{const id=nextId++;pending.set(id,resolve);socket.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true}}));});
      const deadline=Date.now()+120000;
      while(Date.now()<deadline){const reply=await evaluate("document.querySelector('#result').textContent");const text=reply.result?.result?.value||'';if(text.startsWith('PASS ')){assert.equal(text,'PASS progress,result,error,cache');socket.close();finish();return;}if(text.startsWith('FAIL '))throw Error(text);await new Promise(resolve=>setTimeout(resolve,500));}
      throw Error('BROWSER_WORKER_TEST_TIMEOUT');
    }catch(error){finish(error);}
  });
  child.on('error',finish);
  child.on('close',code=>{if(!finished)finish(Error(`Browser exited before test completion: ${code}`));});
});
