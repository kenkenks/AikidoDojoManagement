TargetProfile Runtime Load Order Fix
====================================

目的
----
Target Profile導入後、system_context.js が window.DOJO_RUNTIME_CONFIG.apiBaseUrl を
参照する一方、paypay_code.html だけ runtime_config.js より先に system_context.js を
読み込んでいたため、PayPay画面が初期化時に停止していた問題を修正します。

変更ファイル
------------
- web/qr/paypay_code.html
  runtime_config.js → system_context.js の順へ修正。
- web/qr/system_context.js
  Runtime Config未読込時に、undefined.apiBaseUrl ではなく原因が分かる明示エラーで停止。
- tools/target.mjs
  Build時に全HTMLを検査し、system_context.js を使う画面で
  runtime_config.js が無い／後にある場合はBuildを失敗させる再発防止ガードを追加。

適用
----
ZIPの内容をリポジトリルートへ上書きしてください。
フォルダ構造は元リポジトリと同じです。

確認
----
1. npm run target:build -- demo-gas
2. BuildがGREENになること
3. .build/demo-gas/web/qr/paypay_code.html で
   runtime_config.js が system_context.js より先にあること
4. GitHub Pages反映後、PayPay画面で System Context が表示／操作ログに
   「System Context確定」が出ること
5. 会員ホーム、会員出席、先生出席も軽くスモーク確認

既存コマンドは変更しません。
