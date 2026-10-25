# 先生向け稽古・審査進捗管理 第4工程

## 結論

直近90日の承認済み稽古枠から必要枠到達時期を推定する純粋計算層を追加し、Firebase一括readerと先生一覧へ接続した。審査資格の確定判定には使用せず、画面には参考値であることを明記した。

## 予測契約

- 基準日: 既存SystemContextの業務日（TimeTrip対応）
- 対象期間: 基準日を含む直近90日
- 最低履歴: 異なる承認済み出席日が3日以上
- 頻度: 期間内の一意な日付＋slotの枠数 × 7 ÷ 90
- 必要週数: 残り枠 ÷ 週平均枠数を切り上げ
- 8週以下は「約N週間後」、8週超は「約Nか月後」
- 残り0は「必要枠達成」
- 履歴不足、0枠、必要数未設定、現在級・次級未設定は「算出不可」

確認待ち、取消、対象期間外、未来日、同日同slot重複は予測から除外する。画面側では予測計算を行わず、`forecast_label`を表示する。

## 変更ファイル

- `cloud/attendance/progress-summary.cjs`: 既存状態・日付正規化を予測層と共用
- `cloud/attendance/progress-forecast.cjs`: 予測の純粋計算
- `cloud/attendance/progress-firestore.cjs`: 一括取得済みデータとSystemContextを予測へ接続
- `cloud/api/server.cjs`: 既存SystemContext readerを注入
- `web/qr/attendanceCheck.html`: 到達目安と参考値注記を表示
- `work/verify-attendance-progress-forecast.cjs`ほか関連契約テスト

## 検証結果

- 予測・一括reader・既存進捗・認可・先生画面回帰: 42/42 PASS
- WebConnect・HTTP回帰: 19/19 PASS
- UI契約: PASS
- `git diff --check`: PASS
- `npm run target:build -- dev-firebase`: PASS
- 配信依存関係: 48ファイル PASS

## 未実施

第5工程の総合回帰、実環境データ量での性能確認、push、deploy、実通信は未実施。
