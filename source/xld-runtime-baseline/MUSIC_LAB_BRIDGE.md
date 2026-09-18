# Xin's Music Lab bridge contract

XLD writes one `music-lab.json` beside each track's analysis files. The file is
local-only and contains no audio. It is the supported integration boundary for
Xin's Music Lab; consumers should not depend on MSAF or SongFormer cache paths.

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
    "engine": { "id": "msaf", "name": "MSAF · Spectral" },
    "duration": 0,
    "analyzedRanges": null,
    "segments": [{ "start": 0, "end": 10, "label": "A", "confidence": null }]
  }],
  "harmony": [{
    "engine": { "id": "chord-cqt", "name": "Librosa · CQT / HMM", "family": "harmony" },
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
