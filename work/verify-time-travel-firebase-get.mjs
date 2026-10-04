import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = readFileSync(new URL("../web/qr/time_travel.html", import.meta.url), "utf8");

test("TimeTrip Firebase GET routes through Auth and Dojo API Client while GAS GET remains", () => {
  assert.match(html, /<script src="runtime_config\.js"><\/script>/);
  assert.match(html, /<script src="firebase_auth\.js"><\/script>/);
  assert.match(html, /<script src="dojo_api_client\.js"><\/script>/);
  assert.match(html, /RUNTIME_CONFIG\.runtime === "firebase"/);
  assert.match(html, /DOJO_FIREBASE_AUTH\.create/);
  assert.match(html, /DOJO_API_CLIENT\.create/);
  assert.match(html, /firebaseAuthClient\.ready/);
  assert.match(html, /firebaseAuthClient\.signInWithGoogle\(\)/);
  assert.match(html, /Googleでログイン/);
  assert.match(html, /firebaseAuthClient\.onUserChanged/);
  assert.match(html, /dojoApiClient\.request\(firebaseApiUrl\("\/api\/admin\/time-travel"\)\)/);
  assert.match(html, /jsonp\(GAS_URL, \{ action:"time_travel_admin" \}\)/);

  const inlineScripts = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)];
  assert.ok(inlineScripts.length > 0);
  for (const [index, match] of inlineScripts.entries()) {
    new vm.Script(match[1], { filename:`time_travel.html#${index + 1}` });
  }
});
