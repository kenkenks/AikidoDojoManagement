import { readFileSync, writeFileSync } from 'node:fs';
import { parsePortableDefinition, transformPortableDefinition } from './portable-data-definition-core.mjs';

function upperFirst(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function buildPortableDataDefinition({
  schemaPath,
  definitionOutputPath,
  gasCreateOutputPath,
  schemaLabel,
  builderLabel = 'tools/build-portable-data-definition.mjs',
  exportName,
  gasName
}) {
  const definition = parsePortableDefinition(readFileSync(schemaPath, 'utf8'));
  const transformed = transformPortableDefinition(definition);
  const entityName = upperFirst(gasName || definition.entity);
  const definitionExportName = exportName || `${definition.entity}Definition`;
  const sourceLabel = schemaLabel || schemaPath;

  const output = `'use strict';\n// Generated from ${sourceLabel} by ${builderLabel}. Do not edit.\nconst ${definitionExportName} = ${JSON.stringify(transformed, null, 2)};\nmodule.exports = { ${definitionExportName} };\n`;
  writeFileSync(definitionOutputPath, output, 'utf8');

  const gasSource = transformed.sources.gas;
  const gasHeaders = definition.fields.map(({name}) => gasSource.fields[name]);
  const describeName = `dojoPddDescribe${entityName}Gas_`;
  const ensureName = `dojoPddEnsure${entityName}Gas_`;
  const gasCreateOutput = `'use strict';
// Generated from ${sourceLabel} by ${builderLabel}. Do not edit.
function ${describeName}() {
  return { sheet: ${JSON.stringify(gasSource.sheet)}, requiredHeaders: ${JSON.stringify(gasHeaders)} };
}
function ${ensureName}(spreadsheet) {
  var ss = spreadsheet || SpreadsheetApp.getActiveSpreadsheet();
  var description = ${describeName}();
  var sheetName = description.sheet;
  var expectedHeaders = description.requiredHeaders;
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
    return { created: true, sheet: sheetName, headers: expectedHeaders.slice() };
  }
  var lastColumn = sheet.getLastColumn();
  if (!lastColumn) throw new Error('PDD_STRUCTURE_MISMATCH: ' + sheetName + ' has no headers');
  var actualHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(value) { return String(value).trim(); });
  var missingHeaders = expectedHeaders.filter(function(expected) { return actualHeaders.indexOf(expected) < 0; });
  if (missingHeaders.length) {
    throw new Error('PDD_STRUCTURE_MISMATCH: ' + sheetName + ' required [' + expectedHeaders.join(',') + '] actual [' + actualHeaders.join(',') + '] missing [' + missingHeaders.join(',') + ']');
  }
  return { created: false, sheet: sheetName, headers: expectedHeaders.slice() };
}
`;
  writeFileSync(gasCreateOutputPath, gasCreateOutput, 'utf8');
  return { definition, transformed, definitionExportName, describeName, ensureName };
}
