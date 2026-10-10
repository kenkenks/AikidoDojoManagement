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
