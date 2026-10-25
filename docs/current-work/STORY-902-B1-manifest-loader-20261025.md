# STORY-902 工程B-1 実装記録

## 範囲

工程Aの47イベントManifestを保留ブランチから内容を変更せず再利用し、共通Runnerに先行する静的なLoader、Schema Validation、実行ゲートを実装した。業務API、Firestore、TimeTrip、課金処理は呼び出さない。

## 再利用元

- `story902-progress-hold-20261025:work/story902-event-manifest.json`
- 同ブランチの `work/verify-story902-event-manifest.cjs` にある13項目の静的検証方針
- 同ブランチの引継ぎ資料にある、E010のみ実行可能・暫定30・未確定16という工程A結果

保留ブランチの切替、マージ、リベースは行っていない。mainに既にあった未追跡E470資産も変更していない。

## 実装契約

- Loaderは既定で `work/story902-event-manifest.json` を読み込み、不正時は構造化された `ManifestValidationError` を返す。
- Validatorはschema version、必須フィールド、ID、種別、日付・時刻、依存先、循環、仕様状態、実装状態を検証する。
- イベント種別はManifestの既存adapter定義から取得し、別の重複定義を作らない。
- Gateの状態は `EXECUTION_CANDIDATE`、`SPECIFICATION_BLOCKED`、`DEPENDENCY_BLOCKED`、`MANIFEST_INVALID`。
- 判定理由はcode/detailとして機械取得できる。
- `businessExecutionAllowed` は全件false。候補判定は業務実行許可ではない。
- 認証、DEV環境、fixture、TimeTripは `deferredRuntimeChecks` としてB-2以降へ明示的に委ねる。
- Manifest全体のvalidationが1件でも失敗した場合、識別可能な正常イベントを含む全要素を `MANIFEST_INVALID` とし、候補判定をfail closedにする。非object要素は配列位置で診断する。

## 現行Manifest結果

- 読込イベント: 47
- Schema validation: PASS
- 実行候補: 1（902-E010）
- 仕様未確定による禁止: 46
- 依存不成立: 0（現行の確定依存に限る）
- Manifest不正: 0

暫定依存候補やExcel行順候補は、工程Aの方針どおり確定依存へ昇格していない。

## B-2への引継ぎ

- 確定依存と暫定候補の承認・昇格ルールを設計する。
- PASS/FAIL/BLOCKED/UNKNOWNを受けた後続継続判定を追加する。
- 現在の `completedEventIds` はB-1単体テスト用の暫定的な静的入力であり、業務実行許可や実行証跡を意味しない。B-2では耐久証跡に基づく依存イベントのPASS/FAIL/BLOCKED/UNKNOWN判定へ置き換える。
- 実行直前の認証、DEV固定、fixture、TimeTrip照合が全てPASSするまで、業務送信を許可しない。
- E010のhistorical individual PASSを47件Runnerの完了依存として流用しない。
