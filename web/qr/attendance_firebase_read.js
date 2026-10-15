(function(root) {
  "use strict";
  // Fail closed: the member principal may read only its own saved attendance.
  // All other attendance actions still require server-side implementation/authorization.
  const ALLOWED_ACTIONS = new Set(["attendance_saved_state", "attendance_session_info", "attendance_rank_options", "member_attendance_state"]);
  async function request(options) {
    const { action, params, runtimeConfig, authClient, apiClient } = options || {};
    if (!runtimeConfig || runtimeConfig.runtime !== "firebase" ||
        !authClient || !apiClient || !ALLOWED_ACTIONS.has(action)) {
      throw new Error("Firebase版ではこの出席操作は未接続です: " + String(action || ""));
    }
    await authClient.ready;
    if (!authClient.getCurrentUser()) throw new Error("Firebaseログインが必要です。");
    const base = String(runtimeConfig.apiBaseUrl || "").replace(/\/+$/, "");
    if (!base || !/^https:\/\//.test(base)) throw new Error("Firebase APIの接続先が未設定です。");
    const url = new URL(base + "/api/webconnect");
    for (const key of ["action", "member_id", "attendance_date", "location_id", "billing_block_id"]) {
      const value = key === "action" ? action : params && params[key];
      if (value !== undefined && value !== null && String(value).trim()) url.searchParams.set(key, String(value));
    }
    const response = await apiClient.request(url.toString(), { method:"GET" });
    if (!response.ok) throw new Error("出席情報取得に失敗しました（HTTP " + response.status + "）。");
    return response.json();
  }
  root.DOJO_ATTENDANCE_FIREBASE_READ = Object.freeze({ request });
  async function register(options) {
    const {input,runtimeConfig,authClient,apiClient} = options || {};
    if (runtimeConfig?.runtime !== 'firebase' || !authClient || !apiClient)
      throw new Error('Firebase出席登録の接続が未設定です。');
    await authClient.ready;
    if (!authClient.getCurrentUser()) throw new Error('Firebaseログインが必要です。');
    const base=String(runtimeConfig.apiBaseUrl || '').replace(/\/+$/,'');
    if (!/^https:\/\//.test(base)) throw new Error('Firebase APIの接続先が未設定です。');
    const response=await apiClient.request(base+'/api/webconnect',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'attendance_batch',input})
    });
    let result;
    try {result=await response.json();} catch {throw new Error('出席登録の応答を確認できませんでした。再取得してください。');}
    if (!response.ok || result?.ok !== true)
      throw new Error(result?.message || '出席登録に失敗しました（HTTP '+response.status+'）。');
    return result;
  }
  root.DOJO_ATTENDANCE_FIREBASE_WRITE = Object.freeze({ register });
})(typeof window !== "undefined" ? window : globalThis);
