// ========================================
// 04_ExaminationStandard.js
// 級段位マスタ・審査進捗基準
// ========================================

const RANK_MASTER_SHEET_NAME = "14_級段位マスタ";
const RANK_MASTER_HEADERS = ["rank_id", "表示名", "公式帳票名", "資格体系", "表示順", "状態", "備考"];

const EXAMINATION_STANDARD_SHEET_NAME = "15_審査基準マスタ";
const EXAMINATION_STANDARD_HEADERS = [
  "現在級段位", "次回審査級段位", "必要稽古数", "必要経過年数", "進捗表示対象", "状態", "備考"
];

const RANK_MASTER_INITIAL_ROWS = [
  ["ADULT_UNRANKED", "成人無級", "無級", "成人", 1010, "有効", ""],
  ["ADULT_KYU_5", "成人五級", "5級", "成人", 1020, "有効", ""],
  ["ADULT_KYU_4", "成人四級", "4級", "成人", 1030, "有効", ""],
  ["ADULT_KYU_3", "成人三級", "3級", "成人", 1040, "有効", ""],
  ["ADULT_KYU_2", "成人二級", "2級", "成人", 1050, "有効", ""],
  ["ADULT_KYU_1", "成人一級", "1級", "成人", 1060, "有効", ""],
  ["ADULT_DAN_1", "成人初段", "初段", "成人", 1070, "有効", ""],
  ["ADULT_DAN_2", "成人二段", "二段", "成人", 1080, "有効", ""],
  ["ADULT_DAN_3", "成人三段", "三段", "成人", 1090, "有効", "個別確認"],
  ["ADULT_DAN_4", "成人四段", "四段", "成人", 1100, "有効", "個別確認"],
  ["ADULT_DAN_5", "成人五段", "五段", "成人", 1110, "有効", "個別確認"],
  ["ADULT_DAN_6", "成人六段", "六段", "成人", 1120, "有効", "個別確認"],
  ["ADULT_DAN_7", "成人七段", "七段", "成人", 1130, "有効", "個別確認"],
  ["ADULT_DAN_8", "成人八段", "八段", "成人", 1140, "有効", "個別確認"],
  ["JUNIOR_UNRANKED", "少年無級", "無級", "少年", 2010, "有効", "審査表外の初期状態"],
  ["JUNIOR_PRE_KYU_10", "少年準十級", "準10級", "少年", 2020, "有効", ""],
  ["JUNIOR_KYU_10", "少年十級", "10級", "少年", 2030, "有効", ""],
  ["JUNIOR_PRE_KYU_9", "少年準九級", "準9級", "少年", 2040, "有効", ""],
  ["JUNIOR_KYU_9", "少年九級", "9級", "少年", 2050, "有効", ""],
  ["JUNIOR_PRE_KYU_8", "少年準八級", "準8級", "少年", 2060, "有効", ""],
  ["JUNIOR_KYU_8", "少年八級", "8級", "少年", 2070, "有効", ""],
  ["JUNIOR_PRE_KYU_7", "少年準七級", "準7級", "少年", 2080, "有効", ""],
  ["JUNIOR_KYU_7", "少年七級", "7級", "少年", 2090, "有効", ""],
  ["JUNIOR_PRE_KYU_6", "少年準六級", "準6級", "少年", 2100, "有効", ""],
  ["JUNIOR_KYU_6", "少年六級", "6級", "少年", 2110, "有効", ""],
  ["JUNIOR_PRE_KYU_5", "少年準五級", "準5級", "少年", 2120, "有効", ""],
  ["JUNIOR_KYU_5", "少年五級", "5級", "少年", 2130, "有効", ""],
  ["JUNIOR_PRE_KYU_4", "少年準四級", "準4級", "少年", 2140, "有効", ""],
  ["JUNIOR_KYU_4", "少年四級", "4級", "少年", 2150, "有効", ""],
  ["JUNIOR_PRE_KYU_3", "少年準三級", "準3級", "少年", 2160, "有効", ""],
  ["JUNIOR_KYU_3", "少年三級", "3級", "少年", 2170, "有効", ""],
  ["JUNIOR_PRE_KYU_2", "少年準二級", "準2級", "少年", 2180, "有効", ""],
  ["JUNIOR_KYU_2", "少年二級", "2級", "少年", 2190, "有効", ""],
  ["JUNIOR_PRE_KYU_1", "少年準一級", "準1級", "少年", 2200, "有効", ""],
  ["JUNIOR_KYU_1", "少年一級", "1級", "少年", 2210, "有効", ""],
  ["JUNIOR_DAN_1", "少年初段", "少年部初段", "少年", 2220, "有効", "成人初段とは別資格"],
  ["JUNIOR_DAN_2", "少年二段", "少年部弐段", "少年", 2230, "有効", "成人二段とは別資格"]
];

const EXAMINATION_STANDARD_INITIAL_ROWS = [
  ["成人無級", "成人五級", 30, "", true, "有効", "先生確認前の暫定値"],
  ["成人五級", "成人四級", 40, "", true, "有効", "先生確認前の暫定値"],
  ["成人四級", "成人三級", 50, "", true, "有効", "先生確認前の暫定値"],
  ["成人三級", "成人二級", 50, "", true, "有効", "先生確認前の暫定値"],
  ["成人二級", "成人一級", 60, "", true, "有効", "先生確認前の暫定値"],
  ["成人一級", "成人初段", 70, "", true, "有効", "先生確認前の暫定値"],
  ["成人初段", "成人二段", 200, "", true, "有効", "先生確認前の暫定値"],
  ["成人二段", "成人三段", "", "", false, "有効", "経過年数を含め個別確認"],
  ["少年無級", "少年準十級", "", "", false, "有効", "必要稽古数確認待ち"],
  ["少年準十級", "少年十級", "", "", false, "有効", "必要稽古数確認待ち"],
  ["少年十級", "少年準九級", "", "", false, "有効", "必要稽古数確認待ち"],
  ["少年準九級", "少年九級", "", "", false, "有効", "必要稽古数確認待ち"],
  ["少年九級", "少年準八級", "", "", false, "有効", "必要稽古数確認待ち"],
  ["少年準八級", "少年八級", "", "", false, "有効", "必要稽古数確認待ち"],
  ["少年八級", "少年準七級", "", "", false, "有効", "必要稽古数確認待ち"],
  ["少年準七級", "少年七級", "", "", false, "有効", "必要稽古数確認待ち"],
  ["少年七級", "少年準六級", "", "", false, "有効", "必要稽古数確認待ち"],
  ["少年準六級", "少年六級", "", "", false, "有効", "必要稽古数確認待ち"],
  ["少年六級", "少年準五級", "", "", false, "有効", "必要稽古数確認待ち"],
  ["少年準五級", "少年五級", "", "", false, "有効", "必要稽古数確認待ち"],
  ["少年五級", "少年準四級", "", "", false, "有効", "必要稽古数確認待ち"],
  ["少年準四級", "少年四級", "", "", false, "有効", "必要稽古数確認待ち"],
  ["少年四級", "少年準三級", "", "", false, "有効", "必要稽古数確認待ち"],
  ["少年準三級", "少年三級", "", "", false, "有効", "必要稽古数確認待ち"],
  ["少年三級", "少年準二級", "", "", false, "有効", "必要稽古数確認待ち"],
  ["少年準二級", "少年二級", "", "", false, "有効", "必要稽古数確認待ち"],
  ["少年二級", "少年準一級", "", "", false, "有効", "必要稽古数確認待ち"],
  ["少年準一級", "少年一級", "", "", false, "有効", "必要稽古数確認待ち"],
  ["少年一級", "少年初段", "", "", false, "有効", "必要稽古数確認待ち"],
  ["少年初段", "少年二段", "", "", false, "有効", "必要稽古数確認待ち"]
];

function rankMaster_getOptions(ctx) {
  ctx = ensureSheetContext(ctx);
  const sheet = ctx.ss.getSheetByName(RANK_MASTER_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return [];
  assertHeaders_(sheet, RANK_MASTER_HEADERS);
  return rankMaster_rowsToObjects_(sheet).filter(isActiveMasterRow_).map(function(row) {
    return {
      rank_id: normalizeId_(row["rank_id"]),
      display_name: String(row["表示名"] || "").trim(),
      official_name: String(row["公式帳票名"] || "").trim(),
      qualification_system: String(row["資格体系"] || "").trim(),
      sort_order: Number(row["表示順"] || 999999)
    };
  }).filter(function(row) { return row.rank_id && row.display_name; })
    .sort(function(a, b) { return a.sort_order - b.sort_order; });
}

function rankMaster_getOptionMap(ctx) {
  const result = {};
  rankMaster_getOptions(ctx).forEach(function(option) { result[option.display_name] = option; });
  return result;
}

function rankMaster_rowsToObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  return values.map(function(valuesRow) {
    const row = {};
    headers.forEach(function(header, index) { row[String(header).trim()] = valuesRow[index]; });
    return row;
  });
}

function examinationStandard_getMap(ctx) {
  ctx = ensureSheetContext(ctx);
  const sheet = ctx.ss.getSheetByName(EXAMINATION_STANDARD_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return {};
  assertHeaders_(sheet, EXAMINATION_STANDARD_HEADERS);
  const standards = {};
  rankMaster_rowsToObjects_(sheet).forEach(function(row) {
    const currentRank = String(row["現在級段位"] || "").trim();
    if (!currentRank || !isActiveMasterRow_(row)) return;
    standards[currentRank] = {
      current_rank: currentRank,
      next_rank: String(row["次回審査級段位"] || "").trim(),
      required_training_count: examinationStandard_toNonNegativeNumber_(row["必要稽古数"]),
      required_elapsed_years: examinationStandard_toNonNegativeNumber_(row["必要経過年数"]),
      progress_display_enabled: examinationStandard_toBoolean_(row["進捗表示対象"]),
      note: String(row["備考"] || "").trim()
    };
  });
  return standards;
}

function examinationStandard_toBoolean_(value) {
  if (value === true) return true;
  return ["true", "1", "yes", "有効", "対象", "○"].indexOf(String(value || "").trim().toLowerCase()) >= 0;
}

function examinationStandard_toNonNegativeNumber_(value) {
  const number = Number(value || 0);
  return isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function setupRankAndExaminationMasters() {
  const ctx = createSheetContext();
  const rankResult = examinationStandard_ensureSheet_(ctx, RANK_MASTER_SHEET_NAME, RANK_MASTER_HEADERS, RANK_MASTER_INITIAL_ROWS);
  const standardResult = examinationStandard_ensureSheet_(ctx, EXAMINATION_STANDARD_SHEET_NAME, EXAMINATION_STANDARD_HEADERS, EXAMINATION_STANDARD_INITIAL_ROWS);
  Browser.msgBox(
    "級段位・審査基準マスタを確認しました。\n" +
    "級段位マスタ: " + rankResult + "\n審査基準マスタ: " + standardResult +
    "\n※到達表示のみで、級段位は自動更新しません。"
  );
}

// 旧案内名との互換入口。実体は級段位マスタと審査基準マスタを同時に準備する。
function setupExaminationStandardMaster() {
  setupRankAndExaminationMasters();
}

function examinationStandard_ensureSheet_(ctx, sheetName, headers, initialRows) {
  let sheet = ctx.ss.getSheetByName(sheetName);
  let created = false;
  if (!sheet) {
    sheet = ctx.ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    created = true;
  }
  assertHeaders_(sheet, headers);
  let seeded = false;
  if (sheet.getLastRow() === 1) {
    sheet.getRange(2, 1, initialRows.length, headers.length).setValues(initialRows);
    seeded = true;
  }
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
  return "作成=" + created + " / 初期行追加=" + seeded;
}
