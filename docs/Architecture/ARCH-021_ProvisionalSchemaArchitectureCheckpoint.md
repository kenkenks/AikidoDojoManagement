# ARCH-021 Provisional Schema Architecture Checkpoint

Date: 2026-10-01
Status: Provisional / not connected to runtime or build

## Purpose

Portable Data Definition has reached the point where previously deferred Dictionary, View Definition, Provider separation, and Build Target concepts can be left as concrete architectural evidence before implementation.

This checkpoint deliberately records the map, route, and equipment without changing runtime behavior.

## Provisional structure

```text
schema/
├── Dictionary.yml
├── ID.yml
├── View.yml
├── Target.yml
└── providers/
    ├── host/
    │   ├── gas.yml
    │   └── firebase.yml
    └── database/
        ├── spreadsheet.yml
        ├── firestore.yml
        └── postgres.yml
```

## Responsibilities

- Entity Definition: defines the logical structure of the Entity. Entity existence is represented by the Entity Definition file itself.
- Dictionary: controlled vocabulary for terms, types, formats, known values, and standard human-facing labels.
- ID: defines which Entity an ID identifies. Relation is not duplicated now; it can later be derived from ID Definition and Entity Definition.
- View: selects required Sources and Fields without putting View knowledge into Entity definitions.
- Provider: contains physical-environment differences. Host / Runtime and Database / Storage are separate axes.
- Target: selects one Host Provider and one Database Provider for a build configuration.

## Target rule

Targets are alternatives, not an instruction to build every Provider combination at once. A build selects only the required Target. Demo GAS, production GAS, and production Firebase may therefore exist as distinct Targets even when some Provider combinations are shared.

## Design baseline

Firestore is the primary design baseline. Portability remains a goal, but GAS / Spreadsheet constraints must not flow back into Logical Definitions. GAS is treated as a compatibility Provider for systems where it remains appropriate.

If a physical table requires a prefix, the provisional direction is to express it as a general Entity/Table `table_prefix`, not as a GAS-specific property. No prefix is represented by an empty string so simple concatenation remains a natural no-op.

## Implementation state

The YAML files introduced with this checkpoint are evidence only. They are intentionally not connected to runtime, `schema:build`, or Portable Builders yet. Their detailed shapes may change as real code is connected.

This checkpoint fixes the current architectural direction, not a completed specification.
