# TASK-QR-005 QR発行E2E動作確認

## E2E対象

- MEMBER_CARD: member_idを認識できる。
- DOJO: location_idを認識できる。
- TEACHER: teacher_idを認識できる。

先生メンテ → QR発行 → HTML表示 → 印刷/画面表示 → 実機読取 → 目的画面到達まで確認する。

PAYMENT_MONTHLY / PAYMENT_ONETIME は通常運用E2E対象から外す。料金プラン確定は出席E2E / STORY-901で検証する。

## Acceptance

- 3種類について発行から実機読取まで成功する。
- 読取後に対象IDが正しく認識される。
- 月額／都度の確定をQR E2Eへ混在させない。
