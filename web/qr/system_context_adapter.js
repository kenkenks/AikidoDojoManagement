(function(root) {
  "use strict";

  const READY_EVENT = "dojo-system-context";
  const ERROR_EVENT = "dojo-system-context-error";

  function create(options) {
    options = options || {};
    const eventTarget = options.eventTarget || root;
    const readCurrent = typeof options.readCurrent === "function"
      ? options.readCurrent
      : function() { return root.DOJO_SYSTEM_CONTEXT || null; };
    if (!eventTarget || typeof eventTarget.addEventListener !== "function" ||
        typeof eventTarget.removeEventListener !== "function") {
      throw new TypeError("eventTarget is required");
    }

    const listeners = new Set();
    let revision = 0;
    let disposed = false;
    let state = freezeState("WAITING", revision, null, null, false);

    function onContext(event) {
      if (disposed) return;
      const next = validContext(event && event.detail) || safeReadCurrent();
      if (!next) {
        publish("ERROR", null, adapterError("SYSTEM_CONTEXT_INVALID"), false);
        return;
      }
      const changed = !sameContext(state.context, next);
      publish("READY", next, null, changed);
    }

    function onError(event) {
      if (disposed) return;
      const detail = event && event.detail;
      const message = detail && detail.message ? String(detail.message) : "SYSTEM_CONTEXT_UNAVAILABLE";
      publish("ERROR", null, adapterError("SYSTEM_CONTEXT_UNAVAILABLE", message), false);
    }

    function safeReadCurrent() {
      try { return validContext(readCurrent()); }
      catch (error) { return null; }
    }

    function publish(status, context, error, changed) {
      revision += 1;
      state = freezeState(status, revision, context, error, changed);
      for (const listener of listeners) listener(state);
    }

    function getState() { return state; }
    function getCurrent() { return state.status === "READY" ? state.context : null; }

    function subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("listener is required");
      if (disposed) throw adapterError("SYSTEM_CONTEXT_ADAPTER_DISPOSED");
      listeners.add(listener);
      listener(state);
      return function unsubscribe() { listeners.delete(listener); };
    }

    function waitForReady(signal) {
      if (state.status === "READY") return Promise.resolve(state.context);
      if (disposed) return Promise.reject(adapterError("SYSTEM_CONTEXT_ADAPTER_DISPOSED"));
      if (signal && signal.aborted) return Promise.reject(abortError(signal.reason));
      const startingRevision = state.revision;
      return new Promise(function(resolve, reject) {
        let unsubscribe = null;
        function finish(callback, value) {
          if (unsubscribe) unsubscribe();
          if (signal) signal.removeEventListener("abort", onAbort);
          callback(value);
        }
        function onAbort() { finish(reject, abortError(signal.reason)); }
        unsubscribe = subscribe(function(next) {
          if (next.status === "READY") finish(resolve, next.context);
          else if (next.status === "DISPOSED") finish(reject, adapterError("SYSTEM_CONTEXT_ADAPTER_DISPOSED"));
          else if (next.status === "ERROR" && next.revision > startingRevision) finish(reject, next.error);
        });
        if (signal) signal.addEventListener("abort", onAbort, { once:true });
      });
    }

    function dependency(name) {
      return Object.freeze({
        name: name || "systemContext",
        run: function(managerContext) {
          return waitForReady(managerContext && managerContext.signal);
        }
      });
    }

    function dispose() {
      if (disposed) return state;
      disposed = true;
      eventTarget.removeEventListener(READY_EVENT, onContext);
      eventTarget.removeEventListener(ERROR_EVENT, onError);
      publish("DISPOSED", null, null, false);
      listeners.clear();
      return state;
    }

    eventTarget.addEventListener(READY_EVENT, onContext);
    eventTarget.addEventListener(ERROR_EVENT, onError);
    const existing = safeReadCurrent();
    if (existing) publish("READY", existing, null, true);

    const ready = waitForReady();
    return Object.freeze({
      ready: ready,
      waitForReady: waitForReady,
      dependency: dependency,
      getState: getState,
      getCurrent: getCurrent,
      subscribe: subscribe,
      dispose: dispose
    });
  }

  function validContext(value) {
    return value && value.ok === true && typeof value.system_now === "string" &&
      typeof value.target_month === "string" ? value : null;
  }

  function sameContext(left, right) {
    if (!left || !right) return false;
    return left.system_now === right.system_now &&
      left.target_month === right.target_month &&
      left.time_travel_enabled === right.time_travel_enabled &&
      left.timezone === right.timezone;
  }

  function freezeState(status, revision, context, error, changed) {
    return Object.freeze({
      status: status,
      revision: revision,
      context: context || null,
      error: error || null,
      changed: changed === true
    });
  }

  function adapterError(code, message) {
    const error = new Error(message || code);
    error.code = code;
    return error;
  }

  function abortError(reason) {
    const error = adapterError("SYSTEM_CONTEXT_WAIT_ABORTED", "SystemContext wait aborted");
    error.reason = reason;
    return error;
  }

  root.DOJO_SYSTEM_CONTEXT_ADAPTER = Object.freeze({ create:create });
})(typeof window !== "undefined" ? window : globalThis);
