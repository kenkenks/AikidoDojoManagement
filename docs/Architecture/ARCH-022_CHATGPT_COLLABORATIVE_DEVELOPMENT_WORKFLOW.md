# ARCH-022 ChatGPT Collaborative Development Workflow

Version: 1.0
Date: 2026-10-02
Status: ACTIVE

## Purpose

ChatGPTと長期間の開発作業を継続するとき、会話コンテキストをソースコードの転送路として使わず、共有Drive・ローカルGit・チャットの責務を分離する。

目的は次の3点である。

- チャットの肥大化を抑え、長い作業を安定して継続する。
- Patch適用、テスト、commitの境界を明確にし、変更を安全に積み上げる。
- チャット切替や一時的な利用制限が発生しても、作業状態を外部記録から復元できるようにする。

この文書は、実際の開発でZIP受け渡し、ソース貼付、`Get-Content` / `Select-String`、チャット切替、共有Drive＋Patch方式を試した結果として定める。

## Responsibility separation

```text
Google Drive共有workspace
  = Baseline / ZIP / Patch / 状態資料 / 補助成果物

ローカルGit repository
  = 実作業 / Patch適用 / Build / Test / commit

Chat
  = 実行コマンド / 実行ログ / 判定 / 次の指示
```

基本原則は次の一文とする。

**コードは共有workspaceで受け渡し、チャットではコマンドと結果を受け渡す。**

## Standard loop

```text
ChatGPTが共有workspaceの実ファイルを確認
        ↓
必要な変更を作成
        ↓
Patchを共有workspaceへ配置
        ↓
ユーザーへ実行コマンドを提示
        ↓
git apply --check
        ↓
git apply
        ↓
Build / Test
        ↓
ユーザーが結果ログをチャットへ貼付
        ↓
ChatGPTが判定
        ↓
PASSならcommit
        ↓
次のPatch
```

Patchの詳細手順、Current Baseline、Remote Workflowは `docs/dev-workflow/workflow_v1.md` を正規手順とする。

## Chat content rule

チャットへ貼ることを基本とするもの:

- `node --test` 等のテスト結果
- Build結果
- `git status --short`
- `git diff --stat`
- エラースタック
- commit / push結果
- 実行時に必要な短い診断結果

原則としてチャットへ大量に貼らないもの:

- ソースファイル全文
- 長大な `git diff`
- 長い `Get-Content` 出力
- 大量の `Select-String -Context` 出力
- ZIP内コードを会話へ転記したもの

コード調査が必要な場合は、可能な限り共有workspaceのBaseline / ZIP / 実ファイルをChatGPT側で直接確認する。

## Warning signal

`Get-Content` や長い `Select-String -Context` を繰り返しユーザーへ要求し始めた場合、それを**黄色信号**とする。

一時的な診断として短いコード断片を取得することは禁止しない。しかし、それが継続的なコード受け渡し手段になり始めた場合は作業を止め、共有workspaceベースへ戻す。

復旧が順調であっても、この境界を越えない。順調な作業ほど大量貼付が常態化しやすいためである。

## Patch delivery rule

可能な場合、PatchはChatGPTが共有Driveの日付workspaceへ直接配置する。

ユーザーにPatchをダウンロードさせ、手動で別フォルダへ配置させる手順は避ける。

ユーザーへ提示するコマンドは、可能な限り実際のローカルパスを含む、そのままコピーして実行できる形とする。

2026-10-02時点の作業環境:

```text
Local repository:
C:\Users\pxk07\Documents\道場サポ\workspace\clasp_道場サポ

Shared workspace:
G:\マイドライブ\道場サポ\道場システム（共有）\workspace\YYYYMMDD
```

日付workspaceは作業日ごとに切り替える。

## Chat switch rule

チャット切替時に、ソースや過去ログを大量にコピーして引き継がない。

引継ぎ情報は原則として次に限定する。

```text
作業基準: 共有workspaceの日付
HEAD: commit hash
未コミット変更: 対象ファイルまたは件数
現在工程: 何を完了したか
次工程: 次に何をするか
```

実コード、Patch、Baseline、詳細資料は共有workspaceおよびGit履歴から復元する。

チャット切替は会話コンテキストの肥大化には有効だが、すべての制限を解消するものではない。

## Request-overload handling

リクエスト過多や一時的な利用制限は、チャット固有の問題とは限らない。

この種の制限が発生した場合、新しいチャットを作るだけでは軽減されないことがある。チャット切替を繰り返さず、**時間を空けてから再開する**。

原因ごとの基本対処を分離する。

```text
長大な会話 / 大量ソース貼付による重さ
  → 共有workspace方式へ戻す / 必要ならチャット切替

リクエスト過多 / 一時的な利用制限
  → 時間を空ける
```

制限が解消したら、通常の共有workspace＋Patchループへ戻る。

## Character encoding safety

ソースの書換え目的で、文字コードを暗黙変換する可能性のあるPowerShell処理を安易に使用しない。

特に日本語を含むファイルでは、`Get-Content` → 加工 → `Set-Content` のような経路を標準の修正方法にしない。

変更は実ファイルからPatchを生成し、`git apply --check` を通して適用することを基本とする。

## Recovery principle

チャットの記憶を唯一の作業記録にしない。

忘れた場合、迷った場合、作業方法が再び大量コピペ中心になり始めた場合は、このARCHと `docs/dev-workflow/workflow_v1.md` を読み直し、標準ループへ戻る。

## Version history

### v1.0 - 2026-10-02

初版。

実運用から次を固定した。

- 共有Drive / Local Git / Chatの責務分離
- Patch → command → result log の反復
- ソース大量貼付を避ける
- `Get-Content` / 長い `Select-String` 多発を黄色信号とする
- Patchを共有Driveへ直接配置する
- チャット切替時の引継ぎを最小化する
- リクエスト過多はチャット切替ではなく時間を空ける
- 文字コード事故を避けるためPatch適用を基本とする

今後、実運用で新しい問題や改善方法が確認された場合は、例外手順を増やす前に本ARCHを更新し、Versionを上げる。
