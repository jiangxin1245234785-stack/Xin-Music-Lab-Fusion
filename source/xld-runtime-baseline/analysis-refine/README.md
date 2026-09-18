# XLD refinement · Mega53 all targets

Mega53 default: all 53 original heads listed in mega-targets.json, grouped for display. UI id strings retains bowed_strings for old-cache compatibility; strings-all selects the original strings head. profiles.json targetMap is shared by inference and verified against the catalog and installed model configuration.

Input sourceStem: mix (trusted indexed original file, no separation prerequisite), other, guitar, piano, bass, drums, vocals. Non-mix reads the active separation result. Mega supports full or 1–30 second preview; Bowed and AudioSep remain other previews only. Defaults stay other / strings / full / auto. Soundfile probes original metadata without loading model; unsupported containers produce an error. No new decoder dependencies.

Cache keeps legacy other identity byte-for-byte. New sources add sourceStem; mix parentRunId is null. Path, size, mtime, model manifest, target, device and scope participate in identity. Validate metadata, output paths, frame counts, reconstruction, safe audition and fresh source before commit. Raw source is obtained from the backend track index, never a renderer-supplied path. Cancelled and invalid outputs do not replace cache.

Output original.wav / target.wav / residual.wav is FLOAT at input sample rate and channels. Playback metadata selects optional common-gain listen- copies. Targets overlap; these are 53 extraction choices, not mutually exclusive stems. No automatic merging or MIDI conversion. Each job selects one head, shared trunk unchanged; full-model and selected-head parity tested for all 53 heads on short input. Semantic separation quality still requires listening.

RoFormer reuses pinned installed implementation; strict CPU weight loading, selected head and shared trunk moved to GPU, CPU accumulation. Auto CUDA batch1 tries shorter chunks on OOM then CPU; explicit GPU does not silently switch. Runtime/model folders unchanged. XML remains a consumer.

CLI: runner.py --engine mega-53 --source-stem mix --input SONG --output RESULT.json --target electric-guitar --scope preview --start 497 --duration 30 --track-id ID --run-id UUID --cache-key SHA256. Non-mix additionally requires --parent-run UUID. --probe --input SONG reports frame/rate/channel metadata; --engines reports model availability.

## Existing AudioSep backend notes

AudioSep uses a 32 kHz mono separator. The adapter applies it independently to left/right channels, using 3s central output with 1s context on either side, and resamples target back to source rate. Residual is computed from the original-rate input minus target; high-frequency content outside the model bandwidth remains in the residual. This preserves reconstruction but does not certify source separation quality or stereo image quality.

Two **presets**, not two independently trained models: `audiosep-strings` uses "bowed string instruments"; `audiosep-violin` uses "violin". These are preview alternatives; Mega53 is the default. Unavailable SAM Audio/Banquet are not presented as working options. No target-absence detector or strings MIDI in this version.

Official upstream: https://github.com/Audio-AGI/AudioSep. MIT notice retained under vendor/LICENSE; vendor/models/base.py and resunet.py are unchanged upstream inference code. Model provenance is recorded in the optional asset manifest.

The published audiosep_base_4M_steps.ckpt includes the frozen CLAP text branch and separator. The export loads exact text and projection parameters, removes only verified deterministic legacy position/token-type buffers, computes fixed text conditions with the original RoBERTa pooled output → Linear/ReLU/Linear → L2 normalization, and saves separator state with weights_only-compatible tensors. No fitting or retraining. Training/optimizer/audio-query components are not needed at runtime. Export utility and original checkpoint hashes are retained with the project work record.

Runtime: existing highres Python (torch, torchlibrosa, numpy, scipy, soundfile), plus XLD_REFINE_MODELS pointing to optional assets separator.pt, conditions.npz, manifest.json. Both assets are SHA256 checked before inference. The old runtime/0.5.0 is not modified.

CLI: `python runner.py --engine audiosep-strings --input other.wav --output /absolute/refinement/next.json --track-id ID --parent-run UUID --run-id UUID --cache-key SHA256 --start 60 --duration 30`. `--engines` reports availability. Service validates active parent/source stats, preset, range and asset manifest identity before publishing; cache reuse requires exact identity. Keep records the chosen valid preview separately. Interrupted/invalid runs are cleaned without touching prior previews.

Short BCNR tests are candidates for user audition, not labeled ground truth. Results must be compared against both original other and residual. Silence/negative controls test numerical behavior and do not replace a confirmed no-strings music example.
