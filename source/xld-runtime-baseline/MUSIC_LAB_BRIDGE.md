# Xin's Music Lab bridge contract

XLD writes one `music-lab.json` beside each track's analysis files. The file is
local-only and contains no audio. It is the supported integration boundary for
Xin's Music Lab; consumers should not depend on any engine's cache paths.

Engines in the file: sections `songformer`; chords `chord-chordmini`, `chord-btc`,
`chord-consonance`. Since 2026-11-14 the four MSAF section engines and the three
Librosa chord engines (`chord-cqt`, `chord-cens`, `chord-hybrid`) are removed:
the file no longer carries them, even when their old result files are still on
disk. A consumer that meets one of those ids in an older `music-lab.json` should
ignore it.

Current contract: `xld.music-lab/2`

```json
{
  "schemaVersion": 2,
  "contract": "xld.music-lab/2",
  "producer": { "name": "Xin's Local Deck Beta", "version": "0.5.0-beta.2" },
  "generatedAt": "ISO-8601",
  "timing": { "unit": "seconds", "origin": 0, "duration": 0 },
  "track": {
    "id": "stable XLD track id",
    "number": 1,
    "title": "title",
    "artist": "artist",
    "album": "album",
    "source": "absolute local audio path"
  },
  "analyses": [{
    "engine": { "id": "songformer", "name": "SongFormer · AI" },
    "duration": 0,
    "analyzedRanges": null,
    "segments": [{ "start": 0, "end": 10, "label": "verse", "confidence": null }]
  }],
  "harmony": [{
    "engine": { "id": "chord-chordmini", "name": "ChordMini · BTC-CL", "family": "harmony" },
    "duration": 0,
    "metrics": { "chordChanges": 0, "uniqueChords": 0, "meanConfidence": 0, "noChordRatio": 0 },
    "segments": [{ "start": 0, "end": 4.2, "label": "Dm", "confidence": 0.78 }]
  }],
  "manualTags": [{ "id": "uuid", "start": 0, "end": 10, "label": "高潮", "note": "" }]
}
```

The bridge is regenerated after a successful analysis, result deletion, or tag
edit. The UI also exposes a manual refresh button. A consumer must reject an
unknown `contract` major version rather than guessing its shape.

`analyses` remains structural only. `harmony` is an independent timeline and
must be mapped by Xin's Music Lab's Harmony Mapper rather than treated as a
section label.
