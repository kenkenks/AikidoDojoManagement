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
  invoice: {
    writable: ['invoice_id','target_month','billing_group_id','member_id','plan_id','請求種別','表示名','数量','単価','上限金額','計算額','請求予定額','金額','支払状態','支払期限','作成日','備考'],
    sources: {
      firestore: { collection: 'invoices', keyField: 'invoice_id', fields: { invoice_id:'invoice_id', target_month:'target_month', billing_group_id:'billing_group_id', member_id:'member_id', plan_id:'plan_id', 請求種別:'請求種別', 表示名:'表示名', 数量:'数量', 単価:'単価', 上限金額:'上限金額', 計算額:'計算額', 請求予定額:'請求予定額', 金額:'金額', 支払状態:'支払状態', 支払期限:'支払期限', 作成日:'作成日', 備考:'備考' } },
      gas: { sheet: '05_請求明細', keyField: 'invoice_id', fields: { invoice_id:'invoice_id', target_month:'target_month', billing_group_id:'billing_group_id', member_id:'member_id', plan_id:'plan_id', 請求種別:'請求種別', 表示名:'表示名', 数量:'数量', 単価:'単価', 上限金額:'上限金額', 計算額:'計算額', 請求予定額:'請求予定額', 金額:'金額', 支払状態:'支払状態', 支払期限:'支払期限', 作成日:'作成日', 備考:'備考' } }
    }
  },
  paymentLog: {
    writable: ['payment_id','日時','target_month','billing_group_id','invoice_id','member_id','支払方法','入金額','決済ID','備考','reception_date','location_id','billing_block_id','teacher_id','reception_session_id'],
    sources: {
      firestore: { collection: 'payments', fields: { payment_id:'payment_id', 日時:'日時', target_month:'target_month', billing_group_id:'billing_group_id', invoice_id:'invoice_id', member_id:'member_id', 支払方法:'支払方法', 入金額:'入金額', 決済ID:'決済ID', 備考:'備考', reception_date:'reception_date', location_id:'location_id', billing_block_id:'billing_block_id', teacher_id:'teacher_id', reception_session_id:'reception_session_id' } },
      // GAS 06_入金ログ: base 9列 + paymentReception_ensureSchema() のScope 5列。member_idは物理列ではない。
      gas: { sheet: '06_入金ログ', fields: { payment_id:'payment_id', 日時:'日時', target_month:'target_month', billing_group_id:'billing_group_id', invoice_id:'invoice_id', 支払方法:'支払方法', 入金額:'入金額', 決済ID:'決済ID', 備考:'備考', reception_date:'reception_date', location_id:'location_id', billing_block_id:'billing_block_id', teacher_id:'teacher_id', reception_session_id:'reception_session_id' } }
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
