import fs from "node:fs";
import vm from "node:vm";

const code = fs.readFileSync(new URL("../gas/04_ExaminationStandard.js", import.meta.url), "utf8") +
  "\n;globalThis.__rankRows = RANK_MASTER_INITIAL_ROWS; globalThis.__standardRows = EXAMINATION_STANDARD_INITIAL_ROWS;";
vm.runInThisContext(code);

const rankRows = globalThis.__rankRows;
const standardRows = globalThis.__standardRows;
const juniorNames = rankRows.filter(row => row[3] === "少年").map(row => row[1]);
const expectedJuniorNames = [
  "少年無級", "少年準十級", "少年十級", "少年準九級", "少年九級",
  "少年準八級", "少年八級", "少年準七級", "少年七級", "少年準六級", "少年六級",
  "少年準五級", "少年五級", "少年準四級", "少年四級", "少年準三級", "少年三級",
  "少年準二級", "少年二級", "少年準一級", "少年一級", "少年初段", "少年二段"
];
if (JSON.stringify(juniorNames) !== JSON.stringify(expectedJuniorNames)) {
  throw new Error("少年部の級段位構成または順序が一致しません");
}

const crossSystemTransition = standardRows.find(row => {
  const current = String(row[0]);
  const next = String(row[1]);
  return (current.startsWith("少年") && next.startsWith("成人")) ||
    (current.startsWith("成人") && next.startsWith("少年"));
});
if (crossSystemTransition) throw new Error("成人・少年を横断する審査遷移があります");

console.log("Junior rank structure and order: OK");
console.log("Adult/junior qualification separation: OK");
