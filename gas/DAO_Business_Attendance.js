// 出席課金集計が必要とする原簿を取得する。計算・状態判定はBusinessが所有する。
// 行順と読み取り順を維持し、DAOでの事前絞込みは行わない。
function daoAttendanceCollectChargeRows_(ctx) {
  const core = daoCore_(ctx);
  const attendances = core.read('attendances', ctx);
  const billingBlocks = core.read('billingBlocks', ctx);
  return { attendances: attendances, billingBlocks: billingBlocks };
}

function daoAttendanceAppend_(attendanceRows, ctx) {
  return daoCore_(ctx).appendAttendanceRows(attendanceRows, ctx);
}

function daoAttendanceCancel_(attendanceRows, teacherId, reason, ctx) {
  return daoCore_(ctx).cancelAttendanceRows(attendanceRows, teacherId, reason, ctx);
}

function daoAttendanceGetMemberMap_(ctx) {
  ctx = daoContext_(ctx);

  const members = {};
  daoCore_(ctx).read('members', ctx).forEach(function(row) {
    if (isActiveMasterRow_(row)) {
      members[normalizeId_(row["member_id"])] = row;
    }
  });
  return members;
}

function daoAttendanceGetSlotMap_(locationId, billingBlockId, ctx) {
  ctx = daoContext_(ctx);

  const slots = {};
  daoCore_(ctx).read('trainingSlots', ctx).forEach(function(row) {
    const slotId = normalizeId_(row["slot_id"]);

    if (
      slotId &&
      isActiveMasterRow_(row) &&
      normalizeId_(row["location_id"]) === normalizeId_(locationId) &&
      normalizeId_(row["billing_block_id"]) === normalizeId_(billingBlockId)
    ) {
      slots[slotId] = row;
    }
  });
  return slots;
}

function daoAttendanceFindRowsForScope_(params, ctx) {
  ctx = daoContext_(ctx);

  const rows = daoCore_(ctx).readAttendanceScopeRows(ctx);
  const attendanceDate = parseAttendanceDate_(params.attendance_date, ctx);
  const dateText = formatAttendanceDate_(attendanceDate, ctx);

  return rows.filter(function(row) {
    if (formatAttendanceDate_(row["稽古日"], ctx) !== dateText) return false;

    if (params.member_id &&
        normalizeId_(row["member_id"]) !== normalizeId_(params.member_id)) return false;

    if (params.location_id &&
        normalizeId_(row["location_id"]) !== normalizeId_(params.location_id)) return false;

    if (params.billing_block_id &&
        normalizeId_(row["billing_block_id"]) !== normalizeId_(params.billing_block_id)) return false;

    if (params.status &&
        normalizeId_(row["状態"]) !== normalizeId_(params.status)) return false;

    return normalizeId_(row["状態"]) !== "取消";
  });
}


function daoAttendanceUpdateRows_(rows, updateValues, ctx) {
  return daoCore_(ctx).updateAttendanceRows(rows, updateValues, ctx);
}
