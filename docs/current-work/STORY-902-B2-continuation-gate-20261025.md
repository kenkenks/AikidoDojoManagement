# STORY-902 工程B-2 依存結果・継続判定

## 実装範囲

B-1のManifest LoaderとValidatorを再利用し、確定依存の結果に基づくローカル継続判定を追加した。業務API、Firestore、TimeTrip、Adapter、永続Run ledgerは未接続である。

## 実行結果モデル

結果はイベントIDに対する次の4状態として受け付ける。

- `PASS`
- `FAIL`
- `BLOCKED`
- `UNKNOWN`

結果未登録はMapに項目が存在しない状態として保持し、`UNKNOWN`とは別に `DEPENDENCY_RESULT_MISSING` と診断する。未定義の結果値、重複結果、Manifestに存在しないイベントIDの結果は結果モデル不正となり、全イベントを遮断する。未知IDは `RESULT_EVENT_UNKNOWN` として診断する。

## 継続判定

- Manifest全体が不正：全件 `MANIFEST_INVALID`
- 結果モデルが不正：全件 `RESULT_MODEL_INVALID`
- 仕様未確定：`SPECIFICATION_BLOCKED`
- 暫定依存候補あり：`DEPENDENCY_DEFINITION_BLOCKED`
- 確定依存がPASS以外または未登録：`DEPENDENCY_RESULT_BLOCKED`
- 仕様確定かつ確定依存が全てPASS：`CONTINUATION_CANDIDATE`

全状態で `businessExecutionAllowed=false` とする。継続候補は業務実行許可ではない。

## Manifestの現状

- 47イベントを正常読込
- 継続候補：E010のみ
- 仕様未確定による禁止：46件
- 現行Manifestの確定依存：0件
- 暫定依存候補を持つイベント：24件（依存へ自動昇格しない）

## B-1との接続

`validateManifest()`を直接再利用し、B-1のLoader/Gate公開契約は変更していない。B-1の`completedEventIds`も変更せず、B-2は独立した結果モデルを使用する。

## B-3への引継ぎ

- TimeTrip controllerは継続候補に対しても直ちに動作させず、DEV固定・認証・fixtureを含む実行直前ゲートの一部として接続する。
- 永続Run ledger導入時に、イベント結果の出所、Run ID、入力fingerprint、UNKNOWN復旧状態を結果モデルへ関連付ける。
- 現在の結果モデルはRun IDと入力fingerprintを持たないローカル判定用である。過去Runの結果を業務実行許可へ流用せず、B-3以降の実行直前ゲートで結果の出所と現在の入力を必ず照合する。
- 現在のManifestは確定依存が0件であるため、暫定候補を確定依存へ変更する作業は別途仕様承認が必要。
