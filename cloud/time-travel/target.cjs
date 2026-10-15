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

function createAttendanceRegistrationTarget(ctx, dependencies) {
  const artifactPath = path.resolve(__dirname,'..','..','.build','portable-timetravel-firestore','DojoTimeTravelFirestore.cjs');
  return require(artifactPath).createAttendanceRegistration(ctx,dependencies);
}
function createTeacherOverviewTarget(options) {
  const artifactPath=path.resolve(__dirname,'..','..','.build','portable-timetravel-firestore','DojoTimeTravelFirestore.cjs');
  return require(artifactPath).createTeacherAttendanceOverview(options);
}
module.exports = { createTimeTravelTarget, createAttendanceRegistrationTarget,createTeacherOverviewTarget };
