'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

test('existing registerAttendanceBatch routes only Attendance Core through Step3 Portable DAO', () => {
  const source = fs.readFileSync(path.join(root, 'gas', '04_Attendance.js'), 'utf8');
  const entry = fs.readFileSync(path.join(root, 'gas', 'DojoAttendanceStep3Entry.js'), 'utf8');
  const lockedStart = source.indexOf('function registerAttendanceBatchLocked_');
  assert.notEqual(lockedStart, -1);
  const locked = source.slice(lockedStart, source.indexOf('\nfunction attendance_postEvent', lockedStart));
  assert.match(locked, /billingMonthlyAccept\s*\(/, 'old monthly billing selection must remain');
  assert.match(locked, /dojoAttendanceStep3RegisterCore\s*\(/, 'Attendance Core must use Portable entry');
  assert.doesNotMatch(locked, /attendanceCore_registerBatch_\s*\(/, 'old direct Attendance Core call must be disconnected from reception entry');
  assert.match(locked, /billingUsageSyncFromAttendance_\s*\(/, 'old usage billing sync must remain');
  assert.match(locked, /attendanceProgress_updateSelfDeclaredRanks_\s*\(/, 'old rank update must remain');
  assert.match(entry, /invalidateAttendances\s*\(projectionCtx\)/, 'existing attendance cache must be invalidated');
  assert.match(entry, /lock:\s*suppliedCtx\s*\?/, 'nested script lock must be bypassed only for existing locked route');
});
