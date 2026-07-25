TASK-FWK-022 Payment画面 Session Context対応

適用対象:
- web/qr/payment_teacher.html
- work/verify-payment-session-context.mjs
- docs/Architecture/ARCH-VIRTUAL-LOGIN-001.md

確認:
node work/verify-virtual-session.mjs
node work/verify-payment-session-context.mjs

期待結果:
PASS: 仮想ログインの保持・コンテキスト更新・破損復旧・ログアウト
PASS: Payment画面のURL優先・Session補完・別先生Context分離・Context保存
