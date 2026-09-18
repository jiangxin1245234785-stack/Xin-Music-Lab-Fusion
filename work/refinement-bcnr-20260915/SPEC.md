# Other refinement pilot
1. Input: existing other WAV and corresponding BCNR source excerpts.
2. Target: strings group only; retain original other and source separation.
3. Output: target/residual WAV pair plus model/source/range metadata, separate run directory.
4. GUI: existing XLD Electron workbench, source=other, target=strings, default/alternative model cards, extract/cancel, target/residual/original audition, keep, open folder.
5. Use 30-second preview first; no strings MIDI or automatic one-click inclusion.
6. Windows personal machine; optional model dependencies isolated from runtime/0.5.0.
7. First validate locally runnable public weights and short BCNR outputs before selecting production default.
8. Failure: task error without replacing previous valid outputs; incomplete runs not selectable.
9. Preserve same sample count/channel count/time origin; target+residual reconstruct input.
10. Cache key includes parent source/run, model/parameters and selected range; preserve separate accepted result.
11. Reuse existing service/progress/cancel architecture; XML remains consumer, no new top-level system.
12. CLI/importable inference adapter; existing torch/audio stack reused where compatible, extra packages isolated.
13. Tests: source/cache identity, reconstruction, cancel/error, UI menu and actual excerpt inference.
14. Backlog: further sound categories, individual orchestral instruments, MIDI, model training.
