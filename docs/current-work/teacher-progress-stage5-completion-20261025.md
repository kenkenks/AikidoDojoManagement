# 先生向け稽古・審査進捗管理 [5/5] 総合回帰・性能検証

## 結論

基準コミット `258f152` の先生向け一括進捗、受審時期予測、WebConnect認可、一覧UIについて総合検証を完了した。業務コードの修正は不要だった。既存ブラウザ回帰テストのハーネスだけを、現行の AuthGate / SystemContext / PageInitializationManager 契約へ追従させた。

実DEV Firestoreへの書込み、push、deployは実施していない。

## 変更ファイル

- `work/verify-teacher-progress-overview-stage5.cjs`
  - 複数会員・複数級段位について、一括DTOと既存会員別DTOの一致を検証
  - 250会員・400会員のページ取得数と生成時間を測定
- `work/verify-teacher-progress-overview-emulator.cjs`
  - Firestore Emulator上の実ドキュメントで、一括取得から一覧DTO生成まで検証
- `work/verify-fw001-browser.cjs`
  - 現行の認証・初期化ライフサイクルを再現するモックへ更新
  - 保存確認actionは現行の `attendance_saved_state` と従来の `member_attendance_state` の双方を契約内として検証

## 総合テスト結果

| 区分 | 結果 |
|---|---:|
| 全体回帰 `verify-fw001.cjs` | 225 / 225 PASS |
| 先生一括WebConnect認可 | 4 / 4 PASS |
| 一括/個別DTO・性能 | 2 / 2 PASS |
| 紙出席確認待ち・承認 | 10 / 10 PASS |
| 先生一覧UI契約 | PASS |
| 旧ブラウザ登録回帰 | 3 / 3 PASS |
| Firestore Emulator統合 | PASS |
| `dev-firebase` ビルド | PASS |
| 配信依存関係 | 48ファイル PASS |
| `git diff --check` | PASS |

検証内容には、現在級・次級、必要枠、承認済み枠、繰越、級段位起算日、達成率、残り枠、重複排除、確認待ち除外、90日予測、最低3出席日、未来日・取消除外、TimeTrip基準日、先生・管理者許可、会員・未認証・無効先生・偽装拒否、一覧の1回取得、各ソートと状態表示が含まれる。

## Firestore Emulator

- project: `demo-teacher-progress-stage5`（demo project。非Emulatorサービスへの接続不可）
- 在籍会員: 2件（別に退会会員1件を投入し除外を確認）
- 出席: 4件
- 級段位・審査基準: 複数条件
- 結果: `PASS emulator bulk progress DTO: 2 active members, 4 attendance records`
- DEV Firestoreへの書込み: なし

## 性能測定

ローカルの同一プロセス内モックストレージ、ページサイズ100件で測定した。時間は環境依存の参考値である。

| 会員数 | 出席レコード | ページ取得 | DTO生成時間 |
|---:|---:|---:|---:|
| 250 | 5,002 | 56 | 27.62 ms |
| 400 | 8,002 | 87 | 34.06 ms |

`readById` と `queryEqual` は0回で、会員単位のN+1取得はない。取得回数は会員数そのものではなく、会員・出席・マスタ各コレクションのページ数に比例する。

## 安全上限と残課題

- 一括readerには1コレクション10,000行の安全上限がある。500会員×20枠相当（出席10,002件）は `PROGRESS_PAGE_LIMIT` でfail closedになる。今回、この上限は変更していない。
- 実DEVの実データ量・ネットワーク遅延を含む応答時間は未検証。
- iPhone実機の画面操作と実先生アカウントでの表示は未検証。
- 第3回デモ前に、DEVへ配信後、先生認証で一覧表示・ソート・参考予測をread-only確認する必要がある。

## 第3回デモ準備状況

ローカルコード、認可、計算、UI契約、Emulator、ビルドはデモ準備完了。実環境確認はHosting/Cloud Runの配信判断後に行う。10,000件上限に近づく運用規模では、期間・ページング方針を別工程で設計する。
