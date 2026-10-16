(function(root) {
  "use strict";

  function create(options) {
    const send = options && options.send;
    const generateRequestId = options && options.generateRequestId;
    if (typeof send !== "function" || typeof generateRequestId !== "function") {
      throw new Error("PAYMENT_CASH_ACCEPT_CLIENT_DEPENDENCY_REQUIRED");
    }
    let pending = null;
    let busy = false;

    function sameTarget(request, input) {
      const left = request.items && request.items[0] || {};
      const right = input.items && input.items[0] || {};
      return request.location_id === input.location_id &&
        request.billing_block_id === input.billing_block_id &&
        left.member_id === right.member_id &&
        left.billing_group_id === right.billing_group_id;
    }

    async function execute(input) {
      if (busy) return { ok:false, duplicate_submit:true };
      if (pending && !sameTarget(pending, input)) {
        const error = new Error("PAYMENT_CASH_ACCEPT_PENDING_OTHER_TARGET");
        error.pending = true;
        error.outcomeUnknown = true;
        throw error;
      }
      if (!pending) pending = Object.freeze(Object.assign({ request_id:generateRequestId() }, input));
      busy = true;
      try {
        const result = await send(pending);
        if (!result || result.ok !== true || result.request_id !== pending.request_id) {
          const error = new Error("PAYMENT_CASH_ACCEPT_RESULT_UNKNOWN");
          error.outcomeUnknown = true;
          throw error;
        }
        pending = null;
        return result;
      } catch (error) {
        if (!error || error.outcomeUnknown !== true) pending = null;
        throw error;
      } finally {
        busy = false;
      }
    }

    return Object.freeze({
      execute,
      isBusy:() => busy,
      getPendingRequest:() => pending
    });
  }

  root.DOJO_PAYMENT_CASH_ACCEPT = Object.freeze({ create });
})(typeof window !== "undefined" ? window : globalThis);
