'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  EXPECTED_PROJECT_ID, LOCATION_ID, BILLING_BLOCK_ID, SLOT_IDS, CREATE_SLOT_IDS,
  EXPECTED_SLOTS, assertDevProfile, planMigration, executeMigration, createAdminRepository, parseArgs
} = require('./update-paper-attendance-dev-masters.cjs');

const profile = {target: 'dev-firebase', mode: 'development', projectId: EXPECTED_PROJECT_ID,
  confirmedDevelopmentProject: EXPECTED_PROJECT_ID};

function initialSnapshot() {
  return {
    location: {location_id: LOCATION_ID, display_name: '道場不明', status: '有効', notes: '紙の出席記録取込専用'},
    block: {billing_block_id: BILLING_BLOCK_ID, location_id: LOCATION_ID, display_name: '課金枠不明',
      slots_per_charge: 2, maximum_training_slots: 2, status: '有効', untouched: 'preserve'},
    slots: Object.fromEntries(SLOT_IDS.map((id, index) => [id, index < 2 ? {...EXPECTED_SLOTS[id]} : null]))
  };
}

function appliedSnapshot() {
  const snapshot = initialSnapshot();
  snapshot.block.slots_per_charge = 8;
  snapshot.block.maximum_training_slots = 8;
  for (const id of CREATE_SLOT_IDS) snapshot.slots[id] = {...EXPECTED_SLOTS[id]};
  return snapshot;
}

function repository(snapshot) {
  const writes = [];
  return {
    writes,
    readSnapshot: async () => structuredClone(snapshot),
    runAtomic: async callback => callback(structuredClone(snapshot), {
      create: (collection, id, fields) => writes.push({type: 'create', collection, id, fields}),
      update: (collection, id, fields) => writes.push({type: 'update', collection, id, fields})
    })
  };
}

test('normal dry-run prints six creates and one narrow update without writes', async () => {
  const repo = repository(initialSnapshot());
  const result = await executeMigration(repo, profile);
  assert.equal(result.state, 'READY_TO_APPLY');
  assert.equal(result.writeCount, 7);
  assert.equal(result.appliedWrites, 0);
  assert.equal(result.creates.length, 6);
  assert.deepEqual(result.update.after, {slots_per_charge: 8, maximum_training_slots: 8});
  assert.deepEqual(repo.writes, []);
});

test('project mismatch fails closed', () => {
  assert.throws(() => assertDevProfile({...profile, projectId: 'production-project'}), /DEV_PROJECT_REQUIRED/);
  assert.throws(() => planMigration(initialSnapshot(), {...profile, confirmedDevelopmentProject: 'other'}), /DEV_PROJECT_REQUIRED/);
});

test('existing new-slot collision blocks the plan', () => {
  const snapshot = initialSnapshot();
  snapshot.slots.PAPER_UNKNOWN_SLOT_3 = {slot_id: 'PAPER_UNKNOWN_SLOT_3', duration_minutes: 30};
  const result = planMigration(snapshot, profile);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some(issue => issue.reason === 'NEW_SLOT_ID_COLLISION'));
});

test('billing block and existing slot preconditions are required', () => {
  const badBlock = initialSnapshot();
  badBlock.block.maximum_training_slots = 3;
  assert.ok(planMigration(badBlock, profile).issues.some(issue => issue.reason === 'BILLING_BLOCK_CAPACITY_PRECONDITION_MISMATCH'));
  const badSlot = initialSnapshot();
  badSlot.slots.PAPER_UNKNOWN_SLOT_2.duration_minutes = 30;
  assert.ok(planMigration(badSlot, profile).issues.some(issue => issue.reason === 'EXISTING_SLOT_PRECONDITION_MISMATCH'));
});

test('apply is explicit and stages all seven writes atomically in the mock', async () => {
  assert.throws(() => parseArgs(['--apply']), /APPLY_CONFIRMATION_REQUIRED/);
  const args = parseArgs(['--apply', '--confirm-project', EXPECTED_PROJECT_ID]);
  const repo = repository(initialSnapshot());
  const result = await executeMigration(repo, profile, args);
  assert.equal(result.appliedWrites, 7);
  assert.equal(repo.writes.filter(row => row.type === 'create').length, 6);
  assert.deepEqual(repo.writes.at(-1), {type: 'update', collection: 'billing_blocks', id: BILLING_BLOCK_ID,
    fields: {slots_per_charge: 8, maximum_training_slots: 8}});
});

test('partial and cross-state application are detected and cannot apply', async () => {
  const partial = initialSnapshot();
  partial.slots.PAPER_UNKNOWN_SLOT_3 = {...EXPECTED_SLOTS.PAPER_UNKNOWN_SLOT_3};
  const plan = planMigration(partial, profile);
  assert.equal(plan.state, 'PARTIALLY_APPLIED');
  await assert.rejects(() => executeMigration(repository(partial), profile, {apply: true}), /APPLY_BLOCKED:PARTIALLY_APPLIED/);
  const blockOnly = initialSnapshot();
  blockOnly.block.slots_per_charge = 8;
  blockOnly.block.maximum_training_slots = 8;
  assert.equal(planMigration(blockOnly, profile).state, 'PARTIALLY_APPLIED');
});

test('already applied state is idempotent and reports rollback prerequisites', async () => {
  const repo = repository(appliedSnapshot());
  const dry = await executeMigration(repo, profile);
  assert.equal(dry.state, 'ALREADY_APPLIED');
  assert.equal(dry.writeCount, 0);
  assert.equal(dry.rollback.requiresAttendanceReferenceCheck, true);
  const apply = await executeMigration(repo, profile, {apply: true});
  assert.equal(apply.appliedWrites, 0);
  assert.deepEqual(repo.writes, []);
});

test('verify mode passes only after the complete reflected state is visible', async () => {
  const before = await executeMigration(repository(initialSnapshot()), profile, {verify: true});
  assert.equal(before.ok, false);
  assert.equal(before.verification, 'NOT_APPLIED');
  const after = await executeMigration(repository(appliedSnapshot()), profile, {verify: true});
  assert.equal(after.ok, true);
  assert.equal(after.verification, 'PASS');
  assert.equal(after.appliedWrites, 0);
});

test('normal masters are outside the fixed read and write set', async () => {
  const result = await executeMigration(repository(initialSnapshot()), profile);
  assert.deepEqual(result.targetIds, [LOCATION_ID, BILLING_BLOCK_ID, ...SLOT_IDS]);
  assert.ok(result.creates.every(row => row.id.startsWith('PAPER_UNKNOWN_SLOT_')));
  assert.equal(result.update.id, BILLING_BLOCK_ID);
});

test('admin adapter reads and stages the complete change in one transaction', async () => {
  const initial = initialSnapshot();
  const staged = [];
  const ref = (collection, id) => ({collection, id});
  const refs = [ref('dojos', LOCATION_ID), ref('billing_blocks', BILLING_BLOCK_ID),
    ...SLOT_IDS.map(id => ref('training_slots', id))];
  const snapshots = refs.map(({collection, id}) => {
    const data = collection === 'dojos' ? initial.location : collection === 'billing_blocks' ? initial.block : initial.slots[id];
    return {exists: Boolean(data), data: () => structuredClone(data)};
  });
  const db = {
    collection: collection => ({doc: id => ref(collection, id)}),
    getAll: async (...actual) => { assert.deepEqual(actual, refs); return snapshots; },
    runTransaction: async callback => callback({
      getAll: async (...actual) => { assert.deepEqual(actual, refs); return snapshots; },
      create: (document, fields) => staged.push({type: 'create', document, fields}),
      update: (document, fields) => staged.push({type: 'update', document, fields})
    })
  };
  const repo = createAdminRepository(db);
  assert.equal(planMigration(await repo.readSnapshot(), profile).state, 'READY_TO_APPLY');
  const result = await executeMigration(repo, profile, {apply: true});
  assert.equal(result.appliedWrites, 7);
  assert.equal(staged.length, 7);
  assert.equal(staged.at(-1).document.id, BILLING_BLOCK_ID);
});
