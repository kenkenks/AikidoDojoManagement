function scalar(text) {
  const value = text.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  return value;
}

export function parseViewDefinition(source) {
  const result = { key: [], sources: {} };
  let section = '';
  let currentSource = null;
  let sourceSection = '';

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '');
    if (!line.trim()) continue;
    const indent = line.length - line.trimStart().length;
    const text = line.trim();

    if (indent === 0) {
      const [name, ...rest] = text.split(':');
      const value = rest.join(':').trim();
      if (value) result[name] = scalar(value);
      else section = name;
      currentSource = null;
      sourceSection = '';
      continue;
    }

    if (section === 'key' && indent === 2 && text.startsWith('- ')) {
      result.key.push(scalar(text.slice(2)));
      continue;
    }

    if (section === 'sources') {
      if (indent === 2 && text.endsWith(':')) {
        currentSource = text.slice(0, -1);
        result.sources[currentSource] = { fields: [] };
        sourceSection = '';
        continue;
      }
      if (indent === 4 && currentSource) {
        const [name, ...rest] = text.split(':');
        const value = rest.join(':').trim();
        if (value) result.sources[currentSource][name] = scalar(value);
        else sourceSection = name;
        continue;
      }
      if (indent === 6 && currentSource && sourceSection === 'fields' && text.startsWith('- ')) {
        result.sources[currentSource].fields.push(scalar(text.slice(2)));
        continue;
      }
    }

    throw new Error(`Unsupported View YAML: ${raw}`);
  }
  return result;
}

export function requiredViewFields(viewDefinition, sourceName) {
  const source = viewDefinition?.sources?.[sourceName];
  if (!source) throw new Error(`View source is not defined: ${sourceName}`);
  return [...new Set([...(viewDefinition.key || []), source.identity, ...(source.fields || [])].filter(Boolean))];
}

export function checkDtoAgainstView(viewDefinition, sourceName, dto) {
  if (!dto || typeof dto !== 'object' || Array.isArray(dto)) throw new Error('DTO object is required');
  const required = requiredViewFields(viewDefinition, sourceName);
  const missing = required.filter(name => !Object.prototype.hasOwnProperty.call(dto, name));
  return { ok: missing.length === 0, required, missing };
}

export function assertDtoAgainstView(viewDefinition, sourceName, dto) {
  const result = checkDtoAgainstView(viewDefinition, sourceName, dto);
  if (result.ok) return result;
  throw new Error(`DTO/View整合エラー [${viewDefinition.view || 'unknown'}:${sourceName}] DTOにないView項目: ${result.missing.join(', ')}`);
}
