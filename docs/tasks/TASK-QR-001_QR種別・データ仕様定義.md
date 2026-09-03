# TASK-QR-001 QR種別・データ仕様定義

## Decision

通常運用QRは識別・コンテキストに限定する。

| QR種別 | 必須パラメータ |
|---|---|
| MEMBER_CARD | member_id |
| DOJO | location_id |
| TEACHER | teacher_id |

PAYMENT_MONTHLY / PAYMENT_ONETIME は通常運用から廃止候補とする。月額／都度は出席時に `04_月次選択` へ確定する。

## Acceptance

- 3種類の必要パラメータが定義されている。
- 既存QR読取との互換性を可能な範囲で維持する。
- 業務判断をQR専用パラメータへ持ち込まない。
- 審査費等の追加請求QRは別TASKで判断する。
