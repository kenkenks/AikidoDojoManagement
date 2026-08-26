// ========================================
// 21_QrGeneratorOptions.js
// QR Generator master options
// ========================================
//
// TYPE: SERVICE
// AREA: QR
// TAG: QR
// TAG: TEACHER
// TAG: MEMBER
//
// RESPONSIBILITY
// 先生用QR生成画面へ、発行対象となる有効マスタ一覧と
// 会員区分ごとの料金プラン選択ルールを返す。
// QR生成・帳票表示そのものはブラウザ側の責務とする。

function qrGenerator_getOptions(ctx) {
  ctx = ensureSheetContext(ctx || createSheetContext());

  const members = getMembers(ctx)
    .filter(isActiveMasterRow_)
    .map(function(row) {
      return {
        member_id: normalizeId_(row["member_id"]),
        member_name: String(row["氏名"] || "").trim(),
        member_type: String(row["区分"] || "").trim()
      };
    })
    .filter(function(row) { return !!row.member_id; })
    .sort(function(a, b) {
      return (a.member_name || a.member_id).localeCompare(b.member_name || b.member_id, "ja");
    });

  const plans = getFees(ctx)
    .filter(isActiveMasterRow_)
    .map(function(row) {
      return {
        plan_id: normalizeId_(row["plan_id"]),
        plan_name: String(row["表示名"] || row["plan_id"] || "").trim(),
        fee_type: String(row["会費タイプ"] || "").trim(),
        unit_price: Number(row["回数単価"] || 0),
        cap_amount: Number(row["上限金額"] || 0)
      };
    })
    .filter(function(row) { return !!row.plan_id; });

  assertSheetRowHeaders_(
    ctx,
    "03_料金プラン選択ルール",
    ["member_type", "selectable_plan_id"]
  );

  const planSelectionRules = getPlanSelectionRules(ctx)
    .map(function(row) {
      return {
        member_type: String(row["member_type"] || "").trim(),
        selectable_plan_id: normalizeId_(row["selectable_plan_id"])
      };
    })
    .filter(function(row) {
      return !!row.member_type && !!row.selectable_plan_id;
    });

  const locations = getLocations(ctx)
    .filter(isActiveMasterRow_)
    .map(function(row) {
      return {
        location_id: normalizeId_(row["location_id"]),
        location_name: String(row["表示名"] || row["道場名"] || row["location_id"] || "").trim()
      };
    })
    .filter(function(row) { return !!row.location_id; })
    .sort(function(a, b) { return a.location_name.localeCompare(b.location_name, "ja"); });

  const memberNameMap = {};
  members.forEach(function(row) {
    memberNameMap[row.member_id] = row.member_name;
  });

  const teachers = getTeachers(ctx)
    .filter(isActiveMasterRow_)
    .map(function(row) {
      const teacherId = normalizeId_(row["teacher_id"]);
      const memberId = normalizeId_(row["member_id"]);
      return {
        teacher_id: teacherId,
        teacher_name: String(
          row["表示名"] ||
          row["氏名"] ||
          memberNameMap[memberId] ||
          teacherId
        ).trim(),
        member_id: memberId,
        role_name: String(row["役職"] || row["組織役割"] || "").trim()
      };
    })
    .filter(function(row) { return !!row.teacher_id; })
    .sort(function(a, b) { return a.teacher_name.localeCompare(b.teacher_name, "ja"); });

  return {
    ok: true,
    members: members,
    plans: plans,
    monthly_plans: plans.filter(function(row) { return row.fee_type === "月会費"; }),
    onetime_plans: plans.filter(function(row) { return row.fee_type === "回数料金"; }),
    plan_selection_rules: planSelectionRules,
    locations: locations,
    teachers: teachers
  };
}
