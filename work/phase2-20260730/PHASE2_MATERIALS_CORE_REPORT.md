# Xin’s Music Lab — Phase 2 Materials Core Report

Date: 2026-07-30  
Status: **PASS — native materials, shared Mapping, and field consumers integrated; artistic acceptance remains open**

## Outcome

The editable Fusion baseline now contains two native visual materials:

- `spectral-fabric`;
- `temporal-strata`.

They are independent visual-source choices in a new “视觉材料 / MATERIAL”
catalog group. Existing classic, modern, Butterchurn, and Glitch entries remain
available and unchanged.

This is a Phase 2 core-integration milestone, not a product deployment. The
installed product at `D:\Program Files\xins-music-lab-fusion` was not modified.

## Material behavior

### Spectral Fabric

`spectral-fabric` turns the supplied spectrum profile into a continuous
two-dimensional density field. It does not draw bars, rings, scales, labels,
or instrument-like controls.

Output:

- color `MaterialSurface`;
- `density` MaterialField;
- coverage, mean-frame-difference, and actual-refresh-rate metrics.

### Temporal Strata

`temporal-strata` accumulates spectrum rows on the shared engine clock. New
rows enter at the lower boundary; previous rows remain as readable history and
fade by age. Its lowest `material.refreshRate` setting produces an actual
1,500 ms refresh interval, so the history layers remain visibly separate.

Output:

- color `MaterialSurface`;
- `density` MaterialField;
- `age` MaterialField;
- coverage, mean-frame-difference, and actual-refresh-rate metrics.

## Architecture boundary

Both materials are created by `VisualMaterialRegistry` and implement the same
lifecycle as the Phase 1 adapters:

`reset / update / render / outputs / status`

They receive only the already-created material frame:

- shared frame index and engine time;
- a 96-sample spectrum profile;
- current energy snapshot;
- current palette;
- current `material.*` parameters.

The module does not:

- read an analyser or audio source;
- access XLD or realtime providers;
- create a second animation loop or clock;
- call `Math.random`;
- set Generator/Glitch targets;
- expose a Canvas rendering context in its public output contract.

Material selection remains registry-owned; there is no new
`activeEffect === ...` branch in the animation loop.

## Material target control

The existing independent target registry supplies:

- `material.coverage`;
- `material.continuity`;
- `material.refreshRate`;
- `material.density`.

The shared material snapshot now receives four real Generator mappings:

- `audio.loudness → material.coverage`;
- `audio.flatness → material.continuity` with inverted polarity;
- `audio.flux → material.refreshRate`;
- `audio.spectralDensity → material.density`.

These mappings are runtime extensions of the same `TargetMixer.mixFrame`
evaluation used by the Glitch preset. Material targets are explicitly owned
by the Material layer, are excluded from the Glitch energy budget, and do not
change the formal 21-target renderer binding contract. The bounded
`setTargets()` interface remains available as a manual/test override.

The host frame is split into two synchronous phases:

1. `pre-material`: resolve music, evaluate Generator mappings, accept
   `material.*`;
2. render Material;
3. `post-material`: render Generator from the newly produced Material output,
   then observe ownership, stability, and output state.

This removes the prior hidden one-frame dependency while preserving one RAF
owner.

## Generator interoperability

Runtime smoke exercised both materials with three Generator presets:

- `balanced`;
- `temporal-excavation`;
- `raster-deflection`.

All six material/preset cells passed:

- material output contract present;
- expected MaterialField IDs present;
- Generator source kind is `material-canvas`;
- Material output, Generator source, and orchestrator frame indexes match;
- Generator render status is `rendered`;
- formal target binding count remains 21;
- Generator reports the expected consumed MaterialField IDs;
- status metrics are finite.

Observed runtime:

- material registry entries: 29;
- material targets: 4;
- material frames: 515;
- Generator/Glitch observations: 513;
- frame mismatches: 0;
- single-RAF ownership violations: 0;
- runtime assertions: 57 / 57;
- runtime errors: 0.

## MaterialField consumer

Generator's source-aware renderer now accepts the complete Material source
payload rather than discarding everything except the color canvas.

- `density` is sampled as a spatial susceptibility mask for block commits,
  grain, and signal dropout.
- `age` is sampled as a bounded local bias on feedback retention.
- Missing fields resolve to neutral 0.5, keeping the legacy source path
  behavior unchanged.
- The fields use dedicated WebGL textures and report
  `xin.generator-material-fields/1` diagnostics.
- Custom GLSL passes remain compatible because absent field uniforms resolve
  as inactive locations.

`spectral-fabric` reports consumed field `density`; `temporal-strata` reports
consumed fields `density` and `age`.

## Deterministic replay

- Generator fixed-frame tests prove the Mapping extension survives product
  preset swaps and transport-epoch rewind/reset.
- Desktop runtime replay proves pause, seek, and track-change Material resets
  resume on the same Generator frame.
- Hidden-window pause/resume proves evaluation and rendering stop together and
  resume together.

## High-density evidence

The fixture was captured before adding any adaptive normalization.

### Spectral Fabric

- coverage: 0.828485;
- next-frame mean difference: 0.008172;
- fixture resolution: 640 × 360.

### Temporal Strata

- coverage: 1.000000;
- next-frame mean difference: 0.004131;
- actual refresh rate: 20 Hz;
- accumulated refreshes: 150;
- fixture resolution: 640 × 360.

Both high-density fixtures remain non-static. `temporal-strata` preserves its
layer order at full coverage instead of collapsing into one flat maximum.

## Verification

- Fusion declared checks and contracts: **88 / 88 PASS**.
- Generator TypeScript build: **PASS**, browser distribution 86 files.
- Generator consolidated suite: **327 / 327 PASS** across 73 test files.
- Experimental material determinism/lifecycle contract: **PASS**.
- Phase 2 integration/ownership contract: **PASS**, zero ownership warnings.
- Electron runtime smoke: **57 / 57 PASS**, zero runtime errors.
- Two materials × three Generator presets: **6 / 6 PASS**.
- FX OFF runtime screenshots: captured for both materials.
- High-density fixture screenshots: captured for both materials.

## Acceptance still open

The following work is deliberately not claimed complete:

1. run a fixed real-audio listening corpus covering silence, sparse passages,
   builds, drops, and sustained high density;
2. capture the same two materials through the full Glitch preset matrix and
   judge whether material identity survives each destruction model;
3. tune the material art direction from listening evidence, without adding
   normalization before that evidence is reviewed.

Until those items pass, Phase 2 is **in progress**, even though its native
material core and runtime seam are operational.
