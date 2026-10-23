'use strict';

const fs = require('node:fs');
const path = require('node:path');

const EXPECTED_PROJECT_ID = 'dojo-management-dev';
const LOCATION_ID = 'PAPER_UNKNOWN_LOCATION';
const BILLING_BLOCK_ID = 'PAPER_UNKNOWN_BILLING_BLOCK';
const SLOT_IDS = Object.freeze(Array.from({length: 8}, (_, index) => `PAPER_UNKNOWN_SLOT_${index + 1}`));
const CREATE_SLOT_IDS = Object.freeze(SLOT_IDS.slice(2));
const COLLECTIONS = Object.freeze({locations: 'dojos', blocks: 'billing_blocks', slots: 'training_slots'});

function slotFields(number) {
  return {
    slot_id: `PAPER_UNKNOWN_SLOT_${number}`,
    location_id: LOCATION_ID,
    display_name: '稽古枠不明',
    day_of_week: '',
    start_time: '',
    end_time: '',
    duration_minutes: 60,
    billing_block_id: BILLING_BLOCK_ID,
    attendance_allowed: true,
    billing_allowed: false,
    status: '有効',
    notes: `紙取込の同日${number}回目を識別する内部枠`
  };
}

const EXPECTED_SLOTS = Object.freeze(Object.fromEntries(SLOT_IDS.map((id, index) => [id, Object.freeze(slotFields(index + 1))])));

function assertDevProfile(profile) {
  if (!profile || profile.target !== 'dev-firebase' || profile.mode !== 'development' ||
      profile.projectId !== EXPECTED_PROJECT_ID || profile.confirmedDevelopmentProject !== EXPECTED_PROJECT_ID) {
    throw new Error('PAPER_MASTER_DEV_PROJECT_REQUIRED');
  }
}

function sameRequiredFields(actual, expected) {
  return Boolean(actual) && Object.entries(expected).every(([key, value]) => actual[key] === value);
}

function publicDocument(collection, id, fields) {
  return {collection, id, fields: fields ? {...fields} : null};
}

function planMigration(snapshot, profile) {
  assertDevProfile(profile);
  if (!snapshot || typeof snapshot !== 'object') throw new Error('PAPER_MASTER_SNAPSHOT_REQUIRED');
  const location = snapshot.location || null;
  const block = snapshot.block || null;
  const slots = snapshot.slots || {};
  const issues = [];

  if (!sameRequiredFields(location, {location_id: LOCATION_ID, status: '有効'})) {
    issues.push({id: LOCATION_ID, reason: 'LOCATION_PRECONDITION_MISMATCH'});
  }
  if (!block || block.billing_block_id !== BILLING_BLOCK_ID || block.location_id !== LOCATION_ID || block.status !== '有効') {
    issues.push({id: BILLING_BLOCK_ID, reason: 'BILLING_BLOCK_IDENTITY_MISMATCH'});
  }
  for (const id of SLOT_IDS.slice(0, 2)) {
    if (!sameRequiredFields(slots[id], EXPECTED_SLOTS[id])) issues.push({id, reason: 'EXISTING_SLOT_PRECONDITION_MISMATCH'});
  }

  const newSlotStates = CREATE_SLOT_IDS.map(id => {
    if (!slots[id]) return {id, state: 'missing'};
    if (sameRequiredFields(slots[id], EXPECTED_SLOTS[id])) return {id, state: 'expected'};
    return {id, state: 'collision'};
  });
  for (const row of newSlotStates.filter(row => row.state === 'collision')) {
    issues.push({id: row.id, reason: 'NEW_SLOT_ID_COLLISION'});
  }

  const blockInitial = block?.slots_per_charge === 2 && block?.maximum_training_slots === 2;
  const blockApplied = block?.slots_per_charge === 8 && block?.maximum_training_slots === 8;
  if (!blockInitial && !blockApplied && block) issues.push({id: BILLING_BLOCK_ID, reason: 'BILLING_BLOCK_CAPACITY_PRECONDITION_MISMATCH'});

  const allMissing = newSlotStates.every(row => row.state === 'missing');
  const allExpected = newSlotStates.every(row => row.state === 'expected');
  const partiallyApplied = !allMissing && !allExpected;
  if (partiallyApplied) issues.push({reason: 'PARTIAL_APPLICATION_DETECTED'});

  let state = 'BLOCKED';
  if (!issues.length && blockInitial && allMissing) state = 'READY_TO_APPLY';
  else if (!issues.length && blockApplied && allExpected) state = 'ALREADY_APPLIED';
  else if (partiallyApplied || (blockApplied && allMissing) || (blockInitial && allExpected)) state = 'PARTIALLY_APPLIED';

  const creates = state === 'READY_TO_APPLY'
    ? CREATE_SLOT_IDS.map(id => publicDocument(COLLECTIONS.slots, id, EXPECTED_SLOTS[id])) : [];
  const update = state === 'READY_TO_APPLY' ? {
    collection: COLLECTIONS.blocks,
    id: BILLING_BLOCK_ID,
    before: {slots_per_charge: 2, maximum_training_slots: 2},
    after: {slots_per_charge: 8, maximum_training_slots: 8}
  } : null;

  return {
    ok: state === 'READY_TO_APPLY' || state === 'ALREADY_APPLIED',
    projectId: profile.projectId,
    state,
    targetIds: [LOCATION_ID, BILLING_BLOCK_ID, ...SLOT_IDS],
    targetCount: 10,
    writeCount: state === 'READY_TO_APPLY' ? 7 : 0,
    creates,
    update,
    issues,
    current: {
      location: publicDocument(COLLECTIONS.locations, LOCATION_ID, location),
      billingBlock: publicDocument(COLLECTIONS.blocks, BILLING_BLOCK_ID, block),
      slots: SLOT_IDS.map(id => publicDocument(COLLECTIONS.slots, id, slots[id] || null))
    },
    rollback: {
      eligibleBeforeAttendanceUse: state === 'ALREADY_APPLIED',
      requiresAttendanceReferenceCheck: state === 'ALREADY_APPLIED',
      deleteIds: state === 'ALREADY_APPLIED' ? [...CREATE_SLOT_IDS] : [],
      restoreBillingBlock: state === 'ALREADY_APPLIED' ? {slots_per_charge: 2, maximum_training_slots: 2} : null
    }
  };
}

async function executeMigration(repository, profile, {apply = false, verify = false} = {}) {
  assertDevProfile(profile);
  if (!repository || typeof repository.readSnapshot !== 'function') throw new Error('PAPER_MASTER_REPOSITORY_REQUIRED');
  if (!apply) {
    const plan = planMigration(await repository.readSnapshot(), profile);
    if (verify) return {...plan, ok: plan.state === 'ALREADY_APPLIED', operation: 'verify', appliedWrites: 0,
      verification: plan.state === 'ALREADY_APPLIED' ? 'PASS' : 'NOT_APPLIED'};
    return {...plan, operation: 'dry-run', appliedWrites: 0};
  }
  if (typeof repository.runAtomic !== 'function') throw new Error('PAPER_MASTER_TRANSACTION_REQUIRED');
  return repository.runAtomic(async (snapshot, writer) => {
    const plan = planMigration(snapshot, profile);
    if (plan.state === 'ALREADY_APPLIED') return {...plan, operation: 'apply', appliedWrites: 0};
    if (plan.state !== 'READY_TO_APPLY') {
      const error = new Error(`PAPER_MASTER_APPLY_BLOCKED:${plan.state}`);
      error.plan = plan;
      throw error;
    }
    for (const doc of plan.creates) writer.create(doc.collection, doc.id, doc.fields);
    writer.update(plan.update.collection, plan.update.id, plan.update.after);
    return {...plan, operation: 'apply', appliedWrites: 7};
  });
}

function createAdminRepository(db) {
  const refs = [
    db.collection(COLLECTIONS.locations).doc(LOCATION_ID),
    db.collection(COLLECTIONS.blocks).doc(BILLING_BLOCK_ID),
    ...SLOT_IDS.map(id => db.collection(COLLECTIONS.slots).doc(id))
  ];
  const decode = snapshots => ({
    location: snapshots[0].exists ? snapshots[0].data() : null,
    block: snapshots[1].exists ? snapshots[1].data() : null,
    slots: Object.fromEntries(SLOT_IDS.map((id, index) => [id, snapshots[index + 2].exists ? snapshots[index + 2].data() : null]))
  });
  return {
    async readSnapshot() { return decode(await db.getAll(...refs)); },
    async runAtomic(callback) {
      return db.runTransaction(async transaction => {
        const snapshots = await transaction.getAll(...refs);
        const writer = {
          create(collection, id, fields) { transaction.create(db.collection(collection).doc(id), fields); },
          update(collection, id, fields) { transaction.update(db.collection(collection).doc(id), fields); }
        };
        return callback(decode(snapshots), writer);
      });
    }
  };
}

function parseArgs(argv) {
  const allowed = new Set(['--apply', '--verify', '--confirm-project']);
  const values = {apply: false, verify: false, confirmProject: null};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!allowed.has(arg)) throw new Error('Usage: node work/update-paper-attendance-dev-masters.cjs [--verify] [--apply --confirm-project dojo-management-dev]');
    if (arg === '--apply') values.apply = true;
    else if (arg === '--verify') values.verify = true;
    else values.confirmProject = argv[++index] || null;
  }
  if (values.apply && values.confirmProject !== EXPECTED_PROJECT_ID) throw new Error('PAPER_MASTER_APPLY_CONFIRMATION_REQUIRED');
  if (!values.apply && values.confirmProject) throw new Error('PAPER_MASTER_CONFIRMATION_WITHOUT_APPLY');
  return values;
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const profile = JSON.parse(fs.readFileSync(path.join(root, 'targets', 'dev-firebase.json'), 'utf8'));
  const args = parseArgs(process.argv.slice(2));
  assertDevProfile(profile);
  const admin = require('firebase-admin');
  const {getFirestore} = require('firebase-admin/firestore');
  if (!admin.getApps().length) admin.initializeApp({credential: admin.applicationDefault(), projectId: EXPECTED_PROJECT_ID});
  if (admin.getApp().options.projectId !== EXPECTED_PROJECT_ID) throw new Error('PAPER_MASTER_ADMIN_PROJECT_MISMATCH');
  const repository = createAdminRepository(getFirestore(admin.getApp()));
  const result = await executeMigration(repository, profile, {apply: args.apply, verify: args.verify});
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (!result.ok) process.exitCode = 2;
}

if (require.main === module) main().catch(error => {
  const output = {ok: false, error: error.message};
  if (error.plan) output.plan = error.plan;
  console.error(JSON.stringify(output, null, 2));
  process.exitCode = 1;
});

module.exports = {
  EXPECTED_PROJECT_ID, LOCATION_ID, BILLING_BLOCK_ID, SLOT_IDS, CREATE_SLOT_IDS,
  EXPECTED_SLOTS, assertDevProfile, planMigration, executeMigration, createAdminRepository, parseArgs
};
