'use strict';

const SYSTEM_KEYS = Object.freeze({
  attendance_id: Object.freeze({autoGenerate:true,generator:'uuid',prefix:'ATT-'}),
  created_at: Object.freeze({autoGenerate:true,generator:'now'}),
  source: Object.freeze({autoGenerate:false})
});

function reconcileSystemKeys(dto = {}, dependencies = {}) {
  const out={...dto};
  for(const [key,rule] of Object.entries(SYSTEM_KEYS)) {
    if(!rule.autoGenerate || (out[key] !== undefined && out[key] !== null && out[key] !== '')) continue;
    if(rule.generator === 'uuid') {
      if(typeof dependencies.uuid !== 'function') throw new Error('UUID_PROVIDER_REQUIRED');
      out[key]=String(rule.prefix || '') + dependencies.uuid();
      continue;
    }
    if(rule.generator === 'now') {
      if(typeof dependencies.now !== 'function') throw new Error('NOW_PROVIDER_REQUIRED');
      out[key]=dependencies.now();
      continue;
    }
    throw new Error('SYSTEM_KEY_GENERATOR_UNSUPPORTED: ' + key);
  }
  return out;
}

module.exports={SYSTEM_KEYS,reconcileSystemKeys};
