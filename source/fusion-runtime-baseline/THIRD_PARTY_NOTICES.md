# Third-party notices

The optional **Beta · GitHub** section includes local copies of these open-source projects:

## Butterchurn 2.6.7

- Repository: https://github.com/jberg/butterchurn
- Purpose: WebGL implementation of the MilkDrop music visualizer
- License: MIT
- Vendored file: `vendor/butterchurn-2.6.7.min.js`
- License text: `vendor/LICENSE-butterchurn.txt`

## Butterchurn Presets 2.4.7

- Repository: https://github.com/jberg/butterchurn-presets
- Purpose: converted MilkDrop presets for Butterchurn
- License: MIT
- Vendored file: `vendor/butterchurn-presets-2.4.7.min.js`
- License text: `vendor/LICENSE-butterchurn-presets.txt`

The classic visualizers do not use third-party rendering code. Full license texts are available in the linked repositories.

The audio feature layer, auto director, adaptive quality manager and the additional real-time Glitch post-processing modes are original project code. `OPEN_SOURCE_RESEARCH.md` lists projects reviewed for product and architectural ideas; those projects are not redistributed or linked at runtime unless explicitly listed above.

## Music Structure Analysis Framework research reference

- Repository: https://github.com/urinieto/msaf
- License: MIT
- Purpose of reference: separation of boundary detection and segment clustering; Foote checkerboard novelty and recurrence/spectral-clustering research families
- Distribution status: no MSAF source code, Python package, model, or runtime is bundled

`section-engines.js` is an independent causal implementation written for live system audio. “Foote Novelty” and “Recurrence Form” identify the research lineage in the UI; they are not claimed to reproduce MSAF outputs exactly.
