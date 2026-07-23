(function() {
  const GAS_URL = "https://script.google.com/macros/s/AKfycbz_Movz5VBZkf8qHdMkR7kkQRkLkYJAbahN5OPStFT8YXnhCuIGJBCdqjy2PwgWaorUfA/exec";
  const callbackName = "systemContextCallback_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
  const script = document.createElement("script");
  const query = new URLSearchParams({ action:"system_context", callback:callbackName, _ts:Date.now() });
  let scriptErrorObserved = false;
  const timeout = window.setTimeout(function() {
    cleanup();
    window.dispatchEvent(new CustomEvent("dojo-system-context-error", {
      detail: {
        message: scriptErrorObserved
          ? "システム時刻の取得中に通信エラーが発生しました。"
          : "システム時刻の取得がタイムアウトしました。"
      }
    }));
  }, 20000);
  script.src = GAS_URL + "?" + query.toString();
  window[callbackName] = function(data) {
    cleanup();
    if (!data || data.ok !== true) return;
    window.DOJO_SYSTEM_CONTEXT = data;
    const banner = document.createElement("div");
    banner.className = "system-context " + (data.time_travel_enabled ? "time-travel" : "real-time");
    banner.textContent = (data.time_travel_enabled ? "⚠ テスト時刻" : "システム時刻") +
      "：" + data.system_now + " ／ 対象月：" + data.target_month;
    document.body.insertBefore(banner, document.body.firstChild);
    window.dispatchEvent(new CustomEvent("dojo-system-context", { detail:data }));
  };
  // iPhone Safariでは、JSONPコールバックが後から成功する場合でも
  // script.onerrorが先に発生することがあるため、ここでは終了しない。
  script.onerror = function() {
    scriptErrorObserved = true;
  };
  document.head.appendChild(script);
  function cleanup() {
    window.clearTimeout(timeout);
    delete window[callbackName];
    if (script.parentNode) script.parentNode.removeChild(script);
  }
})();
