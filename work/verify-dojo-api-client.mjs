import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../web/qr/dojo_api_client.js", import.meta.url), "utf8");

function loadClient(fetchImpl) {
  const window = { fetch: fetchImpl };
  const context = vm.createContext({ window, globalThis: window, Headers, fetch: fetchImpl });
  new vm.Script(source, { filename: "web/qr/dojo_api_client.js" }).runInContext(context);
  return window.DOJO_API_CLIENT;
}

{
  const tokenCalls = [];
  const requests = [];
  const user = { async getIdToken(forceRefresh) { tokenCalls.push(forceRefresh === true); return "token-1"; } };
  const api = loadClient(async (input, init) => {
    requests.push({ input, authorization: init.headers.get("Authorization") });
    return new Response("ok", { status: 200 });
  });

  const response = await api.create({ getCurrentUser: () => user }).request("https://example.test/api", { method: "GET" });
  assert.equal(response.status, 200);
  assert.deepEqual(tokenCalls, [false]);
  assert.deepEqual(requests, [{ input: "https://example.test/api", authorization: "Bearer token-1" }]);
}

{
  const tokenCalls = [];
  const authorizations = [];
  const user = {
    async getIdToken(forceRefresh) {
      tokenCalls.push(forceRefresh === true);
      return forceRefresh ? "token-refreshed" : "token-stale";
    }
  };
  let call = 0;
  const api = loadClient(async (_input, init) => {
    authorizations.push(init.headers.get("Authorization"));
    call += 1;
    return new Response(call === 1 ? "unauthorized" : "ok", { status: call === 1 ? 401 : 200 });
  });

  const response = await api.create({ getCurrentUser: () => user }).request("https://example.test/api");
  assert.equal(response.status, 200);
  assert.deepEqual(tokenCalls, [false, true]);
  assert.deepEqual(authorizations, ["Bearer token-stale", "Bearer token-refreshed"]);
  assert.equal(call, 2);
}

{
  let fetchCalls = 0;
  const api = loadClient(async () => { fetchCalls += 1; return new Response("unexpected"); });
  await assert.rejects(
    () => api.create({ getCurrentUser: () => null }).request("https://example.test/api"),
    /UNAUTHENTICATED/
  );
  assert.equal(fetchCalls, 0);
}

{
  let call = 0;
  const user = { async getIdToken(forceRefresh) { return forceRefresh ? "token-2" : "token-1"; } };
  const api = loadClient(async () => { call += 1; return new Response("unauthorized", { status: 401 }); });
  const response = await api.create({ getCurrentUser: () => user }).request("https://example.test/api");
  assert.equal(response.status, 401);
  assert.equal(call, 2, "401 retry must happen exactly once");
}

console.log("PASS verify-dojo-api-client");
