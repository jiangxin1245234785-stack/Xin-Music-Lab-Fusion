# Third-party preview · setup.1
1. Target: Windows x64 ZIP, no preinstalled Node/Python required; existing Electron UI retained.
2. Ship latest workbench, original adapters and reviewed visual dependencies; no weights/music/credentials/AI vendor trees.
3. Add bilingual setup window: first-run guidance, model group, interpreter/folder picker, check, save, official links, diagnostic export.
4. Base MIDI environment: optional explicit online install of managed Python and pinned MIDI dependencies; no system Python/PATH changes.
5. Existing AI backends: import and probe independently; do not modify imported environments or silently download weights.
6. MIDI installation writes only to a user-selected owned directory; failures/cancel preserve previous runtime configuration.
7. Persist validated path changes atomically; explain restart requirement; retain all other runtime settings.
8. Setup stays optional: no-model library/playback/visualization must work.
9. Validate malformed paths, partial setups, failed probes, cancellation, bilingual UI and actual packaged startup using isolated profiles.
10. Publish preview ZIP plus checksums and matching source export; keep existing assets and repository visibility unchanged.
11. Clean-machine and GPU acceptance are separate from developer-machine isolated testing; label unverified coverage honestly.
12. Next iteration: per-model dependency installation and licensed official weight acquisition; no generic plugin marketplace this round.
