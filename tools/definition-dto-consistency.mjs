export function checkDtoAgainstDefinition(definition, dto, options = {}) {
  if (!definition || !Array.isArray(definition.fields)) throw new Error('Definition fields are required');
  if (!dto || typeof dto !== 'object' || Array.isArray(dto)) throw new Error('DTO object is required');

  const defined = new Set(definition.fields.map(field => field.name));
  const actual = Object.keys(dto);
  const unknown = actual.filter(name => !defined.has(name));
  const required = options.requiredFields || [];
  const missing = required.filter(name => !Object.prototype.hasOwnProperty.call(dto, name));

  return { ok: unknown.length === 0 && missing.length === 0, unknown, missing };
}

export function assertDtoAgainstDefinition(definition, dto, options = {}) {
  const result = checkDtoAgainstDefinition(definition, dto, options);
  if (result.ok) return result;

  const entity = definition.entity || 'unknown';
  const details = [];
  if (result.unknown.length) details.push(`YAMLにない項目: ${result.unknown.join(', ')}`);
  if (result.missing.length) details.push(`DTOにない必須項目: ${result.missing.join(', ')}`);
  throw new Error(`DTO/Definition整合エラー [${entity}] ${details.join(' / ')}`);
}
