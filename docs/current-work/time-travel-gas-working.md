# タイムトリップ：開発GAS実動確認済み

元リポジトリ `C:\Users\pxk07\Documents\道場サポ\workspace\clasp_道場サポ` と、targets/dev-gas.jsonで指定された開発GASへ反映しました。コミットはまだ行っていません。本番GAS・Firestoreには反映していません。

## 確認結果

Apps Script APIで開発GASの最新保存コードを実行し、次を確認しました。

```json
{"ok":true,"message":"TIME-TRAVEL-PORTABLE PASS","success":4}
```

実際の一時シートで新規保存・更新・再読込・無効化を実行し、finallyで一時シートを削除しました。99_設定は変更していません。確認時の既存設定は有効、2026-07-06 10:00:00、対象月2026-07でした。

## 使い方

開発GASの既存タイムトリップ設定ダイアログを使用できます。Apps Scriptエディターから `showTimeTravelDialog` を実行すると既存画面を開きます（紐付いたスプレッドシートの画面から利用する関数です）。その画面の取得・保存が共通DAOにつながっています。

エディターから `runner_timeTravelPortable_smoke` を実行すると、現在の設定を変えずに同じ実I/O確認を再実行できます。テスト中に強制停止した場合はfinallyが動かず、一時シートが残る可能性があります。

既存のバージョン固定Webアプリのデプロイ更新はしていません。今回確認したのは開発GASの最新保存コードです。

## 変更範囲

- gas/sup_timeTravel.js：既存の取得・保存・システムコンテキスト入口を共通実装へ委譲。
- gas/DojoTimeTravel.js：shared＋GAS DAOから生成したコード。
- gas/DojoTimeTravelEntry.js：GAS環境への接続、実I/O確認関数。
- shared/、adapters/gas/DAO_Core.js：共通定義・処理とGAS用DAO。出席処理の既存入口は変更していません。
- tools/build-time-travel.mjs：生成用。work/verify-time-travel-entry.cjs：ローカル入口検証。

共通ソースを修正したら、リポジトリ直下で再生成します。

```powershell
node tools/build-time-travel.mjs
node --test work/verify-time-travel-entry.cjs
npm run target:build -- dev-gas
```

通常のtargetビルドは生成済みgas/DojoTimeTravel.jsをコピーします。生成物を直接編集せず、shared側を修正して再生成してください。

開発GAS更新前の全ソースは作業環境にバックアップしました。反映時はリモートの他ファイルを維持し、上記GAS3ファイルのみ変更しました。
