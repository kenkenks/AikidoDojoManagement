# Development Workflow v1

## 1. Purpose

開発作業における基準ソース、Patch適用、検証、Baseline更新の手順を固定し、
作業状態の不整合を防止する。

この文書を開発作業手順の Single Source of Truth とする。

## 2. Baseline

現在の `Current Baseline` は、直前までのPASS済み変更とユーザー側commitを反映した、
Google Drive共有フォルダ上の日付workspace内の基準ソースとする。

2026-10-01時点のCurrent Baselineは次のとおり。

- `workspace/20261001/AikidoDojoManagement-main-58/`
- 対応する受け渡し用ZIP: `workspace/20261001/AikidoDojoManagement-main(58).zip`

ZIP、展開済みフォルダ、ユーザーのローカルGit repoは、同じCurrent Baselineを指すものとして管理する。
次のPatchは、必ず直前のPASS済み状態を反映したCurrent Baselineから作成する。

PASS後にcommit / pushした場合は、次のPatchを作る前にそのHEADを共有Driveの
Current Baselineへ反映する。直前Patchをローカルへ適用済みだが未commitの状態で
追補Patchが必要になった場合は、古いcommit済みBaselineを現在状態とみなさず、
必要な対象ファイルだけを現在のローカル状態から共有workspaceへ同期して差分を作る。

## 3. Shared Google Drive Workspace

道場システムのGoogle Drive共有フォルダを、開発時の補助記憶領域および成果物の受け渡し領域として使用する。

共有フォルダ入口:

- `https://drive.google.com/drive/folders/16HI95-Klq3DKBbwa-zd5BNc8-uS30Q3-?usp=sharing`

ユーザーのローカルPCでは同じ領域が `G:` ドライブ配下として見える場合があるが、
開発手順上の「共有フォルダ」は上記Google Drive共有フォルダを意味する。
ChatGPTは共有URLを入口として直接参照し、ローカルPCの `G:` パスへのアクセスを前提としない。

日付workspaceには、Current Baseline、対応ZIP、Patch、検証用成果物などを配置する。
例:

```text
workspace/20261001/
  AikidoDojoManagement-main-58/    # Current Baseline
  AikidoDojoManagement-main(58).zip
  *.patch
```

古いBaselineや失敗PatchをCurrent Baselineとして扱わない。

## 4. Standard Workflow

```text
Current Baseline
        ↓
次Patchを作成
        ↓
Build / Testを実行
        ↓
Patchを機械生成
        ↓
git apply --check 相当で適用可能性を検証
        ↓
共有DriveへPatchを格納
        ↓
ユーザーがローカルrepoへ git apply
        ↓
指定されたBuild / Testを実行
        ↓
実行ログを返却
        ↓
結果を確認
        ↓
PASS
        ↓
ユーザーが git commit
        ↓
その状態を次のCurrent Baselineとする
        ↓
次工程
```

Patchのhunkを手書きしない。
Current Baselineの実ファイルを編集し、差分からPatchを生成し、適用検証してから渡す。

## 5. Invariant

**次のPatchは、必ず直前のPASS済み状態を反映したCurrent Baselineから作成する。**

Patchをユーザーへ渡しただけでは、その工程は完了していない。
ユーザー側でBuild / TestのPASSを確認し、commitした状態を次のCurrent Baselineとして確定して初めて完了とする。

`git apply` が想定外に失敗した場合は作業を停止し、BaselineとPatchの不一致を確認する。
直ちにZIP再提出や推測によるPatch修正へ進まない。

## 6. Remote / Drive Workflow

出先など、ユーザーが開発PCを操作できない場合は、共有DriveのCurrent Baselineを起点として作業する。

```text
Google Drive Current Baseline
        ↓
ChatGPT作業環境へ取得
        ↓
実装
        ↓
npm run schema:build
        ↓
Node Build / Test
        ↓
PASS
        ↓
Patch生成・適用検証
        ↓
共有DriveへPatchを格納
        ↓
ユーザーが後でローカルrepoへ git apply
        ↓
ユーザー側Build / Test
        ↓
PASS
        ↓
ユーザーが git commit
```

2026-10-01に、Google Drive上の `AikidoDojoManagement-main(58).zip` を直接取得し、
ChatGPT側の一時実行環境へ展開して `npm run schema:build` とNodeテストを実行できることを確認した。

現時点ではcommitはユーザー側で行う。
ChatGPT側でのcommit/pushはRemote Workflowの必須条件としない。

## 7. Build Entry Point

Schema / Definitionに関係する生成は、個別の生成ターゲットを直接操作せず、
ユーザー向け入口を次に統一する。

```powershell
npm run schema:build
```

生成物を直接編集しない。
必要な生成処理は `schema:build` から到達できるように構成する。

## 8. Resynchronization

通常作業では、ユーザーへZIPやソースの再アップロードを要求しない。
共有DriveのCurrent Baselineを直接参照できる場合は、それを使用する。

再同期が必要なのは、Baselineの対応関係が確認できない、Drive上のCurrent Baselineが欠損している、
またはローカルGitとの不一致が実証された場合などの例外時とする。

## 9. Future Issues

今後の運用で、次を課題として検討する。

- Remote作業時に正規Git履歴を維持し、ChatGPT側で安全にcommitする方法。
- checkout / commit / pushをどこまで委譲するか、および認証と誤push防止の境界。
- PASS・commit後のCurrent BaselineをGoogle Driveへ安全に同期する方法。
- 複数Patchが蓄積した場合の適用順、依存関係、適用済み状態の管理。
- GAS実環境、Firestore実接続など認証を必要とするE2EをRemote Workflowでどこまで実行できるか。
- ZIP、展開済みフォルダ、ローカルGit commit hashの対応関係をより機械的に保証する方法。
- 古いBaseline、失敗Patch、無効成果物をCurrent Baselineと誤認しない整理・識別方法。

この手順は固定仕様ではない。実運用で問題が発生した場合は、原因を確認し、
例外運用を増やすのではなく必要に応じて本手順を更新する。
