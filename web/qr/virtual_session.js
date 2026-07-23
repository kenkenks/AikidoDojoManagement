(function() {
  "use strict";

  const STORAGE_KEY = "aikido_dojo_virtual_session_v1";

  function normalize(value) {
    return String(value || "").trim();
  }

  function read() {
    try {
      const value = sessionStorage.getItem(STORAGE_KEY);
      if (!value) return null;
      const session = JSON.parse(value);
      if (!session || !session.role || !session.subject_id) return null;
      return session;
    } catch (error) {
      return null;
    }
  }

  function login(role, subjectId, source) {
    const normalizedRole = normalize(role).toUpperCase();
    const normalizedId = normalize(subjectId);
    if (["TEACHER", "MEMBER"].indexOf(normalizedRole) < 0 || !normalizedId) {
      throw new Error("仮想ログインの役割またはIDが不正です。");
    }
    const session = {
      role: normalizedRole,
      subject_id: normalizedId,
      teacher_id: normalizedRole === "TEACHER" ? normalizedId : "",
      member_id: normalizedRole === "MEMBER" ? normalizedId : "",
      logged_in_at: new Date().toISOString(),
      last_accessed_at: new Date().toISOString(),
      source: normalize(source) || "QR"
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    window.DOJO_VIRTUAL_SESSION = session;
    window.dispatchEvent(new CustomEvent("dojo-virtual-session", { detail: session }));
    return session;
  }

  function logout() {
    sessionStorage.removeItem(STORAGE_KEY);
    window.DOJO_VIRTUAL_SESSION = null;
    window.dispatchEvent(new CustomEvent("dojo-virtual-session", { detail: null }));
  }

  function touch() {
    const session = read();
    if (!session) return null;
    session.last_accessed_at = new Date().toISOString();
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    window.DOJO_VIRTUAL_SESSION = session;
    return session;
  }

  window.DojoVirtualSession = {
    get: read,
    loginTeacher: function(teacherId, source) { return login("TEACHER", teacherId, source); },
    loginMember: function(memberId, source) { return login("MEMBER", memberId, source); },
    logout: logout,
    touch: touch
  };
  window.DOJO_VIRTUAL_SESSION = touch();
})();
