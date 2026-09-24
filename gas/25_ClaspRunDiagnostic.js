// API実行の疎通だけを確認する。Sheets・設定・外部サービスを参照しない。
// demo/prodの *Diagnostic.js 除外ルールにより開発側だけへ含める。
function runner_clasp_ping() {
  return { ok: true, probe: "clasp-api-ping-v1", storage_access: false };
}
