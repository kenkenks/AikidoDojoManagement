import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../web/qr/firebase_auth.js", import.meta.url), "utf8");

function loadAuthFactory() {
  const context = { console, Promise, Set };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: "firebase_auth.js" });
  return context.DOJO_FIREBASE_AUTH;
}

const runtimeConfig = {
  runtime: "firebase",
  firebase: {
    apiKey: "test-api-key",
    authDomain: "dojo-management-dev.firebaseapp.com",
    projectId: "dojo-management-dev",
    appId: "test-app-id"
  }
};

test("Firebase Auth client uses target config, session persistence, and exposes currentUser", async () => {
  const calls = [];
  const auth = { currentUser: null };
  const user = { uid: "TEST_ADMIN", getIdToken: async () => "token" };
  let authObserver = null;

  const firebase = {
    browserSessionPersistence: { kind: "session" },
    initializeApp(config) {
      calls.push(["initializeApp", config]);
      return { name: "app" };
    },
    getAuth(app) {
      calls.push(["getAuth", app]);
      return auth;
    },
    async setPersistence(receivedAuth, persistence) {
      calls.push(["setPersistence", receivedAuth, persistence]);
    },
    onAuthStateChanged(receivedAuth, observer) {
      calls.push(["onAuthStateChanged", receivedAuth]);
      authObserver = observer;
      return () => {};
    }
  };

  const factory = loadAuthFactory();
  const client = factory.create({ runtimeConfig, loadFirebase: async () => firebase });
  await client.ready;

  assert.equal(auth.languageCode, "ja");
  assert.deepEqual(calls[0], ["initializeApp", runtimeConfig.firebase]);
  assert.equal(calls[2][0], "setPersistence");
  assert.equal(calls[2][2], firebase.browserSessionPersistence);
  assert.equal(calls[3][0], "onAuthStateChanged");
  assert.equal(client.getCurrentUser(), null);

  authObserver(user);
  assert.equal(client.getCurrentUser(), user);

  const apiClientOptions = { getCurrentUser: client.getCurrentUser };
  assert.equal(apiClientOptions.getCurrentUser(), user);
});
