# TASK-DEV-024 Attendance受付のJob接続責務整理

STATUS: 保留
TYPE: DEV / Architecture

## 背景

現在の `registerAttendanceBatch` 系受付処理は、出席登録だけでなく、月次選択、BillingUsage、級段位更新などの後続処理もオーケストレーションしている。

902 の本番Attendanceシナリオも、`billing_selections`、`usage_billing` 等をAttendance受付結果の一部として検証しているため、単純な呼出し移動では受付APIとRunnerの契約に影響する。

## 検討内容

各処理のJob化が進んだ段階で、Attendance自身から後続Jobの実行責務を外し、Web / GAS 等の接続部で必要な入力を各Jobへ渡して順次実行する構造を検討する。

対象候補:

- AttendanceRegisterJob
- MonthlySelection系Job
- BillingUsageJob
- 級段位更新Job

## 方針

- Workflowクラスの導入を前提にしない。
- まず接続部 / CompositionでJobを順次実行できる責務分離を検討する。
- Job間の直接依存を減らす。
- 902および受付APIの返却契約を同時に整理する。
- Runnerを `Job + 条件 + 検証` のLISTで表現する案は、Runner整理時に別途検討する。

## 今回の扱い

BillingUsage Job化では現行のAttendance → `billingUsageSyncFromAttendance_()` 接続と返却契約を維持し、本TASKは保留とする。
