# Xin Music Lab Fusion — Development Workspace

This directory is the development workspace for Xin’s Music Lab Fusion.

## Directory roles

- `source/fusion-runtime-baseline` — a cleaned, editable snapshot of the current installed Fusion runtime. Generated installer output, installed dependencies, backups, legacy Generator copies, and old desktop builds are excluded.
- `source/glitch-generator-typescript` — the TypeScript Generator source baseline, including its lockfile, tests, compiled baseline, and local development dependencies.
- `artifacts` — Phase 0 evidence, reports, screenshots, fixtures, and prior research outputs.
- `work` — Phase 0 measurement controls, source snapshots, and reproducibility scripts.
- `docs` — architecture, migration, research, and source-of-truth notes.

## Safety boundary

`D:\Program Files\xins-music-lab-fusion` remains the installed product and must not be used as an editable development directory.

Phase 1 may proceed in this workspace, but product deployment remains blocked until the TypeScript Generator source is reconciled with the current deployed JavaScript and a clean equivalent build is demonstrated.

