// Score view: a multi-lane score that scrolls past a fixed play line.
//
//   const view = XinScoreView.create(canvas, model, clock, options);
//   view.start();
//
// One job: given a model (`xin.score-view/1`, see MODEL.md) and "what second is it now",
// draw one frame. Canvas 2D only, no dependencies, no build step, and no knowledge of who
// loaded it: the listening page and (stage two) an XML scene load this same file. The host
// owns the audio, the clock and the canvas's size; this file never touches the DOM beyond
// the canvas it was handed.
//
// Every layer of the model except `track`, `audio` and `lanes` may be missing, and a layer
// that is missing or malformed is simply not drawn. That rule is what lets any analysed
// song into the view, so it is enforced in `prepare` rather than left to each drawing
// routine.
//
// Drawn so far (stages A1 and A2): the header, the note lanes, the drum lane, the play
// line, the chord panel and the section bar. `layers()` says which of the model's layers
// this version draws, so a host never has to guess.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XinScoreView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CONTRACT = 'xin.score-view/1';
  const VERSION = '0.32.0';
  const DRAWN_LAYERS = Object.freeze(['header', 'lanes', 'drums', 'playhead', 'chords', 'sections', 'bars', 'contour', 'captions', 'backdrop']);

  // The first four are what gate one settled on (2026-11-10): simplified notes, one lane
  // per stem, sixteen seconds a screen, the play line at 35%.
  const DEFAULTS = Object.freeze({
    windowSeconds: 16,      // how many seconds one screen width holds
    playhead: 0.35,         // where the play line sits, as a fraction of the width
    simplify: true,         // draw the simplified notes instead of the transcription as it is
    mergeTimbres: true,     // one lane per stem instead of one per timbre track
    hidden: [],             // ids of model lanes not to show
    offsetSeconds: 0,       // added to the clock (the listening page's latency slider)
    chordSmoothing: 'raw',  // which chords are too short to show: a key of CHORD_SMOOTHING
    plainSections: 'letters', // sections that only have a cluster letter: 'letters' | 'numbered' | 'hidden'
    showContour: true,      // the sung pitch as a thin line over the vocal notes
    showCaptions: true,     // the listening captions at the top left
    quietText: false,       // Compact title/chord row and song-timed section cue, selected for the XML scene.
    albumLayout: false,     // The listening window owns the track details and captions.
    // 'mark': a caption row that carries a fifth item (adapter/cues.cjs) is drawn as an
    // "object · event" mark, dim ahead of its moment and lit at it, the object as its lane's
    // icon or name; 'sentence': every row is drawn as text, exactly as 0.9.2 drew it.
    // work/score-cues-20261113/SPEC.md. The default since 0.11.0 (chosen at gate10).
    captionStyle: 'mark',
    showBackdrop: true,     // a wash of the section's colour behind everything, brighter when the song is louder
    backdrop: 'cover',      // 'cover': the album cover, faded, under a lighter wash (the wash alone when the host has no picture); 'section': the wash alone
    // 'loudness': the backdrop brightens and fades with the song's loudness; 'steady': it keeps the
    // middle brightness throughout (a video export: a picture that changes every frame is costly
    // to compress). work/score-export-20261114/SPEC.md, REPORT-A §10.
    backdropLevel: 'loudness',
    focusGroup: null,       // a lane group (stem) being listened to alone: the other lanes are dimmed
    loop: null,             // [start, end] in seconds: the stretch a host is repeating, outlined on the section bar
    laneHeights: 'loudness', // 'fixed': by pitch span alone; 'loudness': each lane's share follows how loud its stem is
    // 'icon': a drawn instrument at the left of each lane instead of its name ('text': the name,
    // as before). A lane whose group has no icon, or that shares its group with another lane
    // on screen, keeps its name. PRESETS-SPEC.md §5. The default since 0.11.0 (chosen at gate9).
    laneLabels: 'icon',
    liveTextureRaster: false, // Alternative band rendering used during interactive playback.
    denseLaneLabels: false, // XML can stagger compact track heads in the existing label gutter.
    // 'line': each section a thin line with its name beside it, a name that does not fit left
    // out whole ('block': the filled blocks, as before). PRESETS-SPEC.md §6. The default since 0.11.0.
    sectionStyle: 'line',
    // Step one of the effects (work/score-fx-20261113/SPEC.md): the notes are seen being played.
    // 'off' draws exactly what 0.7.0 drew; each switch below turns one effect off on its own.
    effects: 'light',       // 'off' | 'light' | 'strong': the same as fxPreset 'off' | 'clear' | 'strong'
    // Step 1.5 (work/score-fx-20261113/PRESETS-SPEC.md): a named set of amounts for the four
    // effects, a key of FX_PRESETS. Setting `effects` sets this to its alias, and back.
    fxPreset: 'clear',
    // 'song': the preset's brightness and reach follow the song's slow rise and fall (its whole
    // loudness, smoothed: see swellOf), held back where it is quiet and opened up at its peaks;
    // 'off': the preset as it is, all the way through, exactly as 0.11.0 drew it.
    // work/score-dynamics-20261114/SPEC.md. Hosts that want it ask for it.
    fxDynamics: 'off',
    // The separator's 'other' stem (no notes: pads, effects, noise) shown as a low band at the foot
    // of the lanes whose thickness and light follow its loudness ('texture' lanes of the model). Off by
    // default: then nothing changes. SPEC-REST.md, SPEC-FIX.md.
    showTexture: false,
    textureAt: 'below',     // 'below': under the drums, at the very foot; 'above': between the last pitched lane and the drums
    // Lead and accompaniment inside a lane (the model's `roles`, adapter/roles.cjs), told apart by shape:
    // accompaniment notes sounding together drawn as one block, the notes of a lead line joined into a line;
    // lead notes and lone accompaniment notes drawn as every note was. Off by default: then nothing changes.
    // work/score-roles-20261114/SPEC-3.md (SPEC-2.md drew them fainter; withdrawn).
    showRoles: false,
    // Notes shaped by how the instrument sounds (SHAPE_BY_GROUP): struck or plucked ones with a head at the onset
    // and a body that thins toward the end, the bass the same a step thicker, held ones as before. Off by default:
    // then nothing changes. Taken over by showShapes where both are on is not defined (shapes win where they apply).
    // work/score-shapes-20261114/SPEC.md.
    showShapes: false,
    // Which set of shapes showShapes draws: 'two' (struck or plucked vs held, SHAPE_BY_GROUP / SHAPES, as 0.17.0 drew)
    // or 'spindle' (the same, and the held groups of SPINDLE_GROUPS drawn as spindles, SPINDLE). Anything else (the three-way
    // value withdrawn in 0.19.0 too) reads as 'two'. One of the two goes once the user has chosen.
    // work/score-shapes-20261114/SPEC-3.md.
    shapeSet: 'two',
    // With shapeSet 'spindle' (and showShapes): notes of a string lane that follow one another closely and near in
    // pitch joined by a thin smooth curve (STRANDS). Off by default. work/score-shapes-20261114/SPEC-4.md.
    shapeLinks: false,
    // Each note's thickness by its own pitch (PITCH_WEIGHT: the ear's filter width there, in semitones, against
    // A4's), for the lanes of WEIGHT_GROUPS; the bass's own step up is then not added. Off by default: then
    // nothing changes. Independent of showShapes. work/score-shapes-20261114/SPEC-5.md.
    pitchWeight: false,
    // With the cover as backdrop and its measure handed over (setCover(image, measure), measureCover): the veil
    // behind the lanes set from how bright and busy the cover is (COVER_ADAPT) instead of the fixed COVER_VEIL.
    // Off by default: then nothing changes. work/score-shapes-20261114/SPEC-6.md part 3 A.
    coverAdapt: false,
    // With the cover as backdrop and its measure: the texture band's light raised so it stands out from the cover
    // behind it as it does from the plain ground (TEXTURE_ADAPT). Off by default. SPEC-6 part 3 B.
    textureAdapt: false,
    drumNotation: false,    // fixed drum positions and compact articulation marks
    // The radius in pixels of the round head a short note (under SHORT_NOTE.seconds) gets at its onset, in every shared
    // look (0.29.0, work/score-depth-20261118/SPEC.md batch 1); 0 draws short notes as before.
    shortHead: 1.6,         // 0.29.1: the user's pick of three (A); 0.29.0 had 2.2
    meteorMotion: false,    // starry score, stored under the original preference for existing installations
    // The starry score as a night sky (0.30.0, work/score-depth-20261118/SPEC.md batch 2), only with meteorMotion: a still
    // sky tinted by the cover, dim stars for the notes to come (`starDim`, their light), meteors whose tails are gone
    // `meteorTail` seconds after the note ends, the play line a horizon, the 「其它」 band a Milky Way. Off: as 0.29.1.
    // The sound mist's fog bed along the whole timeline (0.31.0, work/score-depth-20261118/SPEC.md batch 3): the light
    // of its thickest part; 0 keeps the mist as 0.30.1 drew it (wisps by the needle only).
    mistFog: .32,           // .32 since 0.31.2 (the user: 雾加浓; .24 in 0.31.1)
    // The embossed paper's press (0.31.0, batch 3): how deep a note still to come is pressed into the paper (its edges'
    // light); 0 inks both sides of the needle as 0.30.1 did.
    paperPress: 1.5,        // 1.5 since 0.31.2 (the user: 压痕纸加深; 1.1 in 0.31.1)
    pressTint: 0,           // 0.31.1: a faint grey inside the groove (0–0.3)
    radarFall: .6, radarEcho: 1,  // 0.32.0, the echo post: needle fall (full scale per second, .2–2), echo life in turns (.25–1)
    radarDepth: 1, radarCorner: 'cut',  // the echo post's thickness (0 flat, 1 light, 1.6 heavier; 0–2) and panel corners ('cut' 8 px 45°, or 'round')
    radarLead: .4,  // the echo post's lyric tape prints this many seconds ahead of the singing (0–1.5; XML offers .2 / .4 / .7)
    radarJumpers: false, radarOvershoot: true, radarBloom: true, radarInk: true,  // the echo post's batch 4 switches
    radarNoise: true,  // the VOX beam's faint noise (radar.5 feedback)
    radarStep: 'neon',  // the drum grid's current step (radar.5 feedback): 'neon' bulbs, a brass 'cursor', or a 'backlight' column
    radarWheel: 'light',  // the chord wheels (SPEC-WEATHER A): 'light' wheels with dark figures (the user's pick) or 'dark' with light
    radarCell: 'round',  // the drum grid's cells (radar.5 feedback): 'round' lamps behind holes (the user's pick) or 'square' backlit tiles
    terrainRoadside: 'off',  // 车窗地貌: the drums as things passing by the line - 'off' (default until the user has looked), 'all', 'kick-snare'
    nightSky: false, starDim: .48, meteorTail: 1.5,  // starDim .48 since 0.30.1: the user's pick of three (C)
    pluckReleaseSeconds: .70, // 0 selects the shared spatial fade.
    drumDecayScale: 1,        // 0 likewise keeps the full history of each fixed drum mark.
    meteorDirectionDegrees: 0, meteorBassDirection: true,
    releaseFocus: false,    // Fade released notes over two song seconds.
    spacedLanes: false,     // Separate instrument rows with quiet bands and clip their note marks.
    softCover: false,       // Prepare one softened cover and hold it back more behind the notes.
    attackWeight: false,    // Ease each pitched attack using its own start in the song.
    weakNoteHints: false,   // Reduce piano marks only where the local stem supports it.
    balancedLanes: false,   // Equalise the ink of note families without changing hue.
    fxHit: true,          // S1: a note lights up and a short halo opens on the line where it starts
    fxAfterglow: true,      // S2: a played note dims slowly; a held one has light running along it
    fxPlayline: true,       // S3: the line is a soft column that lights notes near it, and jumps a little on a downbeat
    fxDrums: true           // S4: the kick lifts the background, the snare flashes, hats and cymbals spark
  });

  // The effects, by level. Every one of them is a function of the song's time, not the wall
  // clock, so a paused or scrubbed frame shows exactly what it would show while playing.
  const EFFECT_LEVELS = ['off', 'light', 'strong'];
  const FX = Object.freeze({
    shimmerPeriod: 1.2,     // S2: seconds the light takes to run once along a held note
    shimmerFrom: 0.4,       // S2: a note this long or longer counts as held
    pulseLife: 0.18,        // S3: seconds the downbeat jump takes to settle
    breatheLife: 0.12,      // S4: seconds the kick's lift takes to fall back
    snareLife: 0.1,         // S4: seconds a snare flash lasts
    sparkLife: 0.3          // S4: seconds a spark lives (a crash's live longer)
  });
  // Lead and accompaniment by shape (showRoles, SPEC-3.md). Accompaniment notes that overlap, or follow one
  // another within `gap` seconds, are one run; a run of at least `blockMin` notes is drawn as a block: over
  // each stretch of time, from the lowest accompaniment note sounding to the highest (a stepped outline), filled
  // in the lane's colour at `fill` of a note's light in the same state (played / to come), its top and bottom
  // edges and a tick at each onset drawn `edge` / `tick` pixels wide at a note's light. A tick struck less
  // than `flashLife` seconds ago is lit (the lane's lit colour, `flash` at most, fading). A run shorter than
  // `blockMin` is drawn note by note, as every note is. The notes of one lead line (`leadLines`) are joined,
  // the end of one to the start of the next, by a `link`-pixel line in the lane's colour at a note's light.
  // Nothing here makes a lead note brighter, dimmer or another colour than it was.
  // How each lane group sounds, for showShapes: 'struck' (struck or plucked: one attack, then it dies away), 'bass'
  // (struck, a step thicker), 'held' (bowed, blown, held: as every note is drawn). Groups not listed (vocals, drums,
  // the texture band, any group this table does not know) are drawn as ever. The same groups the icons are chosen by.
  const SHAPE_BY_GROUP = Object.freeze({piano: 'struck', guitar: 'struck', bass: 'bass', strings: 'held', violin: 'held', winds: 'held'});
  // The struck shape. head: the onset block, `head` times the note's thickness tall and as wide as it is tall, but
  // never more than `headCap` semitones taller than the note itself (a dense chord's heads may touch, never merge
  // into a wall); body: from the full thickness at the onset straight down to `tail` of it (never under `tailMin`
  // pixels) over the first `taper` seconds, then that thin to the end. The bass: `bass` times the thickness, never
  // more than `bassCap` semitones thicker than the note would be.
  // Since 0.22.0 (SPEC-7: the 2x head drew the eye and was bigger than a drum dot) the head is `head` 1.4 times the
  // thickness, never wider than a drum dot on the same screen (drumDotWidth), but always `headOver` pixels prouder than
  // the body, so a head is still seen where the body is already as thick as a dot.
  const SHAPES = Object.freeze({head: 1.4, headOver: 1, headCap: 2, tail: 0.3, tailMin: 1, taper: 0.6, bass: 1.35, bassCap: 1.1});

  // --- the spindle (shapeSet: 'spindle'), kept apart from the two-way set above so it can be deleted whole ---
  // Groups drawn as spindles (bowed: the sound swells and lets go), each note in two layers of its own colour:
  // a halo, the spindle's outline (thin at the onset, swelling to `swell` times the note, thinning back to the end)
  // filled faintly, at `halo` of the note's light (never under `haloFloor` for notes still to come, which are dim
  // already); and on the centre line a core of the same outline, `core` of the note's thickness (never under
  // `coreMin` pixels, never over the note), at the note's own light. Halos may overlap in a dense chord; cores do not.
  // Each end takes `share` of the note's length, never more than `rampMax` seconds: a long note reads as one
  // spindle, a short one as an olive. The ends are `tip` of the layer's middle (the halo never under `tipMin`
  // pixels, the core never under `coreTipMin`). The sides are curves (one quadratic each way, its control mid-ramp).
  // One path a layer a bucket: two fills, no gradient, no per-note light.
  // Winds (0.23.0, work/winds-20261115/SPEC.md W2) are drawn as spindles too, for now: blown like bowed, the sound comes up,
  // holds and goes. Take 'winds' out of this one line and they are plain held bars.
  const SPINDLE_GROUPS = Object.freeze(['strings', 'violin', 'winds']);
  const SPINDLE = Object.freeze({share: 0.4, rampMax: 1, swell: 2.2, halo: 0.35, haloFloor: 0.14, core: 0.55, coreMin: 1,
    tip: 0.15, tipMin: 1, coreTipMin: 0.5});
  // Links between the notes of a string lane (shapeLinks), found once when the notes are laid out: only where a
  // single line hands over. A note's end joins the start of a note beginning between `overlap` seconds before and
  // `gap` seconds after it, at most `step` semitones away, both at least `minDur` seconds long, and no other note of
  // the lane sounding anywhere across the bend (from where the earlier note starts to taper to where the later one
  // has swollen: a chord is never joined; so a note joins out once and in once at most). Drawn as one slow S curve,
  // level at both ends, from where the earlier note's core starts to taper to where the later one's core is full;
  // the two cores stop square where it takes over, so the line runs on through the bend. It is cut where the notes
  // meet (the later one's start where they overlap, else the earlier one's end; found in `halvings` halvings): the
  // part before is the earlier note's (light and core thickness), the part after the later note's. Under the notes.
  // Times are kept as 32-bit floats, so every threshold is taken with `slack` seconds (semitones for `step`) to spare.
  const STRANDS = Object.freeze({gap: 0.12, overlap: 0.05, step: 5, minDur: 0.25, slack: 1e-4, halvings: 24});
  // Note thickness by pitch (pitchWeight): the ear's filter width at the note's frequency (Glasberg & Moore 1990,
  // ERB = 24.7 (4.37 f / 1000 + 1) Hz) in semitones, against A4's, clamped to [`low`, `high`] (where the band
  // reaches 0 Hz, `high`). The lane's thickness times it, never thinner than the lane's own thinnest note can be
  // (2 pixels, 3.5 on a melody lane) nor more than `cap` semitones over the lane's thickness.
  const WEIGHT_GROUPS = Object.freeze(['piano', 'guitar', 'bass', 'strings', 'violin', 'winds']);
  const PITCH_WEIGHT = Object.freeze({low: 0.8, high: 1.7, cap: 0.6});
  function erbSemitones(midi) {
    const f = 440 * Math.pow(2, (midi - 69) / 12), erb = 24.7 * (4.37 * f / 1000 + 1);
    return f - erb / 2 <= 0 ? Infinity : 12 * Math.log2((f + erb / 2) / (f - erb / 2));
  }
  const WEIGHT_BY_PITCH = Float32Array.from({length: 128}, (_, midi) =>
    Math.min(PITCH_WEIGHT.high, Math.max(PITCH_WEIGHT.low, erbSemitones(midi) / erbSemitones(69))));
  const pitchWeightOf = midi => WEIGHT_BY_PITCH[Math.max(0, Math.min(127, Math.round(midi)))];

  const ROLES = Object.freeze({blockMin: 2, gap: 0.1, fill: 0.35, edge: 1, tick: 1, flash: 0.9, flashLife: 0.15, link: 1.3});

  // The amounts a preset gives. 'clear' is what 'light' drew in 0.8.0, value for value; the
  // new amounts (haloReach, hitSparks, sound, burn) are at the value that draws nothing new.
  const FX_CLEAR = Object.freeze({
    // S1 hit: brightness, seconds, how far the ring opens (times the usual), sparks off the line
    halo: 0.5, haloLife: 0.15, haloReach: 1, hitSparks: 0,
    // S2 afterglow: brightness, seconds, the light along a held note, a lift while a note
    // sounds, and how far a played note is dimmed toward the ground once it has gone by
    light: 0.55, afterglow: 0.6, shimmer: 0.3, sound: 0, burn: 0,
    // S3 play line: brightness, half width in pixels, how much a note inside it is lit, the downbeat jump
    column: 0.07, columnHalf: 24, near: 0.4, pulse: 1,
    // S4 drums: the kick's lift, the snare's flash, sparks a hat or cymbal throws; since 0.22.0 the lift and the flash
    // come only on an accent (DRUM_ACCENT), at least `accentGap` seconds after the last one of the same drum
    breathe: 0.035, snare: 0.3, sparks: 4, accentGap: 8
  });
  const FX_PRESETS = Object.freeze({
    clear: FX_CLEAR,
    // The play line leads: a narrower, brighter column; fuller halos with sparks at the line;
    // a played note goes dark, as if burnt (piano-roll teaching software).
    keys: Object.freeze({...FX_CLEAR, halo: 0.85, haloLife: 0.2, haloReach: 1.6, hitSparks: 6,
      light: 0.45, afterglow: 0.35, burn: 0.5, column: 0.15, columnHalf: 12, near: 0.75}),
    // Quiet, for reading: no halos and no sparks; a sounding note is lifted, and a played one
    // fades back slowly, the longest afterglow; of the drums only a faint breath of the kick.
    ink: Object.freeze({...FX_CLEAR, halo: 0, light: 0.7, afterglow: 1.2, shimmer: 0.12, sound: 0.28,
      column: 0.035, near: 0, pulse: 0, breathe: 0.02, snare: 0, sparks: 0}),
    // The rhythm leads: the kick, the snare and the downbeat stronger; the melody's effects give way.
    stage: Object.freeze({...FX_CLEAR, halo: 0.25, light: 0.3, shimmer: 0.15, column: 0.08, near: 0.2,
      pulse: 2.6, snare: 0.7, sparks: 9, breathe: 0.06, accentGap: 4}),
    strong: Object.freeze({...FX_CLEAR, halo: 0.85, light: 0.85, shimmer: 0.5, column: 0.12, near: 0.65, pulse: 1.4, breathe: 0.06, snare: 0.5, sparks: 7,
      accentGap: 5}),
    off: null
  });
  // Which kicks lift the background and which snares flash (0.22.0, SPEC-7: every one of them did, 143 flashes a minute
  // on a busy song): a hit among this song's loud ones for that drum (at least the `top` share of its velocities) and
  // clearly louder than the same drum around it (`standout` times the median within `around` seconds either side). Of
  // those, a hit fires only `accentGap` seconds (the preset's) or more after the last one that fired. Found once per
  // lane, the spacing once per gap: a function of the song alone, so a paused or scrubbed frame is the same.
  const DRUM_ACCENT = Object.freeze({top: 0.75, standout: 1.1, around: 2, drums: ['kick', 'snare']});
  // `effects` and the preset it names, both ways.
  const LEVEL_PRESET = Object.freeze({off: 'off', light: 'clear', strong: 'strong'});
  const PRESET_LEVEL = Object.freeze({off: 'off', clear: 'light', strong: 'strong'});
  // The song's rise and fall (fxDynamics: 'song'). Its whole loudness is first averaged over
  // `even` seconds either side, so single drum hits are gone, then followed by a pointer that
  // reaches nine tenths of a new level in `rise` seconds going up and `fall` coming down: it
  // tracks phrases and sections, not beats. Three points of this song's own frames set the scale:
  // its quiet end (the `low` share) is 0, its usual loudness (the median) 0.5, its loud end (`high`)
  // 1, each half straight; the usual loudness is drawn as the preset itself. The silence before the
  // first sound and after the last (`silence` dB under the loud end) is left out of that count.
  // A song whose whole range is under `narrow` dB swings that much less, toward the middle; one
  // whose loud end is less than `upper` dB above its usual loudness (a song pressed loud all the
  // way) has its upper half shortened the same way, so a dB or so does not open it up all the way.
  // Then the scale is drawn in toward the middle: x = |2e − 1| becomes x to the power `pull` (0, 0.5 and 1
  // stay where they are), so e spends most of the song in the middle and only the really quiet and the
  // really loud stretches reach the ends (SPEC-FIX.md §8: an S pushing outward, tried in §7, left most
  // songs at one end or the other more than half the time; measured on the 18 analysed songs, 2 is the
  // least pull that keeps both ends together under 40 % and either one under 30 % for every one of them).
  const SWELL = Object.freeze({even: 1, rise: 1.5, fall: 4, low: 0.1, high: 0.95, silence: 40, narrow: 6, upper: 1.5, pull: 2});
  // Which amounts follow the swell, and how far down they go where the song is quiet (a share
  // of the preset's own value). Toward the loud end they go up to 'strong''s value for the same
  // amount, scaled the way 'strong' scales 'clear' and never above 'strong' (an amount a preset
  // already gives more of than 'strong' does stays where the preset has it). Times never move.
  // The quiet end: what lasts (afterglow, light along held notes, the column, notes lit ahead, the downbeat
  // jump, sparks) is close to nothing (SPEC-FIX.md §7); what answers each hit (the halo and its sparks,
  // the kick's breath, the snare's flash) keeps at least `INSTANT_FLOOR` of the preset's own, so every
  // note and drum stroke is still seen (§8.2).
  const INSTANT_FLOOR = 0.4;
  const SWELL_QUIET = Object.freeze({halo: INSTANT_FLOOR, haloReach: 0.6, hitSparks: INSTANT_FLOOR, light: 0.1, shimmer: 0.05, sound: 0.3,
    column: 0.15, near: 0.05, pulse: 0.05, breathe: INSTANT_FLOOR, snare: INSTANT_FLOOR, sparks: 0.1});
  const SWELL_COUNTS = Object.freeze(['hitSparks', 'sparks']);
  // `breathe` is the most a full-velocity kick lifts the background by (white over it, as a
  // fraction): the spec allows +6% at most, and a test holds every level to it.
  const CYMBALS = Object.freeze(['hihat', 'openhat', 'crash', 'ride']);

  // Chord segments shorter than this are folded into a neighbour before they are shown.
  // 'beat' is one beat of this song and needs a beat grid; the others are seconds.
  const CHORD_SMOOTHING = Object.freeze({raw: 0, half: 0.5, beat: 'beat', second: 1});
  const CHORD_OUT = 0.06;         // seconds a chord takes to dim out before the next one starts
  const CHORD_IN = 0.08;          // seconds the next one takes to come up after it has started
  // The album cover as a backdrop: how much of it shows in the quietest and the loudest
  // moment, and how much of the section wash is kept on top of it.
  const COVER_FAINT = 0.14, COVER_SWELL = 0.2, COVER_WASH = 0.5;
  // Behind the notes the cover is held back further: a veil of the background colour over
  // the lanes takes away this much of it, easing in and out over COVER_SOFT pixels.
  const COVER_VEIL = 0.55, COVER_SOFT = 28;
  // coverAdapt: the veil from the cover's measure. Lightness is Rec. 709 luma of the 8-bit values, 0..1. Behind the
  // lanes the cover shows at most `shown` = COVER_FAINT + COVER_SWELL times (1 - veil); its bright end there (its mean
  // plus `spread` standard deviations, measureCover) over the ground must stay at most `bright`, so a note still to
  // come (at 0.34 light) of a mid lane colour keeps its contrast against it. The veil that does that, kept within
  // [`low`, `high`]: a plain or dark cover gets a lighter veil than the fixed one, a bright busy one a darker one.
  const COVER_ADAPT = Object.freeze({bright: 0.16, spread: 1.5, low: 0.45, high: 0.8});
  // textureAdapt: the band's light (TEXTURE.alpha) raised by the cover that shows behind it (textureLight); never
  // above `high` (under a played note's 0.92); with nothing behind it, the plain ground's light.
  const TEXTURE_ADAPT = Object.freeze({gain: 14, high: 0.8});
  const lumaOf = rgb => (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  // How bright and busy a cover is behind the lanes: from its pixels (RGBA, row by row), the middle half of its
  // height (the cover fills the canvas, cropped; the lanes sit across the middle), luma mean and standard deviation.
  function measureCover(data, width, height) {
    if (!data || !(width > 0) || !(height > 0) || data.length < width * height * 4) return null;
    let sum = 0, sum2 = 0, n = 0;
    for (let y = Math.floor(height / 4); y < Math.ceil(height * 3 / 4); y++) {
      for (let x = 0; x < width; x++) {
        const k = (y * width + x) * 4, value = (0.2126 * data[k] + 0.7152 * data[k + 1] + 0.0722 * data[k + 2]) / 255;
        sum += value; sum2 += value * value; n++;
      }
    }
    const mean = sum / n, spread = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
    return {mean: Math.round(mean * 1000) / 1000, spread: Math.round(spread * 1000) / 1000};
  }
  // How much of a lane is taken away while another lane is being listened to alone.
  const FOCUS_VEIL = 0.62;
  const BLEND = 2.0;              // seconds over which the backdrop and the lane heights move from one section to the next
  const LONGEST_SPAN = 24;        // lane heights are settled per section, and a longer section is cut into parts this long
  const SHARE_FLOOR = 0.3;        // a silent lane shrinks to this much of its usual height, and no further
  const SHARE_CEILING = 1.9;
  const CAPTION_FADE = 0.3;       // seconds a caption takes to come and to go
  // A mark ahead of its moment is this bright, and this bright once it has come (as a caption).
  const MARK_DIM = 0.42, MARK_LIT = 0.94;
  const MARK_ICON = 1.1;           // the object's icon, as a multiple of the mark's font size
  const MARK_FLASH = 1.2;          // seconds the named lane's label stays lit after the moment, fading
  // The flash is a halo in the lane's own colour under its icon or name: a stroke this many times wider
  // (icon) or this many pixels wide (name) at the height of the flash, this bright. Drawn, not a canvas
  // shadow: it stays exactly where the label is and adds no blur pass.
  const MARK_WIDEN = 2.2, MARK_TEXT_HALO = 4, MARK_HALO = 0.35;
  const PLAIN_SECTIONS = Object.freeze(['letters', 'numbered', 'hidden']);
  // Structure engines whose section names mean something. Anything else only clusters.
  const NAMED_SOURCES = Object.freeze(['songformer', 'manual']);

  // What "simplified" means. A transcription writes a held or re-struck pitch as a chain of
  // notes that touch, leaves blips a few tens of milliseconds long, and reports notes where
  // the stem is all but silent. Each rule answers one of those.
  // Joining mends a note the transcriber cut up; it never turns many strikes into one line (0.22.0, SPEC-7: a
  // tremolo of 311 strikes had become one 29.9 s note). On a struck or plucked lane (`struck`: piano, guitar, bass) a
  // piece is joined only when it is clearly softer than the strike that started the note (at most `fade` of its
  // velocity) and not louder than `rise` times the piece just before it: a piece as loud, or one that swells up again,
  // is struck again. On any lane a joined note stops growing at `longest` seconds; the
  // next piece starts a note of its own. A note that was that long to begin with is left as it is.
  const SIMPLIFY = Object.freeze({
    joinGap: 0.04,          // same pitch, next one starts within this of the last one's end: one note
    fade: 0.8,              // struck lanes: the next piece at most this much of the strike's velocity
    rise: 1.25,             // struck lanes: and not louder than this much of the piece just before it (struck again)
    longest: 6,             // a joined note is never longer than this many seconds
    // After joining, only what is plainly the transcriber's noise is dropped (0.22.0, SPEC-7 ④: 0.21.0 dropped every note
    // under 0.06 s and every one under velocity 40, and a fast run of soft notes went with them):
    minDuration: 0.03,      // anything shorter than this: a blip
    faint: 0.4,             // and a note both softer than this share of the lane's median velocity
    faintDur: 0.12          // and shorter than this many seconds (a joined note keeps its loudest part's velocity)
  });
  const STRUCK_GROUPS = Object.freeze(['piano', 'guitar', 'bass']);

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const NATURALS = [0, 2, 4, 5, 7, 9, 11];
  // How many letters above the root a chord tone is written, by its distance in semitones:
  // a minor third is the third letter up (C -> Eb, never D#), a seventh the seventh.
  const TONE_LETTER = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6];
  // One hue per kind of section, so a verse looks like the verse before it.
  // The sound studio's look (memesynth/studio/theme.css), as in XLD: a section kind has the same hue in every song
  // and in XLD's timeline (intro green, verse blue, chorus rose …), one step lighter here because the score view
  // lays sections over a dark picture at partial strength. Kinds without a name fall back to the order list.
  const SECTION_BY_KIND = {intro: '#7abc98', outro: '#5f9b7b', verse: '#7db1dd', 'pre-chorus': '#b2a8e0', chorus: '#df8db5',
    bridge: '#a882b4', inst: '#b7b480', solo: '#da9982', break: '#89939e', silence: '#636363', start: '#636363', end: '#636363'};
  const SECTION_HUES = ['#d99796', '#cea175', '#adb074', '#82ba95', '#69babf', '#80b1da', '#aaa3da', '#cb98bf'];
  // Drum rows top to bottom, the way a kit is written: cymbals above, kick at the bottom.
  const DRUM_DISPLAY = ['crash', 'ride', 'openhat', 'hihat', 'tom', 'snare', 'kick'];
  const GROUP_COLORS = {
    // the studio's track colours (Okabe-Ito); violin is a lighter shade of the strings' yellow
    vocals: '#d78ab5', guitar: '#2fb89a', piano: '#7cc4f2', violin: '#e9e09a',
    strings: '#d9cd6a', bass: '#4d7fd0', drums: '#e8663a', other: '#9aa1a9',
    // winds (0.23.1, the user's pick of three): an olive, kept near the strings' yellow on purpose so winds and strings
    // read as one family, yet within the family's rules (work/winds-20261115/w2/REPORT-W2.md: ΔE 0.149 from guitar,
    // 0.222 from strings, 0.198 from the amber, 45° of hue away); the lit colour is mixed from it like every lane's
    winds: '#7c9206'
  };
  const SPARE_COLORS = ['#a98be0', '#c49a7a', '#6fa8a0', '#b0b6c2'];   // never near the amber
  // One drawn icon per group of GROUP_COLORS, in the lane's own colour. All on a 24-unit
  // square with one stroke width, round ends and joins, nothing filled. Each is a list of
  // pen moves: ['M', x, y] move, ['L', x, y] line, ['Q', cx, cy, x, y] curve,
  // ['C', x, y, r] a whole circle, ['Z'] close the shape.
  const ICON_STROKE = 1.7;
  const ICONS = Object.freeze({
    // a microphone: the head, the cradle, the stand
    vocals: [['M', 9, 5.5], ['Q', 9, 2.5, 12, 2.5], ['Q', 15, 2.5, 15, 5.5], ['L', 15, 10.5], ['Q', 15, 13.5, 12, 13.5],
      ['Q', 9, 13.5, 9, 10.5], ['Z'], ['M', 6, 10.5], ['Q', 6, 17.5, 12, 17.5], ['Q', 18, 17.5, 18, 10.5], ['M', 12, 17.5],
      ['L', 12, 21.5], ['M', 8, 21.5], ['L', 16, 21.5]],
    // three white keys and two black ones
    piano: [['M', 3, 4], ['L', 21, 4], ['L', 21, 20], ['L', 3, 20], ['Z'], ['M', 9, 13.5], ['L', 9, 20], ['M', 15, 13.5],
      ['L', 15, 20], ['M', 7.5, 4], ['L', 7.5, 13.5], ['L', 10.5, 13.5], ['L', 10.5, 4], ['M', 13.5, 4], ['L', 13.5, 13.5],
      ['L', 16.5, 13.5], ['L', 16.5, 4]],
    // a round body with its sound hole, the neck off to the upper right
    guitar: [['C', 8.75, 15.25, 6], ['C', 8.75, 15.25, 1.8], ['M', 13.05, 10.95], ['L', 19.75, 4.25], ['M', 18.25, 2.75],
      ['L', 21.25, 5.75]],
    // the bass clef
    bass: [['C', 5.6, 8.5, 1.4], ['M', 4.3, 8.1], ['Q', 4.6, 3.5, 9.6, 3.5], ['Q', 15.6, 3.5, 15.6, 9.5],
      ['Q', 15.6, 16.5, 5.1, 20.5], ['C', 19.1, 7, 0.7], ['C', 19.1, 12, 0.7]],
    // a violin: the body with its waist, two sound holes, the neck and scroll
    violin: [['M', 12, 6.85], ['Q', 7, 6.85, 7, 9.85], ['Q', 7, 12.35, 9.3, 13.35], ['Q', 7, 14.35, 7, 17.35],
      ['Q', 7, 21.85, 12, 21.85], ['Q', 17, 21.85, 17, 17.35], ['Q', 17, 14.35, 14.7, 13.35], ['Q', 17, 12.35, 17, 9.85],
      ['Q', 17, 6.85, 12, 6.85], ['Z'], ['M', 10.2, 14.85], ['L', 10.2, 17.85], ['M', 13.8, 14.85], ['L', 13.8, 17.85],
      ['M', 12, 6.85], ['L', 12, 3.85], ['C', 12, 3.05, 0.9]],
    // the strings as a section: the violin with a bow across it
    strings: [['M', 10.5, 7], ['Q', 7, 7, 7, 9.6], ['Q', 7, 11.8, 8.6, 12.7], ['Q', 7, 13.6, 7, 16.3],
      ['Q', 7, 20.2, 10.5, 20.2], ['Q', 14, 20.2, 14, 16.3], ['Q', 14, 13.6, 12.4, 12.7], ['Q', 14, 11.8, 14, 9.6],
      ['Q', 14, 7, 10.5, 7], ['Z'], ['M', 10.5, 7], ['L', 10.5, 3], ['M', 2.5, 21], ['L', 20.5, 5], ['M', 19, 3.5],
      ['L', 21.5, 6]],
    // a snare drum and two sticks
    drums: [['M', 4, 11.5], ['Q', 12, 7.5, 20, 11.5], ['Q', 12, 15.5, 4, 11.5], ['M', 4, 11.5], ['L', 4, 18.5], ['M', 20, 11.5],
      ['L', 20, 18.5], ['M', 4, 18.5], ['Q', 12, 22.5, 20, 18.5], ['M', 9, 9.5], ['L', 5, 3.5], ['M', 15, 9.5], ['L', 19, 3.5]],
    // a trumpet: the mouthpiece, the lead pipe, three valves, the bell flaring to the right, the tuning slide below
    winds: [['M', 2, 11.5], ['L', 14.5, 11.5], ['M', 2, 10], ['L', 2, 13], ['M', 14.5, 9.5], ['L', 21.5, 5], ['L', 21.5, 18],
      ['L', 14.5, 13.5], ['Z'], ['M', 6.5, 11.5], ['L', 6.5, 7.5], ['M', 9, 11.5], ['L', 9, 7.5], ['M', 11.5, 11.5], ['L', 11.5, 7.5],
      ['M', 5, 11.5], ['Q', 5, 16.5, 9.5, 16.5], ['Q', 14, 16.5, 14, 13.5]],
    // anything else: a quaver
    other: [['C', 9.5, 17.5, 3], ['M', 12.5, 17.5], ['L', 12.5, 3.5], ['Q', 18, 5.5, 17, 11]]
  });
  // Every lane icon is the same size, this many times the name's font size, whatever the
  // lane's height. In icon mode no lane is shorter than an icon and ICON_PAD above and below
  // it (the room is taken from the tallest lanes); where even that cannot be, the icon is
  // left out. Its brightness follows how loud the lane is (ICON_DIM for a silent one).
  const ICON_SCALE = 1.7, ICON_PAD = 3, ICON_DIM = 0.5;
  // Since 0.22.0 (SPEC-7 ⑤) every lane has an icon: a group without one of its own takes the nearest kind's (ICON_NEAREST,
  // else the quaver of 'other'), and a group on screen more than once (its timbre tracks shown apart) has the same icon
  // on each lane with a small number beside it (1, 2, … top to bottom, MARK_NUMBER of the name's font size), not its name.
  const ICON_NEAREST = Object.freeze({keys: 'piano', keyboard: 'piano', organ: 'piano', synth: 'piano', cello: 'strings', viola: 'strings',
    orchestra: 'strings', choir: 'vocals', voice: 'vocals', percussion: 'drums',
    // a wind group under another name (0.23.0): XLD's id is 'winds'
    wind: 'winds', brass: 'winds', woodwind: 'winds', woodwinds: 'winds', horns: 'winds', sax: 'winds', reeds: 'winds'});
  const iconFor = group => ICONS[group] || ICONS[ICON_NEAREST[group]] || ICONS.other;
  const MARK_NUMBER = 0.72;
  // With a group shown apart and a lane too short for the icon at its one size, every icon on screen is
  // drawn at one smaller size, as tall as the shortest lane, but never under ICON_MIN pixels (a lane shorter has none).
  const ICON_MIN = 8;
  // The texture band (showTexture). Under `floor` dB (the levels layer's scale) the stem counts
  // as silent and nothing is drawn. Above it, how thick and how light the band is goes by this
  // song's own 'other' stem while it sounds: its `low` share of those frames is the thinnest
  // (`thinnest` of the full thickness), its `high` share the thickest, along a `curve` that keeps the
  // loud end for the loudest moments (a stem that sits near its own top would otherwise be a full bar
  // most of the time; SPEC-FIX.md §2); a stem whose range there is
  // under `narrow` dB swings that much less, toward the middle (as swellOf does), so it is never a
  // bar of one width. Its light is at most `alpha` of the lane's own (neutral) colour, the swell
  // included, and less ahead of the line (`ahead`), as notes not yet played are dimmer. It is half
  // the least lane height tall and sits `gap` px from the lanes. Its thickest is `full` of its
  // height; the outline is drawn at `edge` of the light and a core half as thick at the full light.
  const TEXTURE = Object.freeze({floor: -50, low: 0.1, high: 0.98, curve: 1.5, narrow: 6, thinnest: 0.15, alpha: 0.3, ahead: 0.55, gap: 6, edge: 0.4, full: 0.85});
  // Its icon, in the icons' own style: a plain wave.
  const TEXTURE_ICON = Object.freeze([['M', 2, 12], ['Q', 4.5, 6, 7, 12], ['Q', 9.5, 18, 12, 12], ['Q', 14.5, 6, 17, 12], ['Q', 19.5, 18, 22, 12]]);
  // Timbre tracks of one stem share its hue; these mix amounts tell them apart
  // (positive toward white, negative toward the background).
  const SHADES = [0, 0.3, -0.25, 0.5, -0.4, 0.15];
  const BACKGROUND = '#1a1d21';   // the studio's ground
  // The night sky (nightSky): a deep blue-black, `tint` of the way toward the cover's average hue at the sky's own
  // brightness (a bright cover tints it, never lifts it); the Milky Way's pale
  // light; the horizon's glow (`halo` half-width in pixels, `glow` its light, `line` the fine line's).
  const NIGHT = Object.freeze({sky: Object.freeze([11, 14, 24]), tint: .45, milky: Object.freeze([200, 206, 230]), halo: 9, glow: .11, line: .5});
  const FONT = 'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", sans-serif';

  const isObject = value => typeof value === 'object' && value !== null && !Array.isArray(value);
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  // A note this short gets the round head of `shortHead` (0.29.0).
  const SHORT_NOTE = Object.freeze({seconds: 0.3});
  // The drum kit as every shared look draws it (0.29.0, work/score-depth-20261118/SPEC.md batch 1). Five rows that never
  // move, top to bottom: cymbals (crash, ride), hats (hi-hat, open hat), toms, snare, kick, whatever order the song's
  // own rows come in and whether or not a row is played, so a repeated rhythm draws as a repeated picture. One mark per
  // kind: the kick a wide lozenge, the snare a diamond, a tom a dot, a hat one stroke (open: two), the crash a cross, the
  // ride a stroke over its bell. A mark is `mark` of its row tall (between `least` and `most` pixels), a step
  // smaller when soft. A look only chooses the material: colour, light, softness. Exported as XinScoreView.drumKit.
  const DRUM_KIT = Object.freeze({rows: Object.freeze(['cymbal', 'hat', 'tom', 'snare', 'kick']),
    row: Object.freeze({crash: 0, ride: 0, hihat: 1, openhat: 1, tom: 2, snare: 3, kick: 4}), mark: 0.62, least: 1.6, most: 4.2, soft: 0.25});
  // The least gap, in pixels, left between two neighbouring marks of one row (0.29.1).
  const KIT_GAP = 1.6;
  const kitRow = name => (Object.prototype.hasOwnProperty.call(DRUM_KIT.row, name) ? DRUM_KIT.row[name] : DRUM_KIT.row.tom);
  // A row's middle as a share of the drum lane's height, from its top.
  const kitCenter = name => (kitRow(name) + 0.5) / DRUM_KIT.rows.length;
  // Half the height of a mark, in the lane's pixels.
  const kitSize = (laneHeight, velocity) => clamp(laneHeight / DRUM_KIT.rows.length * DRUM_KIT.mark / 2, DRUM_KIT.least, DRUM_KIT.most) *
    (1 - DRUM_KIT.soft + DRUM_KIT.soft * clamp((Number.isFinite(velocity) ? velocity : 80) / 127, 0, 1));
  function kitSlash(path, left, right, y, h) {
    const ink = Math.max(0.95, h * 0.42);
    path.moveTo(left, y + h); path.lineTo(right, y - h); path.lineTo(right + ink, y - h); path.lineTo(left + ink, y + h); path.closePath();
  }
  // For each hit of a drum lane ({count, time, row}), the seconds to the nearest other hit in the same kit row (a hi-hat
  // and an open hat share theirs), Infinity when alone: a mark is never wider than leaves a gap to its neighbour.
  function kitGaps(hits, rowNames) {
    const gaps = new Float32Array(hits.count).fill(Infinity), last = new Map();
    for (let i = 0; i < hits.count; i++) {
      const row = kitRow(rowNames[hits.row[i]]), before = last.get(row);
      if (before !== undefined) {
        const gap = hits.time[i] - hits.time[before];
        if (gap > 0) { gaps[i] = Math.min(gaps[i], gap); gaps[before] = Math.min(gaps[before], gap); }
      }
      last.set(row, i);
    }
    return gaps;
  }
  // One mark into a path (filled by the caller): `h` is half its height; `room` (pixels, optional) half the distance to
  // the nearest hit of the same row. A mark wider than that is narrowed to leave a gap of at least KIT_GAP pixels, but
  // never below 0.45 of its height, so every hit can still be counted.
  function kitMark(path, name, x, y, h, room = Infinity) {
    const fit = width => Math.max(h * 0.45, Math.min(width, room - KIT_GAP / 2));
    // The kick is the widest mark, but narrow enough that sixteenth kicks at a normal zoom stay apart.
    const w = fit(h * 1.15);
    if (name === 'kick') {
      if (path.roundRect) path.roundRect(x - w, y - h * 0.62, 2 * w, h * 1.24, h * 0.6);
      else path.rect(x - w, y - h * 0.62, 2 * w, h * 1.24);
    } else if (name === 'snare') {
      path.moveTo(x, y - h); path.lineTo(x + h * 0.7, y); path.lineTo(x, y + h); path.lineTo(x - h * 0.7, y); path.closePath();
    } else if (name === 'hihat' || name === 'openhat' || name === 'crash' || name === 'ride') {
      kitSlash(path, x - h * 0.75, x + h * 0.45, y, h);
      if (name === 'openhat') kitSlash(path, x + h * 0.35, x + h * 1.55, y, h);
      if (name === 'crash') kitSlash(path, x + h * 0.45, x - h * 0.75, y, h);
      if (name === 'ride') path.rect(x - h * 0.9, y + h * 0.42, h * 1.8, h * 0.46);
    } else {
      path.moveTo(x + h * 0.66, y); path.arc(x, y, h * 0.66, 0, Math.PI * 2);
    }
  }
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const drumSeconds = Object.freeze({hihat:.20, snare:.35, kick:.45, openhat:.50, ride:.50, crash:.50, tom:.40, unknown:.35});
  function transientTiming(raw) {
    const result = {};
    for (const [key,low,high] of [['pluckReleaseSeconds',.25,3],['drumDecayScale',.5,4]]) {
      const value = raw?.[key];
      if (finite(value) && value >= 0) result[key] = value === 0 ? 0 : clamp(value,low,high);
    }
    if (finite(raw?.meteorDirectionDegrees)) result.meteorDirectionDegrees=clamp(raw.meteorDirectionDegrees,0,12);
    if (typeof raw?.meteorBassDirection==='boolean') result.meteorBassDirection=raw.meteorBassDirection;
    return result;
  }
  function transientLight(age, lifetime) {
    const u = clamp(1-age/lifetime,0,1);
    return u*u*(3-2*u);
  }

  function fail(message) {
    const error = new Error('[score-view] ' + message);
    error.code = 'SCORE_VIEW_MODEL';
    return error;
  }

  function noteName(pitch) {
    const value = Math.round(pitch);
    return NOTE_NAMES[((value % 12) + 12) % 12] + (Math.floor(value / 12) - 1);
  }

  // --- colour --------------------------------------------------------------

  function parseHex(hex) {
    const value = parseInt(hex.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  }

  const BACKGROUND_RGB = parseHex(BACKGROUND);

  // Colours are [r, g, b]. A positive amount mixes toward white, a negative one toward
  // the background.
  function mix(rgb, amount) {
    const toward = amount >= 0 ? [255, 255, 255] : BACKGROUND_RGB;
    const k = Math.abs(amount);
    return rgb.map((channel, index) => Math.round(channel + (toward[index] - channel) * k));
  }

  const rgba = (rgb, alpha) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
  // Hold a and b fixed in OKLab (equivalently C and h in OKLCH). Walk only L until the
  // displayed sRGB ink has the target grey, stopping at the gamut boundary for saturated inks.
  function balancedInk(rgb, target) {
    const linear = rgb.map(v => v <= 10 ? v / 3294.6 : ((v / 255 + 0.055) / 1.055) ** 2.4);
    const [r, g, b] = linear;
    const l = Math.cbrt(.4122214708*r + .5363325363*g + .0514459929*b);
    const m = Math.cbrt(.2119034982*r + .6806995451*g + .1073969566*b);
    const s = Math.cbrt(.0883024619*r + .2817188376*g + .6299787005*b);
    const initial = .2104542553*l + .793617785*m - .0040720468*s;
    const a = 1.9779984951*l - 2.428592205*m + .4505937099*s;
    const bb = .0259040371*l + .7827717662*m - .808675766*s;
    let good = initial, limit = lumaOf(rgb) < target ? 1 : 0, best = rgb;
    const lighter = limit === 1;
    for (let i = 0; i < 16; i++) {
      const L = (good + limit) * .5;
      const x = (L + .3963377774*a + .2158037573*bb) ** 3;
      const y = (L - .1055613458*a - .0638541728*bb) ** 3;
      const z = (L - .0894841775*a - 1.291485548*bb) ** 3;
      const channels = [4.0767416621*x - 3.3077115913*y + .2309699292*z,
                       -1.2684380046*x + 2.6097574011*y - .3413193965*z,
                       -.0041960863*x - .7034186147*y + 1.707614701*z];
      if (channels.some(v => v < -1e-7 || v > 1.0000001)) { limit = L; continue; }
      const encoded = channels.map(v => 255 * (v <= .0031308 ? 12.92*v : 1.055*v**(1/2.4)-.055));
      if ((lumaOf(encoded) < target) === lighter) { good = L; best = encoded; }
      else limit = L;
    }
    return best.map(v => clamp(Math.round(v), 0, 255));
  }

  // No confidence score is supplied by these transcribers. Require independent stem evidence
  // even for a short, weak note. A missing, coarsely sampled or truncated row asserts nothing.
  function weakPianoNotes(notes, levels) {
    const row = levels && levels.groups && levels.groups.piano, hop = levels && levels.hop;
    if (!Array.isArray(row) || !finite(hop) || hop <= 0 || hop > 1) return null;
    let flags = null;
    for (let i = 0; i < notes.length; i++) {
      const [start, duration, , velocity] = notes[i];
      const first = Math.max(0, Math.floor((start - hop) / hop));
      const last = Math.floor((start + duration + hop) / hop);
      if (last >= row.length) continue;
      let peak = -Infinity;
      for (let j = first; j <= last; j++) {
        if (!finite(row[j])) { peak = Infinity; break; }
        peak = Math.max(peak, row[j]);
      }
      // At this resolution even a real transient can sit inside a very quiet one-second bin.
      // Treat silence alone as evidence only at the pipeline's measurement floor (−100.7).
      if (peak > -100 && !(peak <= -65 && duration <= .11 && velocity <= 40)) continue;
      if (!flags) flags = new Uint8Array(notes.length);
      flags[i] = 1;
    }
    return flags;
  }

  function attackOpacity(age) {
    const elapsed = clamp(age < .075 ? age / .075 : (age - .075) / .4, 0, 1);
    const smooth = elapsed * elapsed * (3 - 2 * elapsed);
    return age < .075 ? .34 + .66*smooth : 1 - .13*smooth;
  }
  const toHex = rgb => '#' + rgb.map(channel => channel.toString(16).padStart(2, '0')).join('');

  // --- notes ---------------------------------------------------------------

  // Notes are kept as parallel typed arrays sorted by start, so a frame only walks the ones
  // that can be on screen.
  function noteSet(list) {
    const count = list.length;
    const set = {
      count, start: new Float32Array(count), dur: new Float32Array(count),
      pitch: new Uint8Array(count), vel: new Uint8Array(count), maxDur: 0
    };
    for (let i = 0; i < count; i++) {
      const note = list[i];
      set.start[i] = note[0]; set.dur[i] = note[1]; set.pitch[i] = note[2]; set.vel[i] = note[3];
      if (note[1] > set.maxDur) set.maxDur = note[1];
    }
    set.weight = Float32Array.from(set.pitch, pitchWeightOf);
    // 1 lead, 0 accompaniment, -1 not known (a lane without roles merged with one that has them).
    if (list.some(note => note.length > 4)) {
      set.role = new Int8Array(count);
      for (let i = 0; i < count; i++) set.role[i] = list[i].length > 4 ? list[i][4] : -1;
    }
    return set;
  }

  // `roles`: the lane's roles (MODEL.md), one per note of `raw`. When they are usable each note
  // carries its role as a fifth item (1 lead, 0 accompaniment); otherwise notes are as before.
  function validNotes(raw, roles) {
    if (!Array.isArray(raw)) return null;
    const notes = [];
    const withRoles = Array.isArray(roles) && roles.length === raw.length && roles.every(role => role === 0 || role === 1);
    for (let index = 0; index < raw.length; index++) {
      const note = raw[index];
      if (!Array.isArray(note)) continue;
      const start = Number(note[0]), dur = Number(note[1]), pitch = Number(note[2]);
      const vel = note[3] == null ? 100 : Number(note[3]);
      if (!finite(start) || !finite(dur) || !finite(pitch) || !finite(vel)) continue;
      if (start < 0 || dur <= 0 || pitch < 0 || pitch > 127) continue;
      const kept = [start, dur, Math.round(pitch), clamp(Math.round(vel), 1, 127)];
      if (withRoles) kept.push(roles[index]);
      notes.push(kept);
    }
    notes.sort((a, b) => a[0] - b[0] || a[2] - b[2]);
    return notes;
  }

  function validHits(raw, rowCount) {
    if (!Array.isArray(raw)) return null;
    const hits = [];
    for (const hit of raw) {
      if (!Array.isArray(hit)) continue;
      const time = Number(hit[0]), row = Number(hit[1]);
      const vel = hit[2] == null ? 100 : Number(hit[2]);
      if (!finite(time) || time < 0 || !Number.isInteger(row) || row < 0 || row >= rowCount || !finite(vel)) continue;
      hits.push([time, row, clamp(Math.round(vel), 1, 127)]);
    }
    hits.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return hits;
  }

  // Join, then drop. Joining first matters: a held note that decays is one loud start and
  // a tail of quiet pieces, and filtering the pieces first would cut the note short.
  function simplifyNotes(notes, rules) {
    const joinGap = rules && finite(rules.joinGap) ? rules.joinGap : SIMPLIFY.joinGap;
    const minDuration = rules && finite(rules.minDuration) ? rules.minDuration : SIMPLIFY.minDuration;
    const faint = rules && finite(rules.faint) ? rules.faint : SIMPLIFY.faint;
    const faintDur = rules && finite(rules.faintDur) ? rules.faintDur : SIMPLIFY.faintDur;
    const fade = rules && finite(rules.fade) ? rules.fade : SIMPLIFY.fade;
    const longest = rules && finite(rules.longest) ? rules.longest : SIMPLIFY.longest;
    const rise = rules && finite(rules.rise) ? rules.rise : SIMPLIFY.rise;
    const struck = Boolean(rules && rules.struck);
    const byPitch = new Map();
    for (const note of notes) {
      const chain = byPitch.get(note[2]);
      if (chain) chain.push(note); else byPitch.set(note[2], [note]);
    }
    const joined = [];
    for (const chain of byPitch.values()) {
      chain.sort((a, b) => a[0] - b[0]);
      let current = null, strike = 0, last = 0;
      for (const note of chain) {
        const fading = !struck || (note[3] <= strike * fade && note[3] <= last * rise);
        last = note[3];
        if (current && note[0] <= current[0] + current[1] + joinGap &&
            Math.max(current[0] + current[1], note[0] + note[1]) - current[0] <= longest && fading) {
          current[1] = Math.max(current[0] + current[1], note[0] + note[1]) - current[0];
          current[3] = Math.max(current[3], note[3]);
          if (current.length > 4 || note.length > 4) current[4] = Math.max(current.length > 4 ? current[4] : -1, note.length > 4 ? note[4] : -1);
        } else {
          current = note.length > 4 ? [note[0], note[1], note[2], note[3], note[4]] : [note[0], note[1], note[2], note[3]];
          strike = note[3];
          joined.push(current);
        }
      }
    }
    const kept = [];
    let short = 0, quiet = 0;
    // The lane's own typical loudness: the median velocity of its notes after joining.
    const velocities = joined.map(note => note[3]).sort((a, b) => a - b);
    const typical = velocities.length ? velocities[velocities.length >> 1] : 0;
    for (const note of joined) {
      if (note[1] < minDuration) short++;
      else if (note[3] < faint * typical && note[1] < faintDur) quiet++;
      else kept.push(note);
    }
    kept.sort((a, b) => a[0] - b[0] || a[2] - b[2]);
    return {
      notes: kept,
      stats: {input: notes.length, joined: notes.length - joined.length, short, quiet, output: kept.length}
    };
  }

  // The accents of a drum lane's hits (DRUM_ACCENT), one flag a hit; `hits` is the lane's {count, time, row, vel}.
  function drumAccents(hits, rowNames) {
    const accent = new Uint8Array(hits.count);
    for (const name of DRUM_ACCENT.drums) {
      const index = [];
      for (let i = 0; i < hits.count; i++) if (rowNames[hits.row[i]] === name) index.push(i);
      if (!index.length) continue;
      const sorted = index.map(i => hits.vel[i]).sort((a, b) => a - b);
      const floor = sorted[Math.floor(DRUM_ACCENT.top * (sorted.length - 1))];
      let from = 0, to = 0;
      for (const i of index) {
        const time = hits.time[i];
        while (hits.time[index[from]] < time - DRUM_ACCENT.around) from++;
        while (to < index.length && hits.time[index[to]] <= time + DRUM_ACCENT.around) to++;
        // The others around it (a hit alone there stands out by itself).
        const near = index.slice(from, to).filter(k => k !== i).map(k => hits.vel[k]).sort((a, b) => a - b);
        if (hits.vel[i] >= floor && (!near.length || hits.vel[i] + 1e-6 >= DRUM_ACCENT.standout * near[near.length >> 1])) accent[i] = 1;
      }
    }
    return accent;
  }

  // Of a drum lane's accents, the ones that fire with `gap` seconds between two of the same drum; kept per gap.
  function firedHits(lane, gap) {
    const hits = lane.hits;
    if (!hits.fired) hits.fired = new Map();
    let fired = hits.fired.get(gap);
    if (fired) return fired;
    fired = new Uint8Array(hits.count);
    const last = new Map();
    for (let i = 0; i < hits.count; i++) {
      if (!hits.accent[i]) continue;
      const name = lane.rowNames[hits.row[i]], before = last.has(name) ? last.get(name) : -Infinity;
      if (hits.time[i] - before >= gap) { fired[i] = 1; last.set(name, hits.time[i]); }
    }
    hits.fired.set(gap, fired);
    return fired;
  }

  // The pitches a lane has to make room for: the 2nd to 98th percentile, so one stray note
  // three octaves out does not flatten everything else, padded and at least an octave tall.
  function pitchRange(notes) {
    if (!notes.length) return {low: 55, high: 67};
    const pitches = notes.map(note => note[2]).sort((a, b) => a - b);
    const at = fraction => pitches[clamp(Math.round(fraction * (pitches.length - 1)), 0, pitches.length - 1)];
    let low = at(0.02) - 2, high = at(0.98) + 2;
    while (high - low < 12) { low--; if (high - low < 12) high++; }
    return {low: Math.max(0, low), high: Math.min(127, high)};
  }

  // --- chords and sections -------------------------------------------------

  // `[start, end, text, ...]` rows that can be drawn, in time order. Chords and sections
  // (and later captions) all have this shape.
  // The structure of a mark, or null when a row has none that can be drawn as one.
  function markOf(raw, start, end) {
    if (!isObject(raw) || typeof raw.object !== 'string' || !raw.object || typeof raw.word !== 'string' || !finite(Number(raw.at))) return null;
    const at = clamp(Number(raw.at), start, end);
    return {object: raw.object, word: raw.word, at, preview: raw.preview === true && at > start};
  }

  function validSpans(raw) {
    if (!Array.isArray(raw)) return [];
    const spans = [];
    for (const row of raw) {
      if (!Array.isArray(row)) continue;
      const start = Number(row[0]), end = Number(row[1]);
      if (!finite(start) || !finite(end) || end <= start || typeof row[2] !== 'string' || !row[2].trim()) continue;
      spans.push([Math.max(0, start), end, row[2].trim()].concat(row.slice(3)));
    }
    spans.sort((a, b) => a[0] - b[0]);
    return spans;
  }

  function chordRoot(label) {
    const match = /^[A-G][#b]?/.exec(label);
    return match ? match[0] : '';
  }

  // Fold chord segments shorter than `minimum` seconds into a neighbour, shortest first.
  // A blip between two stretches of one chord simply disappears. Otherwise it joins the
  // neighbour that shares its root (a Cm7 beside a Cm), or failing that the longer one.
  // Segments with silence between them are never joined across it.
  function smoothChords(chords, minimum) {
    const list = chords.map(chord => chord.slice());
    if (!(minimum > 0)) return list;
    const touching = (a, b) => Math.abs(a[1] - b[0]) < 0.05;
    for (;;) {
      let pick = -1;
      for (let i = 0; i < list.length; i++) {
        const length = list[i][1] - list[i][0];
        if (length >= minimum) continue;
        const neighbour = (i > 0 && touching(list[i - 1], list[i])) || (i + 1 < list.length && touching(list[i], list[i + 1]));
        if (neighbour && (pick < 0 || length < list[pick][1] - list[pick][0])) pick = i;
      }
      if (pick < 0) break;
      const short = list[pick];
      const before = pick > 0 && touching(list[pick - 1], short) ? list[pick - 1] : null;
      const after = pick + 1 < list.length && touching(short, list[pick + 1]) ? list[pick + 1] : null;
      let into = before || after;
      if (before && after) {
        const root = chordRoot(short[2]);
        const sameBefore = chordRoot(before[2]) === root, sameAfter = chordRoot(after[2]) === root;
        if (sameBefore !== sameAfter) into = sameBefore ? before : after;
        else into = after[1] - after[0] > before[1] - before[0] ? after : before;
      }
      if (into === before) before[1] = short[1]; else after[0] = short[0];
      list.splice(pick, 1);
    }
    // Taking a blip out can leave the same chord on both sides of where it was.
    for (let i = list.length - 1; i > 0; i--) {
      if (list[i][2] === list[i - 1][2] && touching(list[i - 1], list[i])) {
        list[i - 1][1] = list[i][1];
        list.splice(i, 1);
      }
    }
    return list;
  }

  // The names of a chord's tones, spelled from its root: Cm is C Eb G, D#m is D# F# A#.
  // Each tone takes the letter its interval calls for. Where that would need a double
  // accidental, or one of E# B# Cb Fb, the everyday name is used instead.
  function toneNames(label, pitchClasses) {
    const match = /^([A-G])([#b]?)/.exec(String(label || ''));
    if (!match || !Array.isArray(pitchClasses)) return [];
    const letter = LETTERS.indexOf(match[1]);
    const root = (NATURALS[letter] + (match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0) + 12) % 12;
    const everyday = match[2] === 'b' ? FLAT_NAMES : NOTE_NAMES;
    const tones = pitchClasses.filter(finite).map(value => ((Math.round(value) % 12) + 12) % 12);
    const has = step => tones.includes((root + step) % 12);
    return tones.map(pitch => {
      const step = (pitch - root + 12) % 12;
      let up = TONE_LETTER[step];
      if (step === 3 && has(4)) up = 1;         // a raised ninth beside a major third
      if (step === 6 && has(7)) up = 3;         // a raised eleventh beside a fifth
      if (step === 8 && !has(7)) up = 4;        // a raised fifth where there is no plain one
      const target = (letter + up) % 7;
      const accidental = ((pitch - NATURALS[target] + 18) % 12) - 6;
      const name = LETTERS[target] + (accidental === 1 ? '#' : accidental === -1 ? 'b' : '');
      return Math.abs(accidental) > 1 || ['E#', 'B#', 'Cb', 'Fb'].includes(name) ? everyday[pitch] : name;
    });
  }

  // The loudness envelope as 0..1 for the backdrop: this song's own quiet and loud (its
  // 10th and 95th percentile), smoothed over about a second and a half so it breathes
  // with the phrases instead of flickering with the drums.
  function glowOf(energy) {
    if (!isObject(energy) || !Array.isArray(energy.db) || !finite(energy.hop) || energy.hop <= 0) return null;
    const db = energy.db.map(value => (finite(value) ? value : -120));
    if (!db.length) return null;
    const sorted = db.slice().sort((a, b) => a - b);
    const low = sorted[Math.floor(0.1 * (sorted.length - 1))], high = sorted[Math.floor(0.95 * (sorted.length - 1))];
    const reach = Math.max(1, Math.round(0.75 / energy.hop));
    const values = new Float32Array(db.length);
    for (let i = 0; i < db.length; i++) {
      let sum = 0, count = 0;
      for (let j = Math.max(0, i - reach); j <= Math.min(db.length - 1, i + reach); j++) { sum += db[j]; count++; }
      values[i] = high > low ? clamp((sum / count - low) / (high - low), 0, 1) : 0.5;
    }
    return {hop: energy.hop, values};
  }

  // The song's slow rise and fall, 0..1 every `hop` seconds (SWELL says how). Computed once
  // from the model: the value at a moment depends on that moment alone, never on what was drawn
  // before it or on the wall clock. Null without a loudness envelope (the swell is then 0.5).
function canonicalOnsets(rows) {
  const ordered=rows.map(row=>({...row})).sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
  const latest=new Map(),result=[];
  for(const row of ordered){
    const key=String(row.markGroup??row.group)+'|'+row.pitch,previous=latest.get(key);
    const sameEvent=previous&&Math.abs(row.start-previous.start)<.001;
    const crossLane=previous&&row.lane!==previous.lane&&row.start-previous.start<=.025;
    if(sameEvent||crossLane){
      previous.end=Math.max(previous.end,row.end);
      previous.velocity=Math.max(previous.velocity,row.velocity);
    } else {result.push(row);latest.set(key,row);}
  }
  return result;
}

  function swellOf(energy) {
    if (!isObject(energy) || !Array.isArray(energy.db) || !finite(energy.hop) || energy.hop <= 0) return null;
    const db = energy.db.map(value => (finite(value) ? value : -120));
    const count = db.length;
    if (!count) return null;
    const rank = (list, share) => list[Math.floor(share * (list.length - 1))];
    const floor = rank(db.slice().sort((a, b) => a - b), SWELL.high) - SWELL.silence;
    let first = 0, last = count - 1;
    while (first < count && db[first] < floor) first++;
    while (last > first && db[last] < floor) last--;
    if (first >= count) return null;
    // Even out the beats: a centred mean over SWELL.even seconds either side, inside the sounding
    // part only, so the silence around the song never leaks into its first and last seconds.
    const sums = new Float64Array(count + 1);
    for (let i = 0; i < count; i++) sums[i + 1] = sums[i] + db[i];
    const reach = Math.max(1, Math.round(SWELL.even / energy.hop));
    const even = Float64Array.from(db);
    for (let i = first; i <= last; i++) {
      const from = Math.max(first, i - reach), to = Math.min(last, i + reach);
      even[i] = (sums[to + 1] - sums[from]) / (to - from + 1);
    }
    // Follow it, up quicker than down: nine tenths of the way in `rise` (or `fall`) seconds. It starts
    // at the first sound (the silence before it is the quiet end); after the last it falls away.
    const up = 1 - Math.pow(0.1, energy.hop / SWELL.rise), down = 1 - Math.pow(0.1, energy.hop / SWELL.fall);
    const followed = Float64Array.from(even);
    for (let i = first + 1; i < count; i++) {
      const gap = even[i] - followed[i - 1];
      followed[i] = followed[i - 1] + gap * (gap > 0 ? up : down);
    }
    const sounding = Array.from(followed.subarray(first, last + 1)).sort((a, b) => a - b);
    const low = rank(sounding, SWELL.low), high = rank(sounding, SWELL.high), range = high - low;
    const middle = rank(sounding, 0.5);
    const squeeze = Math.min(1, range / SWELL.narrow);
    const upper = Math.min(1, (high - middle) / SWELL.upper);
    // Each half straight: the quiet end to the usual loudness is 0 to 0.5, the usual loudness to the loud end 0.5 to 1.
    const half = (value, from, to) => (to > from ? clamp((value - from) / (to - from), 0, 1) : value < from ? 0 : 1);
    const scale = value => (value <= middle ? 0.5 * half(value, low, middle) : 0.5 + 0.5 * half(value, middle, high) * upper);
    const values = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const raw = range > 0 ? scale(followed[i]) : 0.5;
      const pushed = 0.5 + Math.sign(raw - 0.5) * Math.pow(Math.abs(2 * raw - 1), SWELL.pull) / 2;
      values[i] = 0.5 + (pushed - 0.5) * squeeze;
    }
    const r2 = value => Math.round(value * 100) / 100;
    return {hop: energy.hop, values, low: r2(low), middle: r2(middle), high: r2(high), range: r2(range),
            squeeze: Math.round(squeeze * 1000) / 1000, upper: Math.round(upper * 1000) / 1000,
            sounding: [r2(first * energy.hop), r2((last + 1) * energy.hop)]};
  }

  // How thick (and light) the texture band is at each frame, 0..1: 0 under TEXTURE.floor; above it,
  // by this stem's own range while it sounds (see TEXTURE). Made once with the model.
  function textureScale(db) {
    const sounding = Array.from(db).filter(value => value > TEXTURE.floor).sort((a, b) => a - b);
    const amount = new Float32Array(db.length);
    if (!sounding.length) return {amount, low: null, high: null, range: 0, squeeze: 0};
    const rank = share => sounding[Math.floor(share * (sounding.length - 1))];
    const low = rank(TEXTURE.low), high = rank(TEXTURE.high), range = high - low;
    const squeeze = Math.min(1, range / TEXTURE.narrow);
    for (let k = 0; k < db.length; k++) {
      if (!(db[k] > TEXTURE.floor)) continue;
      const raw = range > 0 ? clamp((db[k] - low) / range, 0, 1) : 0.5;
      amount[k] = TEXTURE.thinnest + (1 - TEXTURE.thinnest) * (0.5 + (Math.pow(raw, TEXTURE.curve) - 0.5) * squeeze);
    }
    const r2 = value => Math.round(value * 100) / 100;
    return {amount, low: r2(low), high: r2(high), range: r2(range), squeeze: Math.round(squeeze * 1000) / 1000};
  }

  // A preset's amounts at a swell of `level` (0..1): at 0.5 exactly the preset; below, down
  // toward SWELL_QUIET's share of it; above, up toward what 'strong' gives (see SWELL_QUIET).
  function swelled(preset, level) {
    const out = {...preset};
    for (const key of Object.keys(SWELL_QUIET)) {
      const base = preset[key];
      if (!(base > 0)) continue;
      let value;
      if (level < 0.5) value = base - (base - base * SWELL_QUIET[key]) * (1 - 2 * level);
      else {
        const scale = FX_CLEAR[key] > 0 ? FX_PRESETS.strong[key] / FX_CLEAR[key] : 1;
        const loud = Math.min(base * scale, Math.max(base, FX_PRESETS.strong[key]));
        value = base + (loud - base) * (2 * level - 1);
      }
      out[key] = SWELL_COUNTS.includes(key) ? Math.round(value) : value;
    }
    return out;
  }

  // Per-stem loudness, settled once per stretch of the song: the stretches are the
  // sections (and the gaps between them), or ten-second windows where there are none,
  // and none is longer than LONGEST_SPAN. Each stretch holds every stem's mean power.
  function stretchesOf(levels, sections, duration) {
    if (!isObject(levels) || !isObject(levels.groups) || !finite(levels.hop) || levels.hop <= 0) return null;
    const groups = Object.keys(levels.groups).filter(group => Array.isArray(levels.groups[group]));
    if (!groups.length || !(duration > 0)) return null;
    const edges = new Set([0, duration]);
    for (const section of sections) { edges.add(clamp(section.start, 0, duration)); edges.add(clamp(section.end, 0, duration)); }
    const cuts = [...edges].sort((a, b) => a - b);
    const stretches = [];
    for (let i = 0; i + 1 < cuts.length; i++) {
      const length = cuts[i + 1] - cuts[i];
      if (length < 0.5) continue;
      const limit = sections.length ? LONGEST_SPAN : 10;
      const parts = Math.max(1, Math.ceil(length / limit));
      for (let part = 0; part < parts; part++) {
        const start = cuts[i] + length * part / parts, end = cuts[i] + length * (part + 1) / parts;
        const power = {};
        for (const group of groups) {
          const row = levels.groups[group];
          let sum = 0, count = 0;
          for (let k = Math.floor(start / levels.hop); k < Math.min(row.length, Math.ceil(end / levels.hop)); k++) {
            if (finite(row[k])) { sum += Math.pow(10, row[k] / 10); count++; }
          }
          power[group] = count ? sum / count : 0;
        }
        stretches.push({start, end, power});
      }
    }
    return stretches.length ? stretches : null;
  }

  // --- model ---------------------------------------------------------------

  function prepareLane(lane, index) {
    if (!isObject(lane)) return null;
    const id = typeof lane.id === 'string' && lane.id ? lane.id : `lane-${index}`;
    const group = typeof lane.group === 'string' && lane.group ? lane.group : id.split('/')[0];
    const base = {
      id, group, kind: lane.kind,
      label: typeof lane.label === 'string' && lane.label ? lane.label : id,
      groupLabel: typeof lane.groupLabel === 'string' && lane.groupLabel ? lane.groupLabel : null
    };
    if (lane.kind === 'pitched' || lane.kind === 'melody') {
      const notes = validNotes(lane.notes, lane.kind === 'pitched' ? lane.roles : null);
      if (!notes) return null;
      const contour = isObject(lane.contour) && Array.isArray(lane.contour.midi) && finite(lane.contour.hop) &&
        lane.contour.hop > 0 ? lane.contour : null;
      // The lane's lead lines (MODEL.md), kept only beside usable roles: [start, end] pairs in seconds.
      const leadLines = lane.kind === 'pitched' && notes.some(note => note.length > 4) && Array.isArray(lane.leadLines)
        ? lane.leadLines.filter(item => Array.isArray(item) && finite(item[0]) && finite(item[1]) && item[1] > item[0]).map(item => [item[0], item[1]]) : null;
      const instrument = lane.meta || {};
      const name = [instrument.instrumentName, lane.label, id].join(' ');
      const pluckedString = /pizz(?:icato)?\b|\bharp\b|orchestral_harp|拨奏|拨弦|竖琴/i.test(name) ||
        instrument.program === 45 || instrument.program === 46;
      const skyVoice = STRUCK_GROUPS.includes(group) || (SPINDLE_GROUPS.includes(group) && pluckedString)
        ? 'meteor' : group === 'winds' ? 'wind' : group === 'strings' || group === 'violin' ? 'bow' : 'line';
      return {...base, notes, contour, skyVoice, ...(leadLines && leadLines.length ? {leadLines} : {})};
    }
    if (lane.kind === 'texture') {
      const level = isObject(lane.level) && finite(lane.level.hop) && lane.level.hop > 0 && Array.isArray(lane.level.db) && lane.level.db.length
        ? lane.level : null;
      return level ? {...base, level: {hop: level.hop, db: level.db.map(value => (finite(value) ? value : -120))}} : null;
    }
    if (lane.kind === 'drums') {
      const rows = Array.isArray(lane.rows) ? lane.rows.map(String) : null;
      const hits = rows ? validHits(lane.hits, rows.length) : null;
      if (!hits) return null;
      return {...base, rows, hits};
    }
    return null;
  }

  function prepare(model) {
    if (!isObject(model)) throw fail('模型不是对象');
    const contract = /^xin\.score-view\/(\d+)/.exec(String(model.contract || ''));
    if (!contract) throw fail(`缺 contract，或者不是 ${CONTRACT}`);
    if (Number(contract[1]) !== 1) throw fail(`不认识的契约版本 ${model.contract}`);
    if (!isObject(model.track)) throw fail('缺 track');
    if (!isObject(model.audio)) throw fail('缺 audio');
    if (!Array.isArray(model.lanes)) throw fail('缺 lanes');

    const lanes = [], skipped = [], textures = [];
    const seen = new Set();
    model.lanes.forEach((lane, index) => {
      const prepared = prepareLane(lane, index);
      if (!prepared || seen.has(prepared.id)) {
        skipped.push(isObject(lane) && lane.id ? String(lane.id) : `lane-${index}`);
        return;
      }
      seen.add(prepared.id);
      if (prepared.kind === 'texture') textures.push(prepared);
      else lanes.push(prepared);
    });
    // Several stems without notes are one band: their loudness added as power, on the first one's frames.
    let texture = null;
    if (textures.length) {
      const first = textures[0], hop = first.level.hop, count = first.level.db.length;
      const db = new Float32Array(count);
      for (let k = 0; k < count; k++) {
        let power = 0;
        for (const item of textures) {
          const value = item.level.db[Math.min(item.level.db.length - 1, Math.floor(k * hop / item.level.hop))];
          power += Math.pow(10, value / 10);
        }
        db[k] = power > 0 ? 10 * Math.log10(power) : -120;
      }
      texture = {id: first.id, label: first.label, group: first.group, groupLabel: first.groupLabel, hop, db,
                 color: parseHex(GROUP_COLORS.other), members: textures.map(item => item.id)};
      Object.assign(texture, textureScale(db));
    }

    // One colour per group; timbre tracks of a group are shades of it.
    const groups = [...new Set(lanes.map(lane => lane.group))];
    const hue = new Map(groups.map((group, index) =>
      [group, GROUP_COLORS[group] || SPARE_COLORS[index % SPARE_COLORS.length]]));
    const inGroup = new Map();
    for (const lane of lanes) {
      const position = inGroup.get(lane.group) || 0;
      inGroup.set(lane.group, position + 1);
      lane.groupColor = parseHex(hue.get(lane.group));
      lane.color = mix(lane.groupColor, SHADES[position % SHADES.length]);
    }

    let duration = Number(model.track.duration);
    if (!finite(duration) || duration <= 0) {
      duration = 0;
      for (const lane of lanes) {
        for (const note of lane.notes || []) duration = Math.max(duration, note[0] + note[1]);
        for (const hit of lane.hits || []) duration = Math.max(duration, hit[0]);
      }
    }
    const text = value => (typeof value === 'string' ? value.trim() : '');
    const bars = isObject(model.bars) && Array.isArray(model.bars.beats) ? model.bars : null;

    // Chords: `[start, end, label, confidence]`, plus the tone names of every label the
    // model gives pitch classes for.
    const chords = validSpans(model.chords).map(row => [row[0], row[1], row[2], finite(row[3]) ? row[3] : null]);
    const named = isObject(model.chordTones) ? model.chordTones : {};
    const chordToneNames = new Map();
    for (const chord of chords) {
      if (!chordToneNames.has(chord[2])) chordToneNames.set(chord[2], toneNames(chord[2], named[chord[2]]));
    }
    // One beat of this song, for "shorter than a beat": the median gap of the beat grid.
    const gaps = bars ? bars.beats.filter(finite).map((time, index, all) => all[index + 1] - time)
      .filter(gap => gap > 0).sort((a, b) => a - b) : [];
    const beat = gaps.length ? gaps[gaps.length >> 1] : null;

    // Sections: `[start, end, name, source, kind]`. Sections of one kind share a hue; a
    // section whose source only clusters has a letter for a name and is `plain`.
    const kinds = [];
    let plainCount = 0;
    const sections = validSpans(model.sections).map(row => {
      const source = typeof row[3] === 'string' ? row[3] : '';
      const plain = !NAMED_SOURCES.includes(source);
      const kind = typeof row[4] === 'string' && row[4] ? row[4] : row[2];
      if (!kinds.includes(kind)) kinds.push(kind);
      return {start: row[0], end: Math.min(row[1], duration || row[1]), name: row[2], source, plain,
              ordinal: plain ? ++plainCount : 0,
              hue: parseHex(SECTION_BY_KIND[String(kind).trim().toLowerCase()] || SECTION_HUES[kinds.indexOf(kind) % SECTION_HUES.length])};
    }).filter(section => section.end > section.start);

    return {
      track: {title: text(model.track.title), artist: text(model.track.artist), album: text(model.track.album), duration},
      lanes, skipped, chords, chordToneNames, beat, sections,
      // Captions: `[start, end, text, source]`, one on screen at a time.
      // A fifth item makes the row a mark: `{object, word, at, preview, ...}` (MODEL.md).
      captions: validSpans(model.captions).map(row => ({start: row[0], end: row[1], text: row[2], source: row[3], cue: markOf(row[4], row[0], row[1])})),
      glow: glowOf(model.energy),
      skySourceLevels: model.levels,
      texture,
      swell: swellOf(model.energy),
      stretches: stretchesOf(model.levels, sections, duration),
      localLevels: model.levels,
      // Bar lines exist only on a grid that was judged steady (plan decision D4).
      downbeats: bars && bars.steady && Array.isArray(bars.downbeats) ? bars.downbeats.filter(finite).sort((a, b) => a - b) : [],
      // What the model carries beyond the lanes; DRAWN_LAYERS says which of it is drawn.
      has: {
        chords: chords.length > 0,
        chordTones: [...chordToneNames.values()].some(names => names.length > 0),
        sections: sections.length > 0,
        plainSections: sections.some(section => section.plain),
        bars: Boolean(bars && bars.steady && Array.isArray(bars.downbeats) && bars.downbeats.length > 0),
        beats: Boolean(bars && bars.beats.length > 0),
        captions: validSpans(model.captions).length > 0,
        energy: isObject(model.energy) && Array.isArray(model.energy.db) && model.energy.db.length > 0,
        levels: Boolean(stretchesOf(model.levels, sections, duration)),
        cover: isObject(model.cover) && typeof model.cover.src === 'string' && model.cover.src.length > 0,
        texture: Boolean(texture),
        roles: lanes.some(lane => Array.isArray(lane.notes) && lane.notes.some(note => note.length > 4)),
        contour: lanes.some(lane => lane.contour)
      }
    };
  }

  // --- what is on screen ---------------------------------------------------

  // The lanes as shown: hidden ones removed, timbre tracks merged per stem when asked,
  // notes simplified when asked. Rebuilt only when one of those three things changes.
  function buildDisplay(prepared, options) {
    const hidden = new Set(options.hidden);
    const display = [];
    const add = (id, label, kind, members, color) => {
      const visible = members.filter(lane => !hidden.has(lane.id));
      const entry = {id, label, kind, color, lit: mix(color, 0.55), group: members[0].group,
                     members: members.map(lane => lane.id),
                     visible: visible.length > 0, count: 0, shown: 0, removed: null};
      display.push(entry);
      if (options.balancedLanes) {
        entry.ink = balancedInk(color, .57);
        entry.litInk = balancedInk(entry.lit, .80);
      }
      if (kind === 'drums') {
        const lane = members[0];
        entry.count = entry.shown = lane.hits.length;
        const used = new Set(lane.hits.map(hit => hit[1]));
        const order = lane.rows.map((name, row) => ({name, row})).filter(item => used.has(item.row));
        order.sort((a, b) => {
          const ia = DRUM_DISPLAY.indexOf(a.name), ib = DRUM_DISPLAY.indexOf(b.name);
          return (ia < 0 ? DRUM_DISPLAY.length + a.row : ia) - (ib < 0 ? DRUM_DISPLAY.length + b.row : ib);
        });
        entry.rows = order;
        entry.rowIndex = new Map(order.map((item, index) => [item.row, index]));
        entry.rowNames = lane.rows.slice();
        const count = lane.hits.length;
        entry.hits = {count, time: new Float32Array(count), row: new Uint8Array(count), vel: new Uint8Array(count)};
        lane.hits.forEach((hit, i) => { entry.hits.time[i] = hit[0]; entry.hits.row[i] = hit[1]; entry.hits.vel[i] = hit[2]; });
        entry.hits.accent = drumAccents(entry.hits, entry.rowNames);
        entry.hits.kitGap = kitGaps(entry.hits, entry.rowNames);
        return;
      }
      let raw = visible.length === 1 ? visible[0].notes : [].concat(...visible.map(lane => lane.notes));
      if (visible.length > 1) raw = raw.slice().sort((a, b) => a[0] - b[0] || a[2] - b[2]);
      entry.count = raw.length;
      // The lane's height comes from the notes as transcribed, in both drawings, so that
      // switching between them changes the notes and nothing else moves.
      entry.range = pitchRange(raw);
      let notes = raw;
      if (options.simplify) {
        const simplified = simplifyNotes(raw, {struck: STRUCK_GROUPS.includes(entry.group)});
        notes = simplified.notes;
        entry.removed = simplified.stats;
      }
      entry.shown = notes.length;
      entry.set = noteSet(notes);
      if (options.weakNoteHints && entry.group === 'piano') entry.weak = weakPianoNotes(notes, prepared.localLevels);
      entry.strands = SPINDLE_GROUPS.includes(entry.group) ? strandsOf(entry.set) : null;
      // The shapes showRoles draws, made once here from the notes as shown: blocks, and links between lead notes.
      if (entry.set.role) Object.assign(entry, shapesOf(entry.set, [].concat(...visible.map(lane => lane.leadLines || []))));
      entry.contour = visible.length === 1 ? visible[0].contour : null;
    };

    if (!options.mergeTimbres) {
      for (const lane of prepared.lanes) add(lane.id, lane.label, lane.kind, [lane], lane.color);
    } else {
      const order = [], buckets = new Map();
      for (const lane of prepared.lanes) {
        // A melody lane and a drum lane are never folded into anything else.
        const key = lane.kind === 'pitched' ? `g:${lane.group}` : `l:${lane.id}`;
        if (!buckets.has(key)) { buckets.set(key, []); order.push(key); }
        buckets.get(key).push(lane);
      }
      for (const key of order) {
        const members = buckets.get(key);
        const single = members.length === 1;
        add(single ? members[0].id : members[0].group,
            single ? members[0].label : (members[0].groupLabel || members[0].group),
            members[0].kind, members, single ? members[0].color : members[0].groupColor);
      }
    }
    return display;
  }

  // Blocks and links of one lane (showRoles). `set.role`: 1 lead, 0 accompaniment, -1 not known.
  //   blocked  1 for an accompaniment note drawn inside a block (not drawn on its own)
  //   blocks   [{start, end, notes, segs: [t0, t1, low, high, ...], ticks: [t, low, high, ...]}] in time order;
  //            a stretch with no accompaniment note sounding (a gap up to ROLES.gap) keeps the outline before it
  //   links    [t0, pitch0, t1, pitch1, ...]: the end of a lead note to the start of the next lead note in the same line
  function shapesOf(set, lines) {
    const count = set.count, role = set.role;
    const blocked = new Uint8Array(count), blocks = [];
    let run = null;
    const close = () => {
      if (!run || run.notes.length < ROLES.blockMin) return;
      const cuts = [...new Set(run.notes.flatMap(i => [set.start[i], set.start[i] + set.dur[i]]))].sort((a, b) => a - b);
      const segs = [];
      let low = null, high = null;
      for (let k = 0; k + 1 < cuts.length; k++) {
        const t0 = cuts[k], t1 = cuts[k + 1];
        let lo = Infinity, hi = -Infinity;
        for (const i of run.notes) if (set.start[i] < t1 && set.start[i] + set.dur[i] > t0) { lo = Math.min(lo, set.pitch[i]); hi = Math.max(hi, set.pitch[i]); }
        if (lo !== Infinity) { low = lo; high = hi; }
        if (low === null) continue;
        const last = segs.length - 4;
        if (last >= 0 && segs[last + 1] === t0 && segs[last + 2] === low && segs[last + 3] === high) segs[last + 1] = t1;
        else segs.push(t0, t1, low, high);
      }
      const ticks = [];
      let previous = -Infinity;
      for (const i of run.notes) {
        const t = set.start[i];
        if (t - previous < 0.02) continue;
        previous = t;
        for (let k = 0; k < segs.length; k += 4) if (t >= segs[k] && t < segs[k + 1]) { ticks.push(t, segs[k + 2], segs[k + 3]); break; }
      }
      for (const i of run.notes) blocked[i] = 1;
      blocks.push({start: run.start, end: run.end, notes: run.notes.length, segs, ticks});
    };
    for (let i = 0; i < count; i++) {
      if (role[i] !== 0) continue;
      const start = set.start[i], end = start + set.dur[i];
      if (run && start <= run.end + ROLES.gap) { run.notes.push(i); run.end = Math.max(run.end, end); }
      else { close(); run = {start, end, notes: [i]}; }
    }
    close();
    const links = [];
    const lineOf = t => lines.findIndex(([a, b]) => t >= a - 0.001 && t <= b + 0.001);
    let previous = -1;
    for (let i = 0; i < count; i++) {
      if (role[i] !== 1) continue;
      if (previous >= 0) {
        const at = lineOf(set.start[previous]);
        if (at >= 0 && at === lineOf(set.start[i]) && set.start[i] > set.start[previous]) {
          links.push(Math.min(set.start[previous] + set.dur[previous], set.start[i]), set.pitch[previous], set.start[i], set.pitch[i]);
        }
      }
      previous = i;
    }
    let longest = 0;
    for (const block of blocks) longest = Math.max(longest, block.end - block.start);
    return {blocked, blocks, blockStarts: Float64Array.from(blocks.map(block => block.start)), longestBlock: longest, links};
  }

  // The string links (STRANDS) of a lane's notes: [from, to, ...] note indices, in order of where the bend starts;
  // `ends`: per note, 1 when a link comes in, 2 when one goes out.
  function strandsOf(set) {
    const {count, start, dur, pitch} = set;
    const ramp = k => Math.min(dur[k] * SPINDLE.share, SPINDLE.rampMax);
    // Whether a note other than i and j sounds anywhere in [from, to).
    const alone = (i, j, from, to) => {
      for (let k = lowerBound(start, count, from - set.maxDur); k < count && start[k] < to; k++) {
        if (k !== i && k !== j && start[k] + dur[k] > from) return false;
      }
      return true;
    };
    // A single line can hand over to one note only, and take over from one only: any second candidate would itself be
    // sounding across the bend. So every pair that passes is kept, one out and one in per note by construction.
    const kept = [];
    for (let i = 0; i < count; i++) {
      if (dur[i] < STRANDS.minDur - STRANDS.slack) continue;
      const end = start[i] + dur[i];
      for (let j = lowerBound(start, count, end - STRANDS.overlap - STRANDS.slack); j < count && start[j] <= end + STRANDS.gap + STRANDS.slack; j++) {
        const step = Math.abs(pitch[j] - pitch[i]);
        if (j === i || start[j] <= start[i] || step > STRANDS.step + STRANDS.slack || dur[j] < STRANDS.minDur - STRANDS.slack) continue;
        if (!alone(i, j, end - ramp(i), start[j] + ramp(j))) continue;
        kept.push([i, j]);
      }
    }
    const from = k => start[k] + dur[k] - ramp(k);
    kept.sort((a, b) => from(a[0]) - from(b[0]));
    const links = new Int32Array(kept.length * 2), at = new Float64Array(kept.length), ends = new Uint8Array(count);
    kept.forEach(([i, j], n) => { links[n * 2] = i; links[n * 2 + 1] = j; at[n] = from(i); ends[i] |= 2; ends[j] |= 1; });
    return {links, at, ends, span: SPINDLE.rampMax * 2 + STRANDS.gap};
  }

  function lowerBound(array, count, value) {
    let low = 0, high = count;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (array[middle] < value) low = middle + 1; else high = middle;
    }
    return low;
  }

  // --- the view ------------------------------------------------------------

  function create(canvas, model, clock, initial) {
    if (!canvas || typeof canvas.getContext !== 'function') throw fail('需要一个 canvas');
    const context = canvas.getContext('2d');
    if (!context) throw fail('拿不到 2D 画布');
    const host = typeof globalThis !== 'undefined' ? globalThis : {};

    let prepared = prepare(model);
    let options = {...DEFAULTS};
    let display = null, geometry = null, cover = null;
    // The lanes as shown, kept per combination of drawing, grouping and hidden lanes:
    // someone comparing two drawings flips between them many times, and only the first
    // flip should pay for joining and sorting several thousand notes.
    const built = new Map();
    let size = {width: 0, height: 0, ratio: 1};
    let guidesOnly=false;
    let materialIcons=null;
    let frame = null, last = {time: 0, lanes: 0, notes: 0, hits: 0, active: 0};
    // The effects of the frame being drawn (see effectsFor), or null while they are off.
    let frameFx = null;
    // The mark on screen in the frame being drawn ('mark' style only), or null.
    let frameMark = null;

    const readClock = () => {
      const value = typeof clock === 'function' ? clock() : clock && typeof clock.now === 'function' ? clock.now() : 0;
      return finite(value) ? value : 0;
    };

    function setOptions(patch) {
      if (!isObject(patch)) return getOptions();
      const next = {...options};
      if (finite(patch.windowSeconds) && patch.windowSeconds > 0) next.windowSeconds = clamp(patch.windowSeconds, 1, 120);
      if (finite(patch.playhead)) next.playhead = clamp(patch.playhead, 0.05, 0.95);
      if (typeof patch.simplify === 'boolean') next.simplify = patch.simplify;
      if (typeof patch.mergeTimbres === 'boolean') next.mergeTimbres = patch.mergeTimbres;
      if (finite(patch.offsetSeconds)) next.offsetSeconds = patch.offsetSeconds;
      if (Array.isArray(patch.hidden)) next.hidden = patch.hidden.map(String);
      if (Object.prototype.hasOwnProperty.call(CHORD_SMOOTHING, patch.chordSmoothing)) next.chordSmoothing = patch.chordSmoothing;
      if (PLAIN_SECTIONS.includes(patch.plainSections)) next.plainSections = patch.plainSections;
      if (typeof patch.showContour === 'boolean') next.showContour = patch.showContour;
      if (typeof patch.showCaptions === 'boolean') next.showCaptions = patch.showCaptions;
      if (typeof patch.quietText === 'boolean' && patch.quietText !== options.quietText) {
        next.quietText = patch.quietText;
        geometry = null;
      }
      if (typeof patch.albumLayout === 'boolean' && patch.albumLayout !== options.albumLayout) {
        next.albumLayout = patch.albumLayout;
        geometry = null;
      }
      if (finite(patch.albumSidebarGap)) next.albumSidebarGap = Math.max(0, patch.albumSidebarGap);
      if (patch.captionStyle === 'mark' || patch.captionStyle === 'sentence') next.captionStyle = patch.captionStyle;
      if (typeof patch.showBackdrop === 'boolean') next.showBackdrop = patch.showBackdrop;
      if (patch.backdrop === 'section' || patch.backdrop === 'cover') next.backdrop = patch.backdrop;
      if (patch.backdropLevel === 'loudness' || patch.backdropLevel === 'steady') next.backdropLevel = patch.backdropLevel;
      if (patch.laneHeights === 'fixed' || patch.laneHeights === 'loudness') next.laneHeights = patch.laneHeights;
      if (typeof patch.liveTextureRaster === 'boolean') next.liveTextureRaster = patch.liveTextureRaster;
      if (typeof patch.denseLaneLabels === 'boolean') next.denseLaneLabels = patch.denseLaneLabels;
      if (patch.laneLabels === 'icon' || patch.laneLabels === 'text') next.laneLabels = patch.laneLabels;
      if (patch.sectionStyle === 'line' || patch.sectionStyle === 'block') next.sectionStyle = patch.sectionStyle;
      if (patch.fxDynamics === 'song' || patch.fxDynamics === 'off') next.fxDynamics = patch.fxDynamics;
      if (typeof patch.showTexture === 'boolean') next.showTexture = patch.showTexture;
      if (patch.textureAt === 'below' || patch.textureAt === 'above') next.textureAt = patch.textureAt;
      if (typeof patch.showRoles === 'boolean') next.showRoles = patch.showRoles;
      if (typeof patch.showShapes === 'boolean') next.showShapes = patch.showShapes;
      if ('shapeSet' in patch) next.shapeSet = patch.shapeSet === 'spindle' ? 'spindle' : 'two';
      if (typeof patch.shapeLinks === 'boolean') next.shapeLinks = patch.shapeLinks;
      if (typeof patch.pitchWeight === 'boolean') next.pitchWeight = patch.pitchWeight;
      if (typeof patch.coverAdapt === 'boolean') next.coverAdapt = patch.coverAdapt;
      if (typeof patch.textureAdapt === 'boolean') next.textureAdapt = patch.textureAdapt;
      if (typeof patch.drumNotation === 'boolean') next.drumNotation = patch.drumNotation;
      if (finite(patch.shortHead) && patch.shortHead >= 0 && patch.shortHead <= 4) next.shortHead = patch.shortHead;
      if (typeof patch.meteorMotion === 'boolean') next.meteorMotion = patch.meteorMotion;
      if (typeof patch.nightSky === 'boolean') next.nightSky = patch.nightSky;
      if (finite(patch.mistFog) && patch.mistFog >= 0 && patch.mistFog <= .5) next.mistFog = patch.mistFog;
      if (finite(patch.paperPress) && patch.paperPress >= 0 && patch.paperPress <= 2) next.paperPress = patch.paperPress;
      if (finite(patch.pressTint) && patch.pressTint >= 0 && patch.pressTint <= .3) next.pressTint = patch.pressTint;
      if (finite(patch.radarFall) && patch.radarFall >= .2 && patch.radarFall <= 2) next.radarFall = patch.radarFall;
      if (finite(patch.radarEcho) && patch.radarEcho >= .25 && patch.radarEcho <= 1) next.radarEcho = patch.radarEcho;
      if (finite(patch.radarLead) && patch.radarLead >= 0 && patch.radarLead <= 1.5) next.radarLead = patch.radarLead;
      if (finite(patch.radarDepth) && patch.radarDepth >= 0 && patch.radarDepth <= 2) next.radarDepth = patch.radarDepth;
      if (patch.radarCorner === 'round' || patch.radarCorner === 'cut') next.radarCorner = patch.radarCorner;
      for (const key of ['radarJumpers', 'radarOvershoot', 'radarBloom', 'radarInk', 'radarNoise']) if (typeof patch[key] === 'boolean') next[key] = patch[key];
      if (['neon', 'cursor', 'backlight'].includes(patch.radarStep)) next.radarStep = patch.radarStep;
      if (['square', 'round'].includes(patch.radarCell)) next.radarCell = patch.radarCell;
      if (['dark', 'light'].includes(patch.radarWheel)) next.radarWheel = patch.radarWheel;
      if (['off', 'all', 'kick-snare'].includes(patch.terrainRoadside)) next.terrainRoadside = patch.terrainRoadside;
      if (finite(patch.starDim) && patch.starDim >= .05 && patch.starDim <= .9) next.starDim = patch.starDim;
      if (finite(patch.meteorTail) && patch.meteorTail >= .3 && patch.meteorTail <= 4) next.meteorTail = patch.meteorTail;
      Object.assign(next, transientTiming(patch));
      if (typeof patch.releaseFocus === 'boolean') next.releaseFocus = patch.releaseFocus;
      if (typeof patch.spacedLanes === 'boolean') next.spacedLanes = patch.spacedLanes;
      for (const key of ['softCover', 'attackWeight', 'weakNoteHints', 'balancedLanes']) {
        if (typeof patch[key] === 'boolean') next[key] = patch[key];
      }
      if (EFFECT_LEVELS.includes(patch.effects)) { next.effects = patch.effects; next.fxPreset = LEVEL_PRESET[patch.effects]; }
      // A preset given with a level wins. A preset that is no level reads as 'light' (on).
      if (Object.prototype.hasOwnProperty.call(FX_PRESETS, patch.fxPreset)) {
        next.fxPreset = patch.fxPreset;
        next.effects = PRESET_LEVEL[patch.fxPreset] || 'light';
      }
      for (const key of ['fxHit', 'fxAfterglow', 'fxPlayline', 'fxDrums']) if (typeof patch[key] === 'boolean') next[key] = patch[key];
      if ('focusGroup' in patch) next.focusGroup = typeof patch.focusGroup === 'string' && patch.focusGroup ? patch.focusGroup : null;
      if ('loop' in patch) {
        const span = patch.loop;
        next.loop = Array.isArray(span) && finite(span[0]) && finite(span[1]) && span[1] > span[0] ? [span[0], span[1]] : null;
      }
      if (next.showTexture !== options.showTexture || next.textureAt !== options.textureAt || next.spacedLanes !== options.spacedLanes) geometry = null;
      if (next.meteorMotion !== options.meteorMotion || next.drumNotation !== options.drumNotation || next.denseLaneLabels !== options.denseLaneLabels ||
          ((next.denseLaneLabels || options.denseLaneLabels) && next.laneLabels !== options.laneLabels)) geometry = null;
      const rebuild = next.simplify !== options.simplify || next.mergeTimbres !== options.mergeTimbres ||
        next.weakNoteHints !== options.weakNoteHints || next.balancedLanes !== options.balancedLanes ||
        next.hidden.join('\n') !== options.hidden.join('\n');
      options = next;
      if (options.softCover && cover && !cover.soft) prepareSoftCover();
      if (rebuild) { display = null; geometry = null; }
      return getOptions();
    }

    const getOptions = () => ({...options, hidden: options.hidden.slice()});

    // The picture for `backdrop: 'cover'`. The host loads it (the core never touches the
    // network or the DOM) and hands over anything `drawImage` takes; null takes it away.
    const groupOf = lane => lane.group || lane.id;

    // `measure` (optional): measureCover's result for this picture, for coverAdapt and textureAdapt; worked out here
    // once into the veil and the band's light (they never change frame to frame).
    function setCover(image, measure) {
      const wide = image && (image.naturalWidth || image.width), tall = image && (image.naturalHeight || image.height);
      // A host can reassign an Image's src or repaint the same mutable canvas between calls.
      // Reuse only an identifiable, unchanged image source on explicit resubmission.
      const source = image && (image.currentSrc || image.src);
      const reuse = source && cover && cover.image === image && cover.source === source &&
        cover.width === wide && cover.height === tall ? cover.soft : null;
      cover = finite(wide) && finite(tall) && wide > 0 && tall > 0 ? {image, width: wide, height: tall} : null;
      if (cover) cover.source = source;
      if (cover && measure && finite(measure.mean) && finite(measure.spread)) {
        cover.veil = measuredVeil(measure);
        cover.measure = {mean: measure.mean, spread: measure.spread};
      }
      if (cover && reuse) cover.soft = reuse;
      if (cover && options.softCover && !cover.soft) prepareSoftCover();
      return Boolean(cover);
    }

    function measuredVeil(measure) {
      const ground = lumaOf(BACKGROUND_RGB), most = COVER_FAINT + COVER_SWELL;
      const brightEnd = clamp(measure.mean + COVER_ADAPT.spread * measure.spread, 0, 1);
      const allowed = brightEnd > COVER_ADAPT.bright ? (COVER_ADAPT.bright - ground) / (brightEnd - ground) : Infinity;
      return round3(clamp(1 - allowed / most, COVER_ADAPT.low, COVER_ADAPT.high));
    }

    // One bounded raster per current picture. Clamp the image at its edges before the Gaussian
    // blur so that its perimeter never fades to transparent. Returning to a preset reuses it.
    // The cover's average colour, once per cover, for the night sky's tint (null where no canvas can read it).
    function coverAverage() {
      if (!cover) return null;
      if (cover.average !== undefined) return cover.average;
      cover.average = null;
      try {
        const sample = typeof host.OffscreenCanvas === 'function' ? new host.OffscreenCanvas(8, 8) : null;
        const reader = sample && sample.getContext('2d', {willReadFrequently: true});
        if (reader && reader.getImageData) {
          reader.drawImage(cover.image, 0, 0, 8, 8);
          const data = reader.getImageData(0, 0, 8, 8).data, sum = [0, 0, 0];
          for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) sum[c] += data[i + c];
          cover.average = sum.map(v => v / 64);
        }
      } catch (_) { cover.average = null; }
      return cover.average;
    }
    const nightSkyOn = () => options.nightSky && options.meteorMotion;
    function skyColour() {
      const average = coverAverage();
      if (!average) return NIGHT.sky.slice();
      // The cover's colour brought down to the sky's brightness: only its hue is taken.
      const level = lumaOf(NIGHT.sky) / Math.max(lumaOf(average), 1e-3);
      return NIGHT.sky.map((v, c) => Math.round(clamp(v + (average[c] * level - v) * NIGHT.tint, 0, 255)));
    }
    function prepareSoftCover() {
      const {image, width, height} = cover;
      const soft = cover.soft = {image, veil: COVER_VEIL};
      if (typeof host.OffscreenCanvas !== 'function') return;
      const scale = Math.min(1, 600 / Math.max(width, height));
      const w = Math.max(1, Math.round(width*scale)), h = Math.max(1, Math.round(height*scale));
      const sigma = Math.max(.5, Math.max(w,h)*.015), pad = Math.ceil(sigma*3);
      try {
        const sample = new host.OffscreenCanvas(64, 64);
        const reader = sample.getContext('2d', {willReadFrequently: true});
        reader.drawImage(image, 0, 0, 64, 64);
        const measure = measureCover(reader.getImageData(0, 0, 64, 64).data, 64, 64);
        if (measure) soft.veil = measuredVeil(measure);
      } catch (_) { /* An unreadable image can still be drawn and softened. */ }
      try {
        const padded = new host.OffscreenCanvas(w + 2*pad, h + 2*pad);
        const out = new host.OffscreenCanvas(w, h), src = padded.getContext('2d'), dest = out.getContext('2d');
        if (!src || !dest || !('filter' in dest)) return;
        const xs = [[0,1,0,pad], [0,width,pad,w], [width-1,1,pad+w,pad]];
        const ys = [[0,1,0,pad], [0,height,pad,h], [height-1,1,pad+h,pad]];
        for (const [x, sw, dx, dw] of xs) for (const [y, sh, dy, dh] of ys) {
          src.drawImage(image, x,y,sw,sh, dx,dy,dw,dh);
        }
        dest.filter = `blur(${sigma}px)`;
        dest.drawImage(padded, -pad, -pad);
        soft.image = out;
      } catch (_) { /* Unsupported image sources keep the original and use only the veil. */ }
    }
    // The band's light against this cover with this veil (textureAdapt), or the plain one: raised by how much cover
    // shows behind it (COVER_FAINT + COVER_SWELL, less the veil) times how much it stands off the ground and how busy it
    // is (its mean above the ground plus its standard deviation), `gain` to one; never above `high`.
    function textureLight(veil) {
      if (!cover || !cover.measure) return TEXTURE.alpha;
      const shows = (COVER_FAINT + COVER_SWELL) * (1 - veil);
      const clutter = Math.max(0, cover.measure.mean - lumaOf(BACKGROUND_RGB)) + cover.measure.spread;
      return round3(Math.min(TEXTURE_ADAPT.high, TEXTURE.alpha * (1 + TEXTURE_ADAPT.gain * shows * clutter)));
    }
    // The veil behind the lanes this frame: the cover's own with coverAdapt, else the fixed one.
    const veilOf = picture => (options.coverAdapt || options.softCover) && picture && finite(picture.veil) ? picture.veil
      : options.softCover && picture && picture.soft ? picture.soft.veil : COVER_VEIL;

    function setModel(next) {
      prepared = prepare(next);
      skyLevels.clear();
      built.clear();
      smoothed.clear();
      display = null; geometry = null;
    }

    // The chords as shown under one smoothing setting. 'beat' means one beat of this song;
    // a song with no beat grid has no such length, and the chords are then left as they are.
    const smoothed = new Map();
    function chordsFor(setting) {
      if (!smoothed.has(setting)) {
        const rule = CHORD_SMOOTHING[setting];
        const minimum = rule === 'beat' ? (prepared.beat || 0) : rule;
        smoothed.set(setting, smoothChords(prepared.chords, minimum));
      }
      return smoothed.get(setting);
    }

    // The last span in a time-ordered list that has started by `time` (its index), or -1.
    function startedBy(spans, time, startOf) {
      let low = 0, high = spans.length - 1, found = -1;
      while (low <= high) {
        const middle = (low + high) >> 1;
        if (startOf(spans[middle]) <= time) { found = middle; low = middle + 1; } else high = middle - 1;
      }
      return found;
    }

    function sectionAt(time) {
      const index = startedBy(prepared.sections, time, section => section.start);
      return index >= 0 && time < prepared.sections[index].end ? prepared.sections[index] : null;
    }

    // What a section is called on screen. A plain one (a cluster letter, no meaning) is shown
    // the way the host asked: its letter, its place in the song, or nothing.
    function sectionLabel(section) {
      if (!section.plain) return section.name;
      if (options.plainSections === 'hidden') return '';
      return options.plainSections === 'numbered' ? `第 ${section.ordinal} 段` : section.name;
    }

    function currentDisplay() {
      if (display) return display;
      const key = `${+options.simplify}${+options.mergeTimbres}${+options.weakNoteHints}${+options.balancedLanes}|${options.hidden.slice().sort().join('\n')}`;
      display = built.get(key);
      if (display) {
        built.delete(key);
      } else {
        display = buildDisplay(prepared, options);
        if (built.size >= 4) built.delete(built.keys().next().value);
      }
      built.set(key, display);
      return display;
    }

    function resize() {
      const ratio = clamp(finite(canvas.scoreRenderRatio) ? canvas.scoreRenderRatio : finite(host.devicePixelRatio) ? host.devicePixelRatio : 1, 1, 2.5);
      const width = canvas.clientWidth || canvas.width / ratio || 0;
      const height = canvas.clientHeight || canvas.height / ratio || 0;
      const pixelWidth = Math.max(1, Math.round(width * ratio)), pixelHeight = Math.max(1, Math.round(height * ratio));
      // The presentation renderer shares this canvas and can change its backing raster
      // while our CSS geometry is unchanged (notably when leaving native fullscreen).
      if (width === size.width && height === size.height && ratio === size.ratio &&
          canvas.width === pixelWidth && canvas.height === pixelHeight) return;
      size = {width, height, ratio};
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      geometry = null;
    }

    // The lanes stacked into their area. `factors` scales each lane's usual weight (its
    // pitch span); with none, every lane gets its usual share.
    // Every lane at least an icon tall plus ICON_PAD above and below; what the short lanes
    // gain, the lanes above that height give up in proportion to how much they have above it,
    // so the total stays the same. Where there is not room for all of them, nothing changes, except with a group shown
    // apart (0.22.0): then every lane is made at least as tall as the room allows, down to an ICON_MIN icon with no room
    // above or below (drawEdges draws all icons at the size of the shortest).
    function roomForIcons(heights, room, lanes) {
      const groups = lanes.map(lane => lane.group), split = new Set(groups).size < groups.length;
      let least = (size.width < 520 ? 11 : 13) * ICON_SCALE + ICON_PAD * 2;
      // (at most 0.6 of an even share, so the lanes keep most of their differences in height)
      if (split) least = Math.min(least, Math.max(ICON_MIN, 0.6 * room / heights.length));
      if (heights.length * least > room + 1e-9) return heights;
      const short = heights.reduce((sum, value) => sum + Math.max(0, least - value), 0);
      if (short <= 0) return heights;
      const spare = heights.reduce((sum, value) => sum + Math.max(0, value - least), 0);
      return heights.map(value => (value <= least ? least : value - short * (value - least) / spare));
    }

    // The lanes stacked into their area, and the texture band put in its place among them.
    function arrange(area, factors, texture) {
      const boxes = place(area, factors);
      if (!texture) return boxes;
      const last = boxes[boxes.length - 1];
      if (texture.at === 'above' && last && last.lane.kind === 'drums') {
        const shift = texture.height + TEXTURE.gap;
        texture.top = last.top;
        boxes[boxes.length - 1] = {...last, top: last.top + shift, bottom: last.bottom + shift};
      } else texture.top = (last ? last.bottom : area.bottom) + TEXTURE.gap;
      texture.bottom = texture.top + texture.height;
      return boxes;
    }

    // Reserve enough CSS pixels for seven kit voices and a narrow space for unclassified
    // percussion. The existing relative-height calculation distributes the remaining room.
    const drumMinimum = () => size.height < 450 ? 32 : 44;
    function reserveDrumHeight(heights, lanes, room) {
      const kits = lanes.filter(lane => lane.kind === 'drums').length;
      if (!kits) return heights;
      const other = lanes.length - kits;
      const floor = Math.min(drumMinimum(), (other ? room * 0.56 : room) / kits);
      const noteFloor = other ? Math.min(6, Math.max(0, (room - floor * kits) / other)) : 0;
      const floors = lanes.map(lane => lane.kind === 'drums' ? floor : noteFloor);
      const short = heights.reduce((total,h,i) => total + Math.max(0,floors[i] - h),0);
      if (!short) return heights;
      const spare = heights.reduce((total,h,i) => total + Math.max(0,h - floors[i]),0);
      return heights.map((h,i) => h <= floors[i] || spare <= short ? floors[i] : h - short * (h - floors[i]) / spare);
    }
    function place(area, factors, reserve = options.drumNotation || options.meteorMotion) {
      const {top, bottom, gap, lanes} = area;
      const room = Math.max(0, bottom - top - gap * (lanes.length - 1));
      const weights = lanes.map((lane, index) => {
        const factor = factors ? factors[index] : 1;
        if (lane.kind === 'drums') return Math.max(6, lane.rows.length * 2.4) * factor;
        const span = clamp(lane.range.high - lane.range.low + 1, 13, 30);
        return (lane.kind === 'melody' ? span * 1.35 : span) * factor;
      });
      const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
      let heights = weights.map(weight => room * weight / total);
      if (options.laneLabels === 'icon') heights = roomForIcons(heights, room, lanes);
      if (reserve) heights = reserveDrumHeight(heights, lanes, room);
      let y = top;
      return lanes.map((lane, index) => {
        const laneHeight = heights[index];
        const box = {lane, top: y, bottom: y + laneHeight, height: laneHeight};
        if (lane.kind === 'drums') {
          box.rowHeight = laneHeight / lane.rows.length;
        } else {
          // A sung lane keeps a strip at its top free for the note names over its highest notes.
          const headroom = lane.kind === 'melody' ? Math.min(13, laneHeight * 0.3) : 0;
          box.semitone = (laneHeight - headroom) / (lane.range.high - lane.range.low + 1);
          box.thickness = lane.kind === 'melody' ? clamp(box.semitone * 1.3, 3.5, 8) : clamp(box.semitone * 0.9, 2, 5);
        }
        y += laneHeight + gap;
        return box;
      });
    }

    // How much of its usual height each lane gets in one stretch of the song: its stem's
    // share of the loudness of the lanes on screen, where an equal share is 1. The square
    // root keeps a dominant stem from taking everything; a silent one keeps a thin strip.
    function sharesIn(stretch, lanes) {
      // Each stretch has a fixed set of powers. A new visible lane arrangement owns a fresh cache.
      const cache = options.drumNotation && geometry && (geometry.stretchShares || (geometry.stretchShares = new WeakMap()));
      if (cache && cache.has(stretch)) return cache.get(stretch);
      const power = lanes.map(lane => stretch.power[lane.group] || 0);
      const total = power.reduce((sum, value) => sum + value, 0);
      const shares = power.map(value => (total > 0 ? clamp(Math.sqrt(value / total * lanes.length), SHARE_FLOOR, SHARE_CEILING) : 1));
      if (cache) cache.set(stretch, shares);
      return shares;
    }

    // The same, at a moment: inside a stretch its own shares, and across a boundary a
    // glide from one stretch's to the next over BLEND seconds, so nothing jumps.
    function sharesAt(now, lanes) {
      const list = prepared.stretches;
      const index = clamp(startedBy(list, now, stretch => stretch.start), 0, list.length - 1);
      const here = sharesIn(list[index], lanes);
      const toNext = list[index].end - now, fromLast = now - list[index].start;
      let other = null, mixed = 0;
      if (toNext < BLEND / 2 && index + 1 < list.length) { other = sharesIn(list[index + 1], lanes); mixed = 0.5 - toNext / BLEND; }
      else if (fromLast < BLEND / 2 && index > 0) { other = sharesIn(list[index - 1], lanes); mixed = 0.5 - fromLast / BLEND; }
      if (!other) return here;
      return here.map((value, i) => value + (other[i] - value) * mixed);
    }

    // The wash behind everything: the colour of the section being played, brighter where
    // the song is louder. Around a section boundary the colour is the average over BLEND
    // seconds, so it turns slowly; between sections it fades toward nothing.
    // With `backdrop: 'cover'` and a picture, the cover fills the canvas (cropped, never
    // stretched), faded, under a lighter wash. It stays between sections; only the wash goes.
    function drawBackdrop(now, stats) {
      const picture = options.backdrop === 'cover' && !options.albumLayout ? cover : null;
      if (!options.showBackdrop || (!prepared.sections.length && !prepared.glow && !picture)) return;
      let red = 0, green = 0, blue = 0, present = 0;
      const samples = 5;
      for (let i = 0; i < samples; i++) {
        const section = sectionAt(now + BLEND * (i / (samples - 1) - 0.5));
        if (!section) continue;
        red += section.hue[0]; green += section.hue[1]; blue += section.hue[2]; present++;
      }
      // A song with a loudness envelope but no sections still breathes, in a neutral colour.
      const colour = present ? [Math.round(red / present), Math.round(green / present), Math.round(blue / present)] : [128, 146, 200];
      const weight = prepared.sections.length ? present / samples : 1;
      let level = 0.5;
      if (!options.meteorMotion && prepared.glow && options.backdropLevel !== 'steady') {
        const at = clamp(now / prepared.glow.hop, 0, prepared.glow.values.length - 1);
        const low = Math.floor(at), high = Math.min(prepared.glow.values.length - 1, low + 1);
        level = prepared.glow.values[low] + (prepared.glow.values[high] - prepared.glow.values[low]) * (at - low);
      }
      // With the jacket in the album panel the score shares the shell's dark ground.
      // Leave a hint of the existing section colour underneath the playing parts.
      const washLevel = options.albumLayout ? .10 : (picture ? COVER_WASH : 1);
      const strength = (0.12 + 0.3 * level) * weight * washLevel;
      const shown = picture ? COVER_FAINT + COVER_SWELL * level : 0;
      const held = veilOf(picture);
      stats.backdrop = {colour, level: Math.round(level * 1000) / 1000, strength: Math.round(strength * 1000) / 1000,
                        cover: Math.round(shown * 1000) / 1000, behindNotes: Math.round(shown * (1 - held) * 1000) / 1000};
      if (held !== COVER_VEIL) stats.backdrop.veil = held;
      if (picture) {
        const scale = Math.max(size.width / picture.width, size.height / picture.height);
        const wide = picture.width * scale, tall = picture.height * scale;
        context.globalAlpha = shown;
        context.drawImage(options.softCover && picture.soft ? picture.soft.image : picture.image,
                          (size.width - wide) / 2, (size.height - tall) / 2, wide, tall);
        context.globalAlpha = 1;
        const top = geometry.area.top, bottom = geometry.area.bottom;
        const from = Math.max(0, top - COVER_SOFT), to = Math.min(size.height, bottom + COVER_SOFT);
        if (bottom > top && to > from) {
          const upper = options.softCover ? held + (1 - held)*.10 : held;
          const lower = options.softCover ? held + (1 - held)*.24 : held;
          if (options.softCover) {
            stats.backdrop.laneVeil = [round3(upper), round3(lower)];
            stats.backdrop.behindNotes = round3(shown * (1 - (upper + lower)/2));
          }
          // The soft veil depends only on this layout and the current cover's brightness.
          let veil = options.softCover && geometry.veilBrightness === held && geometry.softVeil;
          if (!veil) {
            veil = context.createLinearGradient(0, from, 0, to);
            veil.addColorStop(0, rgba(BACKGROUND_RGB, 0));
            veil.addColorStop((top - from) / (to - from), rgba(BACKGROUND_RGB, upper));
            veil.addColorStop((bottom - from) / (to - from), rgba(BACKGROUND_RGB, lower));
            veil.addColorStop(1, rgba(BACKGROUND_RGB, 0));
            if (options.softCover) {
              geometry.softVeil = veil;
              geometry.veilBrightness = held;
            }
          }
          context.fillStyle = veil;
          context.fillRect(0, from, size.width, to - from);
        }
      }
      if (strength <= 0) return;
      const wash = context.createLinearGradient(0, 0, size.width, size.height);
      wash.addColorStop(0, rgba(colour, strength.toFixed(3)));
      wash.addColorStop(0.6, rgba(colour, (strength * 0.4).toFixed(3)));
      wash.addColorStop(1, rgba(colour, (strength * 0.12).toFixed(3)));
      context.fillStyle = wash;
      context.fillRect(0, 0, size.width, size.height);
    }

    // Where each visible lane sits. Height goes by how many semitones (or drum rows) a
    // lane spans, within limits, so a two-octave part is not squeezed into the same strip
    // as a bass that moves a fifth.
    function layout() {
      const {width, height} = size;
      const narrow = width < 520;
      const hasHeader = Boolean(prepared.track.title || prepared.track.album || prepared.track.artist);
      const header = options.albumLayout ? (prepared.has.sections || prepared.has.chords ? clamp(height * .08, 34, 50) : 8)
        : options.quietText ? (prepared.track.title || prepared.has.chords ? clamp(height * 0.07, 28, 38) : 8)
        : hasHeader ? clamp(height * 0.1, 30, 48) : 10;
      const side = narrow ? 10 : 16;
      // Under the header, a band for "where we are and what is sounding": the section name
      // on the left, the chord on the right. At the foot, the section bar. Each is there
      // only when the model has something to put in it.
      // A song with captions gets a taller band: a caption is a sentence, not a label.
      const band = options.quietText ? clamp(height * 0.075, 34, 52)
        : prepared.has.captions ? clamp(height * 0.21, 74, 124) : clamp(height * 0.17, 58, 104);
      const info = options.albumLayout ? {top: 0, bottom: header, left: side, right: width - side}
        : prepared.has.chords || prepared.has.sections || prepared.has.captions
        ? {top: header + 2, bottom: header + 2 + band, left: side, right: width - side} : null;
      const barHeight = clamp(height * 0.07, 22, 34);
      const bar = prepared.has.sections
        ? {top: height - 9 - barHeight, bottom: height - 9, left: side, right: width - side} : null;
      const lanes = display.filter(lane => lane.visible && (lane.kind === 'drums' ? lane.rows.length : true));
      const gap = lanes.length > 1 ? clamp(height * 0.022, 5, 14) : 0;
      // A ruler over the lanes: bar numbers where the song has a steady grid, seconds where it has not.
      const rulerTop = (info ? info.bottom : header) + 4;
      const ruler = lanes.length ? {top: rulerTop, bottom: rulerTop + 13} : null;
      const top = (ruler ? ruler.bottom : rulerTop) + 9, bottom = bar ? bar.top - 12 : height - 10;
      const area = {top, bottom, gap, lanes};
      // The texture band: half the least lane height, under all the lanes ('below') or above the
      // drums ('above'). Its room comes off the lanes' area; 'below' also keeps it out of the area
      // the kick's breath lights, so no effect touches it.
      const tall = Math.round(((narrow ? 11 : 13) * ICON_SCALE + ICON_PAD * 2) / 2);
      const texture = options.showTexture && prepared.texture && lanes.length && bottom - top > tall * 4
        ? {at: options.textureAt, height: tall} : null;
      const placeArea = texture ? {top, bottom: bottom - tall - TEXTURE.gap, gap, lanes} : area;
      if (options.spacedLanes && lanes.length > 1) {
        const share = (placeArea.bottom - top) / lanes.length;
        // Spacious scores can spare a larger margin. In split view the original fixed
        // gutters can use up the height of the notes themselves. Reserve a quarter
        // of each row (3–24 px) and keep the rest available for pitch.
        area.gap = placeArea.gap = clamp(share * 0.25, 3, 24);
      }
      // A short, purely melodic stack can otherwise spend every pixel between lanes.
      // Keep a real hit area for every visible track in the opt-in layout.
      if (options.denseLaneLabels && options.laneLabels === 'icon' && lanes.length > 1) {
        const free = placeArea.bottom - top;
        const minRow = Math.min(4, Math.max(0, free) / lanes.length);
        placeArea.gap = Math.max(0, Math.min(gap, (free - minRow * lanes.length) / (lanes.length - 1)));
      }
      if ((options.drumNotation || options.meteorMotion) && lanes.some(lane => lane.kind === 'drums') && lanes.length > 1) {
        const kits = lanes.filter(lane => lane.kind === 'drums').length;
        const needed = kits * drumMinimum() + (lanes.length - kits) * 8;
        const original = place(placeArea,null,false);
        const shortage = original.reduce((sum,box) => sum + (box.lane.kind === 'drums' ? Math.max(0,drumMinimum()-box.height) : 0),0);
        placeArea.gap = Math.max(1,Math.min(placeArea.gap-shortage/(lanes.length-1),(placeArea.bottom-top-needed)/(lanes.length-1)));
      }
      const placed = arrange(placeArea, null, texture);
      return {
        width, height, narrow, header, info, bar, ruler, side, area: texture && texture.at === 'below' ? placeArea : area, placeArea, texture, lanes: placed,
        top: placed.length ? placed[0].top : top, bottom: placed.length ? placed[placed.length - 1].bottom : bottom,
        labelFont: narrow ? 11 : 13, gutter: narrow ? 58 : 84
      };
    }

    const pitchY = (box, pitch) =>
      box.bottom - (clamp(pitch, box.lane.range.low, box.lane.range.high) - box.lane.range.low + 0.5) * box.semitone;

    const contourY = (box, pitch) => box.bottom - (pitch - box.lane.range.low + .5) * box.semitone;

    // Path2D collects the same CSS-space coordinates without a canvas-state transition per vertex.
    // The immediate path remains available to Canvas implementations without Path2D and other modes.
    function beginGeometry() {
      if (options.drumNotation && typeof host.Path2D === 'function') return new host.Path2D();
      context.beginPath();
      return context;
    }
    function fillGeometry(path) {
      if (path === context) context.fill();
      else context.fill(path);
    }

    function fillBars(rects, style, radius) {
      if (!rects.length) return;
      context.fillStyle = style;
      context.beginPath();
      const round = radius > 0 && typeof context.roundRect === 'function';
      for (let i = 0; i < rects.length; i += 4) {
        if (round) context.roundRect(rects[i], rects[i + 1], rects[i + 2], rects[i + 3], radius);
        else context.rect(rects[i], rects[i + 1], rects[i + 2], rects[i + 3]);
      }
      context.fill();
    }

    // The struck shape (SHAPES) for a bucket of note rectangles [x, y, width, thickness, ...]: one path, one fill.
    // Each note is a head block at its onset and a body from the full thickness down to the tail, on the note's
    // centre line. A note shorter than its head is just the head.
    // How wide a drum dot is on this screen (drawDrums: half a drum row, 2 to 4 pixels tall, 1.6 times as wide); with no
    // drum lane on screen, the widest a dot can be.
    function drumDotWidth() {
      // The release and attack envelopes may draw several individual note heads from one lane.
      // Their cap uses the same drum-row width until a fresh arrangement replaces the boxes.
      const reuse = options.releaseFocus || options.attackWeight;
      if (reuse && geometry.dotLanes === geometry.lanes) return geometry.dotWidth;
      const drums = geometry.lanes.find(item => item.lane.kind === 'drums');
      const width = 1.6 * (drums ? clamp(drums.rowHeight * 0.5, 2, 4) : 4);
      if (reuse) {
        geometry.dotLanes = geometry.lanes;
        geometry.dotWidth = width;
      }
      return width;
    }

    function fillShapes(rects, style, shape, box, pps) {
      if (!rects.length) return;
      const dot = drumDotWidth();
      context.fillStyle = style;
      const shapePath = beginGeometry();
      for (let i = 0; i < rects.length; i += 4) {
        const x = rects[i], width = rects[i + 2], base = rects[i + 3], centre = rects[i + 1] + base / 2;
        const full = shape === 'bass' && !options.pitchWeight ? Math.min(base * SHAPES.bass, base + box.semitone * SHAPES.bassCap) : base;
        const head = Math.max(full + SHAPES.headOver, Math.min(full * SHAPES.head, full + box.semitone * SHAPES.headCap, dot));
        const tail = Math.max(SHAPES.tailMin, full * SHAPES.tail);
        shapePath.rect(x, centre - head / 2, head, head);
        if (width <= head) continue;
        const reach = Math.min(width, SHAPES.taper * pps);
        shapePath.moveTo(x, centre - full / 2);
        shapePath.lineTo(x + reach, centre - tail / 2);
        shapePath.lineTo(x + width, centre - tail / 2);
        shapePath.lineTo(x + width, centre + tail / 2);
        shapePath.lineTo(x + reach, centre + tail / 2);
        shapePath.lineTo(x, centre + full / 2);
        shapePath.closePath();
      }
      fillGeometry(shapePath);
    }

    // One layer of spindles (SPINDLE) for a bucket of note rectangles [x, y, width, thickness, ...]: one path, one
    // fill. `layer`: 'halo' (the wide faint outline) or 'core' (the thin line on the centre).
    // `ends` (with links on): per note, 1 when a link comes in (the core starts square where it is full), 2 when one
    // goes out (the core stops square where it would start to taper); the link draws the rest.
    function fillSpindles(rects, style, layer, pps, ends) {
      if (!rects.length) return;
      context.fillStyle = style;
      const shapePath = beginGeometry();
      for (let i = 0; i < rects.length; i += 4) {
        const x = rects[i], width = rects[i + 2], base = rects[i + 3], centre = rects[i + 1] + base / 2;
        const full = layer === 'halo' ? base * SPINDLE.swell : Math.min(base, Math.max(SPINDLE.coreMin, base * SPINDLE.core));
        const tip = Math.min(full, Math.max(layer === 'halo' ? SPINDLE.tipMin : SPINDLE.coreTipMin, full * SPINDLE.tip));
        const ramp = Math.min(width * SPINDLE.share, SPINDLE.rampMax * pps), end = x + width;
        const top = centre - full / 2, bottom = centre + full / 2;
        const joined = layer === 'core' && ends ? ends[i / 4] : 0;
        if (joined) {
          if (joined & 1) shapePath.moveTo(x + ramp, top);
          else { shapePath.moveTo(x, centre - tip / 2); shapePath.quadraticCurveTo(x + ramp / 2, top, x + ramp, top); }
          shapePath.lineTo(end - ramp, top);
          if (joined & 2) shapePath.lineTo(end - ramp, bottom);
          else {
            shapePath.quadraticCurveTo(end - ramp / 2, top, end, centre - tip / 2);
            shapePath.lineTo(end, centre + tip / 2);
            shapePath.quadraticCurveTo(end - ramp / 2, bottom, end - ramp, bottom);
          }
          shapePath.lineTo(x + ramp, bottom);
          if (!(joined & 1)) shapePath.quadraticCurveTo(x + ramp / 2, bottom, x, centre + tip / 2);
          shapePath.closePath();
          continue;
        }
        shapePath.moveTo(x, centre - tip / 2);
        shapePath.quadraticCurveTo(x + ramp / 2, top, x + ramp, top);
        shapePath.lineTo(end - ramp, top);
        shapePath.quadraticCurveTo(end - ramp / 2, top, end, centre - tip / 2);
        shapePath.lineTo(end, centre + tip / 2);
        shapePath.quadraticCurveTo(end - ramp / 2, bottom, end - ramp, bottom);
        shapePath.lineTo(x + ramp, bottom);
        shapePath.quadraticCurveTo(x + ramp / 2, bottom, x, centre + tip / 2);
        shapePath.closePath();
      }
      fillGeometry(shapePath);
    }

    // Past notes are bright, notes still to come are dim, and a note lying across the play
    // line is lit. `pps` is pixels per second, `line` the x of the play line.
    // A lane owns its precise clip geometry. Static stretches reuse the same boxes.
    // Canvas implementations without Path2D take the original immediate path.
    function clipContents(box) {
      context.save();
      if (typeof host.Path2D === 'function') {
        if (!box.contentClip) {
          box.contentClip = new host.Path2D();
          box.contentClip.rect(0, box.top, size.width, box.height);
        }
        context.clip(box.contentClip);
      } else {
        context.beginPath();
        context.rect(0, box.top, size.width, box.height);
        context.clip();
      }
    }

    // A clip wholly outside the painted pixels has no visible effect. Use the largest
    // note head or spindle halo plus a two-CSS-pixel antialias margin. All other layers,
    // labels and onset shadows retain the clip, with the original row boundary.
    function notesReachClip(rects, stride, box) {
      for (let i = 0; i < rects.length; i += stride) {
        const base = rects[i + 3], middle = rects[i + 1] + base / 2;
        const radius = Math.max(base * SPINDLE.swell / 2, (base * SHAPES.bass * SHAPES.head + SHAPES.headOver) / 2) + 2;
        if (middle - radius <= box.top || middle + radius >= box.bottom ||
            (stride === 6 && rects[i + 4] < 0.14)) return true;
      }
      return false;
    }

    // The soft meteor study: real onsets, track colour and velocity. The trajectory uses only
    // the song clock, so a pause, seek, or mid-note toggle reconstructs the same state.
    let meteorBrushes;
    function meteorBrush(lane) {
      if (!meteorBrushes) meteorBrushes = new WeakMap();
      if (meteorBrushes.has(lane)) return meteorBrushes.get(lane);
      const color = lane.color;
      // Unit gradients are transformed to the exact trajectory, size and orientation at paint time.
      const wake = context.createLinearGradient(0, 0, 1, 0);
      wake.addColorStop(0, rgba(mix(color, .55), 1));
      wake.addColorStop(.18, rgba(mix(color, .16), .95));
      wake.addColorStop(.58, rgba(color, .65));
      wake.addColorStop(1, rgba(color, 0));
      const halo = context.createRadialGradient(0, 0, 0, 0, 0, 1);
      halo.addColorStop(0, rgba(mix(color, .35), .9));
      halo.addColorStop(.27, rgba(color, .55));
      halo.addColorStop(.65, rgba(color, .12));
      halo.addColorStop(1, rgba(color, 0));
      // Keep a little of the instrument hue in the bright head, including at a
      // simultaneous crossing where the larger, softer halos can overlap.
      const brush = {wake, halo, core:rgba(mix(color, lane.group==='guitar'?.64:lane.group==='piano'?.72:.90), 1)};
      meteorBrushes.set(lane, brush);
      return brush;
    }

    const skyPartsCache = new WeakMap();
    const skyLevels = new Map();
    const historyBrushes = new WeakMap();
    const historyAlpha = [0, .44, .75, .94, 1];
    let history = null;

    // The album panel sits just outside the canvas. In a full-width view the canvas
    // edge itself is the reference. All sounding marks share this spatial envelope.
    function historyFor(line, pps) {
      const gap = options.albumLayout ? options.albumSidebarGap || 0 : 0;
      const span = Math.min(line, .60 * (line + gap));
      return {left:line-span, line, span, seconds:span/pps};
    }

    function lightAt(x) {
      const step = clamp((x-history.left)/Math.max(history.span,1e-9),0,1) * (historyAlpha.length-1);
      const i = Math.floor(step), j = Math.min(i+1,historyAlpha.length-1);
      return historyAlpha[i] + (historyAlpha[j]-historyAlpha[i]) * (step-i);
    }

    // The needle writes fresh light at its right edge. Every point to the left has a
    // known age in song seconds, including when paused, seeking or exporting a frame.
    function historyBrush(lane) {
      const {left, line} = history, previous = historyBrushes.get(lane);
      if (previous && previous.left === left && previous.line === line && previous.ratio === size.ratio) return previous;
      function fade(color) {
        const ink = context.createLinearGradient(left, 0, line, 0);
        historyAlpha.forEach((alpha,i) => ink.addColorStop(i/(historyAlpha.length-1), rgba(color,alpha)));
        return ink;
      }
      const brush = {left, line, ratio:size.ratio, color:fade(lane.color), lit:fade(lane.lit), preview:mix(lane.color,.10)};
      historyBrushes.set(lane, brush);
      return brush;
    }

    // A measured, monophonic contour can run across several simultaneous MIDI
    // notes. Draw it once in each sounding interval, with a gap at every real rest.
    function soundingSpans(set) {
      const spans = [];
      for (let i=0; i<set.count; i++) {
        const start = set.start[i], end = start + set.dur[i], last = spans[spans.length-1];
        if (last && start <= last[1]) last[1] = Math.max(last[1], end);
        else spans.push([start, end]);
      }
      return spans;
    }

    function heldIntervals(set) {
      const last=new Map(), spans=[];
      let overlap=false;
      for(let i=0;i<set.count;i++) {
        const start=set.start[i],end=start+set.dur[i],pitch=set.pitch[i],prior=last.get(pitch);
        if(prior && start<prior[0]+prior[1]) {
          prior[1]=Math.max(prior[0]+prior[1],end)-prior[0];
          overlap=true;
        } else {
          const row=[start,end-start,pitch,100];last.set(pitch,row);spans.push(row);
        }
      }
      return overlap ? noteSet(spans) : set;
    }

    function skyParts(lane) {
      if (skyPartsCache.has(lane)) return skyPartsCache.get(lane);
      const members = prepared.lanes.filter(item => lane.members.includes(item.id) && !options.hidden.includes(item.id));
      const groups=new Map();
      for(const item of members) {
        // A recorded contour belongs to its own timbre. Compatible timbres in a
        // merged lane can share the same light without painting their unisons twice.
        const key=item.contour ? item : item.skyVoice;
        if(!groups.has(key))groups.set(key,[]);
        groups.get(key).push(item);
      }
      const parts = Array.from(groups.values(),items => {
        const item=items[0], pluckedInBowLane = item.skyVoice === 'meteor' && !STRUCK_GROUPS.includes(lane.group);
        let set = lane.set;
        if (groups.size > 1 || (pluckedInBowLane && options.simplify)) {
          const raw=items.length===1 ? item.notes : items.flatMap(v=>v.notes).sort((a,b)=>a[0]-b[0]||a[2]-b[2]);
          set = noteSet(options.simplify ? simplifyNotes(raw, {struck:item.skyVoice === 'meteor'}).notes : raw);
        }
        const held=item.skyVoice==='wind'||item.skyVoice==='bow';
        let bends=null;
        if(item.contour && item.skyVoice==='meteor') {
          bends=new Uint8Array(set.count);
          let previousEnd=-Infinity;
          for(let i=0;i<set.count;i++) {
            const start=set.start[i],end=start+set.dur[i];
            bends[i]=previousEnd<=start+1e-5 && (i+1===set.count || set.start[i+1]>=end-1e-5);
            previousEnd=Math.max(previousEnd,end);
          }
        }
        const contourSpans = held && item.contour && set.count ? soundingSpans(set) : null;
        return {voice:item.skyVoice, set, contour:item.contour, contourSpans, bends, glow:held ? heldIntervals(set) : null};
      });
      skyPartsCache.set(lane, parts);
      return parts;
    }

    // Only stem loudness is available across a held note. All its simultaneous notes share
    // the same halo; their attacks retain their own velocities. Missing frames are neutral.
    function skyLevelFor(group) {
      if (skyLevels.has(group)) return skyLevels.get(group);
      const levels = prepared.skySourceLevels;
      const db = levels && levels.groups && (levels.groups[group] || (group === 'violin' && levels.groups.strings));
      let curve = null;
      if (Array.isArray(db) && db.length > 1 && finite(levels.hop) && levels.hop > 0) {
        const scale = textureScale(db);
        if (scale.low !== null && scale.range > 0) {
          const values = scale.amount;
          for (let i = 0; i < db.length; i++) if (!finite(db[i])) values[i] = .5;
          curve = {hop:levels.hop, values};
        }
      }
      skyLevels.set(group, curve);
      return curve;
    }

    function skyAmount(curve, time) {
      if (!curve || time < 0 || time > (curve.values.length - 1) * curve.hop) return .5;
      const at = time / curve.hop, i = Math.floor(at), next = Math.min(curve.values.length - 1, i + 1);
      return curve.values[i] + (curve.values[next] - curve.values[i]) * (at - i);
    }

    function recordedPitchAt(contour,time) {
      const at=(time-(finite(contour.start)?contour.start:0))/contour.hop;
      if(at<0 || at>contour.midi.length-1) return null;
      const i=Math.floor(at),a=contour.midi[i],b=contour.midi[Math.ceil(at)];
      return finite(a) && finite(b) ? a+(b-a)*(at-i) : null;
    }

    // One repeatable direction per attack, across pitches and split/merged timbres.
    // Group from the original song attacks so hiding a lane or seeking cannot reroll a strum.
    let directionModel, directionGroups;
    function directionAt(group, start) {
      if (directionModel!==prepared) {directionModel=prepared; directionGroups=new Map();}
      if (!directionGroups.has(group)) {
        const times=[];
        for (const lane of prepared.lanes) {
          if (lane.group===group && lane.skyVoice==='meteor') {
            for (const note of lane.notes) times.push(Math.round(Math.fround(note[0])*1000));
          }
        }
        times.sort((a,b)=>a-b);
        const seedText=[prepared.track.artist,prepared.track.album,prepared.track.title,group].join('|');
        let seed=2166136261;
        for (let i=0;i<seedText.length;i++) seed=Math.imul(seed^seedText.charCodeAt(i),16777619);
        const starts=[], factors=[];
        for (const ms of times) {
          if (starts.length && ms-starts[starts.length-1]<=30) continue;
          let h=Math.imul(ms^seed,0x85ebca6b);
          h=Math.imul(h ^ (h>>>13),0xc2b2ae35);
          starts.push(ms);factors.push(((h ^ (h>>>16))>>>0)/0xffffffff*2-1);
        }
        directionGroups.set(group,{starts,factors});
      }
      const {starts,factors}=directionGroups.get(group);
      const ms=Math.round(Math.fround(start)*1000);
      return factors[lowerBound(starts,starts.length,ms+1)-1] || 0;
    }

    function drawFlight(box, part, index, now, line, pps, brush, ink) {
      const set = part.set, start = set.start[index], end = start + set.dur[index];
      const age = Math.max(0, now - start), release = Math.max(0, now - end);
      const lifetime = nightSkyOn() ? options.meteorTail : options.pluckReleaseSeconds;
      if (release >= history.seconds || (lifetime > 0 && release >= lifetime-1e-9)) return false;
      const afterRelease = lifetime > 0 ? transientLight(release,lifetime) : 1;
      const velocity = set.vel[index] / 127, lane = box.lane;
      const crowded = lowerBound(set.start,set.count,start+.15) - lowerBound(set.start,set.count,start-.15);
      const exposure = 1 / Math.sqrt(1 + .13 * Math.max(0,crowded-3));
      const packed = geometry.lanes.length >= 12;
      const base = pitchY(box,set.pitch[index]);
      const drop = Math.max(0,Math.min(box.semitone*.40,box.height*.13,box.bottom-base-.3,packed?2.5:5));
      const bends=options.showContour && part.bends && part.bends[index];
      const yAt = a => {
        const pitch=bends ? recordedPitchAt(part.contour,now-a) : null;
        return (pitch===null?base:pitchY(box,pitch)) + drop * (a*a / (.58 + a*a));
      };
      const headX = line - age * pps, tailX = line - release * pps;
      const headY = yAt(age), tailY = yAt(release);
      const bass = lane.group === 'bass' ? 1.22 : 1;
      const scale = clamp(size.width/1000,.78,1.18) * (packed ? .84 : 1) * bass;
      const thickness = scale * (.71+.37*velocity);
      if (age > release) {
        const headAge = Math.min(age,history.seconds);
        const sx = line-headAge*pps;
        context.beginPath();
        context.moveTo(sx,yAt(headAge));
        if(bends) {
          const step=Math.max(part.contour.hop,2/pps);
          for(let t=now-headAge+step;t<now-release;t+=step) context.lineTo(line+(t-now)*pps,yAt(now-t));
          context.lineTo(tailX,tailY);
        } else {
          const midAge=(headAge+release)*.5;
          context.quadraticCurveTo((sx+tailX)*.5,2*yAt(midAge)-(yAt(headAge)+tailY)*.5,tailX,tailY);
        }
        context.strokeStyle=ink.color;
        context.globalAlpha=.57*(.72+.28*exposure)*afterRelease;
        context.lineWidth=Math.max(.8,thickness);
        context.stroke();
      }
      if (headX <= history.left) {context.globalAlpha=1; return true;}
      // The brighter wake is short. The fine note body above continues all the way to the needle.
      const wakeAge = Math.max(release,age-(.15+.15*velocity)*exposure);
      const dx=(age-wakeAge)*pps;
      let dy=yAt(wakeAge)-headY;
      if (dx>0 && options.meteorDirectionDegrees>0 && (lane.group!=='bass' || options.meteorBassDirection)) {
        const degrees=directionAt(lane.group,start)*options.meteorDirectionDegrees*(lane.group==='bass' ? 1/3 : 1);
        const cap=Math.min(4,box.semitone*.5);
        const drift=clamp(dx*Math.tan(degrees*Math.PI/180),-cap,cap);
        dy+=clamp(drift,Math.min(0,box.top+.25-headY-dy),Math.max(0,box.bottom-.25-headY-dy));
      }
      const span=Math.hypot(dx,dy);
      const ratio=size.ratio;
      const attack=lifetime > 0 ? .40+.60*Math.exp(-age/.26) : .82+.18*Math.exp(-age*2);
      const mix=options.fxDynamics==='song'?.78+.44*swellAt(start):1;
      const strength=lightAt(headX)*(.54+.46*velocity)*exposure*attack*afterRelease*mix;
      if (span>.4) {
        context.setTransform(dx*ratio,dy*ratio,-dy/span*ratio,dx/span*ratio,headX*ratio,headY*ratio);
        context.globalAlpha=strength;context.fillStyle=brush.wake;
        context.beginPath();context.moveTo(0,-1.35*thickness);context.quadraticCurveTo(.48,-.83*thickness,1,0);
        context.quadraticCurveTo(.48,.83*thickness,0,1.35*thickness);context.closePath();context.fill();
      }
      const radius=(packed?5.2:7.6)*thickness;
      context.setTransform(radius*ratio,0,0,radius*.76*ratio,headX*ratio,headY*ratio);
      context.fillStyle=brush.halo;context.globalAlpha=strength*.74;context.fillRect(-1,-1,2,2);
      context.setTransform(ratio,0,0,ratio,0,0);
      context.fillStyle=brush.core;context.globalAlpha=strength;
      const guitar=lane.group==='guitar',piano=lane.group==='piano';
      // Direction controls the wake only; the attack face stays on its true
      // time/pitch axes even when the tail takes a slanted trajectory.
      context.beginPath();context.ellipse(headX,headY,(guitar?2.38:piano?1.68:2.25)*thickness,
        (guitar?.87:piano?1.34:1.19)*thickness,0,0,Math.PI*2);
      if(guitar){
        // A small drawn tip, rather than another halo, reads as a pluck.
        // Fill its union with the ellipse once so the tip cannot darken itself.
        context.moveTo(headX-3.2*thickness,headY);
        context.lineTo(headX-.8*thickness,headY-.83*thickness);
        context.lineTo(headX-.8*thickness,headY+.83*thickness);context.closePath();
      }else if(piano){
        // A blunt leading face gives the shorter piano head a struck edge.
        context.rect(headX-1.72*thickness,headY-1.05*thickness,.78*thickness,2.1*thickness);
      }
      context.fill();
      context.globalAlpha=1;
      return true;
    }

    function drawSkyHeld(box, part, i, from, to, now, line, pps, curve, ink, glowOnly=false) {
      const set=glowOnly ? part.glow : part.set, lane=box.lane, wind=part.voice==='wind', held=wind || part.voice==='bow';
      const y=pitchY(box,set.pitch[i]), velocity=set.vel[i]/127;
      const levelAt=time=>options.fxDynamics==='song'?.65*skyAmount(curve,time)+.35*swellAt(time):skyAmount(curve,time);
      const x0=line+(from-now)*pps, x1=line+(to-now)*pps;
      if (x1<=x0) return;
      const unit=Math.max(.36,Math.min(1.08,box.semitone*.45));
      const stride=held && curve ? curve.hop*Math.max(1,Math.ceil(4/(pps*curve.hop))) : 0;
      const firstSample=stride ? Math.floor(from/stride)+1 : 0;
      const count=stride ? 1+Math.max(0,Math.ceil(to/stride)-firstSample) : 1;
      const sampleAt=n=>n===0 ? from : n===count ? to : (firstSample+n-1)*stride;
      const edge=amount=> wind ? (.80+2.85*amount)*unit : (.62+1.46*amount)*unit;
      // A ribbon records each sample at its original horizontal position. It does not resize
      // the whole note when the current frame is louder. The sharp core stays on pitch.
      if (held && (glowOnly || part.glow===part.set)) {
        const shape = (factor,alpha) => {
          context.beginPath();
          for (let n=0;n<=count;n++) {
            const t=sampleAt(n), x=line+(t-now)*pps;
            const top=y-edge(levelAt(t))*factor;
            if(n) context.lineTo(x,top); else context.moveTo(x,top);
          }
          for (let n=count;n>=0;n--) {
            const t=sampleAt(n);
            context.lineTo(line+(t-now)*pps,y+edge(levelAt(t))*factor);
          }
          context.closePath();context.fillStyle=ink.color;context.globalAlpha=alpha;context.fill();
        };
        shape(wind ? 1.21 : 1.0,wind ? .15 : .18);
        shape(wind ? .65 : .56,wind ? .32 : .44);
        context.globalAlpha=1;
        if(to===now && set.start[i]+set.dur[i]>now) {
          const energy=levelAt(now),reach=Math.min(x1-x0,(wind?9:6)*unit*(.55+.7*energy));
          context.fillStyle=rgba(lane.lit,.21+.16*energy);
          context.beginPath();context.moveTo(x1-reach,y);
          context.lineTo(x1,y-edge(energy)*.40);context.lineTo(x1,y+edge(energy)*.40);
          context.closePath();context.fill();
        }
      }
      if(glowOnly)return;
      context.beginPath();context.moveTo(x0,y);context.lineTo(x1,y);
      context.lineWidth=Math.max(.80,(held?1.12:1.03)*unit*(.85+.3*velocity));
      context.strokeStyle=ink.lit;context.globalAlpha=held ? .82 : part.contour ? .36 : .78;
      context.stroke();context.globalAlpha=1;
    }

    function drawSkyPitched(box, now, line, pps, stats) { if(guidesOnly)return;
      const lane=box.lane, left=now-line/pps, right=now+(size.width-line)/pps;
      context.save();context.beginPath();context.rect(history.left,box.top,size.width-history.left,box.height);context.clip();
      context.lineCap='butt';context.lineJoin='round';context.globalAlpha=1;
      const parts=skyParts(lane);
      const ink=historyBrush(lane), pastStart=now-history.seconds;
      for (const part of parts) {
        const {set,voice}=part, meteor=voice==='meteor';
        const first=lowerBound(set.start,set.count,left-set.maxDur);
        const stop=lowerBound(set.start,set.count,right);
        // Forecast starts at the greater of onset and now, including the unsounded
        // remainder of a note whose attack has already crossed.
        // A night sky draws only a faint thread for the length; the star is the point at the onset below.
        context.strokeStyle=rgba(ink.preview,nightSkyOn() ? options.starDim*.42 : .56);context.lineWidth=Math.max(.81,Math.min(1.25,box.semitone*.40));
        context.beginPath();
        for(let i=first;i<stop;i++) {
          const t=set.start[i], end=t+set.dur[i];
          if(end<=now) continue;
          const y=pitchY(box,set.pitch[i]);
          context.moveTo(line+(Math.max(t,now)-now)*pps,y);
          context.lineTo(Math.min(size.width+2,line+(end-now)*pps),y);
        }
        context.stroke();
        const brush=meteor ? meteorBrush(lane) : null;
        const curve=voice==='bow' || voice==='wind' ? skyLevelFor(lane.group) : null;
        if(part.glow && part.glow!==set) {
          const glow=part.glow;
          for(let g=lowerBound(glow.start,glow.count,pastStart-glow.maxDur);g<glow.count && glow.start[g]<=now;g++) {
            const end=glow.start[g]+glow.dur[g];
            if(end>pastStart)drawSkyHeld(box,part,g,Math.max(pastStart,glow.start[g]),Math.min(end,now),now,line,pps,curve,ink,true);
          }
        }
        if(meteor) {
          context.fillStyle=rgba(ink.preview,nightSkyOn() ? options.starDim : .78);context.beginPath();
          const r=geometry.lanes.length>=12 ? .9 : 1.2;
          for(let i=lowerBound(set.start,set.count,now);i<stop;i++) {
            const t=set.start[i];if(t<=now)continue;
            const x=line+(t-now)*pps,y=pitchY(box,set.pitch[i]);
            const head=set.dur[i]<SHORT_NOTE.seconds ? Math.max(r,options.shortHead) : r;
            context.moveTo(x+head,y);context.arc(x,y,head,0,Math.PI*2);
          }
          context.fill();
        }
        for(let i=first;i<stop;i++) {
          const t=set.start[i],end=t+set.dur[i];
          if(end>left)stats.notes++;
          if(t>now) continue;
          if(end>now)stats.active++;
          if(meteor) {
            if(drawFlight(box,part,i,now,line,pps,brush,ink)) stats.meteors=(stats.meteors||0)+1;
          } else if(end>pastStart) {
            drawSkyHeld(box,part,i,Math.max(t,pastStart),Math.min(end,now),now,line,pps,curve,ink);
          }
        }
        if(part.contour && options.showContour && !meteor) {
          if (part.contourSpans) {
            const spans = part.contourSpans;
            const firstSpan = Math.max(0, startedBy(spans,pastStart,span=>span[0]));
            for (let j=firstSpan; j<spans.length && spans[j][0]<right; j++) {
              const from = Math.max(pastStart,spans[j][0]), to = Math.min(right,spans[j][1]);
              if (from<to) drawSkyContour(box,part.contour,now,line,pps,stats,from,to,ink);
            }
          } else {
            drawSkyContour(box,part.contour,now,line,pps,stats,pastStart,right,ink);
          }
        }
      }
      context.restore();
    }

    function drawSkyContour(box, contour, now, line, pps, stats, from, to, ink) {
      const {midi,hop}=contour, origin=finite(contour.start) ? contour.start : 0;
      const start=Math.max(0,Math.floor((Math.max(from,now-line/pps)-origin)/hop)-1);
      const end=Math.min(midi.length-1,Math.ceil((Math.min(to,now+(size.width-line)/pps)-origin)/hop)+1);
      const yFor=pitch=>contourY(box,pitch);
      context.lineWidth=1.32;
      for(const past of [true,false]) {
        context.strokeStyle=past ? ink.lit : rgba(ink.preview,.65);
        context.globalAlpha=past ? .93 : 1;
        context.beginPath();
        let pen=false;
        for(let i=start+1;i<=end;i++) {
          const t=origin+i*hop, before=t-hop;
          if(!finite(midi[i-1]) || !finite(midi[i]) || (past ? before>=now : t<=now)) {pen=false;continue;}
          const a=Math.max(from,past ? before : Math.max(now,before)), b=Math.min(to,past ? Math.min(t,now) : t);
          if (b<=a) {pen=false;continue;}
          const slope=(midi[i]-midi[i-1])/hop;
          if(!pen) context.moveTo(line+(a-now)*pps,yFor(midi[i-1]+(a-before)*slope));
          context.lineTo(line+(b-now)*pps,yFor(midi[i-1]+(b-before)*slope));
          pen=true;stats.contour++;
        }
        context.stroke();
      }
    }

    function drawPitched(box, now, line, pps, stats) { if(guidesOnly)return;
      if (options.meteorMotion) {
        drawSkyPitched(box, now, line, pps, stats);
        return;
      }
      const {lane} = box, set = lane.set;
      const bodyColor = lane.ink || lane.color, activeColor = lane.litInk || lane.lit;
      const left = now - line / pps, right = now + (size.width - line) / pps;
      const future = [], past = [], active = [], names = [];
      const recent = options.releaseFocus ? [] : null;
      const recentEnds = recent && options.attackWeight ? [] : null;
      const attacks = options.attackWeight ? [] : null;
      const hints = lane.weak ? [] : null;
      const thickness = box.thickness, half = thickness / 2;
      const weighted = options.pitchWeight && WEIGHT_GROUPS.includes(lane.group);
      const thinnest = Math.min(thickness, lane.kind === 'melody' ? 3.5 : 2);
      const spindle = options.showShapes && options.shapeSet === 'spindle' && SPINDLE_GROUPS.includes(lane.group);
      const linked = spindle && options.shapeLinks && lane.strands && lane.strands.links.length > 0;
      const joins = linked ? [[], [], []] : null;
      const extra = frameFx ? {set, thickness, halos: [], glow: [], shimmer: [], near: [], sound: [], burnt: [], burning: []} : null;
      // showRoles: accompaniment notes inside a block are drawn as the block, not one by one; a lane being
      // listened to alone shows every note again. Lead notes, lone accompaniment notes and unknown ones are as ever.
      const shapes = options.showRoles && set.role ? lane : null;
      const blocked = shapes && lane.blocked && lane.group !== options.focusGroup ? lane.blocked : null;
      for (let i = lowerBound(set.start, set.count, left - set.maxDur); i < set.count; i++) {
        const start = set.start[i];
        if (start >= right) break;
        const end = start + set.dur[i];
        if (end <= left) continue;
        const x = line + (start - now) * pps;
        // A hair's gap before the next note, so a re-struck pitch reads as separate strokes.
        const width = Math.max(2, set.dur[i] * pps - 1.5);
        if (blocked && blocked[i]) {
          stats.notes++;
          stats.blocked = (stats.blocked || 0) + 1;
          continue;
        }
        const y = pitchY(box, set.pitch[i]) - half;
        const bucket = start > now ? future : end <= now ? past : active;
        if (hints && lane.weak[i]) {
          const thin = Math.max(1, thickness*.52);
          hints.push(x, y + half - thin/2, width, thin);
          stats.notes++;
          if (bucket === active) stats.active++;
          continue;
        }
        const fading = recent && bucket === past && now - end < 2;
        const rects = fading ? recent : bucket;
        if (weighted) {
          const own = ownThickness(box, i, thinnest);
          rects.push(x, y + half - own / 2, width, own);
        } else rects.push(x, y, width, thickness);
        if (fading) {
          recent.push(now - end, joins ? lane.strands.ends[i] : 0);
          if (recentEnds) recentEnds.push(attackOpacity(end - start));
        }
        else if (joins) (bucket === future ? joins[0] : bucket === past ? joins[1] : joins[2]).push(lane.strands.ends[i]);
        if (attacks && bucket === active) attacks.push(now - start);
        if (lane.kind === 'melody') names.push(x, y, set.pitch[i], bucket === future ? 0 : bucket === past ? 1 : 2);
        stats.notes++;
        if (bucket === active) stats.active++;
        if (extra) noteEffects(extra, i, x, y, width, start, end, now, line);
      }
      const clip = options.spacedLanes && (active.length || hints?.length || blocked || shapes?.links?.length || linked ||
        (lane.contour && options.showContour) || (names.length && !options.quietText) ||
        (extra && (extra.halos.length || extra.glow.length || extra.shimmer.length || extra.near.length ||
                   extra.sound.length || extra.burnt.length || extra.burning.length)) ||
        notesReachClip(future, 4, box) || notesReachClip(past, 4, box) || (recent && notesReachClip(recent, 6, box)));
      const savePaint = options.spacedLanes && (clip || future.length || past.length || recent?.length);
      if (clip) clipContents(box);
      else if (savePaint) context.save();
      const radius = Math.min(half, 2.5);
      if (blocked) drawBlocks(box, now, line, pps, stats);
      if (shapes && shapes.links && shapes.links.length) drawLinks(box, now, line, pps, stats);
      // showShapes: a struck lane's notes as head and tapering body, in the same buckets, colours and light.
      const shape = spindle ? 'spindle' : options.showShapes ? SHAPE_BY_GROUP[lane.group] : null;
      const paint = spindle ? (list, colour, light, floor, ends) => {
        fillSpindles(list, rgba(colour, round3(Math.max(floor, light * SPINDLE.halo))), 'halo', pps);
        fillSpindles(list, rgba(colour, light), 'core', pps, ends);
      } : shape === 'struck' || shape === 'bass' ? (list, colour, light) => fillShapes(list, rgba(colour, light), shape, box, pps)
        : (list, colour, light) => fillBars(list, rgba(colour, light), radius);
      if (linked) drawStrands(box, now, line, pps, stats, weighted, thinnest);
      if (hints && hints.length) {
        paint(hints, bodyColor, .12, 0, null);
        stats.weakNotes = (stats.weakNotes || 0) + hints.length / 4;
      }
      paint(future, bodyColor, 0.34, SPINDLE.haloFloor, joins && joins[0]);
      paint(past, bodyColor, recent ? 0.28 : 0.92, 0, joins && joins[1]);
      if (recent && recent.length) {
        // Only the last two seconds need a continuous per-note value. The whole
        // older history still uses a single batched path. Smoothstep has zero
        // slope at release and at the join with that path.
        const one = [0, 0, 0, 0], endBits = [0];
        let previousAge = -1, light = 0, ink, opacity = 0, shadow = 0;
        for (let i = 0; i < recent.length; i += 6) {
          for (let j = 0; j < 4; j++) one[j] = recent[i + j];
          endBits[0] = recent[i + 5];
          const age = recent[i + 4];
          if (age !== previousAge) {
            previousAge = age;
            light = releaseTail(age);
            ink = lane.ink ? bodyColor.map((v,k) => Math.round(v + (activeColor[k]-v)*light)) : mix(bodyColor, 0.55 * light);
            opacity = 0.28 + 0.72 * light;
            shadow = Math.max(0, 1 - age / 0.14);
          }
          if (shadow > 0) {
            context.save();
            context.shadowBlur = 10 * shadow;
            context.shadowColor = rgba(bodyColor, 0.9 * shadow);
          }
          const tailOpacity = recentEnds ? opacity - (1 - recentEnds[i / 6]) * light : opacity;
          paint(one, ink, tailOpacity, 0, joins && endBits);
          if (shadow > 0) context.restore();
        }
      }
      if (active.length) {
        context.save();
        context.shadowColor = rgba(bodyColor, 0.9);
        context.shadowBlur = 10;
        if (!attacks) paint(active, activeColor, 1, 0, joins && joins[2]);
        else {
          const one = [0,0,0,0], endBits = [0], held = [], heldEnds = joins ? [] : null;
          for (let j = 0; j < attacks.length; j++) {
            const age = attacks[j], i = j*4;
            if (age >= .475) {
              held.push(active[i], active[i+1], active[i+2], active[i+3]);
              if (heldEnds) heldEnds.push(joins[2][j]);
              continue;
            }
            for (let k = 0; k < 4; k++) one[k] = active[i+k];
            if (joins) endBits[0] = joins[2][j];
            paint(one, activeColor, attackOpacity(age), 0, joins && endBits);
          }
          if (held.length) paint(held, activeColor, .87, 0, heldEnds);
        }
        context.restore();
      }
      if (shape && shape !== 'held') stats.shaped = (stats.shaped || 0) + (future.length + past.length + active.length + (hints ? hints.length : 0)) / 4 + (recent ? recent.length / 6 : 0);
      if (extra) drawNoteEffects(extra, box, line, now, radius);
      if (lane.contour && options.showContour) drawContour(box, now, line, pps, stats);
      if (names.length) drawNoteNames(names, lane, box);
      if (savePaint) context.restore();
    }

    // A note's own thickness with pitchWeight on (the lane's thickness by the note's weight, within its floor and cap).
    function ownThickness(box, i, thinnest) {
      return Math.max(thinnest, Math.min(box.thickness * box.lane.set.weight[i], box.thickness + box.semitone * PITCH_WEIGHT.cap));
    }

    // The string links of one lane this frame (shapeLinks): one slow S from where the earlier note's core starts to
    // taper to where the later one's is full, level at both ends, under the notes. The S is cut where the two notes
    // meet: the part before is the earlier note's (its light: still to come, played or sounding, and its core's
    // thickness), the part after the later note's, so each note's light ends where the note does (strokes grouped by
    // light and width).
    function drawStrands(box, now, line, pps, stats, weighted, thinnest) {
      const {lane} = box, {set} = lane, {links, at, span} = lane.strands;
      const left = now - line / pps, right = now + (size.width - line) / pps;
      const xOf = t => line + (t - now) * pps;
      // The same bar width and ramp the spindles take, and the core's thickness.
      const barWidth = k => Math.max(2, set.dur[k] * pps - 1.5);
      const ramp = k => Math.min(barWidth(k) * SPINDLE.share, SPINDLE.rampMax * pps);
      const core = k => {
        const base = weighted ? ownThickness(box, k, thinnest) : box.thickness;
        return Math.min(base, Math.max(SPINDLE.coreMin, base * SPINDLE.core));
      };
      const groups = [new Map(), new Map(), new Map()];
      const bucketOf = k => set.start[k] > now ? 0 : set.start[k] + set.dur[k] <= now ? 1 : 2;
      const add = (k, half) => {
        const width = Math.round(core(k) * 4) / 4, list = groups[bucketOf(k)].get(width) || [];
        list.push(...half);
        groups[bucketOf(k)].set(width, list);
      };
      let drawn = 0;
      for (let n = lowerBound(at, at.length, left - span); n < at.length && at[n] <= right; n++) {
        const i = links[n * 2], j = links[n * 2 + 1];
        const a = xOf(set.start[i]) + barWidth(i) - ramp(i), b = xOf(set.start[j]) + ramp(j);
        if (b < 0 || a > size.width) continue;
        // The S (a, ya) → (b, yb) with both controls at the middle x, cut in two where the notes meet (the later
        // one's start where they overlap, else the earlier one's end): the parameter there found by halving (x grows
        // with it), the curve split there (de Casteljau), each part a cubic of its own [start, control, control, end].
        const ya = pitchY(box, set.pitch[i]), yb = pitchY(box, set.pitch[j]), m = (a + b) / 2;
        const meet = xOf(Math.min(set.start[i] + set.dur[i], set.start[j]));
        const xAt = t => { const u = 1 - t; return u * u * u * a + 3 * u * t * m + t * t * t * b; };
        let low = 0, high = 1;
        if (meet <= a) high = 0; else if (meet >= b) low = 1;
        else for (let k = 0; k < STRANDS.halvings; k++) { const mid = (low + high) / 2; if (xAt(mid) < meet) low = mid; else high = mid; }
        const t = (low + high) / 2, lerp = (p, q) => p + (q - p) * t;
        const x01 = lerp(a, m), x12 = m, x23 = lerp(m, b), y12 = lerp(ya, yb);
        const x012 = lerp(x01, x12), y012 = lerp(ya, y12), x123 = lerp(x12, x23), y123 = lerp(y12, yb);
        const x = lerp(x012, x123), y = lerp(y012, y123);
        if (t > 0) add(i, [a, ya, x01, ya, x012, y012, x, y]);
        if (t < 1) add(j, [x, y, x123, y123, x23, yb, b, yb]);
        drawn++;
      }
      [[0, lane.color, 0.34], [1, lane.color, 0.92], [2, lane.lit, 1]].forEach(([k, colour, light]) => {
        for (const [width, list] of groups[k]) {
          context.strokeStyle = rgba(colour, light);
          context.lineWidth = width;
          context.beginPath();
          for (let p = 0; p < list.length; p += 8) {
            context.moveTo(list[p], list[p + 1]);
            context.bezierCurveTo(list[p + 2], list[p + 3], list[p + 4], list[p + 5], list[p + 6], list[p + 7]);
          }
          context.stroke();
        }
      });
      context.lineWidth = 1;
      if (drawn) stats.strands = (stats.strands || 0) + drawn;
    }

    // The blocks of one lane this frame (showRoles): left of the play line in a played note's light, right of it
    // in a note-to-come's, each part filled at ROLES.fill of that light with its edges and onset ticks at it.
    function drawBlocks(box, now, line, pps, stats) {
      const {lane} = box, half = box.thickness / 2;
      const left = now - line / pps, right = now + (size.width - line) / pps;
      const top = pitch => pitchY(box, pitch) - half, bottom = pitch => pitchY(box, pitch) + half;
      const xOf = t => line + (t - now) * pps;
      const parts = {past: {fill: [], edges: [], ticks: []}, future: {fill: [], edges: [], ticks: []}};
      const flashes = [];
      let shown = 0;
      for (let b = lowerBound(lane.blockStarts, lane.blocks.length, left - lane.longestBlock); b < lane.blocks.length; b++) {
        const block = lane.blocks[b];
        if (block.start >= right) break;
        if (block.end <= left) continue;
        shown++;
        const segs = block.segs;
        for (let k = 0; k < segs.length; k += 4) {
          const t0 = segs[k], t1 = segs[k + 1], hi = top(segs[k + 3]), lo = bottom(segs[k + 2]);
          for (const [a, z, part] of [[t0, Math.min(t1, now), parts.past], [Math.max(t0, now), t1, parts.future]]) {
            if (z <= a) continue;
            const x0 = xOf(a), x1 = xOf(z);
            part.fill.push(x0, hi, x1 - x0, lo - hi);
            part.edges.push(x0, hi, x1, hi, x0, lo, x1, lo);
            // The step up or down from the stretch before, at its start.
            if (k >= 4 && segs[k - 3] === t0 && a === t0) {
              const prevHi = top(segs[k - 1]), prevLo = bottom(segs[k - 2]);
              if (prevHi !== hi) part.edges.push(x0, prevHi, x0, hi);
              if (prevLo !== lo) part.edges.push(x0, prevLo, x0, lo);
            }
          }
        }
        const ticks = block.ticks;
        for (let k = 0; k < ticks.length; k += 3) {
          const t = ticks[k];
          if (t < left || t >= right) continue;
          const x = xOf(t);
          (t <= now ? parts.past : parts.future).ticks.push(x, top(ticks[k + 2]), x, bottom(ticks[k + 1]));
          if (t <= now && now - t < ROLES.flashLife) flashes.push(x, top(ticks[k + 2]), x, bottom(ticks[k + 1]), 1 - (now - t) / ROLES.flashLife);
        }
      }
      if (!shown) return;
      stats.blocks = (stats.blocks || 0) + shown;
      const strokeSegments = (list, style, width) => {
        if (!list.length) return;
        context.strokeStyle = style;
        context.lineWidth = width;
        context.beginPath();
        for (let i = 0; i < list.length; i += 4) { context.moveTo(list[i], list[i + 1]); context.lineTo(list[i + 2], list[i + 3]); }
        context.stroke();
      };
      for (const [part, light] of [[parts.future, 0.34], [parts.past, 0.92]]) {
        fillBars(part.fill, rgba(lane.color, round3(light * ROLES.fill)), 0);
        strokeSegments(part.edges, rgba(lane.color, light), ROLES.edge);
        strokeSegments(part.ticks, rgba(lane.color, light), ROLES.tick);
      }
      for (let i = 0; i < flashes.length; i += 5) {
        strokeSegments([flashes[i], flashes[i + 1], flashes[i + 2], flashes[i + 3]], rgba(lane.lit, round3(ROLES.flash * flashes[i + 4])), ROLES.tick + 1);
      }
      context.lineWidth = 1;
    }

    // The links between the notes of one lead line this frame (showRoles): note centre to note centre, the end
    // of one to the start of the next, in the lane's colour at a note's light, played left of the line.
    function drawLinks(box, now, line, pps, stats) {
      const {lane} = box, links = lane.links;
      const left = now - line / pps, right = now + (size.width - line) / pps;
      const xOf = t => line + (t - now) * pps;
      const pieces = {past: [], future: []};
      for (let i = 0; i < links.length; i += 4) {
        const t0 = links[i], t1 = links[i + 2];
        if (t1 < left || t0 > right) continue;
        const y0 = pitchY(box, links[i + 1]), y1 = pitchY(box, links[i + 3]);
        if (t1 <= now) pieces.past.push(xOf(t0), y0, xOf(t1), y1);
        else if (t0 >= now) pieces.future.push(xOf(t0), y0, xOf(t1), y1);
        else {
          const ym = y0 + (y1 - y0) * (now - t0) / (t1 - t0);
          pieces.past.push(xOf(t0), y0, line, ym);
          pieces.future.push(line, ym, xOf(t1), y1);
        }
      }
      for (const [list, light] of [[pieces.future, 0.34], [pieces.past, 0.92]]) {
        if (!list.length) continue;
        context.strokeStyle = rgba(lane.color, light);
        context.lineWidth = ROLES.link;
        context.beginPath();
        for (let i = 0; i < list.length; i += 4) { context.moveTo(list[i], list[i + 1]); context.lineTo(list[i + 2], list[i + 3]); }
        context.stroke();
        stats.links = (stats.links || 0) + list.length / 4;
      }
      context.lineWidth = 1;
    }

    // A name above each sung note. A name that would run into the one before it is left
    // out; the bar itself still shows the pitch.
    function drawNoteNames(names, lane, box) {
      if (options.quietText) return;
      const fontSize = geometry.narrow ? 9 : 10.5;
      context.font = `600 ${fontSize}px ${FONT}`;
      context.textAlign = 'left';
      context.textBaseline = 'alphabetic';
      let taken = -Infinity;
      const styles = [rgba(lane.color, 0.45), rgba(lane.color, 0.95), 'rgba(255,255,255,1)'];
      for (let i = 0; i < names.length; i += 4) {
        const x = names[i];
        if (x < taken) continue;
        const text = noteName(names[i + 2]);
        context.fillStyle = styles[names[i + 3]];
        context.fillText(text, x, Math.max(box.top - 2, names[i + 1] - 3));
        taken = x + context.measureText(text).width + 4;
      }
    }

    // The kit's rows (DRUM_KIT) for a drum lane's own rows, the centre in eighths of the lane (drumYAt's unit).
    function notationRows(lane) {
      if (!lane.notationRows) lane.notationRows = lane.rowNames.map(name => ({name: DRUM_DISPLAY.includes(name) ? name : 'unknown', center: kitCenter(name) * 8}));
      return lane.notationRows;
    }
    const drumMark = (path,name,x,y,h,room) => kitMark(path,name,x,y,h,room);
    function drawDrumNotation(box,now,line,pps,stats) {
      const {lane} = box, hits = lane.hits, rows = notationRows(lane);
      const right = now + (size.width-line)/pps, step = box.height / 8;
      const colors = lane.ink
        ? [rgba(lane.ink, options.releaseFocus ? .28 : .92), rgba(lane.litInk, 1), rgba(lane.ink,.34)]
        : [rgba(lane.color,.73),rgba(lane.color,.91),rgba(lane.color,.46)];
      let batch = -1, path;
      for (let i=lowerBound(hits.time,hits.count,now-line/pps-.2); i<hits.count && hits.time[i]<right; i++) {
        const t = hits.time[i], row = rows[hits.row[i]];
        const phase = t > now ? 2 : now-t < .09 ? 1 : 0;
        if (phase !== batch) {
          if (batch >= 0) fillGeometry(path);
          context.fillStyle = colors[phase]; path = beginGeometry(); batch = phase;
        }
        const h = kitSize(box.height, hits.vel[i]);
        drumMark(path,row.name,line+(t-now)*pps,box.top+step*row.center,h,hits.kitGap ? hits.kitGap[i]*pps/2 : Infinity);
        stats.hits++;
        if (phase === 1) stats.active++;
      }
      if (batch >= 0) fillGeometry(path);
    }


    function drawSkyDrums(box, now, line, pps, stats) {
      const lane=box.lane, hits=lane.hits, rows=notationRows(lane), step=box.height/8;
      const right=now+(size.width-line)/pps;
      context.save();context.beginPath();context.rect(history.left,box.top,size.width-history.left,box.height);context.clip();
      let batch=-1, lastAlpha=-1, path;
      const ink=historyBrush(lane), colors=[ink.color,ink.lit,rgba(ink.preview,.56)];
      const scale=options.drumDecayScale, past=scale ? Math.min(history.seconds, .50*scale) : history.seconds;
      for(let i=lowerBound(hits.time,hits.count,now-past);i<hits.count&&hits.time[i]<right;i++) {
        const t=hits.time[i],age=now-t, row=rows[hits.row[i]];
        const lifetime=drumSeconds[row.name]*scale;
        if (scale && age >= lifetime-1e-9) continue;
        const phase=age<0 ? 2 : age<.085 ? 1 : 0;
        const fade=scale && age>0 ? transientLight(age,lifetime) : 1;
        const alpha=(phase===0 ? .72 : phase===1 ? .84 : 1)*fade;
        if(phase!==batch || alpha!==lastAlpha) {
          if(batch>=0)fillGeometry(path);
          context.fillStyle=colors[phase];context.globalAlpha=alpha;lastAlpha=alpha;
          path=beginGeometry();batch=phase;
        }
        const x=line+(t-now)*pps,y=box.top+step*row.center;
        const strength=hits.vel[i]/127, h=kitSize(box.height, hits.vel[i]);
        drumMark(path,row.name,x,y,h*(phase===1 ? 1.12 : 1)*(strength>.67 && row.name==='snare' ? 1.06 : 1),hits.kitGap ? hits.kitGap[i]*pps/2 : Infinity);
        stats.hits++;if(phase===1)stats.active++;
      }
      if(batch>=0)fillGeometry(path);
      context.restore();
    }
    function releaseTail(age) {
      const left = clamp(1 - age / 2, 0, 1);
      return left * left * (3 - 2 * left);
    }

    function drawDrums(box, now, line, pps, stats) { if(guidesOnly)return;
      if (options.meteorMotion) return drawSkyDrums(box, now, line, pps, stats);
      if (options.drumNotation) return drawDrumNotation(box,now,line,pps,stats);
      const {lane} = box, hits = lane.hits;
      const left = now - line / pps, right = now + (size.width - line) / pps;
      const future = [], past = [], flash = [];
      const recent = options.releaseFocus ? [] : null;
      const mark = clamp(box.rowHeight * 0.5, 2, 4);
      const strikes = frameFx && frameFx.on.drums ? [] : null;
      for (let i = lowerBound(hits.time, hits.count, left - 0.2); i < hits.count; i++) {
        const time = hits.time[i];
        if (time >= right) break;
        const row = lane.rowIndex.get(hits.row[i]);
        const x = line + (time - now) * pps;
        const y = box.top + (row + 0.5) * box.rowHeight - mark / 2;
        // A hit has no length, so it is "on the line" for a moment after it lands.
        const bucket = time > now ? future : now - time < 0.09 ? flash : past;
        if (bucket === flash) bucket.push(x - 1, y - 1, mark * 1.6 + 2, mark + 2);
        else if (recent && bucket === past && now - time < 2.09) recent.push(x, y, now - time - 0.09);
        else bucket.push(x, y, mark * 1.6, mark);
        stats.hits++;
        if (bucket === flash) stats.active++;
        if (strikes && time <= now) strikes.push(i, x + mark * 0.8, y + mark / 2);
      }
      const bodyColor = lane.ink || lane.color;
      fillBars(future, rgba(bodyColor, lane.ink ? .34 : .3), 1);
      fillBars(past, rgba(bodyColor, recent ? .28 : lane.ink ? .92 : .85), 1);
      if (recent) {
        for (let i = 0; i < recent.length; i += 3) {
          const light = releaseTail(recent[i + 2]);
          const shadow = Math.max(0, 1 - recent[i + 2] / 0.14);
          if (shadow > 0) {
            context.save();
            context.shadowBlur = 8 * shadow;
            context.shadowColor = rgba([255, 255, 255], 0.9 * shadow);
          }
          const ink = lane.ink ? bodyColor.map((v,k) => Math.round(v + (lane.litInk[k]-v)*light)) : mix(bodyColor,light);
          fillBars([recent[i] - light, recent[i + 1] - light, mark * 1.6 + 2 * light, mark + 2 * light],
            rgba(ink, 0.28 + 0.72 * light), 1);
          if (shadow > 0) context.restore();
        }
      }
      if (flash.length) {
        context.save();
        context.shadowColor = 'rgba(255,255,255,0.9)';
        context.shadowBlur = 8;
        fillBars(flash, lane.litInk ? rgba(lane.litInk,1) : 'rgba(255,255,255,1)', 1);
        context.restore();
      }
      if (strikes && strikes.length) drawDrumEffects(strikes, box, now);
    }

    function drawAllGuides() {
      if (!geometry.lanes.length) return;
      if (!options.drumNotation || typeof host.Path2D !== 'function') {
        for (const box of geometry.lanes) drawGuides(box);
        return;
      }
      // Retain the exact rule geometry for each lane; keep the original stroke boundaries
      // and their rasterization, including matches in the narrow 140% XML window.
      if (geometry.guideLanes !== geometry.lanes) {
        const paths = [];
        for (const box of geometry.lanes) {
          const path = new host.Path2D();
          if (box.lane.kind === 'drums') {
            const y = box.top + box.height * 5 / 8;
            path.moveTo(0, y); path.lineTo(size.width, y);
          } else {
            for (let pitch = Math.ceil(box.lane.range.low / 12) * 12; pitch <= box.lane.range.high; pitch += 12) {
              const y = Math.round(pitchY(box, pitch)) + 0.5;
              path.moveTo(0, y); path.lineTo(size.width, y);
            }
          }
          paths.push(path);
        }
        geometry.guideLanes = geometry.lanes;
        geometry.guidePaths = paths;
      }
      context.strokeStyle = 'rgba(255,255,255,0.06)';
      context.lineWidth = 1;
      for (const path of geometry.guidePaths) context.stroke(path);
    }

    function drawGuides(box) {
      const {lane} = box;
      context.strokeStyle = 'rgba(255,255,255,0.06)';
      context.lineWidth = 1;
      context.beginPath();
      if (lane.kind === 'drums') {
        if (options.drumNotation || options.meteorMotion) {
          const y = box.top + box.height * 5 / 8;
          context.moveTo(0,y); context.lineTo(size.width,y);
        } else for (let row = 0; row < lane.rows.length; row++) {
          const y = Math.round(box.top + (row + 0.5) * box.rowHeight) + 0.5;
          context.moveTo(0, y); context.lineTo(size.width, y);
        }
      } else {
        for (let pitch = Math.ceil(lane.range.low / 12) * 12; pitch <= lane.range.high; pitch += 12) {
          const y = Math.round(pitchY(box, pitch)) + 0.5;
          context.moveTo(0, y); context.lineTo(size.width, y);
        }
      }
      context.stroke();
    }

    // Lane names on the left and octave marks on the right sit over the notes, on a fade
    // into the background, so the notes run on underneath as they do in the reference.
    // One icon of ICONS, `side` pixels square with its top left at (x, y), stroked in `colour`.
    function drawIcon(moves, x, y, side, colour, alpha, widen = 1, paint = context, material = null) {
      const k = side / 24;
      paint.save();
      paint.strokeStyle = rgba(colour, alpha);
      paint.lineWidth = ICON_STROKE * k * widen;
      paint.lineCap = 'round';
      paint.lineJoin = 'round';
      if (material) {
        paint.globalAlpha *= .38 + .62 * alpha;
        const ink = material === 'ember'
          ? paint.createLinearGradient(x, y + side * .2, x + side * .82, y + side)
          : paint.createLinearGradient(x, y, x, y + side);
        const stops = material === 'ember'
          ? [[0, '#f5ba82'], [.23, '#c88c67'], [.52, '#98705c'], [1, '#664e46']]
          : material === 'water'
            ? [[0, '#788ca9'], [.54, '#8fa3bc'], [.7, '#748bad'], [.84, '#d5e7f4'], [1, '#adbcd6']]
            : [[0, '#f8f0dc'], [.55, '#e8e3d6'], [1, '#bdbccb']];
        for (const [stop, color] of stops) ink.addColorStop(stop, color);
        paint.strokeStyle = ink;
      }
      // A repeated icon may appear on many tracks. Keep the exact screen-space path,
      // including fractional coordinates; changes of colour or line weight reuse it.
      const cache = options.drumNotation && typeof host.Path2D === 'function'
        ? (geometry.icons || (geometry.icons = new Map())) : null;
      let paths = cache && cache.get(moves);
      if (cache && !paths) { paths = new Map(); cache.set(moves, paths); }
      const key = paths ? x + '/' + y + '/' + side : null;
      let path = paths && paths.get(key);
      if (!path) {
        if (cache) path = new host.Path2D();
        else { paint.beginPath();path = paint; }
        for (const move of moves) {
          if (move[0] === 'M') path.moveTo(x + move[1] * k, y + move[2] * k);
          else if (move[0] === 'L') path.lineTo(x + move[1] * k, y + move[2] * k);
          else if (move[0] === 'Q') path.quadraticCurveTo(x + move[1] * k, y + move[2] * k, x + move[3] * k, y + move[4] * k);
          else if (move[0] === 'Z') path.closePath();
          else if (move[0] === 'C') {
            path.moveTo(x + (move[1] + move[3]) * k, y + move[2] * k);
            path.arc(x + move[1] * k, y + move[2] * k, move[3] * k, 0, Math.PI * 2);
          }
        }
        if (paths) {
          if (paths.size >= 48) paths.delete(paths.keys().next().value);
          paths.set(key, path);
        }
      }
      if (path === paint) paint.stroke();
      else paint.stroke(path);
      paint.restore();
    }

    const iconLevel = share => clamp(ICON_DIM + (1 - ICON_DIM) * (share - SHARE_FLOOR) / (1 - SHARE_FLOOR), ICON_DIM, 1);

    function drawEdges(stats) {
      const {width, gutter, labelFont, top, narrow} = geometry, lanesBottom = geometry.bottom;
      if (!geometry.lanes.length) return;
      const band = geometry.texture;
      const bottom = band ? Math.max(lanesBottom, band.bottom) : lanesBottom;
      // The edges fade into the ground: the studio's, or the night sky's (0.30.0).
      const ground = nightSkyOn() ? skyColour() : BACKGROUND_RGB, groundKey = ground.join();
      if (geometry.fadeGround !== groundKey) { geometry.leftFade = geometry.rightFade = null; geometry.fadeGround = groundKey; }
      let leftFade = options.drumNotation && geometry.leftFade;
      if (!leftFade) {
        leftFade = context.createLinearGradient(0, 0, gutter + 26, 0);
        leftFade.addColorStop(0, rgba(ground, 0.96));
        leftFade.addColorStop(0.62, rgba(ground, 0.8));
        leftFade.addColorStop(1, rgba(ground, 0));
        if (options.drumNotation) geometry.leftFade = leftFade;
      }
      context.fillStyle = leftFade;
      if(!guidesOnly)context.fillRect(0, top - 6, gutter + 26, bottom - top + 12);
      let rightFade = options.drumNotation && geometry.rightFade;
      if (!rightFade) {
        rightFade = context.createLinearGradient(width - 46, 0, width, 0);
        rightFade.addColorStop(0, rgba(ground, 0));
        rightFade.addColorStop(1, rgba(ground, 0.9));
        if (options.drumNotation) geometry.rightFade = rightFade;
      }
      context.fillStyle = rightFade;
      if(!guidesOnly)context.fillRect(width - 46, top - 6, 46, bottom - top + 12);

      context.textBaseline = 'middle';
      stats.labels = [];
      // A group on screen more than once (timbre tracks split apart): the same icon on each, numbered top to bottom.
      let groups = options.drumNotation && geometry.edgeGroups;
      if (!groups) {
        const groupCount = new Map(), groupRank = [];
        for (const box of geometry.lanes) {
          const rank = (groupCount.get(box.lane.group) || 0) + 1;
          groupCount.set(box.lane.group, rank);
          groupRank.push(rank);
        }
        groups = {groupCount, groupRank, split: [...groupCount.values()].some(count => count > 1)};
        if (options.drumNotation) geometry.edgeGroups = groups;
      }
      const {groupCount, groupRank, split} = groups;
      // How loud each lane is now (its share, which glides between sections), for the icons' brightness.
      const shares = options.laneLabels === 'icon' && prepared.stretches ? (geometry.frameShares || sharesAt(stats.time, geometry.area.lanes)) : null;
      // Only with a group shown apart (else as before: one size, a lane too short for it has no icon).
      const minHeight = split ? Math.min(...geometry.lanes.map(box => box.height)) : Infinity;
      const iconSide = Math.max(ICON_MIN, Math.min(labelFont * ICON_SCALE, minHeight));
      // In dense XML scores adjacent labels borrow horizontal room, never vertical room
      // from the notes. Keep each label centred at the height used by hit testing.
      let columns = 1, compactSide = 0;
      if (options.denseLaneLabels && options.laneLabels === 'icon' &&
          (split ? minHeight < 11 : geometry.lanes.some(box => box.height < iconSide + 2))) {
        let pitch = Infinity;
        for (let i = 1; i < geometry.lanes.length; i++) {
          const a = geometry.lanes[i - 1], b = geometry.lanes[i];
          pitch = Math.min(pitch, (b.top + b.bottom - a.top - a.bottom) / 2);
        }
        columns = clamp(Math.ceil(12 / Math.max(.1, pitch)), 1, Math.floor(gutter / 24));
        compactSide = Math.max(1, Math.min(11, pitch * columns - 1));
      }
      for (const [index, box] of geometry.lanes.entries()) {
        const {lane} = box;
        const icon = options.laneLabels === 'icon' ? iconFor(lane.group) : null;
        const number = icon && groupCount.get(lane.group) > 1 ? groupRank[index] : 0;
        // The lane a mark names glows in its own colour as the mark lights, then settles.
        const flash = frameMark && frameMark.flash > 0 && frameMark.cue.object === groupOf(lane) ? frameMark.flash : 0;
        if (flash) context.save();
        if (icon) {
          // One size, centred in the name column, in the middle of its own lane.
          const side = compactSide || iconSide;
          if (!compactSide && box.height < side + (split ? -1e-6 : 2)) stats.labels.push({lane: lane.id, shown: 'none', size: 0});
          else {
            const middle = (box.top + box.bottom) / 2;
            const x = compactSide ? (index % columns + .5) * gutter / columns - (side + 12) / 2 : gutter / 2 - side / 2;
            const y = middle - side / 2;
            const level = round3(flash ? Math.max(iconLevel(shares ? shares[index] : 1), 0.55 + 0.45 * flash) : iconLevel(shares ? shares[index] : 1));
            if (materialIcons) materialIcons.push([icon, x, y, side, lane.color, level]);
            else {
              if (flash) drawIcon(icon, x, y, side, lane.color, round3(MARK_HALO * flash), 1 + MARK_WIDEN * flash);
              drawIcon(icon, x, y, side, lane.color, level);
            }
            if (number) {
              const numberSize = compactSide ? Math.min(9, side) : Math.round(labelFont * MARK_NUMBER);
              context.font = '600 ' + numberSize + 'px ' + FONT;
              context.textAlign = 'left';
              context.textBaseline = compactSide ? 'middle' : 'alphabetic';
              context.fillStyle = rgba(lane.color, level);
              context.fillText(String(number), x + side + 1, compactSide ? middle : y + side);
              context.textBaseline = 'middle';
            }
            stats.labels.push({lane: lane.id, shown: 'icon', size: Math.round(side * 100) / 100, x: Math.round(x * 100) / 100,
                               y: Math.round(y * 100) / 100, level, ...(number ? {number} : {}), ...(flash ? {flash: round3(flash)} : {})});
          }
        } else {
          context.font = `600 ${labelFont}px ${FONT}`;
          context.textAlign = 'left';
          context.fillStyle = rgba(lane.color, 1);
          if (flash) {
            context.lineWidth = MARK_TEXT_HALO * flash;
            context.lineJoin = 'round';
            context.strokeStyle = rgba(lane.color, round3(MARK_HALO * flash));
            context.strokeText(lane.label, narrow ? 8 : 14, (box.top + box.bottom) / 2);
          }
          context.fillText(lane.label, narrow ? 8 : 14, (box.top + box.bottom) / 2);
          stats.labels.push({lane: lane.id, shown: 'text', size: labelFont, ...(flash ? {flash: round3(flash)} : {})});
        }
        if (flash) context.restore();
        if (lane.kind === 'drums') continue;
        context.font = `500 ${narrow ? 8 : 9}px ${FONT}`;
        context.textAlign = 'right';
        context.fillStyle = 'rgba(255,255,255,0.42)';
        // When octaves are packed closer than a line of text, mark every other one.
        const stride = box.semitone * 12 < 13 ? 24 : 12;
        for (let pitch = Math.ceil(lane.range.low / stride) * stride; pitch <= lane.range.high; pitch += stride) {
          const y = pitchY(box, pitch);
          if (y > box.top + 4 && y < box.bottom - 2) context.fillText(noteName(pitch), width - 5, y);
        }
      }
      // The texture band's label: the wave icon at the icons' one size, centred on the band (it may
      // reach into the gaps around it, which hold nothing), or its name; it takes no mark's flash.
      if (band) {
        const texture = prepared.texture, middle = (band.top + band.bottom) / 2;
        if (options.laneLabels === 'icon') {
          const side = labelFont * ICON_SCALE, x = gutter / 2 - side / 2, y = middle - side / 2;
          const level = round3(ICON_DIM + (1 - ICON_DIM) * (stats.texture ? stats.texture.now : 0));
          if (materialIcons) materialIcons.push([TEXTURE_ICON, x, y, side, texture.color, level]);
          else drawIcon(TEXTURE_ICON, x, y, side, texture.color, level);
          stats.labels.push({lane: texture.id, shown: 'icon', size: Math.round(side * 100) / 100, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100});
        } else {
          context.font = `600 ${labelFont}px ${FONT}`;
          context.textAlign = 'left';
          context.fillStyle = rgba(texture.color, 1);
          context.fillText(texture.label, narrow ? 8 : 14, middle);
          stats.labels.push({lane: texture.id, shown: 'text', size: labelFont});
        }
      }
    }

    // Fit a single quiet label without shrinking or stretching its font. Cache
    // the result in the current layout; changing the view, width or song resets it.
    function quietLabel(text, room, key) {
      if (!text || room <= 0) return '';
      const cache = geometry[key];
      if (cache && cache.text === text && cache.room === room && cache.font === context.font) return cache.label;
      let label = text;
      if (context.measureText(text).width > room) {
        const chars = Array.from(text);
        let lo = 0, hi = chars.length;
        while (lo < hi) {
          const middle = Math.ceil((lo + hi) / 2);
          if (context.measureText(chars.slice(0, middle).join('') + '…').width <= room) lo = middle;
          else hi = middle - 1;
        }
        label = lo > 0 ? chars.slice(0, lo).join('') + '…' : '';
      }
      geometry[key] = {text, room, font: context.font, label};
      return label;
    }

    function drawHeader() {
      const {width, header, narrow} = geometry;
      const {title, album, artist} = prepared.track;
      if (options.quietText) {
        if (!title) return;
        context.textAlign = 'left';
        context.textBaseline = 'middle';
        context.font = `500 ${narrow ? 12 : 14}px ${FONT}`;
        context.fillStyle = 'rgba(255,255,255,0.69)';
        const room = prepared.has.chords ? width * 0.65 - 2 * geometry.side : width - 2 * geometry.side;
        context.fillText(quietLabel(title, room, 'quietTitle'), geometry.side, header / 2 + 3);
        return;
      }
      if (!title && !album && !artist) return;
      context.textBaseline = 'middle';
      const y = header / 2 + 4;
      const side = [album, artist].filter(Boolean).join(' — ').toUpperCase();
      let sideWidth = 0;
      if (side) {
        context.font = `500 ${narrow ? 9.5 : 11}px ${FONT}`;
        context.textAlign = 'right';
        context.fillStyle = 'rgba(255,255,255,0.55)';
        sideWidth = context.measureText(side).width;
        context.fillText(side, width - (narrow ? 10 : 16), y);
      }
      if (title) {
        const fontSize = clamp(header * 0.52, 15, 24);
        context.font = `700 ${fontSize}px ${FONT}`;
        context.textAlign = 'left';
        context.fillStyle = 'rgba(255,255,255,0.94)';
        const room = width - sideWidth - (narrow ? 30 : 48);
        let text = title.toUpperCase();
        while (text.length > 1 && context.measureText(text).width > room) text = text.slice(0, -2) + '…';
        context.fillText(text, narrow ? 10 : 16, y);
      }
    }

    // One chord in the band's right-hand corner: a small tag, the name in large type, and
    // under it one chip per tone. `alpha` and `shift` are how far through its entrance (or
    // exit) it is.
    function drawChord(chord, alpha, shift) {
      const {info} = geometry;
      if (options.quietText) {
        context.textAlign = 'right';
        context.textBaseline = 'middle';
        const chordSize = options.albumLayout ? (geometry.narrow ? 19 : 24) : (geometry.narrow ? 15 : 18);
        context.font = `550 ${chordSize}px ${FONT}`;
        // A chord stays legible at the instant its symbol changes; the small
        // remainder of the existing song-time crossfade uses no motion.
        context.fillStyle = rgba([255,255,255], round3(0.64 + 0.19 * alpha));
        const text = quietLabel(chord[2], geometry.width * 0.33 - geometry.side, 'quietChord');
        context.fillText(text, info.right, geometry.header / 2 + 3);
        return;
      }
      const band = info.bottom - info.top;
      const names = prepared.chordToneNames.get(chord[2]) || [];
      const chip = clamp(band * 0.26, 15, 22);
      const labelSize = clamp(band - 12 - chip - 8, 20, 46);
      context.textBaseline = 'top';
      context.textAlign = 'right';
      context.font = `700 ${labelSize}px ${FONT}`;
      context.fillStyle = `rgba(255,255,255,${(0.96 * alpha).toFixed(3)})`;
      context.fillText(chord[2], info.right, info.top + 12 + shift);
      if (!names.length) return;
      const fontSize = clamp(chip * 0.6, 9.5, 13);
      context.font = `600 ${fontSize}px ${FONT}`;
      const widths = names.map(name => context.measureText(name).width + 12);
      let x = info.right - widths.reduce((sum, width) => sum + width, 0) - 4 * (names.length - 1);
      const top = info.bottom - chip + shift;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      names.forEach((name, index) => {
        fillBars([x, top, widths[index], chip], `rgba(150,165,255,${(0.2 * alpha).toFixed(3)})`, 4);
        context.fillStyle = `rgba(205,212,255,${alpha.toFixed(3)})`;
        context.fillText(name, x + widths[index] / 2, top + chip / 2 + 0.5);
        x += widths[index] + 4;
      });
    }

    // The mark that is due ('mark' style): which row, which state, and how lit the named lane is.
    // Without effects there is no fading and no running line: the mark appears and goes.
    function markAt(now) {
      if (!options.showCaptions || options.captionStyle !== 'mark') return null;
      const index = startedBy(prepared.captions, now, caption => caption.start);
      if (index < 0 || now >= prepared.captions[index].end || !prepared.captions[index].cue) return null;
      const caption = prepared.captions[index], cue = caption.cue, still = !frameFx;
      const ahead = now < cue.at;
      // A surprise is not foreshadowed: before its moment there is nothing, even if its row starts early.
      if (ahead && !cue.preview) return null;
      const brightness = ahead ? MARK_DIM : cue.preview && !still ? MARK_DIM + (MARK_LIT - MARK_DIM) * clamp((now - cue.at) / CAPTION_FADE, 0, 1) : MARK_LIT;
      const fade = still ? 1 : Math.min(clamp((now - caption.start) / CAPTION_FADE, 0, 1), clamp((caption.end - now) / CAPTION_FADE, 0, 1));
      const flash = still || ahead ? 0 : clamp(1 - (now - cue.at) / MARK_FLASH, 0, 1);
      const state = ahead ? 'preview' : still || caption.end - now > CAPTION_FADE ? 'on' : 'out';
      const line = ahead && cue.preview && !still ? clamp((now - caption.start) / (cue.at - caption.start), 0, 1) : null;
      return {caption, cue, state, alpha: brightness * fade, flash, line};
    }

    // An "object · event" mark where the caption goes: the object as its lane's icon (icon
    // labels) or its name in the lane's colour, the rest in the caption's white. "全体" has no
    // icon. Nothing behind it, no larger than a caption, and left out whole if it will not fit.
    function drawMark(now, stats, fontSize, room, top) {
      const {info} = geometry;
      const {caption, cue, alpha, line} = frameMark;
      const text = caption.text;
      const separator = text.includes(' → ') ? ' → ' : ' · ';
      const cut = text.indexOf(separator);
      const tail = cue.word === 'only' || cue.word === 'lead';
      const object = cut < 0 ? text : tail ? text.slice(cut + separator.length) : text.slice(0, cut);
      const box = cue.object === 'all' ? null : geometry.lanes.find(item => groupOf(item.lane) === cue.object);
      const icon = box && options.laneLabels === 'icon' ? ICONS[cue.object] : null;
      const side = fontSize * MARK_ICON;
      context.font = `500 ${fontSize}px ${FONT}`;
      const parts = cut < 0 ? [{text}] : tail ? [{text: text.slice(0, cut + separator.length)}, {object: true}] : [{object: true}, {text: text.slice(cut)}];
      for (const part of parts) {
        if (part.object) Object.assign(part, icon ? {icon, width: side + 2} : {text: object, width: context.measureText(object).width});
        else part.width = context.measureText(part.text).width;
      }
      const total = parts.reduce((sum, part) => sum + part.width, 0);
      stats.caption = text;
      stats.mark = {text, object: cue.object, word: cue.word, state: frameMark.state, flash: round3(frameMark.flash), icon: Boolean(icon),
                    line: line === null ? null : round3(line), shown: total <= room, alpha: round3(alpha)};
      if (total > room || alpha <= 0) return;
      context.textAlign = 'left';
      context.textBaseline = 'top';
      const white = `rgba(255,255,255,${alpha.toFixed(3)})`;
      let x = info.left;
      for (const part of parts) {
        if (part.icon) drawIcon(part.icon, x, top + fontSize * 0.5 - side / 2, side, box.lane.color, alpha);
        else {
          context.fillStyle = part.object && box ? rgba(box.lane.color, alpha.toFixed(3)) : white;
          context.fillText(part.text, x, top);
        }
        x += part.width;
      }
      // Ahead of the moment, a hairline under the mark runs out to its full width exactly as the moment comes.
      if (line !== null) {
        context.fillStyle = white;
        context.fillRect(info.left, top + fontSize * 1.22, total * line, 1);
      }
    }

    // The caption that is due, under the section name: what to listen for right now. It
    // keeps clear of the chord panel, wraps by character (Chinese has no spaces to break
    // on), and what will not fit in the band ends in an ellipsis rather than spilling.
    function drawCaption(now, stats, offset) {
      const {info, width} = geometry;
      const index = startedBy(prepared.captions, now, caption => caption.start);
      if (index < 0 || now >= prepared.captions[index].end) return;
      const caption = prepared.captions[index];
      const band = info.bottom - info.top;
      const fontSize = clamp(band * 0.19, 13, 19), lineHeight = fontSize * 1.32;
      const room = info.right - info.left - (prepared.has.chords ? clamp(width * 0.27, 92, 190) : 0);
      const top = info.top + offset;
      const fits = Math.max(1, Math.floor((info.bottom - top + 2) / lineHeight));
      // A row that is a mark, in 'mark' style, is drawn as the mark or not at all.
      if (options.captionStyle === 'mark' && caption.cue) { if (frameMark && frameMark.caption === caption) drawMark(now, stats, fontSize, room, top); return; }
      context.font = `500 ${fontSize}px ${FONT}`;
      const lines = [];
      let line = '';
      for (const character of caption.text) {
        if (line && context.measureText(line + character).width > room) {
          lines.push(line);
          line = '';
        }
        line += character;
      }
      if (line) lines.push(line);
      if (lines.length > fits) {
        lines.length = fits;
        lines[fits - 1] = lines[fits - 1].slice(0, -1) + '…';
      }
      const shown = Math.min(clamp((now - caption.start) / CAPTION_FADE, 0, 1), clamp((caption.end - now) / CAPTION_FADE, 0, 1));
      context.textAlign = 'left';
      context.textBaseline = 'top';
      context.fillStyle = `rgba(255,255,255,${(0.94 * shown).toFixed(3)})`;
      lines.forEach((text, row) => context.fillText(text, info.left, top + row * lineHeight));
      stats.caption = caption.text;
    }

    // The band under the header: which section this is, on the left, and the chord that is
    // sounding, on the right. Changes are eased rather than snapped, and the easing is a
    // function of the song's time, not the wall clock, so it scrubs with the song.
    function drawQuietCue(now, section, name, stats) {
      const info = geometry.info;
      const ci = options.showCaptions ? startedBy(prepared.captions, now, row => row.start) : -1;
      const row = ci < 0 || now >= prepared.captions[ci].end ? null : prepared.captions[ci];
      const marked = row && options.captionStyle === 'mark' && row.cue;
      // markAt already decides whether this entry may be announced. A surprise
      // can have an early row start without permitting a visual preview.
      const cue = marked && (!frameMark || frameMark.caption !== row) ? null : row;
      // A user's own timed annotation takes precedence over the section entrance.
      // Later in the section the same line is available for listening cues.
      let text = '', alpha = 0;
      if (section && name && (!cue || cue.source !== 'manual')) {
        stats.section = name;
        const end = Math.min(section.end, section.start + 3.6);
        const span = end - section.start;
        if (span > 0 && now < end) {
          const edge = Math.min(1, (now - section.start) / Math.min(0.18, span / 3),
            (end - now) / Math.min(0.65, span / 3));
          alpha = 0.68 * edge * edge * (3 - 2 * edge);
          text = name;
          if (alpha > 0) stats.sectionHint = {name, alpha: round3(alpha)};
        }
      } else if (name) stats.section = name;
      if (!text && cue) {
        const age = Math.min(1, (now - cue.start) / CAPTION_FADE, (cue.end - now) / CAPTION_FADE);
        alpha = 0.66 * (marked ? frameMark.alpha : Math.max(0, age));
        text = cue.text;
        stats.caption = text;
        if (marked) stats.mark = {text, object: cue.cue.object, word: cue.cue.word,
          state: frameMark.state, alpha: round3(alpha), icon: false, line: null, shown: alpha > 0};
      }
      if (options.albumLayout) {
        if (name) {
          context.font = `500 ${geometry.narrow ? 12 : 14}px ${FONT}`;
          context.textAlign = 'left';
          context.textBaseline = 'middle';
          context.fillStyle = 'rgba(235,238,244,.80)';
          const label = quietLabel(name, geometry.width * .62 - info.left, 'albumSection');
          context.fillText(label, info.left, geometry.header / 2 + 3);
        }
        return;
      }
      if (!text || alpha <= 0) return;
      context.font = `500 ${geometry.narrow ? 11 : 12}px ${FONT}`;
      context.textAlign = 'left';
      context.textBaseline = 'top';
      context.fillStyle = rgba([255,255,255], round3(alpha));
      // XML's timed lyric starts at the play line. Leave that horizontal space to it.
      const room = geometry.width * options.playhead - info.left - 12;
      const shown = quietLabel(text, room, 'quietCue');
      if (shown) context.fillText(shown, info.left, info.top + 3);
    }

    function drawInfo(now, stats) {
      const {info, narrow} = geometry;
      if (!info) return;
      const band = info.bottom - info.top;
      const section = sectionAt(now);
      const name = section ? sectionLabel(section) : '';
      if (options.quietText) drawQuietCue(now, section, name, stats);
      else if (name) {
        const arrived = clamp((now - section.start) / (CHORD_OUT + CHORD_IN), 0, 1);
        context.font = `600 ${clamp(band * 0.24, 13, 19)}px ${FONT}`;
        context.textAlign = 'left';
        context.textBaseline = 'top';
        context.fillStyle = rgba(mix(section.hue, 0.5), (0.35 + 0.6 * arrived).toFixed(3));
        context.fillText(name, info.left, info.top + 3);
        stats.section = name;
      }
      if (!options.quietText && options.showCaptions) drawCaption(now, stats, name ? clamp(band * 0.24, 13, 19) + 9 : 2);
      const chords = chordsFor(options.chordSmoothing);
      const index = startedBy(chords, now, chord => chord[0]);
      if (index < 0 || now >= chords[index][1]) return;
      const chord = chords[index];
      // No "和弦" tag beside it any more (PRESETS-SPEC.md §8): the name says what it is.
      // The name changes over a moment centred on the change: the old chord dims out just
      // before it and the new one comes up just after. There are never two names at once,
      // so a frame caught mid-change (a pause, a screenshot) shows one dimmed chord, not
      // two on top of each other. A chord next to silence has nothing to change with.
      const next = chords[index + 1];
      const leaving = next && Math.abs(next[0] - chord[1]) < 0.05 ? clamp((chord[1] - now) / CHORD_OUT, 0, 1) : 1;
      const follows = index > 0 && Math.abs(chords[index - 1][1] - chord[0]) < 0.05;
      const arriving = follows ? clamp((now - chord[0]) / CHORD_IN, 0, 1) : 1;
      const shown = Math.min(leaving, arriving);
      drawChord(chord, shown * shown * (3 - 2 * shown), 4 * (1 - arriving));
      stats.chord = chord[2];
    }

    // A name that fits a block of the section bar: the whole name, then without its number,
    // then its first character, then nothing.
    function fitName(name, room) {
      for (const candidate of [name, name.replace(/\s*\d+$/, ''), name.slice(0, 1)]) {
        if (candidate && context.measureText(candidate).width + 7 <= room) return candidate;
      }
      return '';
    }

    // The section bar at the foot: the whole song left to right, one block per section,
    // the one being played lit, and a marker where the song is.
    function drawSections(now, stats) {
      const {bar} = geometry;
      if (!bar) return;
      const total = prepared.track.duration || 1;
      const span = bar.right - bar.left, height = bar.bottom - bar.top;
      const xAt = time => bar.left + clamp(time / total, 0, 1) * span;
      if (options.quietText) {
        const middle = Math.round((bar.top + bar.bottom) / 2);
        for (const section of prepared.sections) {
          const from = xAt(section.start), to = xAt(section.end);
          const on = now >= section.start && now < section.end;
          const thick = options.sectionStyle === 'block' ? (on ? 9 : 6) : (on ? 4 : 2);
          context.fillStyle = on ? 'rgba(255,255,255,0.71)' : 'rgba(255,255,255,0.27)';
          context.fillRect(from + 1, middle - thick / 2, Math.max(1, to - from - 2), thick);
        }
        stats.sectionNames = [];
      } else if (options.sectionStyle === 'line') drawSectionLines(now, xAt, stats);
      else drawSectionBlocks(now, xAt, span, height);
      if (options.loop) {
        // The stretch being repeated: a bright frame around it on the bar.
        const left = xAt(options.loop[0]), right = xAt(options.loop[1]);
        context.strokeStyle = 'rgba(255,255,255,0.95)';
        context.lineWidth = 1.5;
        context.strokeRect(left + 0.75, bar.top - 1.25, Math.max(2, right - left - 3), height + 2.5);
      }
      const x = xAt(now);
      context.fillStyle = 'rgba(255,255,255,0.92)';
      context.fillRect(bar.left, bar.bottom + 2, Math.max(0, x - bar.left), 2);
      context.fillRect(x - 1, bar.top - 3, 2, height + 7);
    }

    // 'line': each section a thin line in its colour along the top of the bar, with a gap to
    // the next, and its name under it in plain light type. The section being played is a
    // thicker, brighter line with a brighter name; sections gone by are a little dimmer
    // than those to come. A name that does not fit under its own line is not written at all
    // (never cut to half a word), except the current one's, which is always written; a
    // neighbour's name it would run into steps aside.
    const SECTION_LINE = Object.freeze({thin: 2.5, thick: 5, gap: 3, pad: 3});
    function drawSectionLines(now, xAt, stats) {
      const {bar, narrow} = geometry;
      const lineY = bar.top + 4.5, textY = (lineY + 4 + bar.bottom) / 2;
      context.font = `400 ${narrow ? 9.5 : 11}px ${FONT}`;
      context.textAlign = 'left';
      context.textBaseline = 'middle';
      context.save();
      context.lineCap = 'round';
      const placed = [];
      let currentName = null;
      for (const section of prepared.sections) {
        const left = xAt(section.start), right = xAt(section.end);
        const current = now >= section.start && now < section.end, played = now >= section.end;
        const from = left + SECTION_LINE.gap / 2 + SECTION_LINE.thin / 2, to = Math.max(from, right - SECTION_LINE.gap / 2 - SECTION_LINE.thin / 2);
        context.strokeStyle = rgba(section.hue, current ? 1 : played ? 0.42 : 0.62);
        context.lineWidth = current ? SECTION_LINE.thick : SECTION_LINE.thin;
        context.beginPath();
        context.moveTo(from, lineY);
        context.lineTo(to, lineY);
        context.stroke();
        const name = sectionLabel(section);
        if (!name) continue;
        const wide = context.measureText(name).width;
        if (current) {
          // Always written; kept inside the bar.
          const at = clamp(left + SECTION_LINE.pad, bar.left, bar.right - wide);
          currentName = {name, at, end: at + wide};
        } else if (wide + SECTION_LINE.pad * 2 <= right - left) {
          placed.push({name, at: left + SECTION_LINE.pad, end: left + SECTION_LINE.pad + wide, played});
        }
      }
      context.restore();
      const shown = [];
      for (const item of placed) {
        if (currentName && item.end + 4 > currentName.at && item.at < currentName.end + 4) continue;
        context.fillStyle = item.played ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.56)';
        context.fillText(item.name, item.at, textY);
        shown.push(item.name);
      }
      if (currentName) {
        context.fillStyle = 'rgba(255,255,255,0.95)';
        context.fillText(currentName.name, currentName.at, textY);
        shown.push(currentName.name);
      }
      stats.sectionNames = shown;
    }

    // 'block': one filled block per section with its name on it, shortened to fit.
    function drawSectionBlocks(now, xAt, span, height) {
      const {bar, narrow} = geometry;
      fillBars([bar.left, bar.top, span, height], 'rgba(255,255,255,0.05)', 3);
      context.font = `600 ${narrow ? 9.5 : 11}px ${FONT}`;
      context.textAlign = 'left';
      context.textBaseline = 'middle';
      for (const section of prepared.sections) {
        const left = xAt(section.start), width = Math.max(1, xAt(section.end) - left - 1.5);
        const current = now >= section.start && now < section.end, played = now >= section.end;
        fillBars([left, bar.top, width, height], rgba(section.hue, current ? 0.66 : played ? 0.3 : 0.17), 3);
        const name = fitName(sectionLabel(section), width);
        if (name) {
          context.fillStyle = current ? 'rgba(255,255,255,0.98)' : played ? 'rgba(255,255,255,0.62)' : 'rgba(255,255,255,0.45)';
          context.fillText(name, left + 4, bar.top + height / 2 + 0.5);
        }
      }
    }

    // The sung pitch itself, frame by frame, over the note bars: where the voice slides,
    // wobbles or sits between two notes, the bars cannot say so and this line can. It is
    // not clamped to the lane's range the way notes are, so a stretch an octave out shows
    // as a line leaving the lane instead of being folded back in.
    function drawContour(box, now, line, pps, stats) {
      const {lane} = box, contour = lane.contour;
      const hop = contour.hop, origin = finite(contour.start) ? contour.start : 0, values = contour.midi;
      const left = now - line / pps, right = now + (size.width - line) / pps;
      const first = Math.max(0, Math.floor((left - origin) / hop));
      const last = Math.min(values.length - 1, Math.ceil((right - origin) / hop));
      const stride = Math.max(1, Math.floor(0.5 / (hop * pps)));       // about two points a pixel
      context.lineWidth = 1.3;
      for (const past of [true, false]) {
        context.strokeStyle = past ? rgba(lane.lit, 0.95) : rgba(lane.color, 0.5);
        context.beginPath();
        let pen = false;
        for (let i = first; i <= last; i += stride) {
          const value = values[i], time = origin + i * hop;
          if (!finite(value) || (time <= now) !== past) { pen = false; continue; }
          const x = line + (time - now) * pps;
          const y = clamp(box.bottom - (value - lane.range.low + 0.5) * box.semitone, box.top - 9, box.bottom + 9);
          if (pen) context.lineTo(x, y); else context.moveTo(x, y);
          pen = true;
          stats.contour++;
        }
        context.stroke();
      }
    }

    // The ruler over the lanes. On a steady grid: a faint line through every lane at each
    // bar, with its number. Otherwise seconds, as ticks and times, and no lines through
    // the lanes: a line there would look like a bar line, and nothing says where the bars are.
    function drawRuler(now, line, pps, stats) {
      const {ruler, bottom, narrow} = geometry;
      if (!ruler) return;
      const left = now - line / pps, right = now + (size.width - line) / pps;
      const middle = (ruler.top + ruler.bottom) / 2;
      const rulerFont = options.quietText ? (narrow ? 10 : 11) : (narrow ? 8.5 : 9.5);
      context.font = `500 ${rulerFont}px ${FONT}`;
      context.textAlign = 'left';
      context.textBaseline = 'middle';
      context.fillStyle = 'rgba(255,255,255,0.5)';
      context.lineWidth = 1;
      const bars = prepared.downbeats;
      if (bars.length) {
        const started = lowerBound(bars, bars.length, now + 1e-9);
        stats.bar = started > 0 ? started : null;
        // Where bars are packed tighter than their numbers, number every second or fourth.
        const typical = bars.length > 1 ? (bars[bars.length - 1] - bars[0]) / (bars.length - 1) : 1;
        const every = options.quietText ? ([1, 2, 4, 8, 16, 32].find(n => n * typical * pps >= 90) || 32)
          : typical * pps >= 24 ? 1 : typical * pps >= 12 ? 2 : 4;
        context.strokeStyle = 'rgba(255,255,255,0.1)';
        context.beginPath();
        for (let i = lowerBound(bars, bars.length, left); i < bars.length && bars[i] < right; i++) {
          const x = Math.round(line + (bars[i] - now) * pps) + 0.5;
          context.moveTo(x, ruler.top);
          context.lineTo(x, bottom);
          if (i % every === 0) context.fillText(String(i + 1), x + 3, middle);
        }
        context.stroke();
        return;
      }
      const step = [1, 2, 5, 10, 15, 30, 60].find(seconds => seconds * pps >= (options.quietText ? 90 : 46)) || 60;
      context.strokeStyle = 'rgba(255,255,255,0.22)';
      context.beginPath();
      for (let second = Math.max(0, Math.ceil(left)); second < right; second++) {
        if (pps < 6 && second % step) continue;
        const x = Math.round(line + (second - now) * pps) + 0.5;
        const labelled = second % step === 0;
        context.moveTo(x, labelled ? ruler.top : middle);
        context.lineTo(x, ruler.bottom);
        if (labelled) context.fillText(`${Math.floor(second / 60)}:${String(second % 60).padStart(2, '0')}`, x + 3, middle);
      }
      context.stroke();
    }

    // --- effects (step one: the notes are seen being played) -----------------
    //
    // Each effect only adds light where the music is: it never moves, hides or recolours
    // what the frame already shows, and it is over within a fraction of a second. Their
    // strength follows the note's velocity; their timing is the song's time.

    const round3 = value => Math.round(value * 1000) / 1000;
    const velocityOf = vel => 0.35 + 0.65 * vel / 127;
    // A fixed scatter for sparks: the same hit throws the same sparks in every frame.
    const scatter = seed => { const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453; return value - Math.floor(value); };

    // Every area an effect lights stops at the section bar's top edge: a halo or a snare flash on
    // the lowest lane, or a spark flying down, is cut off there and never lights the bar
    // (work/score-dynamics-20261114/SPEC.md, the main session's second round). Anything that ends
    // above the bar is drawn with exactly the numbers it had before.
    // With the texture band under the drums, they stop at the drums' own foot instead: no effect lights the band.
    function fillEffect(x, y, width, height) {
      const band = geometry.texture;
      const floor = band && band.at === 'below' ? band.top - TEXTURE.gap : geometry.bar ? geometry.bar.top : size.height;
      if (y + height <= floor) context.fillRect(x, y, width, height);
      else if (floor > y) context.fillRect(x, y, width, floor - y);
    }

    // What this frame's effects are, or null when nothing is to be added: then the frame is
    // drawn exactly as before the effects existed.
    function effectsFor(now) {
      const preset = FX_PRESETS[options.fxPreset];
      if (!preset) return null;
      const on = {hit: options.fxHit, afterglow: options.fxAfterglow, playline: options.fxPlayline, drums: options.fxDrums};
      if (!on.hit && !on.afterglow && !on.playline && !on.drums) return null;
      const stats = {level: options.effects, preset: options.fxPreset, halos: [], afterglow: 0, shimmer: 0, lit: 0, litWidest: 0, column: null, pulse: 0,
                     breathe: 0, snare: 0, sparks: 0, hitSparks: 0, sounding: 0, burnt: 0};
      if (options.fxDynamics !== 'song') return {on, level: preset, stats};
      // The amounts follow the song's rise and fall; the frame says where on it this moment is.
      const swell = swellAt(now);
      const level = swelled(preset, swell);
      stats.swell = round3(swell);
      stats.amounts = Object.fromEntries(Object.keys(SWELL_QUIET).map(key => [key, Math.round(level[key] * 10000) / 10000]));
      return {on, level, stats};
    }

    // The song's rise and fall at a moment (0..1), read off the curve made with the model.
    function swellAt(time) {
      const curve = prepared.swell;
      if (!curve || !finite(time)) return 0.5;
      const at = clamp(time / curve.hop, 0, curve.values.length - 1);
      const low = Math.floor(at), high = Math.min(curve.values.length - 1, low + 1);
      return curve.values[low] + (curve.values[high] - curve.values[low]) * (at - low);
    }

    // One note, while the lane is being walked: which effects it takes part in this frame.
    function noteEffects(extra, i, x, y, width, start, end, now, line) {
      const {on, level} = frameFx, set = extra.set;
      // S1: its head has just reached the line.
      if (on.hit && (level.halo > 0 || level.hitSparks > 0) && start <= now && now - start < level.haloLife) {
        extra.halos.push(y, now - start, set.vel[i], set.pitch[i], x, width, i);
      }
      if (on.afterglow) {
        // S2: played a moment ago, still dimming.
        if (!options.releaseFocus && end <= now && now - end < level.afterglow) extra.glow.push(x, y, width, 1 - (now - end) / level.afterglow);
        // S2: held across the line, long enough to be a held note.
        else if (start <= now && end > now && end - start >= FX.shimmerFrom) extra.shimmer.push(x, y, width, start);
        // S2: sounding right now, lifted.
        if (level.sound > 0 && start <= now && end > now) extra.sound.push(x, y, width, extra.thickness);
        // S2: gone by, dimmed toward the ground, as far as the afterglow has let go of it.
        if (level.burn > 0 && end <= now) {
          const done = Math.min(1, (now - end) / level.afterglow);
          if (done >= 1) extra.burnt.push(x, y, width, extra.thickness);
          else extra.burning.push(x, y, width, done);
        }
      }
      // S3: about to reach the line, its head inside the column of light.
      if (on.playline && level.near > 0 && start > now && x - line < level.columnHalf) extra.near.push(x, y, width);
    }

    function drawNoteEffects(extra, box, line, now, radius) {
      const {lane} = box, {level, stats} = frameFx, thickness = extra.thickness;
      // A played note dimmed toward the ground (only 'keys' does this): under every light below.
      if (extra.burnt.length || extra.burning.length) {
        fillBars(extra.burnt, rgba(BACKGROUND_RGB, level.burn), radius);
        for (let i = 0; i < extra.burning.length; i += 4) {
          fillBars([extra.burning[i], extra.burning[i + 1], extra.burning[i + 2], thickness],
            rgba(BACKGROUND_RGB, round3(level.burn * extra.burning[i + 3])), radius);
        }
        stats.burnt += (extra.burnt.length + extra.burning.length) / 4;
      }
      // Only the stretch of the note inside the column is lit, brightest at the line and
      // fading to nothing at the column's edges, so a long note is lit at its head alone.
      for (let i = 0; i < extra.near.length; i += 3) {
        const half = level.columnHalf, x = extra.near[i];
        const from = Math.max(x, line - half), to = Math.min(x + extra.near[i + 2], line + half);
        if (to <= from) continue;
        const light = context.createLinearGradient(line - half, 0, line + half, 0);
        light.addColorStop(0, rgba(lane.lit, 0));
        light.addColorStop(0.5, rgba(lane.lit, level.near));
        light.addColorStop(1, rgba(lane.lit, 0));
        context.fillStyle = light;
        context.fillRect(from, extra.near[i + 1], to - from, thickness);
        stats.lit++;
        stats.litWidest = Math.max(stats.litWidest, round3(to - from));
      }
      for (let i = 0; i < extra.glow.length; i += 4) {
        // Eased, so the note lets go of the light slowly at first.
        const left = extra.glow[i + 3];
        fillBars([extra.glow[i], extra.glow[i + 1], extra.glow[i + 2], thickness], rgba(lane.lit, round3(level.light * left * left)), radius);
        stats.afterglow++;
      }
      // A sounding note lifted toward white (only 'ink' does this).
      if (extra.sound.length) {
        fillBars(extra.sound, `rgba(255,255,255,${level.sound})`, radius);
        stats.sounding += extra.sound.length / 4;
      }
      if (!extra.shimmer.length && !extra.halos.length) return;
      context.save();
      context.globalCompositeOperation = 'lighter';
      for (let i = 0; i < extra.shimmer.length; i += 4) {
        const x = extra.shimmer[i], y = extra.shimmer[i + 1], width = extra.shimmer[i + 2];
        const phase = ((now - extra.shimmer[i + 3]) / FX.shimmerPeriod) % 1;
        const at = x + phase * width, reach = clamp(width * 0.12, 8, 28);
        const from = Math.max(x, at - reach), to = Math.min(x + width, at + reach);
        if (to <= from) continue;
        const band = context.createLinearGradient(at - reach, 0, at + reach, 0);
        band.addColorStop(0, 'rgba(255,255,255,0)');
        band.addColorStop(0.5, `rgba(255,255,255,${level.shimmer})`);
        band.addColorStop(1, 'rgba(255,255,255,0)');
        context.fillStyle = band;
        context.fillRect(from, y, to - from, thickness);
        stats.shimmer++;
      }
      for (let i = 0; i < extra.halos.length; i += 7) {
        const centre = extra.halos[i] + thickness / 2, age = extra.halos[i + 1] / level.haloLife;
        const strength = round3(level.halo * velocityOf(extra.halos[i + 2]) * (1 - age) * (1 - age));
        // Sparks thrown off the line where the note meets it (only 'keys' does this).
        if (level.hitSparks > 0) {
          const seed = extra.halos[i + 6], loud = velocityOf(extra.halos[i + 2]);
          context.fillStyle = rgba(lane.lit, round3((1 - age) * loud));
          for (let n = 0; n < level.hitSparks; n++) {
            const angle = (scatter(seed * 29 + n) - 0.5) * Math.PI * 1.4 - Math.PI / 2, speed = 20 + 40 * scatter(seed * 13 + n * 7 + 1);
            const travel = speed * level.haloLife * (1 - (1 - age) * (1 - age));
            fillEffect(line + Math.cos(angle) * travel - 0.8, centre + Math.sin(angle) * travel - 0.8, 1.6, 1.6);
            stats.hitSparks++;
          }
        }
        // The note itself flares, then a ring opens on the line at its pitch.
        fillBars([extra.halos[i + 4], extra.halos[i], extra.halos[i + 5], thickness], `rgba(255,255,255,${round3(strength * 0.8)})`, radius);
        const reach = (thickness * 1.2 + 14 * (0.35 + 0.65 * age)) * level.haloReach;
        const ring = context.createRadialGradient(line, centre, 0, line, centre, reach);
        ring.addColorStop(0, rgba(lane.lit, round3(strength * 0.5)));
        ring.addColorStop(0.55, `rgba(255,255,255,${strength})`);
        ring.addColorStop(1, rgba(lane.lit, 0));
        context.fillStyle = ring;
        fillEffect(line - reach, centre - reach, reach * 2, reach * 2);
        stats.halos.push({lane: lane.id, pitch: extra.halos[i + 3], y: round3(centre), strength, reach: round3(reach)});
      }
      context.restore();
    }

    // S3: a soft column of light around the play line, behind the notes. On a song with a
    // steady bar grid it widens and brightens for a moment on every downbeat.
    function drawColumn(now, line) {
      const {level, stats} = frameFx, {top, bottom} = geometry;
      const bars = prepared.downbeats;
      const index = bars.length ? lowerBound(bars, bars.length, now + 1e-9) - 1 : -1;
      const pulse = index >= 0 && level.pulse > 0 ? clamp(1 - (now - bars[index]) / FX.pulseLife, 0, 1) : 0;
      const half = level.columnHalf + 6 * pulse, peak = level.column * (1 + level.pulse * pulse);
      const column = context.createLinearGradient(line - half, 0, line + half, 0);
      column.addColorStop(0, 'rgba(255,255,255,0)');
      column.addColorStop(0.5, `rgba(255,255,255,${round3(peak)})`);
      column.addColorStop(1, 'rgba(255,255,255,0)');
      context.fillStyle = column;
      fillEffect(line - half, top - 7, half * 2, bottom - top + 11);
      stats.column = {half: round3(half), peak: round3(peak)};
      stats.pulse = round3(pulse);
    }

    // S4, kick: the background brightens a little and falls back. Only the ground under the
    // picture is lifted; nothing is scaled or moved. Since 0.11.0 only the lanes' area: the
    // captions at the top and the section bar stay exactly as with the effects off
    // (work/score-export-20261114/SPEC.md B7), and the whole frame no longer flickers.
    function drawBreath(now) {
      const {level, stats} = frameFx;
      let lift = 0;
      for (const box of geometry.lanes) {
        const lane = box.lane;
        if (lane.kind !== 'drums') continue;
        const hits = lane.hits, fired = firedHits(lane, level.accentGap);
        for (let i = lowerBound(hits.time, hits.count, now - FX.breatheLife); i < hits.count && hits.time[i] <= now; i++) {
          if (lane.rowNames[hits.row[i]] !== 'kick' || !fired[i]) continue;
          lift = Math.max(lift, level.breathe * hits.vel[i] / 127 * (1 - (now - hits.time[i]) / FX.breatheLife));
        }
      }
      stats.breathe = Math.round(lift * 10000) / 10000;
      if (lift <= 0) return;
      const {top, bottom} = geometry.area;
      if (bottom <= top) return;
      context.fillStyle = `rgba(255,255,255,${stats.breathe})`;
      context.fillRect(0, top, size.width, bottom - top);
    }

    // S4, snare and cymbals: a short flash where a snare hit sits, fine sparks off a hat or
    // a cymbal. The drum dots themselves are drawn as before.
    function drawDrumEffects(strikes, box, now) {
      const {lane} = box, {level, stats} = frameFx, hits = lane.hits, fired = firedHits(lane, level.accentGap);
      const spark = mix(lane.color, 0.6);
      context.save();
      context.globalCompositeOperation = 'lighter';
      for (let k = 0; k < strikes.length; k += 3) {
        const i = strikes[k], x = strikes[k + 1], y = strikes[k + 2];
        const name = lane.rowNames[hits.row[i]], age = now - hits.time[i], loud = hits.vel[i] / 127;
        if (name === 'snare' && age < FX.snareLife) {
          if (level.snare <= 0 || !fired[i]) continue;
          const left = 1 - age / FX.snareLife, strength = round3(level.snare * loud * left * left);
          const reach = Math.max(22, box.rowHeight * 3) * (1 + 0.3 * age / FX.snareLife);
          const flash = context.createRadialGradient(x, y, 0, x, y, reach);
          flash.addColorStop(0, `rgba(255,255,255,${strength})`);
          flash.addColorStop(1, rgba(lane.lit, 0));
          context.fillStyle = flash;
          fillEffect(x - reach, y - reach, reach * 2, reach * 2);
          stats.snare = Math.max(stats.snare, strength);
        } else if (CYMBALS.includes(name)) {
          const long = name === 'crash' || name === 'openhat';
          const life = FX.sparkLife * (long ? 1.5 : 1);
          if (age >= life) continue;
          const t = age / life, count = level.sparks + (name === 'crash' && level.sparks > 0 ? 3 : 0);
          for (let n = 0; n < count; n++) {
            const angle = scatter(i * 31 + n) * Math.PI * 2, speed = 50 + 90 * scatter(i * 17 + n * 5 + 3);
            const travel = speed * life * (1 - (1 - t) * (1 - t));
            context.fillStyle = rgba(spark, round3((1 - t) * (0.45 + 0.55 * loud)));
            fillEffect(x + Math.cos(angle) * travel - 0.8, y + Math.sin(angle) * travel * 0.6 - 0.8, 1.6, 1.6);
            stats.sparks++;
          }
        }
      }
      context.restore();
    }

    // The texture band: a soft band that scrolls with the notes, as thick and as light as the
    // stems without notes are loud, nothing at all under TEXTURE.floor. No effect reaches it; with
    // fxDynamics 'song' it brightens and dims with the song's rise and fall like everything else.
    function drawTexture(now, line, pps, stats) { if(guidesOnly)return;
      const band = geometry.texture, texture = prepared.texture;
      const middle = (band.top + band.bottom) / 2, width = size.width;
      const amount = time => {
        const at = clamp(time / texture.hop - 0.5, 0, texture.amount.length - 1);
        const low = Math.floor(at), high = Math.min(texture.amount.length - 1, low + 1);
        return texture.amount[low] + (texture.amount[high] - texture.amount[low]) * (at - low);
      };
      // With the swell it dims in the quiet stretches and comes back to its full light at the peaks, never above.
      const swell = options.fxDynamics === 'song' ? 0.75 + 0.25 * swellAt(now) : 1;
      const now0 = amount(now);
      stats.texture = {at: band.at, top: round3(band.top), bottom: round3(band.bottom), now: round3(now0), drawn: 0};
      // The outline, sampled every 3 px: runs where it sounds, each closed on itself.
      const step = 3, count = Math.floor((width + step) / step) + 1;
      // The sample x coordinates are fixed by the layout. Refill numeric storage for each
      // frame, preserving both original edge samples when width is a multiple of three.
      const samples = geometry.textureSamples || (geometry.textureSamples = {
        x: Float64Array.from({length: count}, (_, i) => Math.min(i * step, width)),
        half: new Float64Array(count), start: new Uint32Array(count), end: new Uint32Array(count)
      });
      let runCount = 0, active = false;
      for (let i = 0; i < count; i++) {
        const a = amount(now + (samples.x[i] - line) / pps);
        if (a > 0) {
          if (!active) { samples.start[runCount++] = i; active = true; }
          samples.half[i] = a * TEXTURE.full * band.height / 2;
          samples.end[runCount - 1] = i;
        } else active = false;
      }
      if (!runCount) return;
      // The light along it: one stop per frame of the levels on screen, dimmer ahead of the line.
      // A software-backed band keeps dynamic multi-stop gradients off the display GPU.
      // Crop only in device pixels so path antialiasing keeps its original pixel grid.
      const ratio = size.ratio;
      const topPx = Math.max(0, Math.floor((band.top * ratio - 2) / 8) * 8);
      const bottomPx = Math.min(canvas.height, Math.ceil(band.bottom * ratio) + 2);
      let paint = context, raster = samples.raster;
      if (options.liveTextureRaster && typeof host.OffscreenCanvas === 'function' && bottomPx > topPx) {
        const pixelHeight = bottomPx - topPx;
        if (!raster || raster.canvas.width !== canvas.width || raster.canvas.height !== pixelHeight) {
          const surface = new host.OffscreenCanvas(canvas.width, pixelHeight);
          const cpu = surface.getContext('2d', {willReadFrequently:true});
          raster = samples.raster = cpu ? {canvas:surface, context:cpu} : null;
        }
        if (raster) {
          paint = raster.context;
          paint.setTransform(1,0,0,1,0,0);paint.clearRect(0,0,raster.canvas.width,raster.canvas.height);
          paint.setTransform(ratio,0,0,ratio,0,-topPx);
        }
      }
      const light = paint.createLinearGradient(0, 0, width, 0);
      // textureAdapt, with the cover behind: the band's light from the cover and its veil (else TEXTURE.alpha).
      const picture = options.showBackdrop && options.backdrop === 'cover' ? cover : null;
      const top = options.textureAdapt && picture ? textureLight(veilOf(picture)) : TEXTURE.alpha;
      if (top !== TEXTURE.alpha) stats.texture.light = top;
      const alpha = (a, ahead) => round3(top * (0.35 + 0.65 * a) * swell * (ahead ? TEXTURE.ahead : 1));
      const from = Math.floor((now - line / pps) / texture.hop), to = Math.ceil((now + (width - line) / pps) / texture.hop);
      const stops = [];
      for (let k = from; k <= to; k++) {
        const x = line + ((k + 0.5) * texture.hop - now) * pps;
        if (x > 0 && x < width) stops.push([x / width, alpha(amount((k + 0.5) * texture.hop), x > line)]);
      }
      const at = clamp(line / width, 0, 1);
      if (history) {
        // Extra knots preserve the shared fade even when the stem has sparse loudness samples.
        for (let i=0; i<historyAlpha.length-1; i++) {
          const x=history.left+history.span*i/(historyAlpha.length-1);
          stops.push([x/width,alpha(amount(now+(x-line)/pps),false)]);
        }
      }
      stops.push([at, alpha(now0, false)], [at, alpha(now0, true)]);
      stops.push([0, alpha(amount(now - line / pps), line > 0)], [1, alpha(amount(now + (width - line) / pps), true)]);
      stops.sort((a, b) => a[0] - b[0]);
      for (const [offset, value] of stops) {
        const weight = history && offset<at ? lightAt(offset*width) : 1;
        light.addColorStop(offset, rgba(nightSkyOn() ? NIGHT.milky : texture.color,value*weight));
      }
      // Soft edges: the whole outline faintly, and a core half as thick at the full light.
      const outline = scale => {
        const path = options.drumNotation && typeof host.Path2D === 'function' ? new host.Path2D() : paint;
        if (path === paint) paint.beginPath();
        for (let run = 0; run < runCount; run++) {
          const first = samples.start[run], last = samples.end[run];
          path.moveTo(samples.x[first], middle - samples.half[first] * scale);
          for (let i = first + 1; i <= last; i++) path.lineTo(samples.x[i], middle - samples.half[i] * scale);
          for (let i = last; i >= first; i--) path.lineTo(samples.x[i], middle + samples.half[i] * scale);
          path.closePath();
        }
        if (path === paint) paint.fill(); else paint.fill(path);
      };
      paint.save();
      paint.fillStyle = light;
      if (nightSkyOn()) { paint.globalAlpha = TEXTURE.edge * .45; outline(1.7); }
      paint.globalAlpha = TEXTURE.edge;
      outline(1);
      paint.globalAlpha = 1;
      outline(0.5);
      paint.restore();
      if (paint !== context) {
        context.save();
        context.setTransform(1,0,0,1,0,0);
        context.globalAlpha = 1;
        context.drawImage(raster.canvas,0,topPx);
        context.restore();
      }
      for (let i = 0; i < runCount; i++) stats.texture.drawn += samples.end[i] - samples.start[i] + 1;
    }

    function drawPlayhead(line) {
      const {top, bottom} = geometry;
      if (nightSkyOn()) {
        // A horizon: a still, soft glow with a fine line in it, where the stars are lit. No marker, no pulse.
        const glow = geometry.horizon && geometry.horizon.line === line ? geometry.horizon.fill : null;
        let fill = glow;
        if (!fill) {
          fill = context.createLinearGradient(line - NIGHT.halo, 0, line + NIGHT.halo, 0);
          fill.addColorStop(0, 'rgba(214,224,255,0)'); fill.addColorStop(.5, `rgba(214,224,255,${NIGHT.glow})`); fill.addColorStop(1, 'rgba(214,224,255,0)');
          geometry.horizon = {line, fill};
        }
        context.fillStyle = fill;
        context.fillRect(line - NIGHT.halo, top - 7, 2 * NIGHT.halo, bottom - top + 11);
        context.strokeStyle = `rgba(232,238,255,${NIGHT.line})`;
        context.lineWidth = 1;
        context.beginPath(); context.moveTo(line, top - 7); context.lineTo(line, bottom + 4); context.stroke();
        return;
      }
      context.strokeStyle = 'rgba(255,255,255,0.88)';
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(line, top - 7);
      context.lineTo(line, bottom + 4);
      context.stroke();
      context.fillStyle = 'rgba(255,255,255,0.95)';
      context.beginPath();
      context.arc(line, top - 7, 2.6, 0, Math.PI * 2);
      context.fill();
    }

    // Draw one frame. `at` overrides the clock (tests, and hosts that drive the frame
    // themselves). Returns what the frame held, which is also how the page proves to itself
    // that notes really are passing the line.
    function draw(at, paintVariation) {
      resize();
      currentDisplay();
      if (!geometry) geometry = layout();
      const now = (finite(at) ? at : readClock()) + options.offsetSeconds;
      // Lane heights that follow the loudness are settled again every frame; fixed ones once.
      if (prepared.stretches) {
        if (!options.drumNotation) {
          geometry.lanes = arrange(geometry.placeArea, options.laneHeights === 'loudness' ? sharesAt(now, geometry.area.lanes) : null, geometry.texture);
        } else {
          geometry.frameShares = options.laneHeights === 'loudness' || options.laneLabels === 'icon' ? sharesAt(now, geometry.area.lanes) : null;
          const factors = options.laneHeights === 'loudness' ? geometry.frameShares : null;
          if (factors !== geometry.placedShares || options.laneLabels !== geometry.placedLabels) {
            geometry.lanes = arrange(geometry.placeArea, factors, geometry.texture);
            geometry.placedShares = factors;
            geometry.placedLabels = options.laneLabels;
          }
        }
      }
      const {width, height, ratio} = size;
      const stats = {time: now, lanes: geometry.lanes.length, notes: 0, hits: 0, active: 0, chord: null, section: null, bar: null, contour: 0, caption: null, backdrop: null};
      frameFx = options.meteorMotion ? null : effectsFor(now);
      stats.fx = frameFx ? frameFx.stats : null;
      frameMark = markAt(now);
      if (frameMark) stats.mark = null;
      if (!width || !height) { last = stats; return stats; }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      if(guidesOnly)context.clearRect(0,0,width,height);
      else if(nightSkyOn()){const sky=skyColour();context.fillStyle=rgba(sky,1);context.fillRect(0,0,width,height);stats.backdrop={sky};}
      else{context.fillStyle=BACKGROUND;context.fillRect(0,0,width,height);drawBackdrop(now,stats);}
      stats.heights = Object.fromEntries(geometry.lanes.map(box => [box.lane.id, Math.round(box.height * 100) / 100]));
      const pps = width / options.windowSeconds;
      const line = Math.round(width * options.playhead);
      history = options.meteorMotion ? historyFor(line,pps) : null;
      if (history) stats.skyHistory = history;
      if (frameFx && frameFx.on.drums && !options.drumNotation) drawBreath(now);
      if (frameFx && frameFx.on.playline) drawColumn(now, line);
      if (options.spacedLanes) {
        context.fillStyle = 'rgba(255,255,255,0.028)';
        if (typeof host.Path2D === 'function') {
          if (geometry.bandLanes !== geometry.lanes) {
            const bands = new host.Path2D();
            for (const box of geometry.lanes) bands.rect(0, box.top, width, box.height);
            geometry.bandPath = bands;
            geometry.bandLanes = geometry.lanes;
          }
          context.fill(geometry.bandPath);
        } else {
          context.beginPath();
          for (const box of geometry.lanes) context.rect(0, box.top, width, box.height);
          context.fill();
        }
      }
      drawAllGuides();
      drawRuler(now, line, pps, stats);
      if (!guidesOnly && typeof paintVariation === 'function') {
        stats.variation = paintVariation(context, {time: now, width, height, needle: line, pixelsPerSecond: pps,
          geometry, parts: box => skyParts(box.lane), yAt: pitchY, contourYAt: contourY, left: history?.left,
          drumYAt: options.drumNotation ? (box, row) => box.top + box.height / 8 * notationRows(box.lane)[row]?.center : undefined});
      }
      for (const box of geometry.lanes) {
        if (box.lane.kind === 'drums') {
          if (options.spacedLanes) clipContents(box);
          drawDrums(box, now, line, pps, stats);
          if (options.spacedLanes) context.restore();
        } else drawPitched(box, now, line, pps, stats);
      }
      if (geometry.texture) drawTexture(now, line, pps, stats);
      // One lane listened to alone: the others step back. A group that is not on screen dims nothing.
      stats.focus = null;
      const band = geometry.texture;
      if (!guidesOnly && options.focusGroup && (geometry.lanes.some(box => groupOf(box.lane) === options.focusGroup) || (band && prepared.texture.group === options.focusGroup))) {
        stats.focus = options.focusGroup;
        context.fillStyle = rgba(nightSkyOn() ? skyColour() : BACKGROUND_RGB, FOCUS_VEIL);
        for (const box of geometry.lanes) {
          if (groupOf(box.lane) !== options.focusGroup) context.fillRect(0, box.top, width, box.height);
        }
        if (band && prepared.texture.group !== options.focusGroup) context.fillRect(0, band.top, width, band.height);
      }
      drawEdges(stats);
      drawPlayhead(line);
      if (!options.albumLayout) drawHeader();
      drawInfo(now, stats);
      drawSections(now, stats);
      stats.loop = options.loop && geometry.bar ? options.loop.slice() : null;
      last = stats;
      return stats;
    }

    // What is under a point of the canvas (CSS pixels), for a host that makes the score
    // touchable. Only the section bar answers so far: `{kind: 'section', time, ...}` with
    // the time that section starts, or `{kind: 'bar', time}` for a spot between sections.
    function hit(x, y) {
      if (!geometry) return null;
      const {bar} = geometry;
      if (!bar || y < bar.top - 6 || y > bar.bottom + 8 || x < bar.left - 4 || x > bar.right + 4) {
        // A lane answers with its group, which is what a host can listen to alone.
        const band = geometry.texture;
        if (band && y >= band.top - TEXTURE.gap / 2 && y < band.bottom + TEXTURE.gap / 2 && x >= 0 && x <= size.width) {
          return {kind: 'lane', id: prepared.texture.id, group: prepared.texture.group, label: prepared.texture.label, texture: true};
        }
        const box = geometry.lanes.find(item => y >= item.top && y < item.bottom);
        return box && x >= 0 && x <= size.width ? {kind: 'lane', id: box.lane.id, group: groupOf(box.lane), label: box.lane.label} : null;
      }
      const time = clamp((x - bar.left) / (bar.right - bar.left), 0, 1) * prepared.track.duration;
      const section = sectionAt(time);
      return section
        ? {kind: 'section', time: section.start, end: section.end, name: sectionLabel(section) || section.name,
           index: prepared.sections.indexOf(section)}
        : {kind: 'bar', time};
    }

    // How many chord segments each smoothing setting leaves, so a host can say what a
    // setting does on this song before anyone picks it.
    const chordCounts = () => Object.fromEntries(Object.keys(CHORD_SMOOTHING).map(key => [key, chordsFor(key).length]));

    function start() {
      if (frame !== null || typeof host.requestAnimationFrame !== 'function') return;
      const tick = () => { frame = host.requestAnimationFrame(tick); draw(); };
      frame = host.requestAnimationFrame(tick);
    }

    function stop() {
      if (frame !== null && typeof host.cancelAnimationFrame === 'function') host.cancelAnimationFrame(frame);
      frame = null;
    }

    // The lanes as currently shown, for a host's lane switches. `members` are the model
    // lane ids behind an entry: one in split view, a stem's timbre tracks in merged view.
    function lanes() {
      return currentDisplay().map(lane => ({
        id: lane.id, label: lane.label, kind: lane.kind, group: lane.group, members: lane.members.slice(),
        visible: lane.visible, color: toHex(lane.color), count: lane.count, shown: lane.shown,
        removed: lane.removed ? {...lane.removed} : null,
        rows: lane.kind === 'drums' ? lane.rows.map(item => item.name) : null
      }));
    }

    // What the model carries, and which of it this version draws.
    const layers = () => ({
      version: VERSION, drawn: DRAWN_LAYERS.slice(), lanes: prepared.lanes.length,
      skippedLanes: prepared.skipped.slice(), beatSeconds: prepared.beat, ...prepared.has
    });

    // Screen x of a model time and back, for hosts that let the user drag the score.
    const pixelsPerSecond = () => (size.width || 1) / options.windowSeconds;
    const xOf = (time, at) => size.width * options.playhead +
      (time - ((finite(at) ? at : readClock()) + options.offsetSeconds)) * pixelsPerSecond();
    const timeAt = (x, at) => (finite(at) ? at : readClock()) + options.offsetSeconds +
      (x - size.width * options.playhead) / pixelsPerSecond();

    setOptions(initial);
    resize();
    return {
      // Read-only prepared geometry for the material painters; the normal draw path is unchanged.
      layoutSnapshot() {
        if (!geometry) return null;
        return {
          width:size.width, height:size.height,
          needle:Math.round(size.width*options.playhead),
          pixelsPerSecond:size.width/options.windowSeconds,
          lanes:geometry.lanes.map(box=>({id:box.lane.id,top:box.top,bottom:box.bottom,
            low:box.lane.range?.low,semitone:box.semitone})),
          ruler:geometry.ruler, bar:geometry.bar
        };
      },
      materialFrame(at, material) {
        const icons = material === 'ember' || material === 'water' || material === 'mist' ? [] : null;
        guidesOnly = true;
        materialIcons = icons;
        try {
          const frame = draw(at);
          const paintLabels = (paint, unit, top) => {
            if (!icons?.length) return;
            paint.save();
            paint.setTransform(unit, 0, 0, unit, 0, top);
            for (const icon of icons) drawIcon(...icon, 1, paint, material);
            paint.restore();
          };
          return {frame, geometry, parts: box => skyParts(box.lane), yAt: pitchY, contourYAt: contourY, paintLabels};
        } finally {
          guidesOnly = false;
          materialIcons = null;
        }
      },
      draw, start, stop, resize, setOptions, options: getOptions, setModel, setCover, lanes, layers, xOf, timeAt, hit, chordCounts,
      duration: () => prepared.track.duration, lastFrame: () => ({...last}), destroy: stop,
      // The song's rise and fall: its value at a time, and the whole curve (for a host's own plot).
      swellAt: time => swellAt(time),
      // The texture band's levels and how thick each frame is drawn (for a host's own plot), or null.
      texture: () => (prepared.texture ? {hop: prepared.texture.hop, db: Array.from(prepared.texture.db), amount: Array.from(prepared.texture.amount),
        low: prepared.texture.low, high: prepared.texture.high, range: prepared.texture.range, squeeze: prepared.texture.squeeze, members: prepared.texture.members.slice()} : null),
      swell: () => (prepared.swell ? {...prepared.swell, values: Array.from(prepared.swell.values), sounding: prepared.swell.sounding.slice()} : null)
    };
  }

  return Object.freeze({
    create, swellOf, canonicalOnsets, simplifyNotes,
    SHORT_NOTE, NIGHT,
    drumKit: Object.freeze({gaps: kitGaps, rows: DRUM_KIT.rows, center: kitCenter, size: kitSize, mark: kitMark, row: kitRow}), drumAccents, smoothChords, toneNames, noteName, transientTiming, CONTRACT, VERSION,
    DEFAULTS, SIMPLIFY, STRUCK_GROUPS, DRUM_ACCENT, CHORD_SMOOTHING, DRAWN_LAYERS, FX_PRESETS, SWELL, SWELL_QUIET, TEXTURE, ROLES, SHAPES, SHAPE_BY_GROUP, SPINDLE, SPINDLE_GROUPS, STRANDS, PITCH_WEIGHT, WEIGHT_GROUPS, pitchWeightOf, erbSemitones,
    COVER_ADAPT, TEXTURE_ADAPT, measureCover, GROUP_COLORS: Object.freeze({...GROUP_COLORS}),
    // Checks a model the way `create` would, without a canvas.
    inspect: model => { const p = prepare(model); return {track: p.track, lanes: p.lanes.length, skipped: p.skipped, ...p.has}; }
  });
});
