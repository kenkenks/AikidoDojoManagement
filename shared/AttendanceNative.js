'use strict';

// Native Attendance decision logic.
// This module has no storage side effects. It receives already-collected facts
// and returns the attendance changes that record/post phases may apply later.
function makeAttendancePlan(options = {}, facts = {}, dependencies = {}) {
  const normalizeId = value => String(value == null ? '' : value).trim();
  const isActive = row => {
    const status = normalizeId((row || {})['状態']);
    return status === '' || status === '有効' || status === '在籍' || status === 'TRUE';
  };
  const isTrue = value => value === true || ['TRUE', 'true', '1', '可', '有効'].includes(normalizeId(value));
  const dateKey = dependencies.dateKey || (value => {
    if(value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value == null ? '' : value).trim().slice(0, 10);
  });
  const uuid = dependencies.uuid;
  const now = dependencies.now;
  if(typeof uuid !== 'function') throw new Error('UUID_PROVIDER_REQUIRED');
  if(typeof now !== 'function') throw new Error('NOW_PROVIDER_REQUIRED');

  const teacherId = normalizeId(options.teacher_id);
  const locationId = normalizeId(options.location_id);
  const billingBlockId = normalizeId(options.billing_block_id);
  const sessionId = normalizeId(options.attendance_session_id) || ('ASES-' + uuid());
  const attendanceDate = options.attendance_date;
  const targetMonth = options.target_month;
  const items = Array.isArray(options.attendance_items) ? options.attendance_items : [];
  const requireTeacher = options.require_teacher === true;
  const initialStatus = String(options.initial_status || '有効');
  const source = String(options.source || 'attendance_core');
  const remarks = String(options.remarks || '');
  const syncUnselected = options.sync_unselected === true;
  const allowDuplicateMembers = options.allow_duplicate_members === true;

  const members = (facts.members || []).filter(isActive);
  const teachers = facts.teachers || [];
  const locations = facts.locations || [];
  const billingBlocks = facts.billingBlocks || [];
  const trainingSlots = facts.trainingSlots || [];
  const attendances = facts.attendances || [];

  if(requireTeacher) {
    if(!teacherId || !locationId || !billingBlockId)
      return {result:{ok:false,message:'先生・道場・課金枠を指定してください。'}, rowsToAppend:[], rowsToCancel:[]};
    const teacher = teachers.find(row => normalizeId(row.teacher_id) === teacherId && isActive(row));
    if(!teacher) throw new Error('有効な先生が見つかりません。');
    if(!isTrue(teacher['出席受付可'])) throw new Error('この先生は出席受付不可です。');
  } else if(!locationId || !billingBlockId) {
    return {result:{ok:false,message:'道場・課金枠を指定してください。'}, rowsToAppend:[], rowsToCancel:[]};
  }

  const location = locations.find(row => normalizeId(row.location_id) === locationId && isActive(row));
  if(!location) throw new Error('有効な道場が見つかりません。');
  const block = billingBlocks.find(row => normalizeId(row.billing_block_id) === billingBlockId && isActive(row));
  if(!block || normalizeId(block.location_id) !== locationId)
    throw new Error('道場と課金枠の組み合わせが不正です。');

  if(items.length === 0)
    return {result:{ok:false,message:'出席対象がありません。'}, rowsToAppend:[], rowsToCancel:[]};

  const memberMap = Object.fromEntries(members.map(row => [normalizeId(row.member_id), row]));
  const slotMap = {};
  trainingSlots.forEach(row => {
    const slotId = normalizeId(row.slot_id);
    if(slotId && isActive(row) && normalizeId(row.location_id) === locationId && normalizeId(row.billing_block_id) === billingBlockId)
      slotMap[slotId] = row;
  });

  const rowsToAppend = [];
  const rowsToCancel = [];
  const results = [];
  const requestedMembers = {};

  items.forEach(item => {
    const memberId = normalizeId(item.member_id);
    const hasSlotArray = Array.isArray(item.slot_ids);
    const slotIds = hasSlotArray ? Array.from(new Set(item.slot_ids.map(normalizeId).filter(Boolean))) : [];
    const result = {member_id:memberId,registered_slot_ids:[],retained_slot_ids:[],cancelled_slot_ids:[],errors:[]};

    if(!memberId || !memberMap[memberId]) result.errors.push('有効な会員が見つかりません。');
    else if(!allowDuplicateMembers && requestedMembers[memberId]) result.errors.push('同じ会員が送信データ内で重複しています。');
    else {
      requestedMembers[memberId] = true;
      if(!hasSlotArray) result.errors.push('slot_ids は配列で指定してください。');
      else if(slotIds.length === 0 && !syncUnselected) result.errors.push('slot_ids が指定されていません。');
      else slotIds.forEach(slotId => { if(!slotMap[slotId]) result.errors.push('無効な稽古枠: ' + slotId); });
    }
    if(result.errors.length) { results.push(result); return; }

    const existingRows = attendances.filter(row =>
      normalizeId(row['状態']) !== '取消' &&
      dateKey(row['稽古日']) === dateKey(attendanceDate) &&
      normalizeId(row.member_id) === memberId &&
      normalizeId(row.location_id) === locationId &&
      normalizeId(row.billing_block_id) === billingBlockId
    );
    const existingBySlot = Object.fromEntries(existingRows.map(row => [normalizeId(row.slot_id), row]));

    if(syncUnselected) existingRows.forEach(row => {
      const slotId = normalizeId(row.slot_id);
      if(!slotIds.includes(slotId)) { rowsToCancel.push(row); result.cancelled_slot_ids.push(slotId); }
    });

    slotIds.forEach(slotId => {
      if(existingBySlot[slotId]) { result.retained_slot_ids.push(slotId); return; }
      const slot = slotMap[slotId];
      rowsToAppend.push({
        attendance_id:'ATT-' + uuid(), '稽古日':attendanceDate, '登録日時':now(), member_id:memberId,
        target_month:targetMonth, location_id:locationId, slot_id:slotId, billing_block_id:billingBlockId,
        teacher_id:teacherId, attendance_session_id:sessionId, '稽古時間分':Number(slot['稽古時間分'] || 60),
        '状態':initialStatus, source, '取消日時':'', '取消者teacher_id':'', '取消理由':'', '備考':remarks
      });
      result.registered_slot_ids.push(slotId);
    });
    results.push(result);
  });

  return {
    result:{
      ok:true, attendance_session_id:sessionId, registered_count:rowsToAppend.length,
      retained_count:results.reduce((sum,result)=>sum+result.retained_slot_ids.length,0),
      cancelled_count:rowsToCancel.length, results,
      message:String(options.message || '出席登録を処理しました。')
    },
    rowsToAppend,
    rowsToCancel
  };
}

// Native Attendance collect phase. All persistence reads go through the
// Portable DAO contract; the returned facts are storage-neutral inputs for make.
function collectAttendanceFacts(dao) {
  if(!dao || typeof dao.readAll !== 'function') throw new Error('ATTENDANCE_DAO_REQUIRED');
  return {
    members: dao.readAll('members'),
    teachers: dao.readAll('teachers'),
    locations: dao.readAll('locations'),
    billingBlocks: dao.readAll('billingBlocks'),
    trainingSlots: dao.readAll('trainingSlots'),
    attendances: dao.readAll('attendance')
  };
}

// Native Attendance record phase. This function does not know Sheets or Firestore;
// it only applies a completed AttendancePlan through the Portable DAO contract.
function recordAttendancePlan(plan = {}, options = {}, dao, dependencies = {}) {
  if(!dao || typeof dao.appendRecord !== 'function' || typeof dao.updateByKey !== 'function')
    throw new Error('ATTENDANCE_DAO_REQUIRED');
  if(!plan.result || plan.result.ok !== true) return plan.result;

  const now = dependencies.now;
  if(typeof now !== 'function') throw new Error('NOW_PROVIDER_REQUIRED');
  const teacherId = String(options.teacher_id == null ? '' : options.teacher_id).trim();
  const cancelReason = String(options.cancel_reason || '出席枠再選択');
  const cancelledAt = now();

  for(const row of plan.rowsToCancel || []) {
    const attendanceId = String((row || {}).attendance_id == null ? '' : row.attendance_id).trim();
    if(!attendanceId) throw new Error('ATTENDANCE_ID_REQUIRED');
    const updated = dao.updateByKey('attendance', attendanceId, {
      '状態':'取消', '取消日時':cancelledAt, '取消者teacher_id':teacherId, '取消理由':cancelReason
    });
    if(updated && updated.found === false) throw new Error('ATTENDANCE_NOT_FOUND: ' + attendanceId);
  }
  for(const row of plan.rowsToAppend || []) dao.appendRecord('attendance', row);
  return plan.result;
}

// Native Attendance post phase. Projection is an external reflection of an
// already-decided/recorded attendance change, so the domain logic only depends
// on a projection contract and does not know PaymentStatusView or GAS.
function postAttendancePlan(plan = {}, dependencies = {}) {
  if(!plan.result || plan.result.ok !== true) return plan.result;
  const projectAttendances = dependencies.projectAttendances;
  if(typeof projectAttendances !== 'function') throw new Error('ATTENDANCE_PROJECTION_REQUIRED');
  projectAttendances({
    appended: plan.rowsToAppend || [],
    cancelled: plan.rowsToCancel || []
  });
  return plan.result;
}

module.exports={collectAttendanceFacts,makeAttendancePlan,recordAttendancePlan,postAttendancePlan};
