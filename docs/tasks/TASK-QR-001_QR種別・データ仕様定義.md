# TASK-QR-001 QR種別・データ仕様定義

## Origin

- ITER-003 道場システム リリース準備
- STORY-QR-001 QR発行
- 既存QR読取実装
- 現行Google Sheet QR運用

## Scope

1. 既存QR仕様を変更せず利用する。
2. QRデータは既存のURLクエリパラメータ方式を利用する。
3. 5種類のQRと必要パラメータの対応を定義する。
4. QRの機械向け情報とHTMLシートの人間向け情報を分離する。

## QR Mapping

| QR種別 | 必須パラメータ |
|---|---|
| MEMBER_CARD | member_id |
| PAYMENT_MONTHLY | member_id, plan_id |
| PAYMENT_ONETIME | member_id, plan_id |
| DOJO | location_id |
| TEACHER | teacher_id |

## Decision

月謝／都度支払いの違いを表すための
`MONTHLY` / `ONETIME` 等のQR専用パラメータは新設しない。

業務上の違いは既存料金プランの `plan_id` で表現する。

道場識別子は新しい `dojo_id` を作らず、
既存実装の `location_id` を利用する。

## Acceptance

- 5種類すべてについて必要パラメータが定義されている。
- 既存QR読取画面との互換性を維持する。
- 新規QR専用プロトコルを導入しない。
- 月謝／都度支払いが既存plan_idで表現できる。
- 道場QRがlocation_idを使用する。

## Out of scope

- QR画像生成
- QR HTMLデザイン
- 先生メンテUI
- QR発行履歴
- PDF生成
