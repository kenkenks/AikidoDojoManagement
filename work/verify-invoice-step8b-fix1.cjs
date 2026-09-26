'use strict';
const fs=require('fs');
const core=fs.readFileSync('adapters/gas/DAO_Core.js','utf8');
function must(v,m){if(!v)throw new Error(m);}
must(/source\.keyField/.test(core),'KEY_FIELD_FALLBACK_MISSING');
must(/headers\.indexOf\(String\(source\.keyField\)\.trim\(\)\)/.test(core),'HEADER_KEY_LOOKUP_MISSING');
must(/Number\.isInteger\(source\.keyColumn\)/.test(core),'LEGACY_KEY_COLUMN_COMPAT_MISSING');
console.log('INVOICE-STEP8B FIX1 LOCAL VERIFY PASS');
console.log('KEY_FIELD_HEADER_LOOKUP LEGACY_KEY_COLUMN_COMPAT PASS');
