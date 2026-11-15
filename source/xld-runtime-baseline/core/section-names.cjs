'use strict';
// The one table that turns a structure engine's labels into the names people see on a section bar.
// Read by core/sections.cjs; XLD, the score view and XML all get their names through that module.
//
// `labels`: engine label (lower case) -> kind. `null` means "not a section" (silence): it leaves a gap.
// `kinds`: kind -> the name in each interface language. A label not in `labels` is shown as it is.
// Only engines in `semantic` have labels that mean something; any other (a clustering engine) only clusters, and
// their letters are passed through untouched.
const labels = Object.freeze({
  intro: 'intro',
  verse: 'verse',
  'pre-chorus': 'prechorus',
  prechorus: 'prechorus',
  chorus: 'chorus',
  bridge: 'bridge',
  inst: 'interlude',
  instrumental: 'interlude',
  interlude: 'interlude',
  solo: 'interlude',
  break: 'interlude',
  outro: 'outro',
  end: 'outro',
  silence: null
});

const kinds = Object.freeze({
  intro: Object.freeze({zh: '引子', en: 'Intro'}),
  verse: Object.freeze({zh: '主歌', en: 'Verse'}),
  prechorus: Object.freeze({zh: '导歌', en: 'Pre-chorus'}),
  chorus: Object.freeze({zh: '副歌', en: 'Chorus'}),
  interlude: Object.freeze({zh: '间奏', en: 'Interlude'}),
  bridge: Object.freeze({zh: '桥段', en: 'Bridge'}),
  outro: Object.freeze({zh: '尾奏', en: 'Outro'})
});

module.exports = Object.freeze({
  semantic: Object.freeze(['songformer']),
  labels,
  kinds,
  // A non-silent section shorter than this joins a neighbour instead of standing alone.
  shortSeconds: 4
});
