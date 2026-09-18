# XLD i18n contract — Step 6

This directory provides the localization foundation and the Step 2 language
entry. Step 3 adds explicit bindings for stable HTML copy. Runtime-generated
status and analysis copy is handled by Step 4 through structured runtime keys.
Step 5 synchronizes the effective renderer locale to Electron's main process,
localizes native directory dialogs, and accepts a session-only locale override
when Xin's Music Lab opens XLD.
Step 6 freezes the release contract with catalog-parity, binding-coverage,
fallback-marker and locale-state regression tests. New UI copy must add both
`zh-CN` and `en-US` entries before the release suite can pass.

- Supported locales: `zh-CN`, `en-US`.
- Effective locale priority: host override, local choice, `zh-CN` default.
- Missing message fallback: requested locale, `en-US`, then `[message.key]`.
- `window.xinXldLocale` is the stable host-facing bridge.
- The compact `中 / EN` selector stores the local preference under
  `xin.xld.locale`. Storage failures fall back to in-memory state.
- A host override never deletes the saved local preference. Clearing the host
  override restores that preference.
- Raw analysis JSON, engine IDs, chord symbols, paths, shader/debug output and
  machine-readable error codes must remain untranslated. Future DOM adapters
  must skip elements marked with `data-i18n-raw`.
- Locale changes are presentation state and must never reset playback,
  analysis tasks, cached results or annotations.
- Static localization uses explicit `data-i18n*` attributes and runs only on
  locale changes. It does not use a `MutationObserver` or scan dynamic output.
- Runtime logs retain keys, parameters and raw backend messages. Known analyzer
  progress messages are localized for display; unknown errors remain verbatim.
