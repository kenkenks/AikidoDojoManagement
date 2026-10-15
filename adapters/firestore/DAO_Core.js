'use strict';
const {createFirestoreCore}=require('../../cloud/member-read/DAO_Core_Firestore.cjs');
const {randomUUID} = require('node:crypto');
const {definitions} = require('../../shared/DAO_Definitions.js');
const time = require('../../shared/TimeTravel.js');
const {restoreMasterFields} = require('../../cloud/attendance/master-fields.cjs');
const {monthlySelectionDocumentId} = require('../../cloud/attendance/monthly-selection-key.cjs');
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const SOURCES = Object.freeze({members:'members',fees:'fees',planSelectionRules:'plan_selection_rules',
  teachers:'teachers',locations:'dojos',billingBlocks:'billing_blocks',trainingSlots:'training_slots',
  monthlySelections:'monthly_selections',invoices:definitions.invoice.sources.firestore.collection,
  payments:definitions.paymentLog.sources.firestore.collection,
  attendances:definitions.attendance.sources.firestore.collection,
  paymentEvidences:definitions.paymentEvidence.sources.firestore.collection,paymentStatusView:'payment_status_views'});
const MASTERS = {fees:'Fee',planSelectionRules:'PlanSelectionRule',teachers:'Teacher',
  locations:'Dojo',billingBlocks:'BillingBlock',trainingSlots:'TrainingSlot'};
function validateAttendanceInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      !['teacher_id','location_id','billing_block_id'].every(key => ID.test(input[key] || '')) ||
      !Array.isArray(input.attendance_items) || input.attendance_items.length < 1 ||
      input.attendance_items.length > 50) throw new Error('INVALID_ATTENDANCE_INPUT');
  if (input.attendance_date !== undefined && (typeof input.attendance_date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.attendance_date) ||
      !Number.isFinite(Date.parse(input.attendance_date+'T00:00:00Z')) ||
      new Date(input.attendance_date+'T00:00:00Z').toISOString().slice(0,10) !== input.attendance_date))
    throw new Error('INVALID_ATTENDANCE_DATE');
  if (input.attendance_session_id !== undefined && !ID.test(input.attendance_session_id))
    throw new Error('INVALID_ATTENDANCE_SESSION');
  const seen = new Set();
  for (const item of input.attendance_items) {
    if (!item || !ID.test(item.member_id || '') || seen.has(item.member_id) ||
        !Array.isArray(item.slot_ids) || item.slot_ids.length > 100 ||
        item.slot_ids.some(id => !ID.test(id)) ||
        (item.plan_id !== undefined && item.plan_id !== '' && !ID.test(item.plan_id)) ||
        (item.current_rank !== undefined && (typeof item.current_rank !== 'string' || item.current_rank.length > 100)))
      throw new Error('INVALID_ATTENDANCE_ITEMS');
    seen.add(item.member_id);
  }
  return input;
}

// The GAS DAO contract is synchronous. Read the Firestore transaction first,
// then provide that contract over its snapshot and buffer writes until success.
// No business calculation, billing rule or View projection is implemented here.
function createAttendanceCore(db, {createRegistration, clock = () => new Date(), uuid = randomUUID} = {}) {
  if (!db || typeof db.runTransaction !== 'function' || typeof db.collection !== 'function' ||
      typeof createRegistration !== 'function') throw new Error('ATTENDANCE_TRANSACTION_REQUIRED');
  async function register(input) {
    validateAttendanceInput(input);
    return db.runTransaction(async tx => {
      const tables = Object.fromEntries(Object.keys(SOURCES).map(name=>[name,[]]));
      const rowRefs = new WeakMap();
      const pending = new Map();
      const viewRefs = new Map();
      const selectionRefs = new Map();
      const ctx = {timezone:'Asia/Tokyo',clock,settings:{},cache:{}};
      const ref = (table,id) => db.collection(SOURCES[table]).doc(id);
      function add(table,doc) {
        if (!doc.exists) return null;
        const fields = doc.data();
        const row = MASTERS[table] ? restoreMasterFields(MASTERS[table],fields,doc.id) : {...fields};
        const key = {members:'member_id',attendances:'attendance_id',invoices:'invoice_id'}[table];
        if (key && row[key] !== doc.id) throw new Error('ATTENDANCE_STORAGE_IDENTITY_CONFLICT');
        if (table === 'members') row['状態'] = row.status;
        const existing = tables[table].find(value => rowRefs.get(value)?.path === doc.ref.path);
        if (existing) return existing;
        tables[table].push(row); rowRefs.set(row,doc.ref); return row;
      }
      async function query(table, filters = []) {
        let q = db.collection(SOURCES[table]);
        for (const [field,value] of filters) q=q.where(field,'==',value);
        const snapshot = await tx.get(q.limit(501));
        if (snapshot.docs.length > 500) throw new Error('ATTENDANCE_SCOPE_LIMIT');
        return snapshot.docs.map(doc=>add(table,doc));
      }
      // Same existing TimeTrip keys/values; clock and forced target month are not guessed.
      for (const key of ['TIME_TRAVEL_ENABLED','DEBUG_DATE','DEBUG_TARGET_MONTH','DEBUG']) {
        const doc=await tx.get(db.collection('settings').doc(key));
        if (doc.exists) {
          const value=doc.data();
          if (value.key !== undefined && value.key !== key) throw new Error('INVALID_SETTING');
          if (!['string','boolean','number'].includes(typeof value.value)) throw new Error('INVALID_SETTING');
          ctx.settings[key]=value.value;
        }
      }
      const month=time.targetMonth(ctx);
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('INVALID_TARGET_MONTH');
      const date=input.attendance_date || time.today(ctx);
      for (const table of Object.keys(MASTERS)) await query(table);
      for (const item of input.attendance_items) {
        const doc=await tx.get(ref('members',item.member_id));
        const member=add('members',doc);
        if (!member || !['','有効','在籍','TRUE'].includes(String(member.status ?? '').trim()))
          throw new Error('ATTENDANCE_MEMBER_UNAVAILABLE');
        await query('attendances',[['member_id',item.member_id],['target_month',month]]);
        // Scope cancellation uses the requested date, including TimeTrip month overrides.
        await query('attendances',[['member_id',item.member_id],['稽古日',date]]);
        const viewId='view_'+monthlySelectionDocumentId(item.member_id,month);
        const viewRef=ref('paymentStatusView',viewId);
        const view=await tx.get(viewRef);
        if (view.exists) {
          const value=add('paymentStatusView',view);
          if (value.member_id !== item.member_id || value.target_month !== month)
            throw new Error('ATTENDANCE_VIEW_IDENTITY_CONFLICT');
        }
        viewRefs.set(month+'|'+item.member_id,{ref:viewRef,exists:view.exists});
      }
      const groups=[...new Set(tables.members.map(row=>row.billing_group_id).filter(Boolean))];
      for (const group of groups) {
        if (!ID.test(group)) throw new Error('INVALID_BILLING_GROUP_ID');
        const selectionId=monthlySelectionDocumentId(group,month);
        const selectionRef=ref('monthlySelections',selectionId);
        const canonical=await tx.get(selectionRef);
        const rows=await query('monthlySelections',[['billing_group_id',group],['target_month',month]]);
        if (rows.length>1 || (rows.length && rowRefs.get(rows[0]).path !== selectionRef.path) ||
            canonical.exists !== (rows.length===1)) throw new Error('MONTHLY_SELECTION_IDENTITY_CONFLICT');
        if (canonical.exists && (canonical.data().billing_group_id !== group || canonical.data().target_month !== month))
          throw new Error('MONTHLY_SELECTION_IDENTITY_CONFLICT');
        selectionRefs.set(group+'|'+month,{ref:selectionRef,exists:canonical.exists});
        await query('invoices',[['billing_group_id',group],['target_month',month]]);
        await query('payments',[['billing_group_id',group],['target_month',month]]);
        await query('paymentEvidences',[['billing_group_id',group]]);
      }
      for (const item of input.attendance_items) await query('paymentEvidences',[['member_id',item.member_id]]);
      function serialize(value) {
        if (value instanceof Date) return value.toISOString();
        if (typeof value==='string' || typeof value==='boolean' || (typeof value==='number' && Number.isFinite(value))) return value;
        throw new Error('UNSUPPORTED_ATTENDANCE_WRITE_VALUE');
      }
      function stage(docRef, fields, create = false) {
        const prior=pending.get(docRef.path);
        pending.set(docRef.path,{ref:docRef,create:prior?.create ?? create,
          fields:{...prior?.fields,...Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,serialize(value)]))}});
        if (pending.size>450) throw new Error('ATTENDANCE_WRITE_LIMIT');
      }
      function update(table,row,values) { Object.assign(row,values); stage(rowRefs.get(row),values); }
      function append(table,rows) {
        for (const row of rows) {
          let docRef;
          if (table==='monthlySelections') {
            const access=selectionRefs.get(row.billing_group_id+'|'+row.target_month);
            if (!access || access.exists || tables.monthlySelections.some(r=>r.billing_group_id===row.billing_group_id && r.target_month===row.target_month))
              throw new Error('MONTHLY_SELECTION_WRITE_CONFLICT');
            docRef=access.ref;
          } else {
            const key=table==='attendances'?'attendance_id':'invoice_id';
            docRef=ref(table,row[key]);
          }
          tables[table].push(row); rowRefs.set(row,docRef); stage(docRef,row,true);
        }
      }
      const headers=new Set(['target_month','member_id']);
      ctx.daoCore={
        read: table => {
          if (!Object.hasOwn(tables,table)) throw new Error('UNKNOWN_ATTENDANCE_TABLE');
          return tables[table];
        },
        append: (table,rows) => append(table,rows),
        updateByKey: (table,key,id,values) => {
          const rows=tables[table].filter(row=>row[key]===id);
          if (rows.length>1) throw new Error('DUPLICATE_ATTENDANCE_WRITE_TARGET');
          if (!rows.length) return {found:false}; update(table,rows[0],values); return {found:true};
        },
        readAttendanceScopeRows: () => tables.attendances,
        appendAttendanceRows: rows => append('attendances',rows),
        cancelAttendanceRows: (rows,teacherId,reason) => {
          const now=time.now(ctx);
          for (const row of rows) update('attendances',row,{'状態':'取消','取消日時':now,'取消者teacher_id':teacherId,'取消理由':reason || '画面同期による選択解除'});
        },
        ensurePaymentStatusHeaders: values => {Object.keys(values).forEach(key=>headers.add(key));},
        readPaymentStatusValues: () => {
          tables.paymentStatusView.forEach(row=>Object.keys(row).forEach(key=>headers.add(key)));
          const keys=[...headers];return [keys,...tables.paymentStatusView.map(row=>keys.map(key=>row[key]??''))];
        },
        upsertPaymentStatusRow: (keys,values) => {
          const access=viewRefs.get(keys.target_month+'|'+keys.member_id);
          if (!access) throw new Error('ATTENDANCE_VIEW_SCOPE_UNREAD');
          let row=tables.paymentStatusView.find(r=>r.member_id===keys.member_id && r.target_month===keys.target_month);
          if (!row) {row={...keys};tables.paymentStatusView.push(row);rowRefs.set(row,access.ref);}
          Object.assign(row,values);stage(access.ref,{...keys,...values},!access.exists);
        },
        openMemberRankUpdates: () => {
          const keys=['member_id','現在級段位','級段位登録元','級段位更新日時'];
          return {headerInfo:{map:Object.fromEntries(keys.map((key,i)=>[key,i]))},
            values:[keys,...tables.members.map(row=>[row.member_id,row.current_rank,row.rank_source,row.rank_updated_at])],
            writeRank: (rowNo,_rank,_source,_at,rank,source) => update('members',tables.members[rowNo-2],{current_rank:rank,rank_source:source,rank_updated_at:time.now(ctx)}),
            invalidate() {}};
        }
      };
      const result=createRegistration(ctx,{uuid}).register({...input,attendance_date:date});
      // GAS catches some billing failures. Do not commit a partial failed Node operation.
      if (result?.ok !== true || result.results?.some(row=>row.errors?.length)) {
        return {...result,ok:false};
      }
      for (const write of pending.values()) {
        if (write.create) tx.create(write.ref,write.fields);
        else tx.set(write.ref,write.fields,{merge:true});
      }
      return result;
    });
  }
  return {register};
}
function createCore(config,dependencies={}) { return createFirestoreCore(config,dependencies); }
module.exports={createCore,createAttendanceCore,validateAttendanceInput,SOURCES,backend:'firestore'};
