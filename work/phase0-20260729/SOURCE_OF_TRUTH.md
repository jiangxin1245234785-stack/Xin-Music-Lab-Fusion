# Xin’s Music Lab — Phase 0 Source of Truth

Date: 2026-07-29  
Status: baseline audit; no deployment mutation

## Decision

The intended editable source for the Glitch Generator is:

`C:\Users\12452\Documents\Codex\2026-06-17\new-chat\.webgl-opt\glitch-generator`

The current product deployment is:

`D:\Program Files\xins-music-lab-fusion`

The directory below is legacy source and must not be used for new work:

`D:\Program Files\xins-music-lab-fusion\glitch-generator`

## Current exception

The intended TypeScript source is not presently build-safe as the source of the
running product. Its built-in preset source still contains the removed
`fracture` and `impact` presets and does not contain the currently deployed
`temporal-excavation`, `raster-deflection`, and `bitplane-drift` mechanisms.
Several renderer and runtime files also differ from the deployed JavaScript.

Therefore:

1. The D: deployment remains the frozen runtime reference for Phase 0.
2. No Generator rebuild may be deployed from the TypeScript source until the
   deployed mechanisms and tests have been reconstructed in TypeScript.
3. The generated `deployment-baseline.json` is the machine-readable record of
   the exact files and hashes captured at this point.
4. Phase 1 coding must begin from a reconciled workspace copy, never by directly
   editing the D: deployment.

## Deployment copies

The product currently contains four copies of Generator
`6.6.1-integration-v.3`:

1. `vendor\glitch-generator\6.6.1-integration-v.3`
2. `tools\glitch-generator\6.6.1-integration-v.3`
3. `desktop-build\app\vendor\glitch-generator\6.6.1-integration-v.3`
4. `desktop-build\app\tools\glitch-generator\6.6.1-integration-v.3`

The Phase 0 manifest compares both complete package contents and runtime-relevant
files. Source maps and packaging-only files may differ between installed and
desktop-build copies; executable runtime files must remain equivalent.

The normalized comparison produced these additional findings:

- Current `tools\...\dist` and current flattened `vendor\...` are identical.
- `desktop-build\app\tools\...\dist` and its flattened `vendor\...` are
  identical to each other.
- The existing `desktop-build` pair is not identical to the current installed
  pair: 59 runtime-relevant paths differ. It is an old packaging artifact, not
  a deployable release candidate.
- The intended canonical `dist` differs from the current installed runtime at
  nine paths. The differences include built-in presets, the minimal renderer,
  source-aware render port, runtime facade, uniform registry, and one UI
  catalog.

Consequently, a future release must first reconcile TypeScript, then run the
desktop build from the reconciled source. Neither the old `desktop-build`
directory nor the old TypeScript `dist` may be promoted directly.

## Required reconciliation gate before Phase 1

- Backport the three current experimental mechanisms into TypeScript.
- Preserve the five product built-ins and keep `fracture` / `impact` removed.
- Backport the eight-frame history-reservoir renderer behavior.
- Backport the runtime facade, source-aware render port, and uniform registry
  changes that are present only in the deployed build.
- Add deterministic contract tests for all backported behavior.
- Rebuild into a clean workspace and compare its runtime manifest with the
  frozen deployment manifest.
- Only after parity is demonstrated may a new build be considered deployable.
