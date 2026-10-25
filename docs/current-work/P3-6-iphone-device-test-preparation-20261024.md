# P3-6 iPhone実機検証準備

実施日: 2026-10-24  
範囲: 独立PoCの準備のみ。既存画面・API・Firestore未接続。

## 結論

P3-5の169.5 MiB版を利用するiPhone向け独立操作ページを準備した。カメラ画像選択、向き正規化、紙外周の四隅調整、経過時間、キャンセル、エラー詳細、400カード・格子・WASMヒープ結果、結果JSON保存を備える。

数値処理エンジンは実画像を用いたPCブラウザで再実行し、108.958秒、169.50 MiB、400カード、34/20/346、記入済み27/27を確認した。

ただしiPhone Safariでは未実行であり、成功は未確認。iPhoneから安全にアクセスするにはDEV Hostingへの独立PoC配信が必要なため、今回は配信せず承認待ちとする。

## 固定した検証対象

- `profile_runner.py`: 10×10セル×4区画、精密追跡維持版
- `profile_worker.js`: Pyodide 0.27.7、NumPy、Pillow
- PC再実測:
  - Worker全体 108.958秒
  - Python処理 104.636秒
  - WASMヒープ 177,733,632 bytes（169.50 MiB）
  - 格子外周 `(139,399)–(2097,1827)`
  - 縦横21本
  - 400カード
  - candidate/review/blank = 34/20/346
  - 記入済み27/27、見落とし0

## iPhone操作ページ

採用候補:

- `iphone-v2.html`
- `iphone_ui.js`
- `profile_worker.js`（Hosting配信時は直接 `iphone_worker.js` として配置する）
- `profile_runner.py`
- `runner.py`

旧`iphone.html`と`iphone_worker.js`のimportScripts別名経路は配信対象外。別名Worker経由のPCスモークは10分でタイムアウトしたため、成功済み`profile_worker.js`の内容を直接配置する。

### 画面機能

1. `capture="environment"`付き画像選択
2. `createImageBitmap(..., imageOrientation:'from-image')`による向き反映
3. Canvasへ再エンコードしてEXIF依存を除去
4. 紙全体の四隅をタッチ移動
5. 自己交差・面積不足の拒否
6. 画面スリープ抑止の試行
7. 経過時間とキャンセル
8. 完了後の段階別実測時間・WASMヒープ表示
9. Python失敗時の段階、コード、トレース表示
10. 結果JSONの端末保存

## 進捗表示の扱い

PythonからJavaScriptへのリアルタイム段階通知を追加した実験は、同じ処理が10分で完了しなかった。計測済み104秒版を変えないため、実機候補では処理中は「画像処理中」と経過時間を表示し、正確な段階別時間は完了後に表示する。

失敗時の段階はRunner内部の`CURRENT_STAGE`と`error.json`から取得する。処理段階を細かくリアルタイム表示するために性能を悪化させない方針とした。

## メモリ指標

画面に表示する値は `pyodide._module.HEAP8.buffer.byteLength`、すなわちWASMヒープの確保容量である。

次の値ではないことを画面に明記する。

- iPhoneプロセス全体のRSS
- Safari全体の使用メモリ
- 端末の空きメモリ
- 処理途中のネイティブ領域を含む厳密なピーク

iPhone Safariから取得できない指標を推測値として表示しない。

## DEV Hosting配信候補

既存紙取込画面へは接続せず、独立URLのみ追加する案。

想定URL:

`https://dojo-management-dev.web.app/qr/p3-6/iphone.html`

配信候補ファイル:

| 配信先 | 元ファイル |
|---|---|
| `web/qr/p3-6/iphone.html` | `work/.../iphone-v2.html` |
| `web/qr/p3-6/iphone_ui.js` | `work/.../iphone_ui.js` |
| `web/qr/p3-6/iphone_worker.js` | `work/.../profile_worker.js`を直接配置 |
| `web/qr/p3-6/profile_runner.py` | `work/.../profile_runner.py` |
| `web/qr/p3-6/runner.py` | `work/.../runner.py` |

Workerの前処理本体取得先は、Hosting配置時に `/qr/paper_attendance_preprocess.py` へ合わせる必要がある。現在の独立PC検証用 `/web/qr/...` のまま配信しない。

### 影響範囲

- 新規の独立静的ファイル5件のみ
- 既存HTMLからリンクしない
- 認証、WebConnect、Gemini、出席、会費、Firestoreへ接続しない
- Cloud Run、GAS、Firestoreの変更不要
- Firebase Hosting全体のreleaseは更新されるため、ビルド成果物差分監査が必要

## 配信承認後の手順

1. 上記5ファイルだけを`web/qr/p3-6/`へ明示配置
2. WorkerのPython取得URLをHosting用に確定
3. `node work/verify-paper-attendance-p3-6-iphone-v3.cjs`
4. 実画像を用いた配信形態と同一URL構成のPCブラウザスモーク
5. `npm run target:build -- dev-firebase`
6. 配信成果物と現在Hostingの差分監査
7. 承認後にDEV Hostingのみ配信
8. HTTP 200、SHA-256、Pyodide/CDN読込を確認

## iPhone実行手順

1. iPhone Safariで独立URLを開く
2. 「iPhoneで撮影／画像を選択」を押す
3. 紙全体が入るよう撮影する
4. 赤い4点を紙外周へ合わせる
5. 「正面化・格子検出・400カード生成」を押す
6. Safariを前面のまま維持し、画面ロックしない
7. 再読み込み・白画面・強制終了の有無を記録
8. 完了時に400枚、縦横21本、外周、信頼度、時間、WASMヒープを確認
9. 結果JSONを保存して共有
10. 失敗時はエラー詳細と失敗までの経過時間を保存

## テスト結果

- P3-6画面契約: PASS
- JavaScript構文: PASS
- P3-5成功済みWorker再実行: PASS
- 400カード: PASS
- 34/20/346: PASS
- 27/27: PASS
- 169.50 MiB維持: PASS
- iPhone Safari: 未実施
- DEV Hosting配信: 未実施

## 残課題・判断事項

1. 独立PoC 5ファイルをDEV Hosting配信候補へ移す承認
2. Hosting配信前監査とDEV Hostingのみの配信承認
3. iPhone Safariで約2分間完走できるかの実機確認
4. Safari再読込・低メモリ終了・画面ロック・バックグラウンド移行の確認

上記の準備完了時点では、commit、push、deploy、Firestore書込みは実施していない。

## DEV Hosting配信結果（2026-10-24）

- 対象プロジェクト: `dojo-management-dev`
- Hosting URL: `https://dojo-management-dev.web.app/qr/p3-6/iphone.html`
- release ID: `1792801136493000`
- version ID: `e89301f009e4f2e4`
- 配信ファイル: `iphone.html`、`iphone_ui.js`、`iphone_worker.js`、`profile_runner.py`、`runner.py`
- 配信前後差分: 上記5件の追加と自動生成`base_check_manifest.json`の更新のみ。既存成果物の内容差分なし
- HTTP/SHA-256: 5件すべてHTTP 200、ローカル成果物と一致
- 主要既存ファイル: `index.html`、`paper_attendance_review.html`、`paper_attendance_review.js`、`runtime_config.js`がHTTP 200かつローカル成果物と一致
- Cache-Control: HTMLは`no-cache`、JavaScript/Pythonは`no-store`
- PC実画像スモーク: 112.695秒、WASMヒープ169.50 MiB、400カード、記入セル27/27、見落とし0
- Cloud Run: 通常`00047-xlf`が100%、candidate`00078-bir`タグ維持・通常トラフィック0%。変更なし
- 未実施: iPhone Safari実機での撮影・完走確認

Git commit/push、Cloud Run deploy/promote、Firestore書込み、GAS変更は実施していない。

## iPhone Safari実機結果（2026-10-24）

受領ファイル: `p3-6-iphone-2026-10-24T04-09-30-299Z.json`

- Worker全体: 56.960秒
- Python処理: 54.521秒
- WASMヒープ確保容量: 179,699,712 bytes（171.38 MiB）
- 格子自動検出: 0.882秒
- 罫線: 縦21本・横21本
- 検出信頼度: 0.8559
- 400カード: 成功
- 記入済み既知27セル: 27/27、見落とし0
- candidate/review/blank: 53/20/327
- Safari停止・再読込による中断: JSONが最終結果まで保存されているため発生なし

PC基準112.695秒に対して約49.5%の時間で完了した。ヒープはPCの169.50 MiBより1.88 MiB（約1.1%）多いが、同程度の範囲である。P3-6の「Pyodide初期化から400カード生成までiPhone Safariで完走する」という実機合格条件は満たした。

一方、候補セルはPC基準34件から53件へ増加した。見落としは0だが、19件分の追加候補には罫線・印刷文字・撮影条件由来の過検出が含まれる可能性がある。JSONにはカード画像そのものが含まれないため、文字欠け、隣接セル混入、候補53件の妥当性はこの結果だけでは確定できない。画面統合前に、補正画像または代表カードの視覚確認を行う。
