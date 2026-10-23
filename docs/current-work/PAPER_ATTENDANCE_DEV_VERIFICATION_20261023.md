# 紙出席記録 DEV 実登録検証手順（工程11C-2B）

## 対象と禁止事項

- 対象プロジェクトは `dojo-management-dev` のみ。
- 会員は `ITER11C2_MEMBER_20261023`、日付は `2026-10-12` のみ。
- 本手順のスナップショットCLIは読取り専用であり、Firestore Emulator有効時は停止する。
- Cloud Run通常トラフィック、Firestore、GAS、本番環境はこの準備工程では変更しない。
- スナップショット出力は `work/paper-attendance-dev-snapshots/` に保存され、Git管理外である。

## 事前テストとビルド

同じ `.build/dev-firebase` を更新する処理は直列で実行する。

```powershell
node work/verify-attendance-step8i-progress.cjs
node work/verify-attendance-summary-firebase.cjs
node work/verify-initialization-step8b.cjs
node work/verify-initialization-step9-1.cjs
node work/verify-paper-attendance-registration.cjs
node work/verify-paper-attendance-review.cjs
node work/verify-paper-attendance-dev-snapshot.cjs
npm run target:build -- dev-firebase
git diff --check
```

## Read-onlyスナップショット

ADCがDEVプロジェクトを読める状態で実行する。対象会員が未作成の場合も、`TEST_MEMBER_NOT_CREATED` として完全な空スナップショットを保存する。

```powershell
node work/snapshot-paper-attendance-dev.cjs snapshot --member-id ITER11C2_MEMBER_20261023 --date 2026-10-12 --output before.json
node work/snapshot-paper-attendance-dev.cjs snapshot --member-id ITER11C2_MEMBER_20261023 --date 2026-10-12 --output after.json
node work/snapshot-paper-attendance-dev.cjs compare --before before.json --after after.json
```

比較は紙専用有効枠数、紙専用時間、対象日確定時間、取消、通常QR出席、請求・会費5コレクションの内容を確認する。通常QRまたは請求・会費の内容差分は異常終了となる。

## Cloud Run candidate（実行は次工程の承認後）

```powershell
npm run target:build -- dev-firebase
node tools/cloud-run-release.mjs stage --execute
node tools/cloud-run-release.mjs verify --execute
```

`stage` は現在のソースを再ビルドし、`.build/dev-firebase/cloud-run/dojo-time-travel-admin` を既存サービス `dojo-time-travel-admin` に `--no-traffic --tag candidate` で配置する。通常100%配信は変更しない。`gcloud run services describe` の `status.traffic` とtag URLで、新revisionが0%、通常revisionが100%であることを確認する。候補URLにはFirebase ID tokenを付け、`attendance_progress_summary` と登録直前プレビューだけを確認する。実登録は承認されたシナリオでのみ行う。

候補版の復旧は、通常配信を操作せず、直前candidate revisionへcandidate tagを戻す。実行前にrevision名を保存し、次のread-only確認後に行う。

```powershell
gcloud run services describe dojo-time-travel-admin --project dojo-management-dev --region asia-northeast1 --format=json
gcloud run services update-traffic dojo-time-travel-admin --project dojo-management-dev --region asia-northeast1 --update-tags candidate=＜直前candidate revision＞
```

## DEV Firebase Hosting（実行は次工程の承認後）

正規手順は次の1コマンドで、DEV Hostingだけをビルド・配信する。Cloud Run、Firestore、GASは配信しない。

```powershell
npm run target:push -- dev-firebase
```

対象ページは `paper_attendance_review.html`、`paper_attendance_review.js`、`paper_attendance_scope.js`。ただしFirebase Hostingはファイル単位deployではなくDEV Hosting成果物全体を公開するため、配信前に `.build/dev-firebase/web/qr/` と現在配信版の意図しない差分がないことを確認する。`runtime_config.js` の `paperAttendance` と `paperAttendanceOcr` だけがcandidate URLを向き、通常API URLが変わらないことを確認する。

配信後はHTTP 200、キャッシュヘッダ、Firebaseログイン、会員先行選択、確定時間、差分表、400セル、登録プレビュー、candidateへの認証付き通信を確認する。書込み承認前は `attendance_batch` を実行しない。

Hosting復旧はFirebase ConsoleのHostingリリース履歴から直前DEVリリースをロールバックする。復旧後、3ファイルと`runtime_config.js`のHTTP 200・SHA-256・接続先を再確認する。

## 実登録後の確認と後片付け方針

- before/afterを比較し、紙枠だけが不足時間分増えたことを確認する。
- 同じ希望時間の再実行ではAPI書込み0件を確認する。
- 請求・会費と通常QRに差分があれば直ちに停止する。
- 後片付けは物理削除ではなく、既存`attendance_batch`の紙専用スコープによる取消を候補とする。ただし別承認まで実行しない。
- 別端末同時登録は、登録直前再取得だけでは原子的に防止できない既知の残課題である。
