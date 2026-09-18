# Xin's Music Lab i18n contract — Step 6

This folder is the presentation-only localization foundation for the main XML
application. Step 2 adds a compact `中 / EN` selector to the existing LOOK row.
Step 3 adds explicit `data-i18n*` bindings for the stable application shell,
visual catalog, welcome screen and accessibility labels. The selector updates
locale state immediately without reloading the page.

Step 4 adds `dynamic-ui.js`, a presentation-only semantic adapter for runtime
status text and the Fusion, Mapping Lab, FX Rack, Director/Conductor, palette
and calibration panels. Call sites bind a message key to a specific element;
locale changes refresh only those registered elements. Track titles, artist and
album metadata, chord symbols, file paths, engine IDs and unknown errors are
explicitly unbound before raw values are written.

Step 5 adds the desktop seam. `desktop-locale-bridge.js` sends the effective XML
locale to Electron without reloading the renderer. The main process uses its
own small native-message catalog for open/save dialogs, forwards the locale in
XLD open requests, and applies XML as the host locale of a newly opened or
already running Glitch Generator editor. Generator takeover is presentation
only: preset, seed, mappings, undo history, canvas dimensions and renderer state
remain owned by Generator.

- Supported locales: `zh-CN`, `en-US`.
- Effective priority: host override, local preference, `zh-CN` default.
- Missing-key fallback: requested locale, `en-US`, then `[message.key]`.
- Stable host bridge: `window.xinMusicLabLocale`.
- Compatibility alias: `window.xinXmlLocale` points to the same bridge.
- Local preference key: `xin.musicLab.locale`.
- Locale updates must never reload the page or reset audio, visual, mapping,
  generator, XLD timeline, FX Rack, preset, seed or analysis state.
- `static-ui.js` only applies explicit bindings. It must not scan arbitrary text,
  observe DOM mutations, join an animation loop, or overwrite dynamic status text.
- `dynamic-ui.js` uses selector manifests plus a semantic runtime binding map. It
  must not use DOM observers, animation clocks, audio contexts, WebGL or random
  values, and it must never reset playback, analysis, mapping or renderer state.
- Track metadata, chord symbols, engine IDs, file paths, raw JSON, shader/debug
  output and unknown error details remain untranslated.

Step 6 freezes the bilingual release contract. It completes the PRODUCT dock,
Generator recipe/file/repository chrome and read-only diagnostics, adds exact
catalog/binding/fallback audits, and verifies Chinese and English at 960×640,
1280×760 and 1600×900. The layout smoke also proves that locale changes retain
the same stage, canvas, product APIs, selected scene and FX power state.

Localization modules remain outside audio analysis, Mapping, WebGL and the
engine clock. New visible copy must resolve in both catalogs before the release
suite can pass.
