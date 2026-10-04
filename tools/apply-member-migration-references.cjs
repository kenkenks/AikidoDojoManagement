'use strict';
const fs=require('node:fs'),path=require('node:path');

function buildPlan(classified,repoRoot){
  const byFile=new Map();
  for(const r of classified.results||[]){
    if(r.action==='no-change')continue;
    for(const e of r.files||[])for(const h of e.hits||[])if(h.classification==='REPLACE'){
      if(!byFile.has(e.file))byFile.set(e.file,[]);
      byFile.get(e.file).push({before:r.before,after:r.after,line:h.line,column:h.column,
        expected_text:h.text,reason:h.reason});
    }
  }
  const files=[],stale=[],base=path.resolve(repoRoot)+path.sep;
  for(const [rel,hits] of [...byFile.entries()].sort()){
    const abs=path.resolve(repoRoot,rel);
    if(!abs.startsWith(base))throw Error(`PDD_MEMBER_APPLY_OUTSIDE_REPO: ${rel}`);
    if(!fs.existsSync(abs)){stale.push({file:rel,reason:'missing-file'});continue;}
    const lines=fs.readFileSync(abs,'utf8').split(/\r?\n/),transforms=[];
    for(const h of hits){
      const cur=lines[h.line-1],idx=Number(h.column)-1;
      if(cur===undefined||cur.trim()!==h.expected_text||cur.slice(idx,idx+h.before.length)!==h.before)
        stale.push({file:rel,line:h.line,column:h.column,before:h.before,reason:'stale-scan'});
      else transforms.push(h);
    }
    if(transforms.length)files.push({file:rel,transforms});
  }
  return {entity:classified.entity,mode:'dry-run',
    replacement_count:files.reduce((n,f)=>n+f.transforms.length,0),
    file_count:files.length,stale_count:stale.length,stale,files};
}

function applyPlan(plan,repoRoot){
  if(plan.stale_count)throw Error(`PDD_MEMBER_APPLY_STALE_SCAN: ${plan.stale_count}`);
  let changed=0,replacements=0;
  for(const fp of plan.files){
    const abs=path.resolve(repoRoot,fp.file),orig=fs.readFileSync(abs,'utf8'),
      nl=orig.includes('\r\n')?'\r\n':'\n',lines=orig.split(/\r?\n/);
    const byLine=new Map();
    for(const t of fp.transforms){if(!byLine.has(t.line))byLine.set(t.line,[]);byLine.get(t.line).push(t);}
    for(const [lineNo,ts] of byLine){
      let line=lines[lineNo-1];
      // Right-to-left keeps earlier recorded columns stable.
      for(const t of [...ts].sort((a,b)=>b.column-a.column)){
        const i=t.column-1;
        if(line.slice(i,i+t.before.length)!==t.before)
          throw Error(`PDD_MEMBER_APPLY_COLUMN_MISMATCH: ${fp.file}:${lineNo}:${t.column}`);
        line=line.slice(0,i)+t.after+line.slice(i+t.before.length);
        replacements++;
      }
      lines[lineNo-1]=line;
    }
    const updated=lines.join(nl);
    if(updated!==orig){fs.writeFileSync(abs,updated,'utf8');changed++;}
  }
  return {changed_files:changed,replacements};
}

function printPlan(p){
 console.log(`entity=${p.entity} files=${p.file_count} replacements=${p.replacement_count} stale=${p.stale_count}`);
 for(const f of p.files){console.log(`\n${f.file}`);for(const t of f.transforms)console.log(`  L${t.line}:C${t.column} ${t.before} -> ${t.after} [${t.reason}]`);}
 if(p.stale.length){console.log('\nSTALE / NOT APPLIED');for(const s of p.stale)console.log(`  ${s.file}:${s.line||''}:${s.column||''} ${s.reason}`);}
}
function main(){
 const args=process.argv.slice(2),input=args.find(a=>!a.startsWith('--')),apply=args.includes('--apply');
 if(!input)throw Error('Usage: node tools/apply-member-migration-references.cjs <classified.json> [--apply]');
 const root=path.resolve(__dirname,'..'),p=buildPlan(JSON.parse(fs.readFileSync(path.resolve(input),'utf8')),root);printPlan(p);
 if(!apply){console.log('\nDRY-RUN ONLY: no repository files were changed.');if(p.stale_count)process.exitCode=2;return;}
 const r=applyPlan(p,root);console.log(`\nAPPLIED changed_files=${r.changed_files} replacements=${r.replacements}`);
}
if(require.main===module)main();
module.exports={buildPlan,applyPlan};
