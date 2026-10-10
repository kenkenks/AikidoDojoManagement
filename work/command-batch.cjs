'use strict';
const fs = require('node:fs');
const { copy } = require('./gas2firebase-copy.cjs');

async function runBatch(plan, opts = {}) {
  if (!plan || plan.version !== 1 || !Array.isArray(plan.jobs) || !plan.jobs.length) throw Error('BATCH_PLAN_INVALID');
  const execute = opts.execute === true;
  if (execute && opts.confirm !== 'dojo-management-dev') throw Error('BATCH_EXECUTE_CONFIRMATION_REQUIRED');
  const invoke = opts.copy || copy;
  // Validate the complete plan before any job can write.
  for (let i = 0; i < plan.jobs.length; i++) {
    const job = plan.jobs[i];
    if (!job || job.command !== 'data.copy' || !job.args || typeof job.args.table !== 'string') throw Error(`BATCH_COMMAND_UNSUPPORTED:${i + 1}`);
    if (job.args.execute || job.args.confirm || job.args.preflight || job.args.verifyExisting || job.args.limit) throw Error(`BATCH_JOB_MODE_FORBIDDEN:${i + 1}`);
  }
  const results = [];
  for (let i = 0; i < plan.jobs.length; i++) {
    const job = plan.jobs[i];
    const args = { ...job.args, execute, preflight: !execute, confirm: execute ? opts.confirm : undefined };
    process.stderr.write(`[CommandBatch] ${i + 1}/${plan.jobs.length} ${job.command} ${args.table} ${execute ? 'EXECUTE' : 'PREFLIGHT'}\n`);
    try {
      const result = await invoke(args);
      results.push({ index: i + 1, command: job.command, table: args.table, ...result });
      if (!result.ok && plan.stopOnError !== false) break;
    } catch (error) {
      results.push({ index: i + 1, command: job.command, table: args.table, ok: false, error: error.message, writes: 0 });
      if (plan.stopOnError !== false) break;
    }
  }
  return { ok: results.length === plan.jobs.length && results.every(x => x.ok), mode: execute ? 'execute' : 'preflight', jobs: plan.jobs.length, completed: results.length, results };
}
if (require.main === module) {
  const argv = process.argv.slice(2);
  const file = argv[argv.indexOf('--file') + 1];
  try {
    if (!argv.includes('--file') || !file || file.startsWith('--')) throw Error('BATCH_FILE_REQUIRED');
    const plan = JSON.parse(fs.readFileSync(file, 'utf8'));
    runBatch(plan, { execute: argv.includes('--execute'), confirm: argv[argv.indexOf('--confirm') + 1] })
      .then(result => { console.log(JSON.stringify(result, null, 2)); if (!result.ok) process.exitCode = 2; })
      .catch(error => { console.error(error.message); process.exitCode = 1; });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { runBatch };
