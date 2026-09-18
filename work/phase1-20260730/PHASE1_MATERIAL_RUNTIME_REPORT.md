# Xin’s Music Lab — Phase 1 Material Runtime Report

Date: 2026-07-30  
Status: **PASS — Task 1 architecture seam complete; installed product unchanged**

## Outcome

The editable Fusion baseline now treats the current visual catalog as a
registry of visual materials instead of selecting draw functions directly
inside the animation loop.

Implemented components:

- `VisualMaterialRegistry`;
- `MaterialRuntime`;
- legacy Canvas and Butterchurn material adapters;
- lifecycle: `reset / update / render / outputs / status`;
- abstract `MaterialSurface` color output with optional MaterialFields;
- `MaterialTargetRegistry` with an independent `material.*` namespace;
- `MaterialFrameOrchestrator`;
- explicit material reset reasons;
- Generator source-contract extension;
- formal Generator target ownership metadata;
- cross-layer duplicate-semantic diagnostics.

All 27 existing visual entries are registered as legacy adapters. This is an
architecture-only change: their existing draw functions, Canvas targets,
palettes, and Generator output remain in use.

## Contracts

### Material output

The runtime exposes:

- `xin.visual-material-registry/1`;
- `xin.material-runtime/1`;
- `xin.visual-material/1`;
- `xin.material-surface/1`;
- `xin.material-output/1`;
- `xin.material-frame-orchestrator/1`.

Phase 1 legacy adapters output only a required color surface. Material fields
remain optional.

### Generator source compatibility

The source adapter retains `xin.xml-visual-source/1` as its compatible base
contract and adds `xin.xml-material-source/1` metadata:

- material ID;
- material frame index;
- abstract surface descriptor;
- optional field IDs;
- color-only fallback to the previous Canvas source.

### Material targets and ownership

The independent registry currently defines:

- `material.coverage`;
- `material.continuity`;
- `material.refreshRate`;
- `material.density`.

All 21 formal Generator targets retain their existing IDs, ranges, defaults,
and shader bindings while adding:

- `actionClass`;
- `ownerLayer: glitch`;
- `semanticIntent`.

The ownership diagnostic reports same-source, same-action-class,
cross-layer duplication as a warning. `allowDuplicate` is an explicit
exemption and warnings are not hard failures.

## Frame order and reset behavior

The current runtime order is:

```text
legacy analysis/mapping snapshot
→ Material update
→ Material render
→ Generator evaluation/render on the same engine frame
→ Composer/output layers
```

Electron smoke observed Material frame 576 and Generator source frame 576,
with zero frame mismatches.

Explicit reset reasons are connected for:

- material change;
- resize;
- seek;
- track change;
- pause/resume;
- source-mode change;
- renderer fallback;
- disposal.

## Verification

- Generator TypeScript typecheck: PASS.
- Generator browser build: PASS, 86 files.
- Generator consolidated suite: PASS, 322 / 322 tests across 73 files.
- Generator package staging: PASS.
  - tools package: 433 files;
  - vendor dist: 430 files;
  - parity failures: zero.
- Fusion declared contracts: PASS, 80 / 80 commands.
- Electron/WebGL runtime smoke: PASS, 54 / 54 assertions.
  - material registry entries: 27;
  - initial material targets: 4;
  - Material/Generator frame alignment: PASS;
  - frame mismatch count: zero;
  - runtime error count: zero;
  - injected context recovery: PASS.
- Visual screenshot inspection: PASS.
- Installed Generator verification: 430 / 430 files, zero differences.
- `D:\Program Files\xins-music-lab-fusion` was not modified.

Machine-readable report:

`D:\Projects\Xin-Music-Lab-Fusion\artifacts\phase1-20260730\phase1-material-runtime-report.json`

Runtime report:

`D:\Projects\Xin-Music-Lab-Fusion\artifacts\phase1-20260730\phase1-material-runtime-smoke.json`

Runtime screenshot:

`D:\Projects\Xin-Music-Lab-Fusion\artifacts\phase1-20260730\phase1-material-runtime-smoke.png`

## Remaining Phase 1 work

Task 1 establishes and validates the seam, but it does not complete the whole
Phase 1:

1. register a real `material.*` Mapping in the shared evaluator snapshot;
2. define the replay-fixture adapter scope;
3. move in-scope image-affecting randomness to seeded visual state;
4. verify material change, seek, track change, resize, and pause/resume with
   deterministic replay fixtures;
5. keep Phase 2 material design out of this engineering step.

The installed product must remain read-only until a later explicit deployment
approval.
