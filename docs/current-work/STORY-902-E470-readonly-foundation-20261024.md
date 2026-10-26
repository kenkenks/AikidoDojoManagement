# STORY-902 第2段階: E470 WebConnect read-only基盤

実施日: 2026-10-24
範囲: ローカル実装とモック単体テストのみ。実環境通信、Firestore/GAS書込み、TimeTrip変更、Fixture、cleanup、Git操作、配信は未実施。

## 結論

`902-E470（月末集計）`をGAS/Firebase DEVの既存WebConnect read actionだけで取得し、共通結果DTOへ変換・判定・ローカルJSON保存する小型基盤を追加した。業務Service/DAOは呼び出さない。AdapterはGETだけを生成し、明示allowlist外のactionを拒否する。

E470の完全再現ではない。出席日別時間と受付scope別集計は共通化できるが、月次請求全体はGASの`teacher_payment_status`だけが取得可能で、Firebaseは`UNSUPPORTED`となる。取消件数と審査費集計も共通read actionがないため`UNSUPPORTED`であり、0とは区別される。

## 新規・変更ファイル

- `work/story902-e470-webconnect.cjs`
  - 共通入力DTO検証
  - GAS/Firebase read-only Adapter
  - 共通結果DTO変換
  - Expected/Actual/Judge
  - `UNSUPPORTED`
  - ローカルJSON保存
- `work/verify-story902-e470-webconnect.cjs`
  - モック単体テスト6件
- `docs/current-work/STORY-902-E470-readonly-foundation-20261024.md`
  - 本報告

既存のWebConnect、GAS、Cloud Run、DAO、Service、Excel原本は変更していない。

## 使用する既存action

### GAS/Firebase共通

- `attendance_progress_summary`
  - 対象会員ごとにGET
  - `attendance_by_date`から対象月の確定稽古時間を集計
- `payment_reception_summary`
  - 指定された受付日・道場・課金枠scopeごとにGET
  - `payment_count`, `cash_total`, `paypay_total`, `total_amount`, `outstanding_total`を集計

### GASのみ

- `teacher_payment_status`
  - `date_from`, `date_to`, `target_month`でGET
  - 月次請求・入金・未払いのsummaryを取得

Firebase側には`teacher_payment_status`に相当するWebConnect actionがないため、月次請求全体は`UNSUPPORTED`とする。

## 共通入力DTO

```json
{
  "case_id": "902-E470",
  "target_month": "2027-07",
  "date_from": "2027-07-01",
  "date_to": "2027-07-31",
  "member_ids": ["M001", "M002"],
  "reception_scopes": [
    {
      "reception_date": "2027-07-02",
      "location_id": "HONBU",
      "billing_block_id": "B_KYO"
    }
  ],
  "expected": {
    "attendance_minutes_by_member": { "M001": 240 },
    "payments": { "payment_count": 2, "total_amount": 6000 },
    "monthly_billing": { "invoice_count": 5 }
  }
}
```

安全上、対象会員と受付scopeを自動で全件探索しない。呼出し対象を入力DTOへ明示することで、E470の読取範囲を限定する。

## 共通結果DTO

```text
schema_version
case_id / backend / project_id / target_month / executed_at / mode=READ_ONLY
input
expected
actual
  attendance.status / members[member_id]=minutes|UNSUPPORTED
  payments.status / scopes[] / totals
  monthly_billing=summary|UNSUPPORTED
  attendance_cancellations=UNSUPPORTED
  examination_fees=UNSUPPORTED
judge
  status=PASS|FAIL|PARTIAL
  checks[]: name/status/expected/actual
  passed/failed/unsupported
calls[]: action/status/subject
```

期待値と実値が一致すれば`PASS`、不一致があれば`FAIL`、比較対象が取得不能なら`PARTIAL`となる。取得不能値を数値0へ変換しない。

## Adapterの安全条件

- GAS allowlist:
  - `attendance_progress_summary`
  - `payment_reception_summary`
  - `teacher_payment_status`
- Firebase allowlist:
  - `attendance_progress_summary`
  - `payment_reception_summary`
- Adapterは常に`method: GET`をrequest関数へ渡す。
- `attendance_batch`等のPOST/write actionはallowlist外として実行前に拒否する。
- URLはHTTPSのみ。
- Firebaseは`projectId === dojo-management-dev`以外を生成時に拒否する。
- 認証値は結果DTOやローカルJSONへ保存しない。

## GAS/Firebase契約差分

|観点|GAS|Firebase DEV|
|---|---|---|
|Transport|既存Web App URLのGET|Cloud Run base URL + `/api/webconnect` GET|
|認証|既存Web Appの公開/実行権限設定に従う。必要ならAdapterのAuthorization providerを使用|正規Firebase ID tokenを`Authorization: Bearer ...`で付与|
|出席進捗|`attendance_progress_summary`|同action。本人、active teacher、adminの既存認可|
|受付集計|`payment_reception_summary`|同action。ただしFirebaseはadmin限定|
|月次会費状態|`teacher_payment_status`|相当actionなし、`UNSUPPORTED`|
|応答差|GAS DTOの既存項目|Cloud Run DTOの既存項目。欠落値は`UNSUPPORTED`|

## ローカル保存

`saveLocalResult(result)`は標準でOSの一時ディレクトリ配下`story902-e470-results`へ、一意なJSONファイルを作成する。既存ファイルは上書きしない。認証ヘッダーやトークンはresultへ含めない。出力先は呼出し側から明示変更できる。

## 単体・回帰テスト

### 新規テスト

`node --test work/verify-story902-e470-webconnect.cjs`

- 入力DTO検証: PASS
- GET allowlist、書込みaction拒否、Firebase DEV固定: PASS
- GAS共通DTO変換と月次summary判定: PASS
- Firebaseの月次項目を`UNSUPPORTED`扱い: PASS
- 応答欠落値を0にせず`UNSUPPORTED`: PASS
- ローカルJSON保存と上書き拒否: PASS

合計6件、6 PASS。

### 既存WebConnect回帰

- `node work/verify-webconnect-core.cjs`: 4 PASS
- `node --test work/verify-webconnect-dispatch-step6b.cjs work/verify-webconnect-http-step7c.cjs`: 17 PASS

合計21件、21 PASS。すべてモック/ローカルで、実環境通信はない。

## 実環境接続に必要な条件

### 共通

1. `target_month`, `date_from`, `date_to`
2. 対象をDEV専用に限定した`member_ids`
3. 実在する`reception_date/location_id/billing_block_id`の一覧
4. Excelの期待値を機械判定用`expected`へ確定
5. 実行結果JSONの保存先

### GAS

1. 現在使用中のWeb App URL
2. Web Appのアクセス設定と既存認証方式
3. `attendance_progress_summary`, `payment_reception_summary`, `teacher_payment_status`が現在配信版に含まれること
4. GETだけを許可する実行設定

### Firebase DEV

1. 接続先Cloud Run URL（candidateか通常配信かを明示）
2. `dojo-management-dev`で発行された正規Firebase ID tokenを、ログへ残さず取得する方法
3. `payment_reception_summary`を読めるadmin主体、またはactionごとの既存認可を満たす主体
4. candidateを使う場合はHostingの`runtime_config.js`と混同せず、AdapterへURLを明示

## 残課題

- E470の共通月次請求DTOはFirebaseで完全取得できない。
- 取消済み出席件数と審査費合計の共通read actionがない。
- scope日を列挙しないと受付集計を月次合算できない。
- GAS Web Appの実URL・アクセス権とFirebase検証主体は未確認。
- Excelの期待件数・金額はまだ機械判定値として確定していない。

次段階では実通信を始める前に、接続先・認証主体・対象期間・対象会員・受付scope・期待値をread-only実行票として確定する必要がある。
