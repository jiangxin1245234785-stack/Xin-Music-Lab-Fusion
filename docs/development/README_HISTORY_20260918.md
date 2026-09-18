# 开发 README 历史快照

归档于 2026-09-18；保留历史状态，不是当前下载说明。最新入口见 [项目首页](../../README.md)。部分本机发行包和试听链接不随 GitHub 提供。

---

# Xin Music Lab Fusion — Development Workspace

This directory is the development workspace for Xin’s Music Lab Fusion.

GitHub: https://github.com/jiangxin1245234785-stack/Xin-Music-Lab-Fusion

[GitHub workflow and local-runtime setup](../../docs/GITHUB_WORKFLOW.md). The repository contains source and selected documentation; models, music, generated results and installed environments remain local.

Latest development: **0.5.0-dev.history.1** (XLD core.25 / XML stems.10), 2026-09-17. Launch from `releases/0.5.0-dev.history.1`; P0 round A separates historical MIDI readability from current-version cache matching. This is a locally verified development build, not a clean-machine release certification.

- [Claude handoff / 接手入口](../../CLAUDE_HANDOFF.md)
- [完整开发进度与后续计划](../../docs/XLD_XML_STATUS_AND_ROADMAP_20260917.md)

Current status and history:

- `SOURCE_OF_TRUTH.md` — current authoritative state and safety boundary.
- `DEVELOPMENT_LOG.md` — chronological development, decisions, verification,
  and remaining work.

The older Phase 1/2 status below documents the visual-material workstream. For current XLD analysis and MIDI work, use the handoff above.

## Directory roles

- `source/xld-runtime-baseline` — XLD analysis owner, workbench, stems, refinement, MIDI and storage.
- `runtime` — shared isolated Python environments and model weights.
- `releases` — independently launchable release candidates and development builds.
- `source/fusion-runtime-baseline` — a cleaned, editable snapshot of the current installed Fusion runtime. Generated installer output, installed dependencies, backups, legacy Generator copies, and old desktop builds are excluded.
- `source/glitch-generator-typescript` — the TypeScript Generator source baseline, including its lockfile, tests, compiled baseline, and local development dependencies.
- `artifacts` — Phase 0 evidence, reports, screenshots, fixtures, and prior research outputs.
- `work` — Phase 0 measurement controls, source snapshots, and reproducibility scripts.
- `docs` — architecture, migration, research, and source-of-truth notes.

## Safety boundary

`D:\Program Files\xins-music-lab-fusion` remains the installed product and must not be used as an editable development directory.

Phase 1 source reconciliation and Task 1 Material architecture passed on
2026-07-30. The TypeScript Generator owns the current five-preset mechanism
set, eight-frame history behavior, shader pipeline, and ownership metadata for
all 21 formal targets. Its clean build passes 322 / 322 Generator tests.

The editable Fusion baseline now has a `VisualMaterialRegistry`,
`MaterialRuntime`, legacy adapters, `MaterialTargetRegistry`, frame
orchestrator, abstract MaterialSurface output, and a backward-compatible
Material source extension. Fusion passes 80 / 80 contracts and 54 / 54
Electron runtime assertions; the observed Material and Generator frame indexes
match with zero runtime errors. The installed product remains unchanged.

Phase 2 adds `spectral-fabric` and `temporal-strata` as native registry
materials. Four music-driven `material.*` mappings now use the same Generator
evaluator as Glitch mappings, while the 21 formal Glitch targets remain
unchanged. The engine executes Mapping → Material → Generator in one explicit
two-phase host frame, and Generator WebGL now samples `density` and optional
`age` fields with a neutral legacy fallback.

The current development baseline passes 90 / 90 Fusion checks, 327 / 327
Generator tests, and 57 / 57 Electron assertions. The final real-audio matrix
covers two materials, five Glitch presets, and five musical states: 50 / 50
effect cells plus 10 / 10 FX OFF baselines pass, with zero runtime failures,
console errors, or material-pair collapse.

Phase 2 engineering is complete. Phase 2 remains artistically open until Xin
reviews the final gallery and accepts it or records a bounded correction list.
Any product deployment still requires explicit approval.


## Stem development preview — 2026-09-13

Build `0.5.0-dev.stems.1` adds single-track six-stem WAV separation, audition, output-folder access, and focused task fixes. Run `source/fusion-runtime-baseline/start-dev.cmd` on this machine. Existing XLD Python and Electron dependencies are reused. Human quality review is pending; installed products remain unchanged. See `work/stems-20260913/HANDOFF.md`.

## Strings and drums preview — 2026-09-17

Latest build: [0.5.0-dev.muscriptor.3](../../releases/0.5.0-dev.muscriptor.3/XLD.exe), XLD core.23 / XML stems.10. Strings and drums now offer MuScriptor Medium/Large; existing defaults and guitar tiers remain. Four MEGURI full-song results are cached. [Listen to the three-model comparisons](../../artifacts/muscriptor-parts-20260917/listening/弦乐与鼓MIDI对比.html). See [handoff and validation](../../work/muscriptor-parts-20260917/HANDOFF.md). Local development build; human quality review pending.

## Strings default and toe drums comparison — 2026-09-17

[Development build 0.5.0-dev.muscriptor.4](../../releases/0.5.0-dev.muscriptor.4/XLD.exe): accepted MuScriptor Large becomes the strings default; YourMT3+ and Medium remain available. Drums still default to ADTOF. [toe Goodbye: original drums and three MIDI models](../../artifacts/toe-drums-20260917/listening/toe-Goodbye-鼓MIDI对比.html), with full-song MIDI downloads. [Validation and handoff](../../work/toe-drums-20260917/HANDOFF.md).
