(function(root) {
  "use strict";

  const FIREBASE_APP_URL = "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
  const FIREBASE_AUTH_URL = "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

  function create(options) {
    const runtimeConfig = (options && options.runtimeConfig) || root.DOJO_RUNTIME_CONFIG;
    const loadFirebase = (options && options.loadFirebase) || loadFirebaseFromCdn;
    const listeners = new Set();
    let auth = null;
    let currentUser = null;

    validateRuntimeConfig(runtimeConfig);

    const ready = Promise.resolve()
      .then(() => loadFirebase())
      .then(async firebase => {
        const app = firebase.initializeApp(runtimeConfig.firebase);
        auth = firebase.getAuth(app);
        auth.languageCode = "ja";
        await firebase.setPersistence(auth, firebase.browserSessionPersistence);
        firebase.onAuthStateChanged(auth, user => {
          currentUser = user || null;
          for (const listener of listeners) listener(currentUser);
        });
        return api;
      });

    function getCurrentUser() {
      return currentUser;
    }

    function onUserChanged(listener) {
      if (typeof listener !== "function") throw new Error("listener is required");
      listeners.add(listener);
      return function unsubscribe() { listeners.delete(listener); };
    }

    function getAuth() {
      return auth;
    }

    const api = Object.freeze({ ready, getCurrentUser, onUserChanged, getAuth });
    return api;
  }

  function validateRuntimeConfig(config) {
    if (!config || config.runtime !== "firebase") throw new Error("Firebase runtime config is required");
    for (const key of ["apiKey", "authDomain", "projectId", "appId"]) {
      if (!config.firebase || !config.firebase[key]) throw new Error(`firebase.${key} is required`);
    }
  }

  async function loadFirebaseFromCdn() {
    const [appModule, authModule] = await Promise.all([
      import(FIREBASE_APP_URL),
      import(FIREBASE_AUTH_URL)
    ]);
    return Object.assign({}, appModule, authModule);
  }

  root.DOJO_FIREBASE_AUTH = Object.freeze({ create });
})(typeof window !== "undefined" ? window : globalThis);
