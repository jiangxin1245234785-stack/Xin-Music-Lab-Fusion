# Drum MIDI and batch output access · 2026-09-15

## Stage / scope
Local RC.3, XLD core.9 and XML stems.8. Add ADTOF drum transcription and fix song-level MIDI output access. No string separation/transcription, new editor, or background service.

## Decisions
- XLD remains analysis owner. Reuse isolated highres Python; new upstream files and 3.6 MB weight are bundled in analysis-midi/vendor, no runtime dependency changes.
- ADTOF-pytorch pinned at 85c192e78f716ea0b111cc8a5ee4a8f6a3a4f8a9, SHA-256 in models.json and vendor/PROVENANCE.md. Five classes, fixed velocity 100; UI states this. Strict checkpoint loading; no random fallback when weights are missing.
- 30-second feature blocks + 5-second context; global peak picking. Same-key drum notes end before the next onset so fast rolls roundtrip without changing hit timing.
- Model menu retains default/alternative pattern; drums has one verified candidate, no pretend alternative.
- Song MIDI folder checks any validated current-source result independently of audition selection or model preview. Scoped button opens selected valid result; otherwise falls back to song folder. Successful partial/empty MIDI remains accessible.
- One-click derives supported parts from model profiles: bass, piano, guitar, drums, then merge. Counts/progress are dynamic. Fewer than two nonempty parts completes with a clear no-merge message. Completed outputs refresh after each step.

## File map
- analysis-midi/drums.py, vendor, models.json, runner.py: drum inference and percussion serialization.
- core/derived-assets.cjs, core/midi-merge.cjs, desktop/main.cjs: supported instruments, source validation, folder access and merge inputs.
- derived-controls.js, index.html, i18n/runtime-messages.js: batch, folder buttons and drum limitations.
- XML stem-controls.js and catalogs: consume drum MIDI through the same XLD interface.
- tests/drum-midi.py, midi-models.cjs, midi-batch-ui.cjs, release-tools/test-packaged.cjs: regression evidence.

## Evidence
- Real Radioactive Spell Wave (647.71s), isolated copy of existing BS-RoFormer stems: 2,853 drum notes, four-part merge 7,018 notes; cache activation/readback passed. Counts do not establish musical accuracy.
- Actual 90–120s excerpt produced 210 events. Human listening approval of new drum quality remains pending.
- Python verifies GM percussion channel 10, mixed pitched/drum tracks, rapid same-key rolls and original timing.
- Both complete npm test suites pass. Real hidden Electron UI verifies original selection, model changes, drum scoped folder, failure/cancel, too few nonempty parts, reload, no-WAV disabling, bilingual strings; no console errors.
- Packaged XLD/XML startup, one-click cached four-part merge, directory availability and same-bundle XML→XLD handoff pass.
- Tests use isolated settings and copied derived assets; original audio/results unchanged. Test shell.openPath was intercepted to assert existing target directories without opening Explorer windows.

## Invariants / remaining release gates
Existing installed applications, RC.2, runtime/0.5.0, original audio and annotations are retained. RC.3 shares the relative runtime/0.5.0 directory. Clean Windows/driver validation is still pending; keep RC designation. Upstream ADTOF port has no LICENSE file in the pinned archive; public redistribution clearance remains unverified (local personal-use candidate only).

## Test commands
Run npm test in both source app directories. Use runtime/0.5.0/envs/highres/python.exe for tests/drum-midi.py and tests/test_midi_merge.py. tests/midi-batch-ui.cjs requires isolated XLD_BATCH_TEST_ROOT with fixture.json. release-tools/test-packaged.cjs takes candidate, fixture.json and proof directory.

## Next
Listen to drums in FL Studio using a GM-compatible drum mapping; do not infer sound quality from note counts. Freeze features after this and finish clean-system validation/version polish. Strings stay in backlog.
