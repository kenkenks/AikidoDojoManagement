'use strict';

const fs = require('node:fs');
const path = require('node:path');

function classifyHit(before, hit, file) {
  const text = String(hit.text || '');
  const ext = path.extname(file).toLowerCase();

  if (file.startsWith('schema/migration/Member/') ||
      file === 'tools/classify-member-migration-references.cjs' ||
      /verify-pdd-member-(before|mapping|migration|scanner|classifier)/.test(file)) {
    return { classification: 'KEEP', reason: 'migration-spec' };
  }
  if (file.startsWith('work/') && /-baseline\.txt$/.test(file)) {
    return { classification: 'KEEP', reason: 'baseline-snapshot' };
  }
  if (ext === '.md') return { classification: 'KEEP', reason: 'documentation' };

  const escaped = before.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Only an explicitly named Member object is safe enough for automatic replacement.
  const explicitMember = new RegExp(
    String.raw`\bmember\s*\[\s*["']${escaped}["']\s*\]`
  );
  if (explicitMember.test(text)) {
    // A line can contain member["氏名"] and teacher["氏名"] simultaneously.
    // Classification is occurrence-specific: only the hit whose column falls
    // inside the explicit member[...] token is REPLACE.
    const rawLine = String(hit.raw_text || hit.text || '');
    const zeroColumn = Number(hit.column || 1) - 1;
    const re = new RegExp(String.raw`\bmember\s*\[\s*["']${escaped}["']\s*\]`, 'g');
    let m;
    while ((m = re.exec(rawLine)) !== null) {
      const oldNameOffset = m[0].indexOf(before);
      const start = m.index + oldNameOffset;
      const end = start + before.length;
      if (zeroColumn >= start && zeroColumn < end) {
        return { classification: 'REPLACE', reason: 'explicit-member-field' };
      }
    }
  }

  // row[...] and header map/indexOf require table provenance, so never auto-replace.
  if (new RegExp(String.raw`\brow\s*\[\s*["']${escaped}["']\s*\]`).test(text)) {
    return { classification: 'REVIEW', reason: 'row-provenance-required' };
  }
  if (text.includes(`indexOf("${before}")`) || text.includes(`indexOf('${before}')`) ||
      text.includes(`map["${before}"]`) || text.includes(`map['${before}']`)) {
    return { classification: 'REVIEW', reason: 'header-provenance-required' };
  }

  if (file.startsWith('work/')) return { classification: 'REVIEW', reason: 'test-or-baseline' };
  return { classification: 'REVIEW', reason: 'ambiguous' };
}

function classifyReport(scan) {
  return {
    entity: scan.entity,
    read_only: true,
    results: (scan.results || []).map(result => {
      if (result.action === 'no-change') {
        return {...result, classifications:{REPLACE:0,KEEP:0,REVIEW:0}};
      }
      const files=(result.files||[]).map(entry=>({
        file:entry.file,
        hits:(entry.hits||[]).map(hit=>({
          ...hit,
          ...classifyHit(result.before,{...hit,raw_text:hit.raw_text || hit.text},entry.file)
        }))
      }));
      const counts={REPLACE:0,KEEP:0,REVIEW:0};
      for(const e of files)for(const h of e.hits)counts[h.classification]++;
      return {before:result.before,after:result.after,action:'classified',
              hit_count:result.hit_count,classifications:counts,files};
    })
  };
}

function main(){
  const input=process.argv[2], output=process.argv[3];
  if(!input)throw Error('Usage: node tools/classify-member-migration-references.cjs <scan.json> [classified.json]');
  const report=classifyReport(JSON.parse(fs.readFileSync(path.resolve(input),'utf8')));
  for(const r of report.results){
    if(r.action==='no-change') console.log(`${r.before} -> ${r.after} [no-change]`);
    else {const c=r.classifications;console.log(`${r.before} -> ${r.after}  REPLACE=${c.REPLACE} KEEP=${c.KEEP} REVIEW=${c.REVIEW}`);}
  }
  if(output){fs.writeFileSync(path.resolve(output),JSON.stringify(report,null,2)+'\n','utf8');console.log(`Wrote ${output}`);}
}
if(require.main===module)main();
module.exports={classifyHit,classifyReport};
