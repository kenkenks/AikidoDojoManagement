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
  // 会員PayPayの REQUESTED / CONFIRMED は受付場所・課金枠・先生を確定しない。
  // reception_date だけを業務日として保持し、受付Scopeは先生POST時に確定する。
  const teacherId = 'PAYPAY_MEMBER';
  const scope = paypayCode_resolveReceptionScope_(data, ctx);
  // reception_date は受付Scopeではなく、PayPay操作の業務日。
  // Browser/Runnerが明示しない場合も System Context を含む ctx の業務日を使う。
  const receptionDate = normalizeId_(
    data.reception_date || data.receptionDate || scope.reception_date || sup_today(ctx)
  );
  scope.reception_date = receptionDate;

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
        amount: Number(paymentInfo.amount || 0),
        reception_date: receptionDate,
        location_id: '',
        billing_block_id: '',
        teacher_id: '',
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
  const repairResults = [];
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
    const currentEvidenceCode = normalizeId_(target.row.evidence_code || target.row['evidence_code']);

    if (status === 'REQUESTED') {
      recordTargets.push({
        evidence_id: evidenceId,
        evidence_code: evidenceCode,
        remarks: 'paypay_code.html record'
      });
      continue;
    }

    // 旧データや中断更新で CONFIRMED だけが先に成立し、
    // evidence_code / confirmed_at が欠けた行はコード再登録で自己修復する。
    if (status === 'CONFIRMED' && !currentEvidenceCode) {
      try {
        const updates = {
          evidence_code: evidenceCode
        };
        if (!target.row.confirmed_at && !target.row['confirmed_at']) {
          updates.confirmed_at = sup_now(ctx);
        }
        if (!normalizeId_(target.row.confirmed_by || target.row['confirmed_by'])) {
          updates.confirmed_by = memberId;
        }

        paymentEvidence_updateColumnsAtomic_(target.rowNumber, updates, ctx);
        repairResults.push({
          ok: true,
          repaired: true,
          index: i,
          evidence_id: evidenceId,
          status: status,
          evidence_code: evidenceCode,
          message: 'CONFIRMEDの不足項目を補完しました。'
        });
      } catch (e) {
        repairResults.push({
          ok: false,
          repaired: false,
          index: i,
          evidence_id: evidenceId,
          status: status,
          message: 'CONFIRMED補完失敗: ' + e.message
        });
      }
      continue;
    }

    skipped.push({
      ok: true,
      skipped: true,
      index: i,
      evidence_id: evidenceId,
      status: status,
      message: 'REQUESTEDではないため確認登録をスキップしました。'
    });
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

  const repairOk = repairResults.every(function(r) { return r.ok; });
  const ok = recordResult.ok !== false && repairOk;

  return {
    ok: ok,
    success: ok,
    memberId: memberId,
    evidenceCode: evidenceCode,
    recordResult: recordResult,
    repaired: repairResults,
    skipped: skipped,
    message: ok
      ? 'PayPay決済コードを登録しました。先生の決済更新後に入金反映されます。'
      : 'PayPay決済コードの登録または補完に失敗しました。'
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

  // 会員PayPayの active Evidence は「受付前」。
  // 過去実装で混入した先生受付Scopeを再利用時に除去する。
  // reception_date は業務日なので保持/補完する。
  const desiredReceptionDate = normalizeId_(scope.reception_date || scope.receptionDate);
  const updates = {};

  if (normalizeId_(row.location_id || row['location_id'])) {
    updates.location_id = '';
  }
  if (normalizeId_(row.billing_block_id || row['billing_block_id'])) {
    updates.billing_block_id = '';
  }
  if (normalizeId_(row.teacher_id || row['teacher_id'])) {
    updates.teacher_id = '';
  }
  if (!normalizeId_(row.reception_date || row['reception_date']) && desiredReceptionDate) {
    updates.reception_date = desiredReceptionDate;
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
  const activeStatuses = ['REQUESTED', 'CONFIRMED'];

  return rows.find(function(row) {
    return normalizeId_(row.invoice_id || row['invoice_id']) === normalizeId_(invoiceId) &&
      normalizeId_(row.payment_method || row['payment_method']) === 'PAYPAY' &&
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
