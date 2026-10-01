# Development Workflow v1

## 1. Purpose

開発作業における基準ソース、Patch適用、検証、Baseline更新の手順を固定し、
作業状態の不整合を防止する。

この文書を開発作業手順の Single Source of Truth とする。

## 2. Baseline

初期Baselineは、合意した基準ZIPとする。

現在の開発では次を初期Baselineとする。

- `AikidoDojoManagement-main(56).zip`

ただし、次のPatchを作成するときの基準は初期ZIPそのものではない。

初期Baselineに、これまでPASSしたPatch相当を順番に反映した状態を
`Current Baseline` とする。

## 3. Standard Workflow

```text
Initial Baseline (56 ZIP)
        ↓
PASS済みPatchを順番に反映
        ↓
Current Baseline
        ↓
次Patchを作成
        ↓
Patchリンクを提示
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
Patch相当をCurrent Baselineへ反映
        ↓
次工程
```

## 4. Invariant

**次のPatchは、必ず直前のPASS済み状態を反映したCurrent Baselineから作成する。**

Patchをユーザーへ渡しただけでは、その工程は完了していない。
Build / TestのPASSを確認し、そのPatch相当をCurrent Baselineへ反映して初めて完了とする。

## 5. Drive Policy

Google Driveは、原則としてPatchなどの成果物を受け渡す場所として使用する。

通常作業で、Drive上のソースをCurrent Baselineとして読み直さない。
Current Baselineは、初期BaselineとPASS済みPatch履歴から管理する。

## 6. Resynchronization

通常作業ではZIP再取得やソース再コピーを行わない。

