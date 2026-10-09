'use strict';

if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('AUTH_EMULATOR_NOT_ALLOWED');
}

const fs = require('node:fs');
const path = require('node:path');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { createServer } = require('node:http');
const { createDao } = require('../../shared/DAO_Business.js');
const { createFirestoreCore } = require('../member-read/DAO_Core_Firestore.cjs');
const { createAdminApi } = require('./admin-api.cjs');
const { createTimeTravelTarget } = require('../time-travel/target.cjs');

const root = path.resolve(__dirname, '..', '..');
const port = Number(process.env.PORT || 8082);
const host = process.env.PORT ? '0.0.0.0' : '127.0.0.1';
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

const allowedOrigins = new Set([
  'https://dojo-management-dev.web.app',
  'https://dojo-management-dev.firebaseapp.com'
]);

function getCorsHeaders(origin) {
  if (!origin || !allowedOrigins.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Vary': 'Origin'
  };
}

const memberCore = createFirestoreCore(profile, {
  getAccessToken: async () => (await credential.getAccessToken()).access_token
});
const memberDao = createDao(memberCore, 'firestore');

const handle = createAdminApi({
  verifyIdToken: (token, revoked) => getAuth(firebaseApp).verifyIdToken(token, revoked),
  getTimeTravel: () => application.getTimeTravel(),
  saveTimeTravel: input => application.saveTimeTravel(input),
  readMember: id => memberDao.readById('members', id),
  readMembers: ids => memberDao.readByIds('members', ids)
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
    const corsHeaders = getCorsHeaders(req.headers.origin);

    if (req.method === 'OPTIONS') {
      if (req.headers.origin && !allowedOrigins.has(req.headers.origin)) {
        res.writeHead(403, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        res.end(JSON.stringify({ error: 'ORIGIN_NOT_ALLOWED' }));
        return;
      }
      res.writeHead(204, {
        ...corsHeaders,
        'Cache-Control': 'no-store'
      });
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/hello') {
      res.writeHead(200, {
        ...corsHeaders,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      res.end(JSON.stringify({ ok: true, service: 'dojo-api' }));
      return;
    }

    let body = null;
    if (req.method === 'POST') {
      try {
        body = await readJsonBody(req);
      } catch {
        res.writeHead(400, {
          ...corsHeaders,
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

    res.writeHead(result.status, { ...result.headers, ...corsHeaders });
    res.end(JSON.stringify(result.body));
  } catch (error) {
    console.error(error?.stack || error);
    res.writeHead(500, {
      ...getCorsHeaders(req.headers.origin),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify({ error: 'INTERNAL_ERROR' }));
  }
}).listen(port, host, () => {
  console.log(`Dojo API: http://${host}:${port}`);
  console.log(`Firebase project: ${profile.projectId}`);
});