'use strict';
// Host bindings only. Attendance, billing, rank and View decisions remain in gas/.
const time = require('./TimeTravel.js');
function createAttendanceEnvironment(ctx, {uuid, log = {log() {}}} = {}) {
  if (!ctx?.daoCore || typeof uuid !== 'function') throw new Error('ATTENDANCE_DAO_REQUIRED');
  const read = name => () => ctx.daoCore.read(name, ctx);
  return {
    ensureSheetContext: value => {
      if (value !== ctx) throw new Error('ATTENDANCE_CONTEXT_REQUIRED');
      return ctx;
    },
    createSheetContext: () => ctx,
    Session: {getScriptTimeZone: () => ctx.timezone},
    Utilities: {getUuid: uuid, formatDate: time.format},
    sup_now: () => time.now(ctx), sup_today: () => time.today(ctx),
    sup_targetMonth: () => time.targetMonth(ctx),
    getMembers: read('members'), getFees: read('fees'),
    getPlanSelectionRules: read('planSelectionRules'),
    getMonthlySelections: read('monthlySelections'), getInvoices: read('invoices'),
    getPayments: read('payments'), getAttendances: read('attendances'),
    getLocations: read('locations'), getTeachers: read('teachers'),
    getTrainingSlots: read('trainingSlots'), getBillingBlocks: read('billingBlocks'),
    getPaymentEvidences: read('paymentEvidences'),
    invalidateFeeStatusView() {}, perfLog() {}, console: log
  };
}
module.exports = {createAttendanceEnvironment};
