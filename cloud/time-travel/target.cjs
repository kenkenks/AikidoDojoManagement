'use strict';

const fs = require('node:fs');
const path = require('node:path');

function createTimeTravelTarget(config, dependencies = {}) {
  const root = path.resolve(__dirname, '..', '..');
  const artifactPath = path.join(root, '.build', 'portable-timetravel-firestore', 'DojoTimeTravelFirestore.cjs');
  if (!fs.existsSync(artifactPath)) {
    throw new Error('FIREBASE_BUILD_REQUIRED: npm run target:build -- dev-firebase');
  }
  const { createApplication } = require(artifactPath);
  return createApplication(config, dependencies);
}

module.exports = { createTimeTravelTarget };
