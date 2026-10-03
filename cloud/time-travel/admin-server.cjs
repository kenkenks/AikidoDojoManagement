'use strict';

if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('AUTH_EMULATOR_NOT_ALLOWED');
}

const fs = require('node:fs');
const path = require('node:path');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { createServer } = require('node:http');
const { createAdminTimeTravelApi } = require('./admin-api.cjs');
const { createTimeTravelTarget } = require('./target.cjs');

const root = path.resolve(__dirname, '..', '..');
const profile = JSON.parse(
  fs.readFileSync(path.join(root, 'targets', 'dev-firebase.json'), 'utf8')
);

const credential = applicationDefault();
const firebaseApp = initializeApp({
  projectId: profile.projectId,
  credential
});

const application = createTimeTravelTarget({
  projectId: profile.projectId,
  mode: profile.mode,
  confirmedDevelopmentProject: profile.confirmedDevelopmentProject
}, {
  getAccessToken: async () => (await credential.getAccessToken()).access_token
});

const handle = createAdminTimeTravelApi({
  verifyIdToken: (token, revoked) => getAuth(firebaseApp).verifyIdToken(token, revoked),
  getTimeTravel: () => application.getTimeTravel(),
  saveTimeTravel: input => application.saveTimeTravel(input)
});

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error('BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  if (!chunks.length) return null;
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

createServer(async (req, res) => {
  try {
    let body = null;
    if (req.method === 'POST') {
      try {
        body = await readJsonBody(req);
      } catch {
        res.writeHead(400, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        res.end(JSON.stringify({ error: 'INVALID_JSON' }));
        return;
      }
    }

    const result = await handle({
      method: req.method,
      url: req.url,
      authorization: req.headers.authorization,
      body
    });

    res.writeHead(result.status, result.headers);
    res.end(JSON.stringify(result.body));
  } catch (error) {
    console.error(error?.stack || error);
    res.writeHead(500, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify({ error: 'INTERNAL_ERROR' }));
  }
}).listen(8082, '127.0.0.1', () => {
  console.log('Admin TimeTrip API: http://127.0.0.1:8082');
  console.log(`Firebase project: ${profile.projectId}`);
});