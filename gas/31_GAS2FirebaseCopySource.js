// Read-only source for GAS2FirebaseCopy. Keep the existing Member diagnostic intact.
function runner_gas2firebase_copy_member_source() {
  const records = daoMemberGetAll_(createSheetContext());
  if (!Array.isArray(records)) {
    return { ok: false, error: 'MEMBER_SOURCE_INVALID' };
  }
  return { ok: true, records: records };
}

// Setting contains operational configuration. Export only explicitly requested keys.
// Never dump the entire settings sheet into a copy job.
function runner_gas2firebase_copy_setting_source(request) {
  const keys = request && request.keys;
  if (!Array.isArray(keys) || !keys.length || keys.some(function(key) { return typeof key !== 'string' || !key.trim(); })) {
    return { ok: false, error: 'SETTING_EXPLICIT_KEYS_REQUIRED' };
  }
  const ctx = createSheetContext();
  const settings = sup_loadSettings(ctx);
  const records = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (!Object.prototype.hasOwnProperty.call(settings, key)) return { ok: false, error: 'SETTING_KEY_NOT_FOUND: ' + key };
    const value = settings[key];
    if (value === null || value === undefined) return { ok: false, error: 'SETTING_VALUE_EMPTY: ' + key };
    records.push({ key: key, value: String(value) });
  }
  return { ok: true, records: records };
}

// Master sources: return raw sheet rows; mapping is validated on the Node side.
function runner_gas2firebase_copy_dojo_source() {
  const records = getLocations(createSheetContext());
  return Array.isArray(records) ? { ok: true, records: records } : { ok: false, error: 'DOJO_SOURCE_INVALID' };
}
function runner_gas2firebase_copy_teacher_source() {
  const records = getTeachers(createSheetContext());
  return Array.isArray(records) ? { ok: true, records: records } : { ok: false, error: 'TEACHER_SOURCE_INVALID' };
}

// Additional master sources; composite IDs use reversible URI-component encoding.
function runner_gas2firebase_copy_fee_source() {
  const rows = getFees(createSheetContext());
  if (!Array.isArray(rows)) return { ok: false, error: "COPY_SOURCE_INVALID:Fee" };
  return { ok: true, records: rows };
}
function runner_gas2firebase_copy_planselectionrule_source() {
  const rows = getPlanSelectionRules(createSheetContext());
  if (!Array.isArray(rows)) return { ok: false, error: "COPY_SOURCE_INVALID:PlanSelectionRule" };
  return { ok: true, records: rows.map(function(row) {
    if (!row.member_type || !row.selectable_plan_id) throw Error("COPY_COMPOSITE_KEY_EMPTY:PlanSelectionRule");
    return Object.assign({}, row, { copy_rule_id: encodeURIComponent(String(row.member_type)) + "~" + encodeURIComponent(String(row.selectable_plan_id)) });
  }) };
}
function runner_gas2firebase_copy_trainingslot_source() {
  const rows = getTrainingSlots(createSheetContext());
  if (!Array.isArray(rows)) return { ok: false, error: "COPY_SOURCE_INVALID:TrainingSlot" };
  const timezone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  return { ok: true, records: rows.map(function(row) {
    const next = Object.assign({}, row);
    ["開始時刻", "終了時刻"].forEach(function(key) {
      if (!(next[key] instanceof Date) || isNaN(next[key].getTime())) throw Error("COPY_TIME_NOT_DATE:" + key);
      next[key] = Utilities.formatDate(next[key], timezone, "HH:mm");
    });
    return next;
  }) };
}
function runner_gas2firebase_copy_billingblock_source() {
  const rows = getBillingBlocks(createSheetContext());
  if (!Array.isArray(rows)) return { ok: false, error: "COPY_SOURCE_INVALID:BillingBlock" };
  return { ok: true, records: rows };
}
function runner_gas2firebase_copy_rank_source() {
  const rows = getRankMasterRows(createSheetContext());
  if (!Array.isArray(rows)) return { ok: false, error: "COPY_SOURCE_INVALID:Rank" };
  return { ok: true, records: rows };
}
function runner_gas2firebase_copy_examinationstandard_source() {
  const rows = getExaminationStandardRows(createSheetContext());
  if (!Array.isArray(rows)) return { ok: false, error: "COPY_SOURCE_INVALID:ExaminationStandard" };
  return { ok: true, records: rows.map(function(row) {
    if (!row["現在級段位"] || !row["次回審査級段位"]) throw Error("COPY_COMPOSITE_KEY_EMPTY:ExaminationStandard");
    return Object.assign({}, row, { copy_standard_id: encodeURIComponent(String(row["現在級段位"])) + "~" + encodeURIComponent(String(row["次回審査級段位"])) });
  }) };
}
