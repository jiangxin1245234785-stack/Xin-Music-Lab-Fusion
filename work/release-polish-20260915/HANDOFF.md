# Release polish · 2026-09-15

## Stage and decisions
RC.4 release wrapper; music-analysis source versions remain XLD core.9 / XML stems.8. All RC.3 model/cache/output behavior retained. Existing runtime/0.5.0 reused unchanged.

Build-generated version/help UI replaces the stale BETA / FUSION 0.3 badge only in packaged applications. Both products show 0.5.0-rc.4, provide a local help button/F1 and a read-only version/environment-path dialog. Runtime paths are checked on demand; this is not a claim that every model has run successfully.

The offline guide describes analysis ownership, four-part batch MIDI, result folders, empty/partial results, drum limits, upgrade/rollback, directory layout and clean-machine acceptance. Build stamps README, guide, runtime config and package metadata from one version value. Profile names remain unchanged to preserve settings and single-instance compatibility.

## File map
- release-tools/release-shell.cjs: trusted-main-window IPC, help window reuse, sandboxed local guide, versioned titles, F1 and path status.
- release-ui.js/css: visible localized version/help controls in both packaged headers.
- build-local.cjs/bootstrap.cjs: include release shell, generate preload/API and HTML includes; explicit version required.
- USER-GUIDE.html/BUNDLE-README.md: offline instructions with build version placeholders.
- configure-bundle.cjs: accepts releaseVersion parameter.
- test-release-shell.cjs/test-packaged.cjs: unit and actual packaged UI checks.

## Verification
Both existing complete app suites pass. Release configuration and shell tests pass. Actual packaged XLD/XML checks cover matching version, help-window reuse, keyboard help handler, Chinese/English labels, 1180px XLD viewport, one-click cached four-part MIDI, folder availability and same-bundle XML→XLD handoff. Screenshots retained. Hidden guide windows use offscreen rendering in test mode; normal windows display normally. Guide screenshots checked for overflow and readable layout.

No new music-model inference was required: no algorithm or dependency changed. Existing WEG outputs used in an isolated test profile. Native path-status dialog content is unit-tested; it is not automatically dismissed or exercised against the user's profile.

## Invariants and limitations
RC.3, installed products, runtime files, user audio, analysis results and profiles remain intact. Keep releases/<version> and runtime/0.5.0 in their relative layout. No automatic upgrade/repair, new models or dependency installation.

WindowsSandbox.exe is absent on this host; a clean Windows/no-Python end-to-end run has not been performed. Keep RC designation. Executable resource branding/signing and public redistribution license review remain separate backlog items. The ADTOF port's license gap recorded in the previous handoff is not resolved by this UI change.

## Next and commands
Use the clean-machine checklist in 使用说明.html with a short user-owned audio file. Record Windows/GPU and failed steps before considering a stable label. Test commands and build arguments are in source/release-tools/README.md. Do not restart strings/model development during release closure.
