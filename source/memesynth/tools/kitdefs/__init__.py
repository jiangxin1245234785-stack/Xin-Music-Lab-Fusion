"""The kit recipes. One module each; `make_kits.py` builds them.

A recipe is three names: `NAME`, `SAMPLES` and `VOICES`.

* `SAMPLES` maps a sample name to `(build, rootHz, label)`. `build` takes no arguments
  and returns mono float32 at `synth.RATE`; `rootHz` is the pitch it was generated at,
  which the renderer divides by to work out the playback ratio, so it has to be the
  truth about the buffer rather than a guess.
* `VOICES` maps a route to the kit JSON's voice object. Routing resolves the full route
  first and then the stem, so `guitar` covers every guitar timbre a kit does not name.

`REQUIRED` is every route an XLD export can produce, measured over the 31 merged exports
under `artifacts/`. A kit must cover all of them: a missing route is silence in the
render, and silence is the one failure that a passing test will not show you.
"""
REQUIRED = ('bass', 'piano', 'guitar', 'strings', 'vocals',
            'drums/kick', 'drums/snare', 'drums/hihat', 'drums/openhat',
            'drums/tom', 'drums/crash', 'drums/ride')

#: Build order, which is also the order they are offered. Acid came first and stays first.
KITS = ('acid', 'chiptune', 'musicbox', 'pluck', 'fmkeys', 'organ', 'orchestra', 'gamelan',
        'synthwave', 'supersaw', 'trap', 'lofi', 'glitch', 'ambient',
        'c64', 'megadrive',
        'reese', 'wobble', 'hoover', 'hardstyle', 'techno', 'house', 'garage', 'futurebass',
        'vaporwave', 'italo', 'electro', 'phonk', 'hyperpop', 'psytrance')


def load(name):
    """Import one recipe module by kit name."""
    if name not in KITS:
        raise KeyError(f'未知 kit："{name}"，可用：{", ".join(KITS)}')
    return __import__(f'kitdefs.{name}', fromlist=['NAME'])
