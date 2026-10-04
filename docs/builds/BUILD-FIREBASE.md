# BUILD-FIREBASE

## 1. Purpose

This document defines the build artifact contract for Firebase targets, including
Cloud Run deployment units.

The repository source tree is not the Cloud Run deployment unit. Firebase deployment
must use artifacts produced by the Target Builder under `.build/`.

## 2. Build boundary

```text
Common Source
    |
    +-- npm run schema:build
    |
    +-- npm run target:build -- dev-firebase
            |
            v
          .build/
            |
            v
     Firebase deployment
```

`.build/` is the boundary between development source and target-specific deployable
artifacts.

Cloud Build is allowed to package/install the completed deployment unit, but it must
not reconstruct the Firebase target from the repository source tree.

## 3. Current target

The current Firebase target profile is:

```text
targets/dev-firebase.json
```

It identifies the development Firebase project used by the Target Builder.

## 4. Current artifact structure

The Firebase Target Builder produces the TimeTrip Firestore artifact and a self-contained
Cloud Run deployment unit.

```text
.build/
|-- portable-timetravel-firestore/
|   `-- DojoTimeTravelFirestore.cjs
|
`-- dev-firebase/
    `-- cloud-run/
        `-- dojo-time-travel-admin/
            |-- cloud/
            |   `-- time-travel/
            |       |-- admin-server.cjs
            |       |-- admin-api.cjs
            |       `-- target.cjs
            |-- targets/
            |   `-- dev-firebase.json
            |-- .build/
            |   `-- portable-timetravel-firestore/
            |       `-- DojoTimeTravelFirestore.cjs
            |-- package.json
            `-- package-lock.json
```

The exact internal files may evolve as Firebase functionality grows. The contract is
that each deployment unit contains the runtime files and package metadata required to
deploy and run that unit without depending on unrelated repository content.

## 5. Self-contained deployment unit

A Cloud Run deployment unit is self-contained when:

- all runtime files required by its entry point are present;
- generated runtime artifacts required by the application are present;
- runtime package metadata and dependency lock information are present;
- target-specific runtime configuration required by the unit is present;
- the unit does not depend on `docs/`, `work/`, or development-only `tools/`;
- Cloud Build does not need to run the repository Target Builder again.

The deployment unit may contain an internal `.build/` directory when an existing runtime
module expects a generated artifact at that relative path. This internal directory is
part of the deployment unit and is distinct from using the repository root as the
deployment source.

## 6. Deployment rule

Cloud Run deployment must use the generated deployment unit:

```text
npm run target:build -- dev-firebase
        |
        v
.build/dev-firebase/cloud-run/dojo-time-travel-admin/
        |
        v
gcloud run deploy --source <deployment-unit>
        |
        v
Cloud Run
