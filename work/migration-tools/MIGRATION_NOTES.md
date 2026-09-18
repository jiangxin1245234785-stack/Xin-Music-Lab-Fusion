# D-drive migration notes

## Included

- Clean snapshot of the current Fusion installed runtime.
- Glitch Generator TypeScript source, tests, lockfile, compiled baseline, required deterministic test artifacts, and local development dependencies.
- Phase 0 reports, screenshots, fixtures, logs, source snapshots, and test controls.
- Current glitch research, roadmap, preset, and integration documents.

## Excluded from the Fusion runtime snapshot

- `dist` — packaged installer output, approximately 415 MB.
- `node_modules` — installed product dependencies, approximately 73 MB.
- `glitch-generator` — obsolete installed Generator directory.
- `desktop-build` — stale build output; only `desktop-build\package.json` is retained because `robustness-contract` reads it as a configuration fixture.
- `.backups` — deployment backup history.

These exclusions do not alter the installed product. They only prevent redundant files from being copied into the development workspace.

If a package-manager check materializes `node_modules` in the D-drive workspace, it is treated as a generated development dependency and is excluded from source-parity hashing.

## Generator test artifacts

The Generator `artifacts` directory is retained because the consolidated suite reads its deterministic baseline and screenshot manifest as test fixtures.

## Cleanup policy

No C-drive source is removed until:

1. every copied file has a matching SHA-256;
2. the Generator build and consolidated test suite pass from D;
3. the Fusion contract suite passes from the D runtime baseline;
4. the migration manifest has been written successfully.
