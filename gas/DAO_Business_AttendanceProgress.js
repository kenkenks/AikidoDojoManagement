// 級段位の変更判定を担当する。SheetオブジェクトはCore内に保持する。
function daoAttendanceProgressUpdateRanks_(declarations, requiredHeaders, ctx) {
  const access = daoCore_(ctx).openMemberRankUpdates(requiredHeaders, ctx);
  const headerInfo = access.headerInfo;
  const values = access.values;
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

    access.writeRank(rowIndex + 1, rankColumn, sourceColumn, updatedAtColumn, declaredRank, "本人申告");
    updatedMemberIds.push(memberId);
  }

  if (updatedMemberIds.length > 0) access.invalidate();
  return { updated_count: updatedMemberIds.length, member_ids: updatedMemberIds };
}

function daoAttendanceProgressEnsureSchema_(requiredHeaders, ctx) {
  return daoCore_(ctx).ensureMemberRankSchema(requiredHeaders, ctx);
}
