(function(root) {
  "use strict";

  function create(options) {
    const getCurrentUser = options && options.getCurrentUser;
    const fetchImpl = (options && options.fetchImpl) || root.fetch;

    if (typeof getCurrentUser !== "function") throw new Error("getCurrentUser is required");
    if (typeof fetchImpl !== "function") throw new Error("fetch is required");

    async function request(input, init) {
      const user = getCurrentUser();
      if (!user || typeof user.getIdToken !== "function") {
        throw new Error("UNAUTHENTICATED");
      }

      const firstToken = await user.getIdToken();
      const firstResponse = await fetchImpl(input, withBearer(init, firstToken));
      if (firstResponse.status !== 401) return firstResponse;

      const refreshedToken = await user.getIdToken(true);
      return fetchImpl(input, withBearer(init, refreshedToken));
    }

    return Object.freeze({ request });
  }

  function withBearer(init, token) {
    const next = Object.assign({}, init || {});
    const headers = new Headers((init && init.headers) || undefined);
    headers.set("Authorization", `Bearer ${token}`);
    next.headers = headers;
    return next;
  }

  root.DOJO_API_CLIENT = Object.freeze({ create });
})(typeof window !== "undefined" ? window : globalThis);
