# P3-8 紙出席記録の自動認識 DEV実画面統合

実施日: 2026-10-24  
範囲: ローカル実装・検証のみ。commit、push、deploy、Firestore、Cloud Run、GASは変更していない。

## 結論

P3-7の用紙外周検出とP3-6の正面化・格子自動検出を既存の紙出席記録画面へ接続した。黒台紙の横撮影実画像は、Production Workerで21×21罫線、400カード、既知記入セル27/27を達成した。P3-6基準画像も既知の手動用紙四隅で27/27を維持した。

## 変更ファイル

- `web/qr/paper_attendance_review.html`
- `web/qr/paper_attendance_review.js`
- `web/qr/paper_attendance_preprocess_worker.js`
- `web/qr/paper_attendance_preprocess_runner.py`
- `web/qr/paper_attendance_paper_detector.js`（新規）
- `web/qr/paper_attendance_rectify.py`（新規）
- `work/verify-paper-attendance-review.cjs`
- `work/paper-attendance-p3-8-integration-evaluate.html`（新規検証用）
- `work/verify-paper-attendance-p3-8-integration.cjs`（新規検証用）

既存の `paper_attendance_preprocess.py`、Gemini Adapter、API、DTO、登録処理、会費処理、認証共通基盤は変更していない。

## 実画面への統合内容

1. 画像選択後、ブラウザ側でP3-7用紙検出器を実行する。
2. 物理用紙が画像座標上で縦向きの場合、四隅順を90度回転して横長の正面化出力へ合わせる。
3. 用紙四隅をプレビューし、自動検出失敗時は安全な初期四角形から手動調整できる。
4. 用紙四隅と格子四隅は別変数で保持し、調整対象を画面で切り替える。
5. Runnerが用紙を射影変換し、P3-6の格子自動検出からSEEDを生成する。
6. 格子を手動指定した場合は、その原画像座標を射影変換して既存の精密処理へ渡す。
7. 既存の21×21追跡、441交点、Coons補正、400カード生成、Gemini送信以降を継続する。

四隅が画像端へ接する場合は撮り直し警告を表示する。推奨撮影条件は黒台紙または濃い背景での横撮影だが、専用台紙を必須にはしていない。

## 画像縮小率

- 範囲: 50～100%
- 刻み: 5%
- 初期値: 100%
- 縦横同倍率
- 開始時に値を固定し、処理中は操作不可
- スライダー操作だけでは再解析しない
- CanvasでEXIF反映後の表示向きのままJPEG化し、正規化座標を維持する
- Runnerの正面化解像度にも同倍率を適用する

## 実画像比較

| 画像・条件 | 倍率 | 結果 | 時間 | WASMヒープ | 既知セル |
|---|---:|---|---:|---:|---:|
| P3-7黒台紙・横撮影・自動用紙 | 100% | 21×21、400カード | 63.308秒 | 139.69 MiB | 27/27 |
| P3-6基準・既知手動用紙四隅 | 100% | 21×21、400カード | 63.393秒 | 139.69 MiB | 27/27 |
| P3-7独立PoC（比較元） | 100% | 21×21、400カード | 384.720秒 | 167.62 MiB | 27/27 |

Production Workerでは既存の1/2粗探索を利用するため、独立PoCより短時間・低ヒープだった。PC Chromeの値であり、iPhone Safariの完走を意味しない。

## 50～95%実測

黒台紙画像を同一Production Workerで実測した。精度保証のためアルゴリズム閾値は変更していない。

| 倍率 | 結果 | 段階・理由 | 時間 | ヒープ |
|---:|---|---|---:|---:|
| 50% | 失敗 | grid_detection / GRID_LINE_SPACING_UNSTABLE | 未完走 | 未確定 |
| 55% | 失敗 | vertical_intersections_half / HALF_VERTICAL_LINES_NOT_MONOTONIC | 未完走 | 未確定 |
| 60% | 失敗 | 同上 | 未完走 | 未確定 |
| 65% | 失敗 | 同上 | 未完走 | 未確定 |
| 70% | 失敗 | 同上 | 未完走 | 未確定 |
| 75% | 失敗 | 同上 | 未完走 | 未確定 |
| 80% | 失敗 | 同上 | 未完走 | 未確定 |
| 85% | 失敗 | 同上 | 未完走 | 未確定 |
| 90% | 成功、27/27 | 21×21、400カード | 60.323秒 | 116.38 MiB |
| 95% | 成功、27/27 | 21×21、400カード | 62.093秒 | 116.38 MiB |

50～85%は選択可能だが、現画像では安全検査により停止する。未検証精度を保証しないという仕様に合致する。デモでは100%を初期値のまま推奨する。

## 回帰テスト

- JavaScript構文: PASS
- Python構文: PASS
- 紙取込画面契約: 33/33 PASS
- 紙取込差分登録: 16/16 PASS
- OCR契約・認可・入力制限: 13/13 PASS
- 初期化8B: 4/4 PASS
- 初期化9.1: PASS
- Firebase/GAS出席状態経路: PASS
- 会費基本・受付スコープ: PASS
- P3-8 Production Worker実画像2件: PASS
- `npm run target:build -- dev-firebase`: PASS（46ファイル依存検証）
- `git diff --check`: PASS（改行警告のみ）

ビルド済みの7関連ファイルはソースとSHA-256一致を確認した。

## DEV Hosting配信範囲

Hostingへ必要なのは以下の静的資産である。

- `paper_attendance_review.html`
- `paper_attendance_review.js`
- `paper_attendance_preprocess_worker.js`
- `paper_attendance_preprocess_runner.py`
- `paper_attendance_paper_detector.js`
- `paper_attendance_rectify.py`
- 既存 `paper_attendance_preprocess.py`

Firebase Hostingは公開ディレクトリ単位で配信されるため、配信前にビルド全体と現行Hostingとの差分監査が必要。Cloud Run、Firestore、GASはP3-8では更新不要。

## 残課題

- iPhone Safari実機で100%・90%の処理時間、ヒープ指標、ページ再読込有無を確認する。
- 黒台紙なし、影、明色背景、少ない余白の追加実写を評価する。
- 50～85%は現画像で完走しない。精度を変える最適化は本工程の範囲外。
- 候補68件・要確認31件は記入判定の別課題であり、用紙・格子検出成功とは分離する。
- 自動格子失敗後の手動格子四隅操作を実機タッチで確認する。

