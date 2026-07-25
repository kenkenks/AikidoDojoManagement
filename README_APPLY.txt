Session Framework コア差分 v1

対象:
- web/qr/virtual_session.js
- work/verify-virtual-session.mjs
- docs/Architecture/ARCH-VIRTUAL-LOGIN-001.md

追加内容:
- 業務コンテキスト保持（location_id / teacher_id / billing_block_id）
- setContext / clearContext
- 保持対象外項目の拒否
- 破損SessionStorageの自動破棄
- コアランナーの試験拡張

確認:
node work/verify-virtual-session.mjs

期待結果:
PASS: 仮想ログインの保持・コンテキスト更新・破損復旧・ログアウト
