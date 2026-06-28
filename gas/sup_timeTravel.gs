//
// sup_timeTravel.gs
//
// -----------------------------------------------------------------------------
// テスト用タイムトリップ機構
// -----------------------------------------------------------------------------
//
// 【目的】
// 月次請求・出席・支払い状態など、日付に依存する処理を
// 任意の日付でテストできるようにする。
//
// 【注意】
// 本機構は DEV / TEST 専用。
// PROD では必ず実日時を使用する。
//
// -----------------------------------------------------------------------------

const SUP_TIME_TRAVEL = {
  enabled: false,
  now: "2026-07-01T10:00:00+09:00"
};

function sup_now() {
  if (
    typeof SUP_ENV !== "undefined" &&
    SUP_ENV !== "PROD" &&
    SUP_TIME_TRAVEL &&
    SUP_TIME_TRAVEL.enabled === true
  ) {
    return new Date(SUP_TIME_TRAVEL.now);
  }

  return new Date();
}

function sup_today() {
  const now = sup_now();

  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
}

function sup_targetMonth() {
  const now = sup_now();

  return Utilities.formatString(
    "%04d-%02d",
    now.getFullYear(),
    now.getMonth() + 1
  );
}