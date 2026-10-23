(function(root) {
  "use strict";

  const TERMINAL = new Set(["READY", "ERROR", "INVALIDATED", "DISPOSED"]);

  function create(options) {
    options = options || {};
    const dependencies = normalizeSteps(options.dependencies, "dependency");
    const requiredTasks = normalizeSteps(options.requiredTasks, "required task");
    const optionalTasks = normalizeSteps(options.optionalTasks, "optional task");
    const stopOperations = typeof options.stopOperations === "function" ? options.stopOperations : function() {};
    const listeners = new Set();
    let generation = 0;
    let disposed = false;
    let active = null;
    let state = freezeState("IDLE", generation, {}, {}, null, null);

    function getState() { return state; }

    function subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("listener is required");
      listeners.add(listener);
      listener(state);
      return function unsubscribe() { listeners.delete(listener); };
    }

    function isCurrent(value) {
      const candidate = typeof value === "object" && value ? value.generation : value;
      return !disposed && active !== null && active.generation === candidate && !active.controller.signal.aborted;
    }

    function start() {
      if (disposed) return Promise.reject(managerError("INITIALIZATION_MANAGER_DISPOSED"));
      if (active && active.promise && !TERMINAL.has(state.status)) return active.promise;
      if (state.status === "READY") return Promise.resolve(state);

      const run = {
        generation: ++generation,
        controller: new AbortController(),
        promise: null
      };
      active = run;
      update("WAITING_DEPENDENCIES", run, {}, {}, null, null);
      run.promise = execute(run);
      return run.promise;
    }

    async function execute(run) {
      const values = {};
      const capabilities = {};
      const optionalErrors = {};
      const context = createRunContext(run, values, capabilities);
      try {
        await Promise.all(dependencies.map(async function(step) {
          const value = await step.run(context);
          assertCurrent(run);
          values[step.name] = value;
        }));

        update("INITIALIZING", run, capabilities, optionalErrors, null, null);
        for (const step of requiredTasks) {
          const value = await step.run(context);
          assertCurrent(run);
          values[step.name] = value;
          if (step.capability) capabilities[step.capability] = true;
        }

        for (const step of optionalTasks) {
          try {
            const value = await step.run(context);
            assertCurrent(run);
            values[step.name] = value;
            if (step.capability) capabilities[step.capability] = true;
          } catch (error) {
            assertCurrent(run);
            optionalErrors[step.name] = error;
            if (step.capability) capabilities[step.capability] = false;
          }
        }

        assertCurrent(run);
        update("READY", run, capabilities, optionalErrors, null, values);
        return state;
      } catch (error) {
        if (!isCurrent(run.generation)) return state;
        update("ERROR", run, capabilities, optionalErrors, error, values);
        throw error;
      }
    }

    function createRunContext(run, values, capabilities) {
      return Object.freeze({
        generation: run.generation,
        signal: run.controller.signal,
        values: values,
        capabilities: capabilities,
        // Initializers must call this immediately before applying an async result to the DOM.
        isCurrent: function() { return isCurrent(run.generation); }
      });
    }

    function retry(reason) {
      if (disposed) return Promise.reject(managerError("INITIALIZATION_MANAGER_DISPOSED"));
      invalidate(reason || "retry");
      return start();
    }

    function invalidate(reason) {
      if (disposed) return state;
      stopSynchronously(reason || "invalidated");
      generation += 1;
      active = null;
      state = freezeState("INVALIDATED", generation, {}, {}, null, null, reason || "invalidated");
      notify();
      return state;
    }

    function accessLost(reason) {
      if (disposed) return state;
      return invalidate(reason || "access_lost");
    }

    function dispose() {
      if (disposed) return state;
      stopSynchronously("disposed");
      generation += 1;
      active = null;
      disposed = true;
      state = freezeState("DISPOSED", generation, {}, {}, null, null, "disposed");
      notify();
      listeners.clear();
      return state;
    }

    function stopSynchronously(reason) {
      if (active) active.controller.abort(reason);
      // This callback only disables client-side operations. It does not cancel a server request.
      stopOperations(reason);
    }

    function assertCurrent(run) {
      if (!isCurrent(run.generation)) throw managerError("INITIALIZATION_STALE");
    }

    function update(status, run, capabilities, optionalErrors, error, values) {
      if (!isCurrent(run.generation)) return false;
      state = freezeState(status, run.generation, capabilities, optionalErrors, error, values);
      notify();
      return true;
    }

    function notify() {
      for (const listener of listeners) listener(state);
    }

    const api = Object.freeze({
      start: start,
      retry: retry,
      invalidate: invalidate,
      accessLost: accessLost,
      dispose: dispose,
      getState: getState,
      subscribe: subscribe,
      isCurrent: isCurrent
    });
    return api;
  }

  function normalizeSteps(input, label) {
    if (input == null) return [];
    if (!Array.isArray(input)) throw new TypeError(label + "s must be an array");
    const names = new Set();
    return input.map(function(step, index) {
      if (!step || typeof step.run !== "function") throw new TypeError(label + " run is required at index " + index);
      const name = String(step.name || "").trim();
      if (!name || names.has(name)) throw new TypeError(label + " name must be unique");
      names.add(name);
      return Object.freeze({ name:name, run:step.run, capability:step.capability ? String(step.capability) : "" });
    });
  }

  function freezeState(status, generation, capabilities, optionalErrors, error, values, reason) {
    return Object.freeze({
      status: status,
      generation: generation,
      capabilities: Object.freeze(Object.assign({}, capabilities)),
      optionalErrors: Object.freeze(Object.assign({}, optionalErrors)),
      error: error || null,
      values: values ? Object.freeze(Object.assign({}, values)) : null,
      reason: reason || ""
    });
  }

  function managerError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
  }

  root.DOJO_PAGE_INITIALIZATION_MANAGER = Object.freeze({ create:create });
})(typeof window !== "undefined" ? window : globalThis);
