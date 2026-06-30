// 09_PaymentEvidenceRecord.gs
//   決済エビデンスを確認済みに更新する
//   09_決済エビデンス の REQUESTED 行に evidence_code を記録する

// ==============================
// 決済エビデンス記録（メイン）
// ==============================
function paymentEvidence_record(input, ctx) {
  ctx = ensureSheetContext(ctx || createSheetContext());
  
  sup_logDebug("paymentEvidence_record", {
    input: JSON.stringify(input, null, 2)
  });
  const recordContext = paymentEvidenceRecord_collect(input, ctx);
  const record = paymentEvidenceRecord_make(recordContext);
  
  return paymentEvidenceRecord_update(record, ctx);
}

// バッチ処理
function paymentEvidence_recordBatch(data, ctx) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    ctx = ensureSheetContext(ctx || createSheetContext());

    const teacherId = normalizeId_(data.teacher_id);

    const evidences = Array.isArray(data.evidences)
      ? data.evidences
      : (Array.isArray(data.evidence_items) ? data.evidence_items : []);

    if (!teacherId) {
      return { ok: false, message: "record: teacher_id がありません。" };
    }

    if (evidences.length === 0) {
      return { ok: false, message: "record:決済エビデンス確認の対象がありません。" };
    }

    const results = [];

    for (let i = 0; i < evidences.length; i++) {
      const evidence = evidences[i];

      try {

        const result = paymentEvidence_record({
          evidence_id: evidence.evidence_id || "",
          evidence_code: evidence.evidence_code || "",
          confirmed_by: teacherId,
          remarks: evidence.remarks || "会費受付画面から確認登録"
        }, ctx);

        results.push({
          ok: true,
          index: i,
          evidence_id: result.record.evidence_id,
          evidence_code: result.record.evidence_code,
          confirmed_by: result.record.confirmed_by,
          remarks: result.record.remarks,
          status: result.record.status,
          message: result.message || ""
        }); 
      } catch (e) {

        results.push({
          ok: false,
          index: i,
          evidence_id: evidence.evidence_id || "",
          message: "record: " + e.message
        });

        continue;
      }
    }

    return {
      ok: results.every(function(r) { return r.ok; }),
      results: results,
      completed: results.filter(function(r) { return r.ok; }),
      skipped: results.filter(function(r) { return !r.ok; }),
      message: "record: 決済エビデンス確認を登録しました。"
    };

  } finally {
    lock.releaseLock();
  }
}

// ==============================
// 情報収集
// ==============================
function paymentEvidenceRecord_collect(input, ctx) {
  ctx = ensureSheetContext(ctx);
  
  const evidenceId = normalizeId_(input.evidence_id || input.evidenceId);
  const evidenceCode = normalizeId_(input.evidence_code || input.evidenceCode);
  const confirmedBy = normalizeId_(input.confirmed_by || input.confirmedBy || input.teacher_id || input.teacherId);
  
  if (!evidenceId) {
    throw new Error("record: evidence_id がありません。");
  }
  
  if (!evidenceCode) {
    throw new Error("record: evidence_code がありません。");
  }
  
  if (!confirmedBy) {
    throw new Error("record: confirmed_by がありません。先生QRの teacher_id を指定してください。");
  }

  const target = paymentEvidence_findRowById_(ctx, evidenceId);
  if (!target) {
    throw new Error("record: 決済エビデンスが見つかりません: " + evidenceId);
  }

  const status = normalizeId_(target.row["status"]);
  if (status !== "REQUESTED") {
    throw new Error("record: REQUESTEDではないため確認記録できません: " + status);
  }

  return {
    evidence_id: evidenceId,
    evidence_code: evidenceCode,
    confirmed_by: confirmedBy,
    remarks: input.remarks || ""
  };
}

// ==============================
// Record生成
// ==============================
function paymentEvidenceRecord_make(context) {
  return {
    evidence_id: context.evidence_id,
    status: "CONFIRMED",
    evidence_code: context.evidence_code,
    confirmed_at: sup_now(ctx),
    confirmed_by: context.confirmed_by,
    remarks: context.remarks || ""
  };
}

// ==============================
// Record更新
// ==============================
function paymentEvidenceRecord_update(record, ctx) {
  ctx = ensureSheetContext(ctx);

  const target = paymentEvidence_findRowById_(ctx, record.evidence_id);
  if (!target) {
    throw new Error("record: 決済エビデンスが見つかりません: " + record.evidence_id);
  }

  paymentEvidence_updateColumns_(ctx, target.rowNumber, {
    status: record.status,
    evidence_code: record.evidence_code,
    confirmed_at: record.confirmed_at,
    confirmed_by: record.confirmed_by,
    remarks: record.remarks || target.row["remarks"] || ""
  });

  return {
    ok: true,
    message: "record: 決済エビデンスを確認済みにしました。",
    record
  };
}


// ==============================
// DAO / 共通
// ==============================
function paymentEvidence_findRowById_(ctx, evidenceId) {
  ctx = ensureSheetContext(ctx);

  const sheet = getRequiredSheet_(ctx, "09_決済エビデンス");
  const headerInfo = assertHeaders_(sheet, paymentEvidence_requiredHeaders_());
  const values = sheet.getDataRange().getValues();

  for (let r = 1; r < values.length; r++) {
    const valuesRow = values[r];
    if (normalizeId_(valuesRow[headerInfo.map["evidence_id"]]) === normalizeId_(evidenceId)) {
      const row = {};
      headerInfo.headers.forEach((header, index) => row[header] = valuesRow[index]);
      return {
        rowNumber: r + 1,
        row
      };
    }
  }

  return null;
}

function paymentEvidence_updateColumns_(ctx, rowNumber, valuesByHeader) {
  ctx = ensureSheetContext(ctx);

  const sheet = getRequiredSheet_(ctx, "09_決済エビデンス");
  const headerInfo = assertHeaders_(sheet, paymentEvidence_requiredHeaders_());

  Object.keys(valuesByHeader).forEach(header => {
    if (headerInfo.map[header] === undefined) {
      throw new Error("09_決済エビデンス に列がありません: " + header);
    }
    sheet.getRange(rowNumber, headerInfo.map[header] + 1).setValue(valuesByHeader[header]);
  });

  paymentEvidence_invalidate(ctx);
}
