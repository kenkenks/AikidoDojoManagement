# P3-5 Pyodideメモリ使用量の分析

実施日: 2026-10-24  
対象: Pyodide 0.27.7 / Headless Chrome / iPhone原画像 2880×3840  
範囲: 独立PoCのみ。既存画面・前処理本体は未変更。

## 結論

P3-4の約812 MiBは、格子検出・罫線追跡そのものではなく、オフライン評価用の一括画像生成が主因だった。

精密な格子検出・罫線追跡・441交点・Coons境界を変えず、出力生成だけを10×10セル×4区画へ分割した結果、WASMヒープ高水位を計測可能な同条件で696.63 MiBから169.50 MiBへ75.7%削減できた。処理時間は115.229秒から104.056秒へ9.7%短縮した。

格子外周、縦横21本、candidate/review/blank 34/20/346、400カード、記入済み27/27は維持した。

ただしiPhone Safari実機では未検証である。169.5 MiBのWASMヒープにSafari・ページ・画像デコード等のネイティブメモリが加わるため、iPhoneでの成功はまだ主張できない。

## 計測方法

- Pyodide 0.27.7をWeb Workerで実行
- パッケージはNumPyとPillowのみ
- 同じiPhone原画像と同じ紙四隅を使用
- 各段階でGCを実行後、`HEAP8.buffer.byteLength`を記録
- 明示的に保持しているNumPy配列の`nbytes`も別記録
- Emscripten仮想FSの出力ファイル総量を一括版で記録
- Pythonの全割当を追跡する`tracemalloc`は、処理を10分以上へ遅延させたため正式測定から除外

WASMヒープ値は確保済み容量であり、現在使用量や端末RSSそのものではない。一度拡張したヒープはオブジェクト解放後も縮小しないため、最大到達水準の指標として扱う。

## 一括版の段階別結果

| 段階 | WASMヒープ | 仮想FS出力 | 解釈 |
|---|---:|---:|---|
| 画像デコード | 139.38 MiB | 0 | Pyodide・パッケージ・入力JPEGを含む初期高水位 |
| 紙全体の射影変換 | 139.38 MiB | 0 | 増加なし |
| 格子自動検出 | 139.38 MiB | 0 | 増加なし |
| 6400×3600通常補正画像 | 240.94 MiB | 2.37 MiB | +101.56 MiB |
| 6400×3600文字抽出画像 | 347.00 MiB | 2.37 MiB | +106.06 MiB |
| ラベルカード100枚 | 499.75 MiB | 5.27 MiB | `raw_cards`保持で+152.75 MiB |
| ラベルカード200枚 | 499.75 MiB | 8.25 MiB | 既確保領域内 |
| ラベルカード300枚 | 499.75 MiB | 11.46 MiB | 既確保領域内 |
| ラベルカード400枚 | 595.81 MiB | 14.76 MiB | +96.06 MiB |
| 一覧・テンプレート等完了 | 696.63 MiB | 26.33 MiB | +100.82 MiB |

P3-4の非計測版は完了時812.31 MiBだった。WASMの成長単位や実行時の一時確保で値は変動するが、増加段階は今回の非侵襲フックで特定できた。

## 精密処理とNumPy配列

4分割版の段階別ヒープは次のとおり。

| 段階 | WASMヒープ | 明示的な生存NumPy配列 |
|---|---:|---:|
| デコード～横罫線追跡 | 141.25 MiB | gray 5.29 MiB + dark 5.29 MiB |
| 縦罫線追跡・441交点 | 169.50 MiB | 同上 |
| 縦線分追跡 | 169.50 MiB | 同上 |
| Coonsメッシュ生成 | 169.50 MiB | 同上 |
| 4区画の補正・400カード | 169.50 MiB | 同上 |

最大の精密処理由来の恒久的な拡張は、縦罫線追跡・441交点生成時の28.25 MiBだった。以後、Coons補正とカード生成ではヒープ容量が増えていない。

### 一時配列

- `gray`: 2800×1980 uint8、5.54 MB
- `dark`: 2800×1980 bool、5.54 MB
- 縦罫線追跡では `gray.astype(float64)` が一時的に約44.35 MBを生成する
- 動的計画法の`evidence`、`costs`、`back`は罫線ごとに生成・解放される
- 横罫線追跡にもfloat64のevidence/cost配列があるが、ヒープ高水位は増加しなかった
- Coonsメッシュは25,600パッチのPythonタプルを保持するが、追加ヒープ拡張は発生しなかった

float64をfloat32へ変更すれば一時領域を減らせる可能性はある。しかし数値経路を変えるため今回は試しておらず、精度維持済みの改善策には含めない。

## 主因

1. 6400×3600 RGB画像を複数同時保持
   - 1枚の生画素は約65.92 MiB
   - `normalized`と`character_normalized`を同時保持
   - さらにtemplate、diff、ideal overlayを生成
2. 400枚のラベル済みカードを`raw_cards`へ保持
   - 1枚320×214 RGBの生画素は約0.196 MiB
   - 400枚で約78.4 MiBに加え、Pillow内部バッファと一時コピーが発生
3. 400カード一覧画像の生成
   - 3600×2420 RGBと400回のresizeを追加
4. 仮想FS出力の累積
   - 最終26.33 MiB。影響はあるが、約700 MiBの主因ではない
5. WASMヒープは高水位から縮小しない
   - `del`とGCは再利用を可能にするが、`HEAP8.buffer.byteLength`は小さくならない

## 改善実験

実験名: `exact_tracking_quadrant_output`

- 罫線検出、横罫線追跡、縦罫線追跡、441交点、Coons境界は一括版と同じ
- 6400×3600の全体補正画像を作らない
- 3200×1800の10×10区画を1枚ずつ生成
- 各区画から100カードを保存したら区画画像を解放
- 400カードをメモリ上の一覧へ保持しない
- 評価専用のtemplate、diff、ideal overlay、contact sheetを生成しない

| 指標 | 一括版 | 4分割版 | 改善 |
|---|---:|---:|---:|
| WASMヒープ高水位 | 696.63 MiB | 169.50 MiB | -75.7% |
| P3-4観測値との比較 | 812.31 MiB | 169.50 MiB | -79.1% |
| Python処理時間 | 115.229秒 | 104.056秒 | -9.7% |
| 格子外周 | (139,399)–(2097,1827) | 同一 | 0px |
| 21×21罫線 | 成功 | 成功 | 維持 |
| 400カード | 成功 | 成功 | 維持 |
| スクリーニング | 34/20/346 | 34/20/346 | 同一 |
| 記入セル | 27/27 | 27/27 | 見落とし0 |

## iPhone実機検証への判断

条件付きで次の独立実機検証へ進める。

- 既存画面にはまだ統合しない
- 4分割版だけを独立Workerとして実機実行する
- Safariのページ再読込、低メモリ終了、バックグラウンド移行を記録する
- 処理時間、完走率、端末発熱を確認する
- 400カードと27/27を再確認する

169.5 MiBはP3-4より大幅に改善したが、安全余裕を保証する値ではない。実機で失敗した場合は、解像度またはfloat型を変更する前に、入力JPEG・Pillow画像・仮想FSファイルの明示解放を追加した独立実験を優先する。

## 成果物

- `work/paper-attendance-grid-auto-detect-pyodide-poc/profile_runner.py`
- `work/paper-attendance-grid-auto-detect-pyodide-poc/profile_worker.js`
- `work/paper-attendance-grid-auto-detect-pyodide-poc/profile.html`
- `work/paper-attendance-grid-auto-detect-pyodide-poc/memory-profile-result.json`
- `work/paper-attendance-grid-auto-detect-pyodide-poc/baseline_profile_runner.py`
- `work/paper-attendance-grid-auto-detect-pyodide-poc/baseline_profile_worker.js`
- `work/paper-attendance-grid-auto-detect-pyodide-poc/baseline_profile.html`
- `work/paper-attendance-grid-auto-detect-pyodide-poc/baseline-memory-profile-result.json`
- `work/verify-paper-attendance-grid-memory-pyodide-poc.cjs`

既存PoC成果物、既存画面、既存Worker、精密補正本体、Gemini、出席・会費処理は変更していない。commit、push、deploy、Firestore書込みは実施していない。
