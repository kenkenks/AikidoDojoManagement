import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const sheetAccess = fs.readFileSync(
  path.join(root, "gas", "02_SheetAccess.js"),
  "utf8",
);
const systemConfig = fs.readFileSync(
  path.join(root, "gas", "sup_config.js"),
  "utf8",
);
const examinationStandard = fs.readFileSync(
  path.join(root, "gas", "04_ExaminationStandard.js"),
  "utf8",
);
const sheetContext = fs.readFileSync(
  path.join(root, "gas", "sheetContext.js"),
  "utf8",
);
const attendancePages = [
  "attendance.html",
  "attendanceCheck.html",
].map((name) => ({
  name,
  source: fs.readFileSync(path.join(root, "web", "qr", name), "utf8"),
}));

assert(
  /function getActiveAttendanceRowsForScope[\s\S]*?const rows = getAttendances\(ctx\)[\s\S]*?return rows\.filter/.test(
    sheetAccess,
  ),
  "出席状態取得がSheetContext経由で07_出席ログを読み込む",
);
assert(
  !/function getActiveAttendanceRowsForScope[\s\S]*?getDataRange\(\)\.getValues\(\)[\s\S]*?^}/m.test(
    sheetAccess,
  ),
  "出席状態取得に07_出席ログの直接読込みが残っていない",
);
assert(
  !/formatAttendanceDate_\([^,\n)]+\)/.test(sheetAccess),
  "出席ログの日付処理が既存SheetContextを必ず再利用する",
);
assert(
  /const SUP_LOG\s*=\s*\{[\s\S]*?SHEET:\s*false/.test(systemConfig),
  "Web応答を遅延させるDebugLogシート同期書込みが無効である",
);
assert(
  examinationStandard.includes("getRankMasterRows(ctx)") &&
    examinationStandard.includes("getExaminationStandardRows(ctx)") &&
    !examinationStandard.includes("rankMaster_rowsToObjects_"),
  "級段位・審査基準マスタがSheetContext経由で計測・キャッシュされる",
);
assert(
  sheetContext.includes("headerCache") &&
    sheetContext.includes("assertSheetRowHeaders_"),
  "ヘッダーとデータを一度に読み、同じSheetContextで検証する",
);
assert(
  sheetContext.includes("createSheetObjectMap_") &&
    sheetContext.includes("ss.getSheets()") &&
    sheetContext.includes("getContextSheet_(ctx, sheetName)"),
  "シートオブジェクトを一括取得し、名前検索の反復通信を避ける",
);

for (const page of attendancePages) {
  assert(
    page.source.includes('retry.textContent = "再取得"'),
    `${page.name}: 読込失敗後の再取得ボタンがある`,
  );
  assert(
    page.source.includes("if (!existing.loaded && existing.load_error)"),
    `${page.name}: 失敗後の会員QR再読取で再取得する`,
  );
  assert(
    page.source.includes('member_attendance_state: "会員状態"'),
    `${page.name}: 会員状態取得のエラー名が正しい`,
  );
  assert(
    page.source.includes("}, 30000);"),
    `${page.name}: JSONPの待機時間が30秒である`,
  );

  for (const script of inlineScripts(page.source)) {
    new Function(script);
  }
  console.log(`${page.name}: inline JavaScript syntax OK`);
}

function inlineScripts(html) {
  return [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .filter((script) => script.trim());
}

function assert(condition, message) {
  if (!condition) {
    console.error(`NG: ${message}`);
    process.exit(1);
  }
  console.log(`OK: ${message}`);
}
