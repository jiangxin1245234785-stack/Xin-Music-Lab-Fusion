# Release branding and diagnostics · 2026-09-15

## Stage / scope
RC.5 wrapper ready for personal use. Analysis source versions remain XLD core.9 / XML stems.8; runtime/0.5.0 reused unchanged. No new music models, settings migration or workbench behavior changes.

## Decisions / files
- brand-exe.cjs: build-only existing electron-winstaller 5.4.0 rcedit, fixed SHA256 e2df7b664db830f159d0dc6b3da8a95442cca175b9577f2d19952646d37ac32f. XIN_RCEDIT must identify this tool. Sets ProductName/FileDescription/OriginalFilename/FileVersion/ProductVersion and icons before manifest hashing.
- make-xld-icon.ps1 + assets/xld.ico/png: reproduce existing XLD CSS letter mark, seven icon sizes. XML retains its existing icon. release-shell.cjs sets matching native window icons.
- check-environment.cmd + diagnose.cjs + check-runtime.cjs: double-click packaged console check using bundled Electron Node mode, no system Node/Python. Seven sequential availability probes, each up to 120 seconds, progress and Ctrl+C. Results under LocalAppData/XinMusicDiagnostics/<timestamp-pid>; failed probes continue; malformed config produces report and nonzero exit. This is path/model availability, not model inference or DLL coverage.
- build-local.cjs includes diagnostics and icons; records build tool provenance in manifest. Guide/README document entry and limitations. Version remains a single config value.
- test-inference.cjs now runs separation, bass/piano/guitar/drums MIDI, merge; completion depends on six planned steps.

## Verification
Release configuration, shell and diagnostics tests pass. Diagnostics tests include missing Python/null subprocess output, missing drums model, timeout, invalid config. Windows EXE resources show distinct product names and 0.5.0-rc.5. Icon preview and real app screenshots reviewed.

Actual packaged XLD/XML pass: visible version/help, F1, help reuse/localization, 1180px XLD layout, cached four-part one-click MIDI and enabled song folder, same-bundle handoff. Seven availability probes pass with PATH limited to Windows/System32 and Windows; reports saved into an isolated LocalAppData. This removes Node/Python from executable lookup but is not a clean OS test.

Fresh WEG 90–120s audio: BS-RoFormer 21.578s; bass 12.404s/70 notes; piano 13.011s/0; guitar 10.613s/0; drums 7.125s/223; merge 0.352s/293. All results uncached, six steps pass. Empty pitched results correctly count as completed outputs; merger includes nonempty bass and drums. Counts do not prove transcription accuracy.

Restricted-environment first attempts: Electron renderer/GPU child crashed; a separate highres inference stayed in model loading. Logs retained under staging packaged/ and inference/. After stopping only that exact test process tree, normal-permission isolated tests passed; no runtime workaround shipped. Stop-Process failed in the host; verified-parent taskkill cleaned only the test tree.

## Invariants / limits
Keep RC.1–4, original installation, user audio/results/profiles and runtime intact. Release changes only wrapper, diagnostics, docs and developer acceptance. No public publication or signing. Previous ADTOF upstream license clarification remains open for redistribution.

Clean Windows/no-Python end-to-end acceptance is still outstanding; Windows Sandbox absent on this host. Do not label stable based on a restricted PATH. Next: move release plus runtime together, double-click 检查环境.cmd, then follow offline guide's playback/sections/harmony/separation/four-part MIDI/cancel/reopen/XML handoff checklist.

## Commands / evidence
node test.cjs; node test-release-shell.cjs; node test-diagnostics.cjs; node test-packaged.cjs <release> <fixture> <proof>; node test-inference.cjs <release> <fixture> <new-output>; node verify.cjs <release>. Build arguments in source/release-tools/README.md. Artifacts in artifacts/release-branding-20260915; full staging evidence in D:/Caches/codex/release-branding-20260915.
