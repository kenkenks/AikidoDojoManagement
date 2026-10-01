# Time Travel current route

Time Travel のGAS本番経路は `gas/sup_timeTravel.js` を入口とし、`createSheetContext()` / `ctx.settings` を通じて既存の `99_設定` を使用する。
旧 `DojoTimeTravel*` 生成物・Entry・Step2 GAS builder は撤去済みで、本番経路には使用しない。

Firestore側は `tools/build-time-travel-firestore.mjs` が `.build/portable-timetravel-firestore/DojoTimeTravelFirestore.cjs` を生成する。
構成は `TimeApplicationCore -> DAO_Business_Setting -> Firestore Core` で、旧 generic Portable DAO / `TimeApplicationStep2` には依存しない。

主な確認:

```bash
node --test work/verify-time-travel-entry.cjs
node --test work/verify-time-travel-firestore-composition.cjs
node --test work/verify-pdd001-setting.cjs
node tools/build-time-travel-firestore.mjs
```
