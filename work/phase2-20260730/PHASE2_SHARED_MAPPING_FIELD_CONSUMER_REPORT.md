# Xin’s Music Lab — Phase 2 Shared Mapping and MaterialField Consumer Report

Date: 2026-07-30  
Status: **PASS — implementation and deterministic runtime acceptance**

## Result

Phase 2 now has a complete development-path signal flow:

`resolved music frame → shared Generator Mixer → material.* → native Material → density/age fields → Generator destruction`

This is implemented in the editable D-drive baselines. It has not been
deployed to the installed product.

## Shared mappings

The host supplies four runtime Mapping extensions to Generator:

| Music source | Material target | Artistic role |
| --- | --- | --- |
| `audio.loudness` | `material.coverage` | amount of visible material |
| `audio.flatness` | `material.continuity` | tonal/noisy continuity, inverted |
| `audio.flux` | `material.refreshRate` | speed of material renewal |
| `audio.spectralDensity` | `material.density` | local information density |

All four use Generator's existing continuous Mapping conditioning, smoothing,
polarity, replacement, safety clamp, and deterministic clock behavior. There
is no second evaluator.

Material target definitions:

- use the `material.*` namespace;
- declare `module: Material` and `ownerLayer: material`;
- cannot collide with formal or custom Generator targets;
- are excluded from the Glitch energy budget;
- remain subject to their own declared absolute ranges.

The formal Glitch registry and renderer binding contract remain exactly 21
targets.

## Same-frame order

The previous host order generated Material before resolving Generator
Mappings. Phase 2 now executes:

1. `pre-material`: unified music resolution and one Generator evaluation;
2. accept the resulting `material.*` values;
3. update and render the selected Material;
4. `post-material`: upload the new color surface plus MaterialFields and
   render Generator;
5. observe ownership/stability and switch formal output.

The host still owns exactly one RAF. All observers that depend on a render
result run in `post-material`, preventing false one-frame ownership failures.

## MaterialField consumer

The source-aware render payload keeps:

- the color source;
- optional `density`;
- optional `age`.

Generator uploads `density` and `age` to dedicated textures. The built-in
feedback pass uses density to bias block, grain, and dropout susceptibility,
and age to apply a small bounded local feedback-retention bias. Missing fields
use neutral values; existing Canvas and Butterchurn sources remain valid.

Runtime diagnostics report:

- contract `xin.generator-material-fields/1`;
- available field IDs;
- per-field source dimensions;
- unchanged formal binding count of 21.

## Verification

- Generator TypeScript typecheck/build: PASS.
- Generator consolidated suite: **327 / 327** across 73 files.
- Fusion declared commands: **88 / 88**.
- Electron runtime assertions: **57 / 57**.
- Material × Generator preset cells: **6 / 6**.
- Shared Mapping comparison: PASS for both materials.
- MaterialField consumption:
  - `spectral-fabric`: `density`;
  - `temporal-strata`: `density`, `age`.
- Desktop lifecycle replay: pause, seek, and track-change all PASS.
- Hidden-window pause/resume: PASS.
- Material/Generator frame mismatch count: 0.
- Single-RAF ownership violations: 0.
- Runtime errors: 0.

Evidence:

- `D:\Projects\Xin-Music-Lab-Fusion\artifacts\phase2-20260730\phase2-shared-mapping-runtime-smoke-v3.json`
- `D:\Projects\Xin-Music-Lab-Fusion\artifacts\phase2-20260730\phase2-materials-report.json`

## Remaining Phase 2 acceptance

Engineering blockers for shared Mapping and MaterialField consumption are
closed. Phase 2 still needs:

1. a fixed real-audio listening corpus;
2. the full Material × Glitch artistic acceptance matrix;
3. art-direction tuning based on that evidence.

The installed product remains unchanged. Deployment requires separate,
explicit approval.
