# Drum MIDI and output access
1. Input: existing current-song drums WAV; retain bass/piano/guitar workflow and original audio.
2. Output: existing per-source/per-model MIDI + notes manifests; drums use GM percussion channel and fixed velocity, explicitly labelled.
3. Add ADTOF five-class pretrained backend only after real WEG excerpt inference; strings stay out of scope.
4. Retain default/alternative model-card pattern; do not add unverified alternative models.
5. One-click generates supported available parts then merges nonempty results; silent parts are valid and do not erase successful outputs.
6. Provide song-level MIDI folder access independent of selected audition stem/model; retain scoped part/merge actions.
7. Derive counts and supported parts from model definitions; preserve cancellation/source-change checks and successful cache.
8. Reuse existing isolated highres Python and dependencies; vendor fixed upstream code and checksum-pinned weight with provenance.
9. Validate real drum inference, percussion roundtrip/merge, failed/partial/cancelled batch folder access, and both apps' regressions.
10. Deliver an additional RC bundle, leaving RC.2/runtime and installed products intact; clean Windows validation remains a release gate.
