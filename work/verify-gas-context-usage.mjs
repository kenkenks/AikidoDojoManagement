import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const gasDirectory = path.join(root, "gas");
const files = fs.readdirSync(gasDirectory)
  .filter((name) => name.endsWith(".js"))
  .sort();

const requiredContextCalls = [
  { name: "formatAttendanceDate_", minimumArguments: 2 },
  { name: "parseAttendanceDate_", minimumArguments: 2 },
  { name: "paymentStatusView_update", minimumArguments: 4 },
];

const violations = [];

for (const file of files) {
  const source = fs.readFileSync(path.join(gasDirectory, file), "utf8");

  for (const guardedCall of requiredContextCalls) {
    for (const call of findCalls(source, guardedCall.name)) {
      if (call.isDefinition) continue;
      if (call.argumentCount < guardedCall.minimumArguments) {
        violations.push(
          `${file}:${call.line} ${guardedCall.name}() にctxが渡されていません。`,
        );
      }
    }
  }

  for (const call of findCalls(source, "ensureSheetContext")) {
    if (!call.isDefinition && call.argumentCount === 0) {
      violations.push(
        `${file}:${call.line} ensureSheetContext() が引数なしで呼ばれています。`,
      );
    }
  }
}

if (violations.length > 0) {
  console.error("GAS Context usage: NG");
  violations.forEach((violation) => console.error(`- ${violation}`));
  process.exit(1);
}

console.log(
  `GAS Context usage: OK (${files.length} files, ${requiredContextCalls.length} guarded calls)`,
);

function findCalls(source, functionName) {
  const calls = [];
  const matcher = new RegExp(`\\b${escapeRegex(functionName)}\\s*\\(`, "g");
  let match;

  while ((match = matcher.exec(source)) !== null) {
    const openParen = source.indexOf("(", match.index);
    const closeParen = findClosingParen(source, openParen);
    if (closeParen < 0) continue;

    const prefix = source.slice(Math.max(0, match.index - 20), match.index);
    const argumentsText = source.slice(openParen + 1, closeParen);
    calls.push({
      line: source.slice(0, match.index).split("\n").length,
      argumentCount: countTopLevelArguments(argumentsText),
      isDefinition: /\bfunction\s*$/.test(prefix),
    });
    matcher.lastIndex = closeParen + 1;
  }

  return calls;
}

function findClosingParen(source, openParen) {
  let depth = 0;
  let quote = "";
  let escaped = false;

  for (let index = openParen; index < source.length; index++) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "(") depth++;
    if (character === ")" && --depth === 0) return index;
  }
  return -1;
}

function countTopLevelArguments(text) {
  if (!text.trim()) return 0;
  let count = 1;
  let depth = 0;
  let quote = "";
  let escaped = false;

  for (const character of text) {
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if ("([{".includes(character)) depth++;
    else if (")]}".includes(character)) depth--;
    else if (character === "," && depth === 0) count++;
  }
  return count;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
