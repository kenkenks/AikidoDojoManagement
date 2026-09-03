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
  const scope = paypayCode_resolveReceptionScope_(data, ctx);

  if (!memberId) {
    return { ok: false, success: false, message: 'member_id がありません。' };
  }

  if (!planId) {
    return { ok: false, success: false, message: 'plan_id がありません。' };
  }

  // 04/05/20 を準備し、画面表示用DTOを取得する。
  // PayPay開始処理全体で同じSheetContextを使い、宣言・請求生成後の
  // 最新状態を同一リクエスト内で参照する。
  const paymentInfo = getMemberPaymentInfo_(memberId, planId, ctx);
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
      const reusable = paypayCode_repairReusableEvidenceScope_(existing, scope, ctx);
      evidenceItems.push(paypayCode_makeEvidenceDto_(reusable));
      requestResults.push({
        ok: true,
        skipped: true,
        index: i,
        invoice_id: invoiceId,
        evidence_id: reusable.evidence_id,
        status: reusable.status,
        scope_repaired:
          normalizeId_(existing.location_id || existing['location_id']) !== normalizeId_(reusable.location_id || reusable['location_id']) ||
          normalizeId_(existing.billing_block_id || existing['billing_block_id']) !== normalizeId_(reusable.billing_block_id || reusable['billing_block_id']),
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
        location_id: scope.location_id,
        billing_block_id: scope.billing_block_id,
        teacher_id: teacherId,
        reception_session_id: normalizeId_(data.reception_session_id || data.receptionSessionId),
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
        const reusable = paypayCode_repairReusableEvidenceScope_(retryExisting, scope, ctx);
        evidenceItems.push(paypayCode_makeEvidenceDto_(reusable));
        requestResults.push({
          ok: true,
          skipped: true,
          index: i,
          invoice_id: invoiceId,
          evidence_id: reusable.evidence_id,
          status: reusable.status,
          scope_repaired:
            normalizeId_(retryExisting.location_id || retryExisting['location_id']) !== normalizeId_(reusable.location_id || reusable['location_id']) ||
            normalizeId_(retryExisting.billing_block_id || retryExisting['billing_block_id']) !== normalizeId_(reusable.billing_block_id || reusable['billing_block_id']),
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
    teacherId: teacherId,
    locationId: scope.location_id,
    billingBlockId: scope.billing_block_id,
    scopeInferred: scope.inferred === true,
    scopeMessage: scope.message || ''
  };
}


function paypayCode_resolveReceptionScope_(data, ctx) {
  ctx = ensureSheetContext(ctx);
  data = data || {};

  const locationId = normalizeId_(data.location_id || data.locationId);
  const billingBlockId = normalizeId_(data.billing_block_id || data.billingBlockId);

  // 出席登録とは独立して支払いScopeを解決する。
  // 道場外など、受付Scopeを持たない支払いは従来どおり許容する。
  if (!locationId) {
    return {
      location_id: '',
      billing_block_id: '',
      inferred: false,
      message: '受付Scopeなし'
    };
  }

  const location = getLocations(ctx).find(function(row) {
    return normalizeId_(row["location_id"]) === locationId && isActiveMasterRow_(row);
  });
  if (!location) {
    throw new Error('PayPay受付の有効な道場が見つかりません。');
  }

  if (billingBlockId) {
    const block = getBillingBlocks(ctx).find(function(row) {
      return normalizeId_(row["billing_block_id"]) === billingBlockId &&
        normalizeId_(row["location_id"]) === locationId &&
        isActiveMasterRow_(row);
    });
    if (!block) {
      throw new Error('PayPay受付の道場に対応する有効な課金枠が見つかりません。');
    }
    return {
      location_id: locationId,
      billing_block_id: billingBlockId,
      inferred: false,
      message: ''
    };
  }

  // 課金枠QRには依存しない。道場 + 現在時刻から一意に決まる場合だけ補完する。
  const now = parseSessionDateTime_('', ctx);
  const candidates = findBillingBlockCandidates_(locationId, now, ctx);
  const exact = candidates.filter(function(candidate) { return candidate.is_current; });
  const nearby = candidates.filter(function(candidate) { return candidate.is_nearby; });
  const resolved = exact.length === 1
    ? exact[0]
    : (exact.length === 0 && nearby.length === 1 ? nearby[0] : null);

  if (!resolved) {
    return {
      location_id: locationId,
      billing_block_id: '',
      inferred: false,
      message: '課金枠を自動判定できなかったため、道場情報のみ保持しました。'
    };
  }

  return {
    location_id: locationId,
    billing_block_id: normalizeId_(resolved.billing_block_id),
    inferred: true,
    message: '現在時刻から課金枠を自動判定しました。'
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

    const target = paymentEvidence_findRowById_(evidenceId, ctx);
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


// REQUESTED / CONFIRMED の既存エビデンスを再利用するとき、
// 旧データで受付Scopeが欠けていれば現在の受付Scopeで空欄だけを補完する。
// POSTEDは06入金ログへ既に転記済みなので、ここでは後書きしない。
function paypayCode_repairReusableEvidenceScope_(row, scope, ctx) {
  ctx = ensureSheetContext(ctx);
  row = row || {};
  scope = scope || {};

  const status = normalizeId_(row.status || row['status']);
  if (['REQUESTED', 'CONFIRMED'].indexOf(status) < 0) {
    return row;
  }

  const evidenceId = normalizeId_(row.evidence_id || row['evidence_id']);
  if (!evidenceId) return row;

  const currentLocationId = normalizeId_(row.location_id || row['location_id']);
  const currentBillingBlockId = normalizeId_(row.billing_block_id || row['billing_block_id']);
  const desiredLocationId = normalizeId_(scope.location_id);
  const desiredBillingBlockId = normalizeId_(scope.billing_block_id);

  // 既存値と現在Scopeが食い違う場合は、別受付の可能性があるため上書きしない。
  if (currentLocationId && desiredLocationId && currentLocationId !== desiredLocationId) {
    return row;
  }
  if (currentBillingBlockId && desiredBillingBlockId &&
      currentBillingBlockId !== desiredBillingBlockId) {
    return row;
  }

  const updates = {};
  if (!currentLocationId && desiredLocationId) {
    updates.location_id = desiredLocationId;
  }
  if (!currentBillingBlockId && desiredBillingBlockId) {
    updates.billing_block_id = desiredBillingBlockId;
  }

  if (Object.keys(updates).length === 0) {
    return row;
  }

  const target = paymentEvidence_findRowById_(evidenceId, ctx);
  if (!target) return row;

  paymentEvidence_updateColumns_(target.rowNumber, updates, ctx);

  const refreshed = paymentEvidence_findRowById_(evidenceId, ctx);
  return refreshed ? refreshed.row : row;
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
    evidence_code: normalizeId_(row.evidence_code || row['evidence_code']),
    location_id: normalizeId_(row.location_id || row['location_id']),
    billing_block_id: normalizeId_(row.billing_block_id || row['billing_block_id'])
  };
}
