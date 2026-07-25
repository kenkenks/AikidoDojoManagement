# GAS性能設計

## 原則

GASではJavaScriptの計算量より、Spreadsheetサービスとの通信回数が応答時間を支配する。
Web画面から呼ばれる処理では、実行入口で生成したSheetContextを終了まで再利用する。

```javascript
const ctx = createSheetContext();
return service(input, ctx);
```

下位関数、日付変換、ループ内処理にも同じ`ctx`を渡す。

```javascript
// NG: 行ごとにSheetContextが暗黙生成される
rows.map(row => formatAttendanceDate_(row["稽古日"]));

// OK: 入口で生成したContextを再利用する
rows.map(row => formatAttendanceDate_(row["稽古日"], ctx));
```

## 禁止事項

- ループ内で`createSheetContext()`を呼ばない
- `ctx`を受け取れる下位関数で、新しいContextを生成しない
- `getSheetByName()`、`getRange()`、`getValues()`を行単位で呼ばない
- ヘッダーとデータを別々のSpreadsheet通信で読まない
- Web応答経路でDebugLogシートへ同期的に`appendRow()`しない

## SheetContextの責務

- `sheetCache`: シートオブジェクトを名前で再利用する
- `cache`: シート行データを再利用する
- `headerCache`: 同じ読込みで取得したヘッダーを再利用する
- `settings`: 実行中の設定とタイムトリップ条件を共有する

## 検証

Context必須関数の引数漏れを静的に確認する。

```bash
node work/verify-gas-context-usage.mjs
```

出席状態取得の回帰確認：

```bash
node work/verify-attendance-read-recovery.mjs
node work/verify-attendance-progress.mjs
```

GAS上では`debug_attendance_getMemberState()`を実行し、次を確認する。

- `load sheet object map`が1回だけである
- `getMemberAttendanceState total`が画面タイムアウトより十分短い
- 出席行数を増やしてもContext生成回数が増えない
