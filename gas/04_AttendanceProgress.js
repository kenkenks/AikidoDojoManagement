// ========================================
// 04_AttendanceProgress.js
// 級段位・審査進捗
// ========================================
//
// 01_会員マスタを正本とし、出席ログから現在の審査対象稽古日数を集計する。
// 審査基準は道場運用の確認前なので固定値を持たず、会員マスタの
// 「審査可能稽古数」を使用する。

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
  const member = getMembers(ctx).find(function(row) {
    return normalizeId_(row["member_id"]) === normalizedMemberId && isActiveMasterRow_(row);
  });

  if (!member) {
    return { ok: false, message: "有効な会員が見つかりません。" };
  }

  const rank = String(member["現在級段位"] || "").trim();
  const carriedCount = attendanceProgress_toNonNegativeNumber_(member["繰越稽古数"]);
  const requiredCount = attendanceProgress_toNonNegativeNumber_(member["審査可能稽古数"]);
  const startDate = attendanceProgress_normalizeOptionalDate_(member["級段位起算日"], ctx);
  const attendanceDates = attendanceProgress_collectAttendanceDates_(normalizedMemberId, startDate, ctx);
  const recordedCount = attendanceDates.length;
  const trainingCount = carriedCount + recordedCount;
  const remainingCount = requiredCount > 0 ? Math.max(requiredCount - trainingCount, 0) : null;

  return {
    ok: true,
    member_id: normalizedMemberId,
    member_name: String(member["氏名"] || ""),
    current_rank: rank,
    rank_source: String(member["級段位登録元"] || ""),
    rank_updated_at: member["級段位更新日時"] || "",
    rank_start_date: startDate,
    carried_training_count: carriedCount,
    recorded_training_count: recordedCount,
    training_count: trainingCount,
    required_training_count: requiredCount,
    remaining_training_count: remainingCount,
    examination_ready: requiredCount > 0 && remainingCount === 0,
    recent_attendance_dates: attendanceDates.slice(-5).reverse()
  };
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

function attendanceProgress_collectAttendanceDates_(memberId, startDate, ctx) {
  const uniqueDates = {};
  getAttendances(ctx).forEach(function(row) {
    if (!isActiveMasterRow_(row)) return;
    if (normalizeId_(row["member_id"]) !== memberId) return;

    const dateText = formatAttendanceDate_(row["稽古日"], ctx);
    if (!dateText || (startDate && dateText < startDate)) return;
    uniqueDates[dateText] = true;
  });
  return Object.keys(uniqueDates).sort();
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
