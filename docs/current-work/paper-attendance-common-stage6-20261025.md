# 紙出席簿共通化 [6/6] 総合回帰・動作検証

## 結論

会員の紙出席OCR・確認・修正・確認待ち登録から、先生の一覧・個別承認・確定進捗反映までの6工程は、ローカル回帰およびFirestore Emulatorの読み書き検証で完了条件を満した。実DEV Firestoreと実iPhoneの承認導線は未検証で、push/deployも未実施。

## 業務フローの検証

1. 共通readerは先生・会員で同一のOCR割当、400セル編集、差分計算を使用。
2. 会員principalの本人送信はサーバーが `member_submission_authorized` を付与し、`確認待ち`・請求書込みなしで保存。
3. `確認待ち` は saved-state の重複防止に含まれるが、出席時間・審査進捗には含まれない。
4. 先生principalのみが確認待ち一覧と承認を実行でき、承認はFirestore transactionで同一ドキュメントを `確認済` へ更新。
5. `確認済` は出席時間・審査進捗に含まれ、saved-stateでは引き続き重複防止対象。
6. 会員再送でドキュメントは増えず、承認後再送で `確認済` から戻らない。再承認は `already_confirmed=true` で書込みなし。
7. 紙専用枠は既存契約どおり `skip_billing=true` / `billing_allowed=false`。承認前後とも請求・月次選択・Viewの新規書込みは0件。

## 認証・認可

- OCR：未認証・他人は拒否、会員本人と有効先生のみ許可。
- 会員登録：認証UIDから解決した `member_id` 本人限定。`autoApprove`、`teacher_id`、承認済指定を信用しない。
- 先生承認：認証UIDから解決した有効 `teacher_id` 限定。会員・未認証・クライアント偽装を拒否。
- 先生の従来の直接登録は従来どおり `有効` で保存し、請求含む15/15の登録回帰でPASS。

## 旧Step 8Bの2件

Step 8Bは、Firebase出席writeが未接続だった時点の「`attendance_batch` は404」「`WebConnectCore.resolve()` はnull」を固定していた。第4段階で既存WebConnectに正式接続し、サーバーで本人/先生認可を行う現行仕様と矛盾していた。実装を変更せず、不正payloadは400でDAO呼出し0、未対応 `post_receipt` は404、`attendance_batch` は `attendance.registerBatch` へ解決される現行契約を検証するよう修正し、4/4 PASS。

## Firestore Emulator

- 専用project：`demo-paper-attendance-stage6`、Firestore：`127.0.0.1:8086`。DEV/本番への接続はない。
- Admin SDKと実Firestore transactionで、固定紙専用マスタ、会員1名をEmulatorのみに作成。
- 確認待ち1件、会員再送後も1件、承認後も同一1件、再承認無書込み、承認後再登録で確認済維持、進捗0→1、請求系3collectionが0件を確認。PASS。
- Emulatorは実行後停止済み。永続データなし。

## テスト結果

- 業務・契約・画面・認可・DAO/DTO・進捗：176/176 PASS。
- Firestore Emulator総合：1/1 PASS。
- 合計：177 PASS / 0 FAIL。
- P3-8実iPhone画像のヘッドレスPyodide回帰：400カード、21×21罫線、既知記入27/27、WASM heap 139.6875 MiB。処理時間 298,939 ms（実行環境の性能差があるため性能回帰の合否判定には使用せず、完走と精度を確認）。
- `npm run target:build -- dev-firebase`：PASS。配信依存関係：47 reachable local files PASS。

## 実Firestore未検証と残課題

- `dojo-management-dev` への確認待ち登録・承認は未実施。実データを変更するため、デプロイ後にDEV専用会員と専用日付を固定し、事前/事後スナップショットとcleanup承認を別途必要とする。
- iPhone Safari上の最終会員→先生二者操作は未検証。自動検出精度は撮影条件に依存し、手動四隅補正のフォールバックを維持する。
- push/deployは未実施。Cloud RunとHostingの両方に差分があるため、第3回デモ前に分離配信監査と配信後の認証付きread/write検証が必要。
