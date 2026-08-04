(function() {
  "use strict";

  const STORAGE_KEY = "aikido_dojo_virtual_session_v1";
  const PENDING_CONTEXT_KEY = "aikido_dojo_virtual_pending_context_v1";
  const ROLES = ["TEACHER", "MEMBER"];
  const CONTEXT_KEYS = ["location_id", "teacher_id", "billing_block_id"];

  function normalize(value) {
    return String(value || "").trim();
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function normalizeContext(value) {
    const source = value && typeof value === "object" ? value : {};
    const context = {};
    CONTEXT_KEYS.forEach(function(key) {
      context[key] = normalize(source[key]);
    });
    return context;
  }


  function readPendingContext() {
    try {
      const value = sessionStorage.getItem(PENDING_CONTEXT_KEY);
      if (!value) return normalizeContext({});
      return normalizeContext(JSON.parse(value));
    } catch (error) {
      sessionStorage.removeItem(PENDING_CONTEXT_KEY);
      return normalizeContext({});
    }
  }

  function writePendingContext(patch) {
    if (!patch || typeof patch !== "object") {
      throw new Error("保留コンテキストが不正です。");
    }
    Object.keys(patch).forEach(function(key) {
      if (CONTEXT_KEYS.indexOf(key) < 0) {
        throw new Error("セッション保持対象外の項目です: " + key);
      }
    });
    const pending = readPendingContext();
    CONTEXT_KEYS.forEach(function(key) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        pending[key] = normalize(patch[key]);
      }
    });
    sessionStorage.setItem(PENDING_CONTEXT_KEY, JSON.stringify(pending));
    return pending;
  }

  function clearPendingContext() {
    sessionStorage.removeItem(PENDING_CONTEXT_KEY);
  }

  function isValidSession(session) {
    if (!session || typeof session !== "object") return false;
    if (ROLES.indexOf(normalize(session.role).toUpperCase()) < 0) return false;
    if (!normalize(session.subject_id)) return false;
    return true;
  }

  function write(session, dispatch) {
    const stored = {
      role: normalize(session.role).toUpperCase(),
      subject_id: normalize(session.subject_id),
      teacher_id: normalize(session.teacher_id),
      member_id: normalize(session.member_id),
      logged_in_at: normalize(session.logged_in_at) || nowIso(),
      last_accessed_at: normalize(session.last_accessed_at) || nowIso(),
      source: normalize(session.source) || "QR",
      context: normalizeContext(session.context)
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    window.DOJO_VIRTUAL_SESSION = stored;
    if (dispatch !== false) {
      window.dispatchEvent(new CustomEvent("dojo-virtual-session", { detail: stored }));
    }
    return stored;
  }

  function clearBrokenSession() {
    sessionStorage.removeItem(STORAGE_KEY);
    window.DOJO_VIRTUAL_SESSION = null;
  }

  function read() {
    try {
      const value = sessionStorage.getItem(STORAGE_KEY);
      if (!value) return null;
      const session = JSON.parse(value);
      if (!isValidSession(session)) {
        clearBrokenSession();
        return null;
      }
      session.context = normalizeContext(session.context);
      return session;
    } catch (error) {
      clearBrokenSession();
      return null;
    }
  }

  function login(role, subjectId, source) {
    const normalizedRole = normalize(role).toUpperCase();
    const normalizedId = normalize(subjectId);
    if (ROLES.indexOf(normalizedRole) < 0 || !normalizedId) {
      throw new Error("仮想ログインの役割またはIDが不正です。");
    }
    const timestamp = nowIso();
    const pendingContext = readPendingContext();
    const stored = write({
      role: normalizedRole,
      subject_id: normalizedId,
      teacher_id: normalizedRole === "TEACHER" ? normalizedId : "",
      member_id: normalizedRole === "MEMBER" ? normalizedId : "",
      logged_in_at: timestamp,
      last_accessed_at: timestamp,
      source: normalize(source) || "QR",
      context: pendingContext
    });
    clearPendingContext();
    return stored;
  }

  function logout() {
    sessionStorage.removeItem(STORAGE_KEY);
    window.DOJO_VIRTUAL_SESSION = null;
    window.dispatchEvent(new CustomEvent("dojo-virtual-session", { detail: null }));
  }

  function touch() {
    const session = read();
    if (!session) return null;
    session.last_accessed_at = nowIso();
    return write(session, false);
  }

  function setContext(patch) {
    const session = read();
    if (!session) throw new Error("ログインセッションがありません。");
    if (!patch || typeof patch !== "object") {
      throw new Error("セッションコンテキストが不正です。");
    }

    Object.keys(patch).forEach(function(key) {
      if (CONTEXT_KEYS.indexOf(key) < 0) {
        throw new Error("セッション保持対象外の項目です: " + key);
      }
    });

    const nextContext = normalizeContext(session.context);
    CONTEXT_KEYS.forEach(function(key) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        nextContext[key] = normalize(patch[key]);
      }
    });
    session.context = nextContext;
    session.last_accessed_at = nowIso();
    return write(session);
  }


  function setEntryContext(patch) {
    const session = read();
    if (session) return setContext(patch);
    return writePendingContext(patch);
  }

  function clearContext() {
    const session = read();
    if (!session) return null;
    session.context = normalizeContext({});
    session.last_accessed_at = nowIso();
    return write(session);
  }

  window.DojoVirtualSession = {
    get: read,
    loginTeacher: function(teacherId, source) { return login("TEACHER", teacherId, source); },
    loginMember: function(memberId, source) { return login("MEMBER", memberId, source); },
    setContext: setContext,
    setEntryContext: setEntryContext,
    getPendingContext: readPendingContext,
    clearContext: clearContext,
    logout: logout,
    touch: touch
  };
  window.DOJO_VIRTUAL_SESSION = touch();
})();
