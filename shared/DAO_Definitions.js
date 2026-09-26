'use strict';
// Step 1: Portable DAO generic registry only. Business feature definitions are added in later patches.
const definitions = {
  setting: {
    writable: ['key', 'value'],
    sources: {
      firestore: { collection: 'settings', keyField: 'key', fields: { key: 'key', value: 'value' } },
      gas: { sheet: '99_設定', keyColumn: 1, valueColumn: 2, keyField: 'key', fields: { key: 'key', value: 'value' } }
    }
  },
  monthlySelection: {
    writable: ['target_month','member_id','billing_group_id','plan_id','宣言日','状態','備考'],
    sources: {
      firestore: { collection: 'monthlySelections', fields: { target_month:'target_month', member_id:'member_id', billing_group_id:'billing_group_id', plan_id:'plan_id', 宣言日:'宣言日', 状態:'状態', 備考:'備考' } },
      gas: { sheet: '04_月次選択', fields: { target_month:'target_month', member_id:'member_id', billing_group_id:'billing_group_id', plan_id:'plan_id', 宣言日:'宣言日', 状態:'状態', 備考:'備考' } }
    }
  },
  paymentEvidence: {
    writable: ['evidence_id','invoice_id','member_id','payment_method','amount','reception_date','status','evidence_code','requested_at','confirmed_at','confirmed_by','posted_at','payment_log_id','remarks'],
    sources: {
      firestore: { collection: 'paymentEvidences', keyField: 'evidence_id', fields: {
        evidence_id:'evidence_id', invoice_id:'invoice_id', member_id:'member_id', payment_method:'payment_method', amount:'amount', reception_date:'reception_date', status:'status', evidence_code:'evidence_code', requested_at:'requested_at', confirmed_at:'confirmed_at', confirmed_by:'confirmed_by', posted_at:'posted_at', payment_log_id:'payment_log_id', remarks:'remarks'
      } },
      gas: { sheet: '09_決済エビデンス', keyColumn: 1, keyField: 'evidence_id', fields: {
        evidence_id:'evidence_id', invoice_id:'invoice_id', member_id:'member_id', payment_method:'payment_method', amount:'amount', reception_date:'reception_date', status:'status', evidence_code:'evidence_code', requested_at:'requested_at', confirmed_at:'confirmed_at', confirmed_by:'confirmed_by', posted_at:'posted_at', payment_log_id:'payment_log_id', remarks:'remarks'
      } }
    }
  }
};
const tableDefinitions = {
  members: { sheet: '01_会員マスタ', collection: 'members' },
  locations: { sheet: '10_道場マスタ', collection: 'locations' },
  teachers: { sheet: '11_先生マスタ', collection: 'teachers' },
  trainingSlots: { sheet: '12_稽古枠マスタ', collection: 'trainingSlots' },
  billingBlocks: { sheet: '13_課金枠マスタ', collection: 'billingBlocks' },
  attendances: { sheet: '07_出席ログ', collection: 'attendances' }
};
module.exports = { definitions, tableDefinitions };
