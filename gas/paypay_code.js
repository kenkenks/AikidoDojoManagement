// paypay_code.gs
//   会員用 PayPay 決済コード登録画面のGAS入口
//
// 方針:
// ・会員画面は 09 REQUESTED -> 09 CONFIRMED まで行う。
// ・06入金ログ、05支払済、09 POSTED、20更新は先生画面の [決済更新] で行う。

function paypayCode_start(data, ctx) {
  ctx = ensureSheetContext(ctx || createSheetContext());

  const memberId = normalizeId_(data.member_id || data.memberId);
  const planId = normalizeId_(data.plan_id || data.planId);
  const teacherId = normalizeId_(data.teacher_id || data.teacherId || 'PAYPAY_MEMBER');

  if (!memberId) {
    return { ok: false, success: false, message: 'member_id がありません。' };
  }

  if (!planId) {
    return { ok: false, success: false, message: 'plan_id がありません。' };
  }

  // 04/05/20 を準備し、画面表示用DTOを取得する。
  const paymentInfo = getMemberPaymentInfo_(memberId, planId);
  if (!paymentInfo || paymentInfo.ok !== true) {
    return paymentInfo;
  }

  const invoiceItems = Array.isArray(paymentInfo.invoiceItems)
    ? paymentInfo.invoiceItems
    : [];

  if (Number(paymentInfo.amount || 0) > 0 && invoiceItems.length === 0) {
    return {
      ok: false,
      success: false,
      memberId: memberId,
      message: '未払いがありますが、請求明細 invoiceItems がありません。'
    };
  }

  const evidenceItems = [];
  const requestResults = [];

  for (let i = 0; i < invoiceItems.length; i++) {
    const invoice = invoiceItems[i] || {};
    const invoiceId = normalizeId_(invoice.invoice_id);

    if (!invoiceId) {
      requestResults.push({
        ok: false,
        index: i,
        invoice_id: '',
        message: 'invoice_id がありません。'
      });
      continue;
    }

    const existing = paypayCode_findActiveEvidenceByInvoice_(invoiceId, ctx);
    if (existing) {
      evidenceItems.push(paypayCode_makeEvidenceDto_(existing));
      requestResults.push({
        ok: true,
        skipped: true,
        index: i,
        invoice_id: invoiceId,
        evidence_id: existing.evidence_id,
        status: existing.status,
        message: '既存の決済エビデンスを使用します。'
      });
      continue;
    }

    try {
      const result = paymentEvidence_request({
        invoice_id: invoiceId,
        member_id: invoice.member_id || memberId,
        payment_method: 'PAYPAY',
        amount: Number(invoice.amount || 0),
        remarks: 'paypay_code.html start'
      }, ctx);

      evidenceItems.push(paypayCode_makeEvidenceDto_(result.request));
      requestResults.push({
        ok: true,
        skipped: false,
        index: i,
        invoice_id: invoiceId,
        evidence_id: result.evidence_id,
        status: result.request.status,
        message: result.message || ''
      });

    } catch (e) {
      const retryExisting = paypayCode_findActiveEvidenceByInvoice_(invoiceId, ctx);
      if (retryExisting) {
        evidenceItems.push(paypayCode_makeEvidenceDto_(retryExisting));
        requestResults.push({
          ok: true,
          skipped: true,
          index: i,
          invoice_id: invoiceId,
          evidence_id: retryExisting.evidence_id,
          status: retryExisting.status,
          message: '既存の決済エビデンスを使用します。'
        });
      } else {
        requestResults.push({
          ok: false,
          index: i,
          invoice_id: invoiceId,
          message: e.message
        });
      }
    }
  }

  return {
    ok: requestResults.every(function(r) { return r.ok; }),
    success: requestResults.every(function(r) { return r.ok; }),
    memberId: paymentInfo.memberId || memberId,
    memberName: paymentInfo.memberName || '',
    billingGroupId: paymentInfo.billingGroupId || '',
    targetMonth: paymentInfo.targetMonth || '',
    planId: paymentInfo.planId || planId,
    feeType: paymentInfo.feeType || '',
    amount: Number(paymentInfo.amount || 0),
    status: paymentInfo.status || '',
    message: paymentInfo.message || '',
    invoiceIds: paymentInfo.invoiceIds || [],
    invoiceCount: Number(paymentInfo.invoiceCount || invoiceItems.length || 0),
    invoiceSummary: paymentInfo.invoiceSummary || '',
    invoiceItems: invoiceItems,
    evidenceItems: evidenceItems,
    requestResults: requestResults,
    teacherId: teacherId
  };
}

function paypayCode_record(data, ctx) {
  ctx = ensureSheetContext(ctx || createSheetContext());

  const memberId = normalizeId_(data.member_id || data.memberId);
  const evidenceCode = normalizeId_(data.evidence_code || data.evidenceCode);
  const evidenceItems = Array.isArray(data.evidence_items)
    ? data.evidence_items
    : (Array.isArray(data.evidences) ? data.evidences : []);

  if (!memberId) {
    return { ok: false, success: false, message: 'member_id がありません。' };
  }

  if (!evidenceCode) {
    return { ok: false, success: false, message: 'PayPay決済コードがありません。' };
  }

  if (evidenceItems.length === 0) {
    return { ok: false, success: false, message: '決済エビデンス確認の対象がありません。' };
  }

  const recordTargets = [];
  const skipped = [];

  for (let i = 0; i < evidenceItems.length; i++) {
    const item = evidenceItems[i] || {};
    const evidenceId = normalizeId_(item.evidence_id || item.evidenceId);

    if (!evidenceId) {
      skipped.push({ ok: false, index: i, evidence_id: '', message: 'evidence_id がありません。' });
      continue;
    }

    const target = paymentEvidence_findRowById_(ctx, evidenceId);
    if (!target) {
      skipped.push({ ok: false, index: i, evidence_id: evidenceId, message: '決済エビデンスが見つかりません。' });
      continue;
    }

    const status = normalizeId_(target.row.status || target.row['status']);
    if (status === 'REQUESTED') {
      recordTargets.push({
        evidence_id: evidenceId,
        evidence_code: evidenceCode,
        remarks: 'paypay_code.html record'
      });
    } else {
      skipped.push({
        ok: true,
        skipped: true,
        index: i,
        evidence_id: evidenceId,
        status: status,
        message: 'REQUESTEDではないため確認登録をスキップしました。'
      });
    }
  }

  let recordResult = {
    ok: true,
    results: [],
    completed: [],
    skipped: [],
    message: 'record: 確認登録対象はありません。'
  };

  if (recordTargets.length > 0) {
    recordResult = paymentEvidence_recordBatch({
      teacher_id: memberId,
      evidence_items: recordTargets
    }, ctx);
  }

  return {
    ok: recordResult.ok !== false,
    success: recordResult.ok !== false,
    memberId: memberId,
    evidenceCode: evidenceCode,
    recordResult: recordResult,
    skipped: skipped,
    message: 'PayPay決済コードを登録しました。先生の決済更新後に入金反映されます。'
  };
}

function paypayCode_findActiveEvidenceByInvoice_(invoiceId, ctx) {
  const rows = paymentEvidence_getRows(ctx);
  const activeStatuses = ['REQUESTED', 'CONFIRMED', 'POSTED'];

  return rows.find(function(row) {
    return normalizeId_(row.invoice_id || row['invoice_id']) === normalizeId_(invoiceId) &&
      activeStatuses.indexOf(normalizeId_(row.status || row['status'])) >= 0;
  }) || null;
}

function paypayCode_makeEvidenceDto_(row) {
  return {
    evidence_id: normalizeId_(row.evidence_id || row['evidence_id']),
    invoice_id: normalizeId_(row.invoice_id || row['invoice_id']),
    member_id: normalizeId_(row.member_id || row['member_id']),
    payment_method: normalizeId_(row.payment_method || row['payment_method']),
    amount: Number(row.amount || row['amount'] || 0),
    status: normalizeId_(row.status || row['status']),
    evidence_code: normalizeId_(row.evidence_code || row['evidence_code'])
  };
}
