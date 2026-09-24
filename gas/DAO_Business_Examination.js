// 初期値・列定義は呼出元に維持し、マスタ準備の物理操作をCoreへ委譲する。
function daoExaminationEnsureMaster_(ctx, sheetName, headers, initialRows) {
  return daoCore_(ctx).ensureExaminationMaster(ctx, sheetName, headers, initialRows);
}
