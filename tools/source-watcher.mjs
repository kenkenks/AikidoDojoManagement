function topLevelNames(source, section) {
  const names=[];
  let active=false;
  for(const raw of source.split(/\r?\n/)) {
    const text=raw.trim();
    if(!text || text.startsWith('#')) continue;
    const indent=raw.length-raw.trimStart().length;
    if(indent===0) { active=text===section+':'; continue; }
    if(!active) continue;
    if(section==='fields' && indent===2 && text.startsWith('- name:')) names.push(text.slice(7).trim());
    if(section==='system_keys' && indent===2 && text.endsWith(':')) names.push(text.slice(0,-1).trim());
  }
  return names;
}

export function watchDto(dto, {entitySource, systemKeySource} = {}) {
  const entity=new Set(topLevelNames(entitySource || '', 'fields'));
  const system=new Set(topLevelNames(systemKeySource || '', 'system_keys'));
  const errors=[];
  for(const key of Object.keys(dto || {})) {
    if(!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(key)) {
      errors.push({code:'NAMING_RULE_VIOLATION',key});
      continue;
    }
    if(system.has(key)) continue;
    if(!entity.has(key)) errors.push({code:'UNREGISTERED_KEY',key});
  }
  return {ok:errors.length===0,errors};
}

export function assertWatchedDto(dto, sources) {
  const result=watchDto(dto,sources);
  if(result.ok) return result;
  throw new Error('SOURCE_WATCHER_NG: '+result.errors.map(({code,key})=>`${code}:${key}`).join(', '));
}
