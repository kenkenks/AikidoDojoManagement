# 紙出席簿読み取り デモ版統合結果

実施日: 2026-10-21

## 統合内容

- 確定済み `paper-attendance-preprocess-prototype.py` を変更せずWeb配信資産へ複製した。
- Web Worker内のPyodideで、1/2縮小粗探索と元画像局所精密探索を実行する。
- 既存の `paper_attendance_ocr`、Vertex AI `gemini-2.5-flash` Adapter、`candidates` DTO、20×20確認画面を維持した。
- 進捗、経過時間、Worker終了およびOCR通信中断によるキャンセルを追加した。
- 補正済み4区画は一枚ずつデコードして縮小合成し、メインスレッドで4枚を同時展開しない。

## 同一帳票回帰

| 項目 | 結果 |
| --- | ---: |
| 生成カード | 400 |
| candidate / review / blank | 33 / 0 / 367 |
| 正解記入セル | 27/27 |
| 見落とし | 0 |
| カード361 | candidate / ink 8716 |
| カード362 | candidate / ink 5354 |
| カード381 | candidate / ink 7940 |
| カード382 | candidate / ink 5855 |

ローカルネイティブPythonでの統合Runner実測は約225秒。段階別では横罫線追跡137,682ms、1/2縦交点67,014ms、縦罫線追跡11,732ms、カード生成11,064msだった。

同一Runnerの先行ブラウザ実測は421,969ms、WASM heap 375,783,424 bytes。これはデスクトップのアプリ内ブラウザ値であり、実機スマホ値ではない。

## 補正画像＋Gemini実接続

- engine: `vertex-gemini`
- model: `gemini-2.5-flash`
- 入力: 補正4区画を2400×1350へ合成したJPEG（567,888 bytes）
- 応答時間: 28,494ms
- 候補: 27件
- 正解記入セル検出: 27/27
- 空白誤検出: 0
- 日付完全一致: 22/27（81.48%）
- review申告: 0件

日付の誤読5件をGemini自身がreviewにしていないため、先生による最終確認は引き続き必須。

## テスト

- 紙取込画面・登録テスト: 27件PASS（Node test 10件＋画面契約17件）
- OCR・認証・入力制限: 13件PASS
- Python構文: PASS
- JavaScript構文: PASS
- `dev-firebase` build / Cloud Run deploy unit検証: PASS
- `git diff --check`: エラーなし（既存改行警告のみ）

## 未確認

- 実機スマホでの処理時間、ピークメモリ、長時間処理中のOSによるWorker停止は未確認。
- ローカル検証環境からアプリ内ブラウザのlocalhostへ到達できず、今回追加した進捗表示とキャンセルの実ブラウザ操作は静的契約確認まで。デプロイは行っていない。
