# Step 8I: Firebase級段位マスター取得

- 既存 `/api/webconnect?action=attendance_rank_options` の GET に接続。新しいHTTP入口なし。
- Firebase ID Token検証後、admin またはサーバーで紐づけられた member のみ許可。未紐づけ/teacher-onlyは拒否。
- `ranks` Firestoreマスターの有効行のみ、GAS `rankMaster_getOptions` と同じ返却キーに投影。氏名等は返さない。
- GAS画面分岐は保持。Firebase側はGASへフォールバックしない。
- 会員状態取得と出席登録は未接続のまま。QR URLは変更しない。
- Firestore実データとブラウザのE2Eは未検証。Firestoreの `ranks` 実体化を確認すること。
