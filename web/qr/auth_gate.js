(function(root) {
  "use strict";

  const DEFAULT_STORAGE_KEY = "dojo.auth.return_url.v1";

  function create(options) {
    options = options || {};
    const authClient = options.authClient;
    const locationLike = options.location || root.location;
    const storage = options.storage === undefined ? root.sessionStorage : options.storage;
    const loginUrl = new URL(options.loginPath || "index.html", currentHref(locationLike));
    const allowedPathPrefix = options.allowedPathPrefix || directoryPath(loginUrl.pathname);
    const storageKey = options.storageKey || DEFAULT_STORAGE_KEY;
    const listeners = new Set();
    let unsubscribeAuth = null;
    let disposed = false;
    let state = freezeState("CHECKING", null, null);

    if (!authClient || !authClient.ready || typeof authClient.getCurrentUser !== "function" ||
        typeof authClient.onUserChanged !== "function") {
      throw new Error("authClient is required");
    }

    const ready = Promise.resolve(authClient.ready).then(function() {
      if (disposed) return api;
      setUserState(authClient.getCurrentUser());
      unsubscribeAuth = authClient.onUserChanged(function(user) {
        if (!disposed) setUserState(user);
      });
      return api;
    }).catch(function(error) {
      if (!disposed) updateState(freezeState("ERROR", null, error));
      throw error;
    });

    function setUserState(user) {
      updateState(freezeState(user ? "AUTHENTICATED" : "UNAUTHENTICATED", user || null, null));
    }

    function updateState(next) {
      state = next;
      for (const listener of listeners) listener(state);
    }

    function getState() {
      return state;
    }

    function subscribe(listener) {
      if (typeof listener !== "function") throw new Error("listener is required");
      listeners.add(listener);
      listener(state);
      return function unsubscribe() { listeners.delete(listener); };
    }

    async function requireAuthenticated() {
      await ready;
      const user = authClient.getCurrentUser();
      if (!user) throw gateError("UNAUTHENTICATED");
      return user;
    }

    function validateReturnUrl(value) {
      return normalizeReturnUrl(value, {
        baseUrl: currentHref(locationLike),
        loginUrl: loginUrl.href,
        allowedPathPrefix: allowedPathPrefix
      });
    }

    function rememberReturnUrl(value) {
      const normalized = validateReturnUrl(value);
      if (!normalized) return null;
      safeStorageSet(storage, storageKey, normalized);
      return normalized;
    }

    function getRememberedReturnUrl() {
      const value = safeStorageGet(storage, storageKey);
      const normalized = validateReturnUrl(value);
      if (!normalized && value != null) safeStorageRemove(storage, storageKey);
      return normalized;
    }

    function clearRememberedReturnUrl() {
      safeStorageRemove(storage, storageKey);
    }

    function buildLoginUrl(value) {
      const normalized = rememberReturnUrl(value || currentHref(locationLike));
      const target = new URL(loginUrl.href);
      if (normalized) target.searchParams.set("return_url", normalized);
      return target.href;
    }

    function redirectToLogin(value) {
      const target = buildLoginUrl(value);
      if (!locationLike || typeof locationLike.assign !== "function") {
        throw new Error("location.assign is required");
      }
      locationLike.assign(target);
      return target;
    }

    async function signInWithGoogle() {
      if (typeof authClient.signInWithGoogle !== "function") throw new Error("signInWithGoogle is unavailable");
      await ready;
      return authClient.signInWithGoogle();
    }

    async function signOut() {
      if (typeof authClient.signOut !== "function") throw new Error("signOut is unavailable");
      await ready;
      return authClient.signOut();
    }

    function dispose() {
      disposed = true;
      if (typeof unsubscribeAuth === "function") unsubscribeAuth();
      unsubscribeAuth = null;
      listeners.clear();
    }

    const api = Object.freeze({
      ready,
      getState,
      subscribe,
      requireAuthenticated,
      validateReturnUrl,
      rememberReturnUrl,
      getRememberedReturnUrl,
      clearRememberedReturnUrl,
      buildLoginUrl,
      redirectToLogin,
      signInWithGoogle,
      signOut,
      dispose
    });
    return api;
  }

  function normalizeReturnUrl(value, options) {
    if (typeof value !== "string" || !value.trim()) return null;
    options = options || {};
    let base;
    let login;
    let candidate;
    try {
      base = new URL(options.baseUrl);
      login = new URL(options.loginUrl || "index.html", base);
      candidate = new URL(value, base);
    } catch (error) {
      return null;
    }
    if (!/^https?:$/.test(candidate.protocol) || candidate.origin !== base.origin) return null;
    if (candidate.username || candidate.password) return null;
    const prefix = options.allowedPathPrefix || directoryPath(login.pathname);
    if (!pathWithinPrefix(candidate.pathname, prefix)) return null;
    if (samePath(candidate.pathname, login.pathname)) return null;
    return candidate.pathname + candidate.search;
  }

  function directoryPath(pathname) {
    const index = String(pathname || "/").lastIndexOf("/");
    return String(pathname || "/").slice(0, index + 1) || "/";
  }

  function pathWithinPrefix(pathname, prefix) {
    const normalizedPrefix = String(prefix || "/").replace(/\/+$/, "") + "/";
    return pathname === normalizedPrefix.slice(0, -1) || pathname.startsWith(normalizedPrefix);
  }

  function samePath(left, right) {
    return String(left || "").replace(/\/+$/, "") === String(right || "").replace(/\/+$/, "");
  }

  function currentHref(locationLike) {
    if (!locationLike || typeof locationLike.href !== "string") throw new Error("location.href is required");
    return locationLike.href;
  }

  function freezeState(status, user, error) {
    return Object.freeze({ status:status, user:user, error:error });
  }

  function gateError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
  }

  function safeStorageGet(storage, key) {
    try { return storage && typeof storage.getItem === "function" ? storage.getItem(key) : null; }
    catch (error) { return null; }
  }

  function safeStorageSet(storage, key, value) {
    try { if (storage && typeof storage.setItem === "function") storage.setItem(key, value); }
    catch (error) {}
  }

  function safeStorageRemove(storage, key) {
    try { if (storage && typeof storage.removeItem === "function") storage.removeItem(key); }
    catch (error) {}
  }

  root.DOJO_AUTH_GATE = Object.freeze({ create:create, normalizeReturnUrl:normalizeReturnUrl });
})(typeof window !== "undefined" ? window : globalThis);
