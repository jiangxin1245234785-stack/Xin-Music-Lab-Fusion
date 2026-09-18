# Main interface localization inventory — Step 1

The baseline audit scans the current main shell and both renderer entry points:

- `index.html`: 437 visible-text candidates.
- `index.html`: 118 `title`, `aria-label` and `placeholder` candidates.
- `app.js` + `fusion.js`: 106 dynamic presentation sinks.

These numbers are candidates rather than translation keys. Later steps must
exclude raw metadata, chord symbols, preset names, engine IDs, file paths and
diagnostic output before binding user-facing copy to catalogs.

Recommended ownership:

- Step 3: main shell, top control surface, source controls and basic visual UI.
- Step 4: dynamic statuses, XLD Fusion, FX Rack, director and analysis panels.
- Step 5: native Electron dialogs and locale propagation to child products.
