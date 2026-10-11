#!/usr/bin/env node
// Staged release of the EXISTING Cloud Run service; Hosting is deliberately untouched.
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [action, ...args] = process.argv.slice(2);
const execute = args.includes('--execute');
const positional = args.filter(x => x !== '--execute');
const value = positional[0];
const SERVICE = 'dojo-time-travel-admin';
const PROJECT = 'dojo-management-dev';
const REGION = 'asia-northeast1';
const TAG = 'candidate';
const base = ['--project', PROJECT, '--region', REGION];

if (!['stage', 'verify', 'promote', 'rollback'].includes(action) || positional.length > (['stage', 'verify'].includes(action) ? 0 : 1)) {
  console.error('usage: node tools/cloud-run-release.mjs stage [--execute] | verify [--execute] | promote <revision> [--execute] | rollback <revision> [--execute]');
  process.exit(2);
}
if (['promote', 'rollback'].includes(action) && (!value || !/^dojo-time-travel-admin-[a-z0-9-]+$/.test(value))) {
  throw new Error('An explicit, valid service revision is required for promote/rollback');
}
const run = (args) => {
  console.log(`${execute ? '[EXECUTE]' : '[DRY RUN]'} gcloud ${args.join(' ')}`);
  if (!execute) return;
  // On Windows, .cmd launchers cannot be spawned directly by Node 24.
  // Arguments are constructed here, not accepted as arbitrary shell input.
  const isWindows = process.platform === 'win32';
  if (isWindows && args.some(arg => !/^[a-zA-Z0-9_./=:-]+$/.test(arg))) {
    throw new Error('Unsafe gcloud argument for Windows cmd.exe');
  }
  const binary = isWindows ? (process.env.ComSpec || 'cmd.exe') : 'gcloud';
  const commandArgs = isWindows ? ['/d', '/s', '/c', `gcloud.cmd ${args.join(' ')}`] : args;
  const result = spawnSync(binary, commandArgs, { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`gcloud exited ${result.status}`);
};
if (action === 'verify') {
  // Read-only; safe to execute without changing service traffic or configuration.
  run(['run', 'services', 'describe', SERVICE, ...base, '--format=json']);
} else if (action === 'stage') {
  const deployRoot = join(root, '.build', 'dev-firebase', 'cloud-run', SERVICE);
  // Build from current source immediately before staging. Never deploy stale .build output.
  if (execute) {
    const build = spawnSync(process.execPath, ['tools/target.mjs', 'build', 'dev-firebase'],
      { cwd: root, stdio: 'inherit', windowsHide: true });
    if (build.error) throw build.error;
    if (build.status !== 0) throw new Error(`Firebase target build failed: exit ${build.status}`);
    if (!existsSync(join(deployRoot, 'package.json'))) {
      throw new Error('Cloud Run deploy unit missing after build');
    }
  } else {
    console.log('[DRY RUN] node tools/target.mjs build dev-firebase');
  }
  // No --allow-unauthenticated: preserve existing service IAM policy.
  // No Hosting deployment. Existing traffic stays on the current revision.
  run(['run', 'deploy', SERVICE, '--source', relative(root, deployRoot).replaceAll('\\', '/'),
    ...base, '--no-traffic', '--tag', TAG, '--min', '0', '--max', '1',
    '--cpu', '1', '--memory', '512Mi', '--concurrency', '8']);
  console.log('Verify candidate tag URL and TimeTrip + Member before promote.');
} else {
  run(['run', 'services', 'update-traffic', SERVICE, ...base, '--to-revisions', `${value}=100`]);
}
