# XLD bilingual release contract — beta.8

## Supported languages

- `zh-CN` is the product default.
- `en-US` is the complete alternate interface.
- Effective priority is `host > local preference > zh-CN default`.

## Translation boundary

Translate user-facing navigation, labels, status, progress, native dialogs and
known analyzer messages. Preserve track and album metadata, chord symbols,
engine identifiers, file paths, raw JSON, shader/debug output and unknown error
details verbatim.

## Required release checks

1. Static, runtime and native catalogs have exact Chinese/English key parity.
2. Every `data-i18n*` binding resolves without a `[message.key]` marker.
3. Every literal `runtime.*` reference in `app.js` exists in both catalogs.
4. Switching local locale does not change playback, library or analysis state.
5. A host override does not erase the saved local preference.
6. Clearing the host override restores that preference without reloading.
7. Electron main-process dialogs follow the effective locale.
8. XML may pass only `zh-CN` or `en-US`; invalid host values are ignored.

Run `pnpm test`, then the Electron fixture and full-app smoke tests before a
release deployment.
