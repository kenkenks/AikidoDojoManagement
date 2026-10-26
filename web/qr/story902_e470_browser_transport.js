(function(root) {
  "use strict";

  const ACTION = "attendance_progress_summary";
  const NORMAL_BASE_URL = "https://dojo-time-travel-admin-374758850136.asia-northeast1.run.app";

  function create(options) {
    options = options || {};
    const runtimeConfig = options.runtimeConfig || root.DOJO_RUNTIME_CONFIG;
    const authClient = options.authClient;
    const apiClient = options.apiClient;
    const common = options.common || root.DOJO_STORY902_E470_COMMON;

    validateDependencies(runtimeConfig, authClient, apiClient, common);

    async function runAttendanceProgress(inputValue) {
      const input = common.createE470Input(inputValue);
      if (input.member_ids.length !== 1) throw new Error("SINGLE_MEMBER_REQUIRED");
      if (input.reception_scopes.length !== 0) throw new Error("ATTENDANCE_ONLY_SCOPES_REQUIRED");
      await authClient.ready;
      if (!authClient.getCurrentUser()) throw new Error("UNAUTHENTICATED");

      const url = new URL(NORMAL_BASE_URL + "/api/webconnect");
      url.searchParams.set("action", ACTION);
      url.searchParams.set("member_id", input.member_ids[0]);
      const response = await apiClient.request(url.toString(), {
        method:"GET",
        cache:"no-store",
        redirect:"error"
      });
      const body = await response.json().catch(function() { return null; });
      const transportResult = Object.freeze({
        action:ACTION,
        method:"GET",
        http_status:response.status,
        body:body
      });
      if (response.status !== 200) {
        const error = new Error("WEB_CONNECT_READ_FAILED_" + response.status);
        error.status = response.status;
        throw error;
      }
      return common.createAttendanceProgressResult(input, transportResult);
    }

    return Object.freeze({ runAttendanceProgress:runAttendanceProgress });
  }

  function validateDependencies(runtimeConfig, authClient, apiClient, common) {
    if (!runtimeConfig || runtimeConfig.target !== "dev-firebase" || runtimeConfig.runtime !== "firebase" ||
        runtimeConfig.firebase?.projectId !== "dojo-management-dev") throw new Error("FIREBASE_DEV_REQUIRED");
    const configuredBase = String(runtimeConfig.apiBaseUrl || "").replace(/\/+$/, "");
    if (configuredBase !== NORMAL_BASE_URL || configuredBase.includes("candidate---")) {
      throw new Error("NORMAL_REVISION_REQUIRED");
    }
    if (!authClient || !authClient.ready || typeof authClient.getCurrentUser !== "function") {
      throw new Error("AUTH_CLIENT_REQUIRED");
    }
    if (!apiClient || typeof apiClient.request !== "function") throw new Error("API_CLIENT_REQUIRED");
    if (!common || typeof common.createE470Input !== "function" ||
        typeof common.createAttendanceProgressResult !== "function") throw new Error("E470_COMMON_REQUIRED");
  }

  root.DOJO_STORY902_E470_BROWSER = Object.freeze({
    ACTION:ACTION,
    NORMAL_BASE_URL:NORMAL_BASE_URL,
    create:create
  });
})(typeof window !== "undefined" ? window : globalThis);
