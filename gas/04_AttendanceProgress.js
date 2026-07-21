// ========================================
// 04_AttendanceProgress.js
// 級段位・審査進捗
// ========================================
//
// 01_会員マスタを正本とし、出席ログから現在の審査対象稽古日数を集計する。
// 級段位の名称・順序は14_級段位マスタ、必要稽古数は15_審査基準マスタを正本とする。
// 会員マスタの「審査可能稽古数」は個別上書き値として優先する。

const ATTENDANCE_PROGRESS_MEMBER_HEADERS = [
  "現在級段位",
  "級段位登録元",
  "級段位更新日時",
  "級段位起算日",
  "繰越稽古数",
  "審査可能稽古数"
];

function attendanceProgress_getMemberSummary(memberId, ctx) {
  ctx = ensureSheetContext(ctx);

  const normalizedMemberId = normalizeId_(memberId);
  const summaries = attendanceProgress_getMemberSummaries([normalizedMemberId], ctx);
  return summaries[normalizedMemberId] || { ok: false, message: "有効な会員が見つかりません。" };
}

function attendanceProgress_getMemberSummaries(memberIds, ctx) {
  ctx = ensureSheetContext(ctx);

  const targetIds = {};
  (memberIds || []).map(normalizeId_).filter(Boolean).forEach(function(memberId) {
    targetIds[memberId] = true;
  });

  const states = {};
  const standardMap = examinationStandard_getMap(ctx);
  const rankOptionMap = rankMaster_getOptionMap(ctx);
  getMembers(ctx).forEach(function(member) {
    const memberId = normalizeId_(member["member_id"]);
    if (!targetIds[memberId] || !isActiveMasterRow_(member)) return;

    const currentRank = String(member["現在級段位"] || "").trim();
    const standard = standardMap[currentRank] || {};
    const rankOption = rankOptionMap[currentRank] || {};
    const overrideCount = attendanceProgress_toNonNegativeNumber_(member["審査可能稽古数"]);
    const standardCount = standard.progress_display_enabled
      ? attendanceProgress_toNonNegativeNumber_(standard.required_training_count)
      : 0;
    const requiredCount = overrideCount || standardCount;
    states[memberId] = {
      member: member,
      standard: standard,
      rank_option: rankOption,
      start_date: attendanceProgress_normalizeOptionalDate_(member["級段位起算日"], ctx),
      carried_count: attendanceProgress_toNonNegativeNumber_(member["繰越稽古数"]),
      required_count: requiredCount,
      required_count_source: overrideCount > 0 ? "会員個別" : (standardCount > 0 ? "審査基準マスタ" : "未設定"),
      attendance_dates: {}
    };
  });

  getAttendances(ctx).forEach(function(row) {
    if (!isActiveMasterRow_(row)) return;
    const memberId = normalizeId_(row["member_id"]);
    const state = states[memberId];
    if (!state) return;
    const dateText = formatAttendanceDate_(row["稽古日"], ctx);
    if (!dateText || (state.start_date && dateText < state.start_date)) return;
    state.attendance_dates[dateText] = true;
  });

  const summaries = {};
  Object.keys(states).forEach(function(memberId) {
    const state = states[memberId];
    const member = state.member;
    const attendanceDates = Object.keys(state.attendance_dates).sort();
    const recordedCount = attendanceDates.length;
    const trainingCount = state.carried_count + recordedCount;
    const remainingCount = state.required_count > 0
      ? Math.max(state.required_count - trainingCount, 0)
      : null;

    summaries[memberId] = {
      ok: true,
      member_id: memberId,
      member_name: String(member["氏名"] || ""),
      current_rank: String(member["現在級段位"] || "").trim(),
      current_rank_id: String(state.rank_option.rank_id || ""),
      rank_sort_order: Number(state.rank_option.sort_order || 999999),
      next_rank: String(state.standard.next_rank || ""),
      examination_note: String(state.standard.note || ""),
      rank_source: String(member["級段位登録元"] || ""),
      rank_updated_at: member["級段位更新日時"] || "",
      rank_start_date: state.start_date,
      carried_training_count: state.carried_count,
      recorded_training_count: recordedCount,
      training_count: trainingCount,
      required_training_count: state.required_count,
      required_training_count_source: state.required_count_source,
      remaining_training_count: remainingCount,
      examination_ready: state.required_count > 0 && remainingCount === 0,
      recent_attendance_dates: attendanceDates.slice(-5).reverse()
    };
  });
  return summaries;
}

function attendanceProgress_updateSelfDeclaredRanks(items, ctx) {
  ctx = ensureSheetContext(ctx);

  const declarations = (Array.isArray(items) ? items : []).map(function(item) {
    return {
      member_id: normalizeId_(item.member_id),
      current_rank: String(item.current_rank || "").trim()
    };
  }).filter(function(item) {
    return !!item.member_id && !!item.current_rank;
  });

  if (declarations.length === 0) return { updated_count: 0, member_ids: [] };

  const sheet = getRequiredSheet_("01_会員マスタ", ctx);
  const headerInfo = attendanceProgress_ensureMemberHeaders_(sheet);
  const values = sheet.getDataRange().getValues();
  const memberIdColumn = headerInfo.map["member_id"];
  const rankColumn = headerInfo.map["現在級段位"];
  const sourceColumn = headerInfo.map["級段位登録元"];
  const updatedAtColumn = headerInfo.map["級段位更新日時"];
  const declarationMap = {};
  declarations.forEach(function(item) { declarationMap[item.member_id] = item.current_rank; });

  const updatedMemberIds = [];
  for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
    const memberId = normalizeId_(values[rowIndex][memberIdColumn]);
    const declaredRank = declarationMap[memberId];
    if (!declaredRank) continue;

    const currentRank = String(values[rowIndex][rankColumn] || "").trim();
    if (currentRank === declaredRank) continue;

    sheet.getRange(rowIndex + 1, rankColumn + 1).setValue(declaredRank);
    sheet.getRange(rowIndex + 1, sourceColumn + 1).setValue("本人申告");
    sheet.getRange(rowIndex + 1, updatedAtColumn + 1).setValue(sup_now(ctx));
    updatedMemberIds.push(memberId);
  }

  if (updatedMemberIds.length > 0) invalidateSheetRows(ctx, "01_会員マスタ");
  return { updated_count: updatedMemberIds.length, member_ids: updatedMemberIds };
}

function attendanceProgress_ensureMemberHeaders_(sheet) {
  const headerInfo = getHeaderMap_(sheet);
  const missing = ATTENDANCE_PROGRESS_MEMBER_HEADERS.filter(function(header) {
    return headerInfo.map[header] === undefined;
  });

  if (missing.length > 0) {
    sheet.getRange(1, headerInfo.headers.length + 1, 1, missing.length).setValues([missing]);
  }
  return getHeaderMap_(sheet);
}

function attendanceProgress_normalizeOptionalDate_(value, ctx) {
  if (value === "" || value === null || value === undefined) return "";
  try {
    return formatAttendanceDate_(parseAttendanceDate_(value, ctx), ctx);
  } catch (e) {
    return "";
  }
}

function attendanceProgress_toNonNegativeNumber_(value) {
  const number = Number(value || 0);
  return isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

// 初回導入時に管理者が一度実行する。既存列は変更せず、不足列だけを末尾へ追加する。
function setupAttendanceProgressSchema() {
  const ctx = createSheetContext();
  const sheet = getRequiredSheet_("01_会員マスタ", ctx);
  const before = getHeaderMap_(sheet).headers.length;
  const headerInfo = attendanceProgress_ensureMemberHeaders_(sheet);
  Browser.msgBox("級段位・審査進捗列を確認しました。追加列数: " + (headerInfo.headers.length - before));
}
