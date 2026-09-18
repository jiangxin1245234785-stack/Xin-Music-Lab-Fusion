# Three-model refinement development build
1. Input: current other WAV; local WEG Flowers of Romance excerpts for verification.
2. Models: AudioSep, gilliaan Bowed Strings v2, MVSep Mega 53; existing upstream inference, no training.
3. Output: original/target/residual FLOAT WAV and provenance per 30-second preview, no replacement of stems/MIDI.
4. GUI: existing Electron refinement panel, three model cards, supported target select, auto/GPU/CPU select, start, run/cancel, three-way audition, keep/folder.
5. Default: Bowed Strings v2 for strings; AudioSep and Mega optional, no claim of quality ranking.
6. Targets: strings in all; violin in AudioSep/Mega; viola/cello/double-bass/woodwind/brass/flute/saxophone in Mega.
7. Auto execution: one model at a time, batch 1, CPU accumulation; smaller GPU chunks then CPU on CUDA OOM.
8. Runtime: personal Windows 12GB GPU, reuse isolated Python environments, new optional weights folder.
9. Dependencies: torch/numpy/scipy/soundfile and existing bs-roformer; no new GUI or training framework.
10. Cache keys include source/run/model/target/requested device/adapter settings; record actual device/chunk/peak VRAM.
11. Failure/cancel cannot publish partial results or remove accepted previews; preserve RC.6 results.
12. Validate actual inference for all three, CPU path, OOM retry unit test, sample counts/reconstruction, UI and existing MIDI/XML regression.
13. Ship separate dev release with model assets and listening page, original user analysis preserved.
14. Backlog: whole-song refinement, simultaneous multi-target export, instrument MIDI, automatic model choice.
