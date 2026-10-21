構造進化構想メモ v0.1

2026年10月21日｜検討段階・実装未着手

1. 基本思想

既存の業務処理を、責務の明確な独立した構成要素として整理する。

目指すのは、一括した構造改革ではなく、既存の仕組みを生かしながら発展させる構造進化。

基本原則は次のとおり。

業務の責務と処理の責務を分離する。
各構成要素は独立し、必要な情報を通じて連携する。
実行制御を共通化し、業務ロジックと混在させない。
構造上の制約によって、不適切な依存関係を防ぐ。
AIに曖昧なJobを渡さない。
2. クラス構成（構想）
                    Task（抽象クラス）
                           │
                 ┌─────────┴─────────┐
                 │                   │
                Job                 Unit
                 │                   │
              Sequence            単一処理
                 │
            ┌────┼────┬────┐
            │    │    │    │
         Collect Make Record Post
          Unit   Unit  Unit  Unit


                SequenceCore
                      │
             ┌────────┴────────┐
             │                 │
         Job.Sequence       Workflow
             │                 │
           Unit[]             Task[]
                               │
                         Job / Unit
各クラスの責務
クラス	責務
Task	実行可能な処理の共通抽象
Job	Unitを組み合わせ、業務として成立させる
Unit	個別の処理を実行する
SequenceCore	順序・分岐・繰り返しなどの実行制御
Sequence	Job内部のUnit実行順序を定義する
Workflow	JobとUnitを組み合わせて実行する
重要な構造制約

Jobを構成するためにJobを使用しない。

Job
 └─ Sequence
     └─ Unit[]

これによって、Jobの内部構成に終端を設ける。

一方、WorkflowはTaskを実行するため、JobとUnitの両方を扱える。

Workflow
 ├─ Job1
 ├─ Unit1
 ├─ Job2
 └─ Unit2

なお、Workflowを介した循環参照の防止は別途検討する。

3. 私書箱による連携
           ┌──────────────┐
           │    私書箱     │
           │ EventMailbox │
           └──────┬───────┘
                  │
              イベント通知
                  │
          ┌───────┴───────┐
          ▼               ▼
      Workflow A      Workflow B
          │               │
         Job             Job
          │
         Unit
          │
       イベント発行
          │
          └──────→ 私書箱

私書箱は、業務の実行順序を管理しない。

イベントを受け取り、関係する処理へ通知することで、独立した業務同士の連携を成立させる。

4. CoreとWrapper

従来からの構想を継承する。

Core
汎用的な処理機能を提供する。

Wrapper
Coreのオプションを用途に応じて固定する。

SequenceCoreについても、Job内部のSequenceとWorkflowで共通利用できる可能性がある。

5. 今後の検討事項

今回の段階では、以下を確定しない。

Taskの具体的なインターフェース
JobとUnitの生成・管理方法
SequenceCoreの詳細仕様
私書箱の通知方式
Collect・Make・Record・Postの必須性
既存道場システムへの適用範囲
6. Codexとの共同開発原則

曖昧なJobをCodexへ渡さない。

構想の検討と実装作業を明確に区別する。

Codexには、責務・入出力・完了条件が明確になった作業を依頼する。

今回の構想を理由として、既存システムの大規模な再編を先行させない。

未来くんからの補足

このメモで特に残しておきたいのは、次の関係です。

Task → Job / Unit

Job → Sequence → Unit[]

Workflow → Task[]

Sequence / Workflow → SequenceCore

そして、私書箱は独立した業務間の連携基盤。

この関係が今回の議論で得られた中心部分です。

ファイル名は、例えば、

ARCH-DRAFT_STRUCTURAL_EVOLUTION_20261021.md

がよさそうです。

既存のARCH文書とは区別して、まずは構想段階のメモとして保管するのが適切だと思います。