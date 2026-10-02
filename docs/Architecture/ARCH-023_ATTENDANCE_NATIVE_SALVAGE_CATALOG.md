# ARCH-023 Attendance Native Salvage Catalog

Status: ACTIVE / REFERENCE
Date: 2026-10-02
Source checkpoint: pre-removal baseline `AikidoDojoManagement-main(64).zip`
Production restoration commit: `0083d3c refactor: restore canonical Attendance core`

## 1. Purpose

Phase 1 removed the Attendance Native/Portable detour from the production execution path and restored the canonical `attendanceCore_registerBatch_()` path.

This document does **not** classify the removed implementation as useless code. The Native implementation was a working design experiment with tests. Its production topology was too large for the problem being solved, but several internal ideas and functions are reusable.

The objective here is therefore:

> Remove unnecessary runtime architecture, but preserve useful implementation knowledge as a code parts catalog.

A future developer should be able to read this document, copy a suitable pattern, rename the domain-specific pieces, and start implementation without reconstructing the experiment from Git history.

## 2. Reuse classes

| Class | Meaning | Treatment |
|---|---|---|
| A | Nearly copy/paste reusable | Preserve code shape; rename domain and fields |
| B | Pattern reusable | Preserve structure; rewrite domain rules |
| C | Reference implementation | Use for comparison/design review, not direct copying |
| D | Anti-pattern specimen | Preserve because it prevents repeating the same architectural cost |

The same source can contain both A/B assets and D-level topology. The classification is about the **part**, not a blanket judgment of the whole experiment.

## 3. Source map

Canonical production source before/after restoration:

```text
gas/04_AttendanceCore.js
  attendanceCore_registerBatch_()
  attendanceCore_getMemberMap_()
  attendanceCore_getSlotMap_()
  attendanceCore_findRowsForScope_()
  attendanceCore_updateRows_()
```

Native experiment sources preserved by the pre-removal baseline/Git history:

```text
shared/AttendanceNative.js
  collectAttendanceFacts()
  makeAttendancePlan()
  recordAttendancePlan()
  postAttendancePlan()

shared/ApplicationAttendanceNative.js
  createApplication()
  registerAttendanceCore()

gas/DojoAttendanceNative.js
  generated GAS runtime bundle

gas/DojoAttendanceEntry.js
  existing GAS entry -> Native bridge
```

## 4. Asset A1 — Pure Plan function

Reuse class: **A/B**

### What to look at

`shared/AttendanceNative.js::makeAttendancePlan()` receives already-collected facts and returns a plan. It does not write Sheets or Firestore.

Actual source shape:

```javascript
function makeAttendancePlan(options = {}, facts = {}, dependencies = {}) {
  // ...normalize/validate...

  const rowsToAppend = [];
  const rowsToCancel = [];
  const results = [];

  items.forEach(item => {
    // validate member / slots
    // find existing attendance
    // decide retain / cancel / append
  });

  return {
    result: {
      ok: true,
      attendance_session_id: attendanceSessionId,
      registered_count: rowsToAppend.length,
      retained_count: results.reduce(
        (sum,result)=>sum+result.retained_slot_ids.length, 0),
      cancelled_count: rowsToCancel.length,
      results
    },
    rowsToAppend,
    rowsToCancel
  };
}
```

The important property is not the function name. It is this contract:

```text
facts + request
      ↓
 pure decision
      ↓
plan { append, retain, cancel, result }
```

### Why it is useful

Business decisions can be tested without constructing a spreadsheet, Firestore connection, or persistence mock. Append/retain/cancel cases become ordinary input/output tests.

### Copy/paste template

For another reconciliation-style domain, start from this shape:

```javascript
function makeXxxPlan(options = {}, facts = {}, dependencies = {}) {
  const rowsToAppend = [];
  const rowsToUpdate = [];
  const rowsToCancel = [];
  const results = [];

  // 1. normalize request
  // 2. validate facts
  // 3. compare desired state with current state
  // 4. fill append/update/cancel collections

  return {
    result: { ok: true, results },
    rowsToAppend,
    rowsToUpdate,
    rowsToCancel
  };
}
```

Rename `Xxx`, replace the facts and business rules, but keep storage access outside this function.

### Do not copy automatically

Do not copy the surrounding Native/Application/Generated-runtime layers merely because a pure Plan function is useful. A Plan function can live inside or beside the existing canonical Core.

## 5. Asset A2 — Read → Plan → Write → Post decomposition

Reuse class: **B**

`shared/ApplicationAttendanceNative.js` made the execution order unusually clear:

```javascript
function registerAttendanceCore(options) {
  const facts=attendance.collectAttendanceFacts(dao);
  const plan=attendance.makeAttendancePlan(options,facts,{
    uuid:dependencies.uuid,
    now:dependencies.now,
    dateKey:dependencies.dateKey
  });
  if(!plan.result || plan.result.ok!==true) return plan.result;
  attendance.recordAttendancePlan(
    plan,options,dao,{uuid:dependencies.uuid,now:dependencies.now});
  return attendance.postAttendancePlan(
    plan,{projectAttendances:dependencies.projectAttendances});
}
```

This gives a useful conceptual pipeline:

```text
Read/Collect
   ↓
Plan/Decide
   ↓
Write/Record
   ↓
Post/Project
```

### Salvaged rule

Use these as **responsibility boundaries**, not as mandatory classes/files/layers.

A canonical Core may implement the same idea locally:

```javascript
function xxxCore_execute_(options, ctx) {
  const facts = xxxCore_readFacts_(options, ctx);
  const plan = xxxCore_makePlan_(options, facts);
  if (!plan.result.ok) return plan.result;

  xxxCore_writePlan_(plan, options, ctx);
  xxxCore_project_(plan, ctx);
  return plan.result;
}
```

This retains the clarity without creating a second execution architecture.

## 6. Asset A3 — Existing Core already had useful I/O seams

Reuse class: **A/C**

The canonical Attendance Core already contained DAO-facing helpers:

```javascript
function attendanceCore_getMemberMap_(ctx) {
  return daoAttendanceGetMemberMap_(ctx);
}

function attendanceCore_getSlotMap_(locationId, billingBlockId, ctx) {
  return daoAttendanceGetSlotMap_(locationId, billingBlockId, ctx);
}

function attendanceCore_findRowsForScope_(params, ctx) {
  return daoAttendanceFindRowsForScope_(params, ctx);
}

function attendanceCore_updateRows_(rows, updateValues, ctx) {
  return daoAttendanceUpdateRows_(rows, updateValues, ctx);
}
```

### Salvaged rule

Before introducing a new portability layer, inspect whether the existing Core already has an I/O seam. If it does, portability work should first target that seam.

The preferred order is:

```text
1. Existing DAO/helper boundary
2. Small local Core refactor
3. New adapter/facade only if 1-2 cannot satisfy the requirement
```

This is especially relevant to future GAS → Firestore/RDB work.

## 7. Asset A4 — Equivalence tests as migration scaffolding

Reuse class: **A/B**

The Native work included equivalence verification between canonical Attendance behavior and `makeAttendancePlan()` for behaviors such as:

```text
append
retain
cancel
clear/sync-unselected
member validation
slot validation
duplicate-member validation
```

### Salvaged rule

An equivalence test is valuable even when the replacement architecture is rejected.

Treat it as temporary migration scaffolding:

```javascript
const canonical = runCanonicalAttendance(input, initialState);
const candidate = runCandidatePlan(input, initialState);

assert.deepStrictEqual(candidate.result, canonical.result);
assert.deepStrictEqual(candidate.appended, canonical.appended);
assert.deepStrictEqual(candidate.cancelled, canonical.cancelled);
```

After restoration/refactoring, migrate useful cases into canonical Core regression tests rather than retaining a dead runtime solely to keep the equivalence test alive.

Phase 3 performs that conversion.

## 8. Asset A5 — Storage record mapping boundary

Reuse class: **A/B**

`shared/AttendanceNative.js` separated domain DTO fields from the persisted Attendance row:

```javascript
function toAttendanceStorageRecord(dto = {}) {
  return {
    attendance_id:dto.attendance_id,
    '稽古日':dto.attendance_date,
    '登録日時':dto.created_at,
    member_id:dto.member_id,
    target_month:dto.target_month,
    location_id:dto.location_id,
    slot_id:dto.slot_id,
    billing_block_id:dto.billing_block_id,
    teacher_id:dto.teacher_id,
    attendance_session_id:dto.attendance_session_id,
    '稽古時間分':dto.training_minutes,
    '状態':dto.status,
    source:dto.source,
    '備考':dto.remarks
  };
}
```

### Why it is useful

This is a small, understandable translation boundary. It can prevent Japanese sheet-column names or storage-specific field conventions from leaking into pure decision logic.

### Reuse rule

A small mapper is preferable to creating a new runtime topology. Copy this pattern when a domain DTO and persistence schema genuinely differ.

## 9. Asset A6 — Dependency injection for nondeterministic values

Reuse class: **A**

Native code injected UUID/date behavior instead of directly binding every decision to GAS globals:

```javascript
const uuid = dependencies.uuid;
if(typeof uuid !== 'function') throw new Error('UUID_PROVIDER_REQUIRED');

const dateKey = dependencies.dateKey || (value => {
  if(value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value == null ? '' : value).trim().slice(0, 10);
});
```

### Salvaged rule

For pure/testable logic, inject nondeterministic or environment-specific behavior such as:

```text
UUID
clock / now
calendar/date normalization
external projection callback
```

Do not interpret this as requiring a dependency-injection framework. Function parameters are sufficient when the dependency set is small.

## 10. Specimen D1 — `readAll()` can hide an access regression

Reuse class: **D**

The Native collect phase was storage-neutral but broad:

```javascript
function collectAttendanceFacts(dao) {
  if(!dao || typeof dao.readAll !== 'function')
    throw new Error('ATTENDANCE_DAO_REQUIRED');
  return {
    members: dao.readAll('members'),
    teachers: dao.readAll('teachers'),
    locations: dao.readAll('locations'),
    billingBlocks: dao.readAll('billingBlocks'),
    trainingSlots: dao.readAll('trainingSlots'),
    attendances: dao.readAll('attendance')
  };
}
```

The canonical Core instead had scope-aware access such as:

```javascript
const slots = attendanceCore_getSlotMap_(locationId, billingBlockId, ctx);

const existingRows = attendanceCore_findRowsForScope_({
  attendance_date: attendanceDate,
  member_id: memberId,
  location_id: locationId,
  billing_block_id: billingBlockId
}, ctx);
```

### Lesson

A storage-neutral API is not automatically a better persistence API.

Moving filtering above the DAO can turn a narrow query into full collection reads. This matters even more when moving from Sheets to Firestore/RDB because query cost, transfer volume, indexes, and latency become explicit.

### Guard

Before replacing a scoped DAO call with a generic `readAll()` contract, compare:

```text
rows read
filter location
index/query availability
network boundary
expected collection growth
```

## 11. Specimen D2 — Good internal decomposition does not justify a second runtime path

Reuse class: **D**

The useful internal pipeline eventually sat behind an additional production topology approximately like:

```text
existing Attendance entry
        ↓
DojoAttendanceEntry
        ↓
ApplicationAttendanceNative
        ↓
DojoAttendanceNative (generated bundle)
        ↓
Portable DAO
        ↓
storage
```

At the same time, the canonical Core and its DAO seams still existed.

### Lesson

A locally good abstraction can still be globally wrong if it creates a parallel execution architecture.

The decision question is not:

> Is the new design internally clean?

It is:

> What capability cannot be obtained by modifying the existing canonical path locally?

If that question has no concrete answer, do not create the second path.

## 12. Specimen D3 — Generated runtime has a high justification threshold

Reuse class: **C/D**

`gas/DojoAttendanceNative.js` was a generated GAS runtime bundle. At removal it accounted for roughly 640 generated lines, plus its builder and bridge code.

Generated code is not inherently bad, but it introduces:

```text
source module
+ builder
+ generated artifact
+ build hook
+ runtime bridge
+ tests for generated/runtime behavior
```

### Guard

Introduce generated runtime code only when at least one concrete requirement cannot be met acceptably by normal source composition/building already used by the project.

The design review must identify:

1. why generation is required,
2. which file is authoritative,
3. whether generated output is committed,
4. how stale output is detected,
5. how the runtime benefit exceeds the maintenance cost.

## 13. Asset/Question C1 — System Key reconciliation

Reuse class: **C / pending**

Native record code used:

```javascript
const reconciled = reconcileSystemKeys(
  appended[index],
  {uuid:dependencies.uuid,now:dependencies.now}
);
```

This may contain reusable value because key/time generation is a cross-domain concern. However, Phase 2 does **not** conclude that Attendance needs the surrounding Native runtime in order to obtain this benefit.

Future evaluation should ask whether `reconcileSystemKeys()` belongs at a canonical DAO/write boundary or another shared utility boundary.

Until that evaluation, treat this as a preserved candidate, not an adopted architectural requirement.

## 14. Recommended future implementation sequence

When another domain appears to need portability or pure decision logic, use this sequence:

```text
[1] Locate canonical Core
        ↓
[2] Locate existing DAO/I/O seams
        ↓
[3] Extract pure makeXxxPlan() only if useful
        ↓
[4] Keep scoped reads in DAO where possible
        ↓
[5] Keep write/project phases on canonical path
        ↓
[6] Add equivalence/regression tests
        ↓
[7] Only then consider a new facade/adapter/generated runtime
```

A practical starting template is therefore:

```javascript
function xxxCore_execute_(options, ctx) {
  const facts = xxxCore_readFacts_(options, ctx);
  const plan = makeXxxPlan(options, facts, {
    uuid: () => Utilities.getUuid(),
    now: () => sup_now(ctx)
  });

  if (!plan.result.ok) return plan.result;

  xxxCore_writePlan_(plan, options, ctx);
  xxxCore_project_(plan, ctx);
  return plan.result;
}
```

This intentionally salvages the best part of Native without recreating the discarded detour.

## 15. Phase 2 conclusion

The Attendance Native implementation is retained as a **design experiment and parts source**, not as production architecture.

What was removed:

```text
parallel production execution path
bridge layer
generated Native runtime
Native runtime build hook
```

What was salvaged:

```text
pure Plan function pattern
Read → Plan → Write → Post responsibility model
small storage-record mapper
dependency injection for UUID/time/date behavior
equivalence-test strategy
warning against readAll()-based portability
warning against parallel runtime topology
generated-runtime adoption criteria
System Key reconciliation candidate
```

The restoration therefore should not be described as throwing away the Native work. It converted an overextended production experiment into reusable architecture knowledge.
