# 共通ソースとDAO差し替え：タイムトリップ・出席Core

同じリポジトリからGAS版とFirestore版を生成します。切替対象はadapters内のDAO_Core.jsです。実行中の接続先切替ではなく、ビルド時に選択したファイルだけを組み込みます。

```text
shared/                     共通定義・コンテキスト・タイムトリップ・出席の接続処理
adapters/gas/DAO_Core.js     Sheets読取・書込、GASロック
adapters/firestore/DAO_Core.js  Firestore読取・書込、トランザクション
gas/04_Attendance.js         既存の出席業務ソース（正本）
gas/04_AttendanceCore.js      同上
gas/DAO_Business_Attendance.js 同上
tools/portable.mjs           共通ソースと選択DAOを一つの成果物に生成
```

出席業務ソースは複製して手直しせず、既存GASの3ファイルをビルド時に関数スコープへ組み込みます。未移植の関数も元ファイルに含まれますが、今回の公開入口は出席Coreだけです。shared/Flow.jsが同期DAOと非同期DAOの戻り値を吸収します。GASでは同期結果、Nodeでは必要に応じPromiseになります。

シート名・コレクション名はshared/DAO_Definitions.jsに並べました。出席用のFirestore原簿はGASと同じ業務項目名（状態・稽古日など）を使います。既存のテスト会員1件だけでは必要なマスタが揃わないため、実登録はまだ行わないでください。

## ローカル検証

ZIPをリポジトリ直下へ重ねます。以前のcloud/member-readファイルはsharedを参照する互換入口になったため、cloudフォルダだけをコピーせずsharedも一緒に管理してください。

```powershell
npm run portable:build -- gas
npm run portable:build -- firestore
npm run portable:test
```

出力：`.build/portable-gas/DojoPortable.js`、`.build/portable-gas/DojoPortableEntry.js`、`.build/portable-firestore/DojoPortable.cjs`。sources.jsonには共通ソースのハッシュを出力し、両版の一致を検証します。生成物を手編集しません。

```powershell
node --test work/verify-portable.mjs work/verify-time-travel-port.cjs work/verify-firestore-member.cjs work/verify-admin-member-api.cjs work/verify-member-client.mjs work/verify-preview-routing.cjs work/verify-member-dao-layers.cjs work/verify-generic-dao-core.cjs work/verify-dao-definitions.cjs
```

**68件PASS**。タイムトリップの追加・更新・無効化、出席の追加・保持・取消・再登録・全解除、入力内重複、無効マスタ、不正日付、投影未接続時の停止を検証しました。GASはVMとSheetモック、FirestoreはREST／トランザクションモックです。実GAS、実Firestore、Emulatorでの今回の実行検証は未実施です。物理的な同時実行競合はモック試験の対象外です。

既存targetビルドへの組込みもローカルで確認済みです。targets/dev-gas.jsonに`"portableDao": true`を追加すると、通常の`npm run target:build -- dev-gas`に比較用2ファイルを含めます。このフラグは提供差分では未設定です。clasp push・デプロイは実行していません。

## 入口と対応範囲

GAS比較用入口：dojoPortableGetSystemContext / dojoPortableGetTimeTravel / dojoPortableSaveTimeTravel。出席Coreの比較用入口はdojoPortableRegisterAttendanceCoreです。既存WebConnectのルートは置き換えていません。

Nodeは生成したDojoPortable.cjsのcreateApplication(config, dependencies)から同じ機能を呼びます。configは既存Firestore target形式です。設定読取にはfetchImpl／getAccessToken、出席には同一projectIdのAdmin Firestoreインスタンス、UUID関数、投影処理を注入します。

```js
const {createApplication} = require('./.build/portable-firestore/DojoPortable.cjs');
const app = createApplication(config, dependencies);
await app.getSystemContext();
await app.saveTimeTravel({enabled:true, now:'2099-07-09T10:00:00+09:00', target_month:'2099-07'});
// app.previewAttendance(options, tables) は保存せず結果と書込計画を返す。
```

## 出席の残件

今回移植したのはattendanceCore_registerBatch_です。先生による受付API全体（registerAttendanceBatch）は月次選択・都度請求・級段位更新にもつながるため、置換していません。

出席Coreにも会費状態Viewの再構築が含まれます。GAS比較用入口は既存paymentStatusView_projectAttendances_へ接続します。Firestoreはその完全な移植がまだなので、projectAttendancesが未注入なら登録前に停止します。テストの投影代替関数を実運用へ持ち込まないでください。

Firestore投影フックは`projectAttendances(change, transaction, db)`です。まず必要なView等をtransaction.getで読み、投影の書込だけを行う同期関数を返す契約です。返された関数は出席書込の後に実行します。トランザクションは再試行されるため、メール送信等の外部副作用を入れません。

次は会費状態Viewの再構築・投影を同じ方式で共通化し、その後に受付APIの月次選択・都度請求連携を接続します。出席登録全体の移植完了とはまだしていません。

## 保存方式の差

- GASはスクリプトロック内で取消→追加→View反映。途中失敗のロールバックはありません。
- Firestoreは読取後、出席とViewを同一トランザクションで書く設計です。attendanceGuards/registrationを更新し並行登録を直列化します。今回の仮実装は全原簿を読むため、小規模な開発検証向けです。
- 設定3項目の保存は従来どおり順次処理です。GASとFirestore間のデータ自動同期・データ移行は含みません。「行き来」は同じコードから生成する接続先の切替です。
- GAS設定の重複キーは最後の行を読み更新します。Firestore設定はキーを文書IDにするため一意です。
- Nodeの業務日付処理はGASのスクリプトと同じAsia/Tokyo環境で実行してください。出席元ソースのローカルDate生成を維持しています。

共有ファイル参照に合わせ、既存Dockerfileのビルドコンテキストはリポジトリ直下へ変更しました：`docker build -f cloud/member-read/Dockerfile .`。今回Dockerビルド／配備は行っていません。

Firestoreトランザクションの読取先行・再試行の契約は[公式仕様](https://firebase.google.com/docs/firestore/manage-data/transactions)に合わせています。
