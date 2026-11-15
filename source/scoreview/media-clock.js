// Media clock: "what second of the song is sounding now", smooth enough to scroll a score by.
//
//   const clock = XinMediaClock.create(audioElement, {offset: model.audio.offset});
//   XinScoreView.create(canvas, model, clock);
//
// A host helper, not part of the render core: a host with its own transport (XML) hands
// the core its own clock and never loads this file.
//
// `timeupdate` fires about four times a second, and some browsers refresh
// `audio.currentTime` itself no more often than that, so drawing straight from it makes the
// score move in steps. Between refreshes this clock runs on the wall clock
// (`performance.now()`), and every time the element reports a new position it is pulled
// toward it. Three rules keep that honest:
//
// * It only ever starts running from a reading that has just changed. After play, a seek
//   or a stall the element can sit on one position for a tenth of a second or more while
//   audio is not yet coming out; running the wall clock through that would put the score
//   ahead of the sound.
// * A stale reading (the same value as last frame) carries no news and is ignored rather
//   than averaged in, which would drag the clock late by half a refresh interval.
// * A reading far from where the clock thinks it is means a seek or a stall, and the clock
//   jumps there instead of gliding.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XinMediaClock = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const JUMP_SECONDS = 0.15;   // further off than this is a seek, not drift
  const PULL = 0.12;           // share of the error taken up at each fresh reading
  const EVENTS = ['play', 'playing', 'pause', 'seeking', 'seeked', 'ratechange', 'waiting', 'stalled', 'ended', 'emptied'];

  function create(audio, settings) {
    const config = settings || {};
    const host = typeof globalThis !== 'undefined' ? globalThis : {};
    const wall = typeof config.now === 'function' ? config.now : () => host.performance.now();
    const offset = Number.isFinite(config.offset) ? config.offset : 0;
    let anchorMedia = 0, anchorWall = 0, lastSeen = NaN, running = false;
    let corrections = 0, jumps = 0, worst = 0;

    const steady = () => !audio.paused && !audio.seeking && !audio.ended && audio.readyState >= 3;

    function now() {
      const media = audio.currentTime;
      if (!steady()) {
        running = false;
        lastSeen = media;
        return media - offset;
      }
      if (!running) {
        // Wait for the position to move before trusting the wall clock.
        if (Number.isNaN(lastSeen) || media === lastSeen) { lastSeen = media; return media - offset; }
        anchorMedia = media; anchorWall = wall(); lastSeen = media; running = true;
        return media - offset;
      }
      const rate = audio.playbackRate || 1;
      let predicted = anchorMedia + (wall() - anchorWall) / 1000 * rate;
      if (media !== lastSeen) {
        lastSeen = media;
        const error = media - predicted;
        if (Math.abs(error) > JUMP_SECONDS) {
          anchorMedia = media; anchorWall = wall(); jumps++;
          return media - offset;
        }
        anchorMedia += error * PULL;
        predicted += error * PULL;
        corrections++;
        if (Math.abs(error) > worst) worst = Math.abs(error);
      }
      return predicted - offset;
    }

    const interrupt = () => { running = false; lastSeen = NaN; };
    if (typeof audio.addEventListener === 'function') for (const name of EVENTS) audio.addEventListener(name, interrupt);

    return {
      now,
      playing: steady,
      // How hard the clock has had to work since the last call: how many fresh readings it
      // absorbed, how many times it had to jump, and the largest drift it corrected.
      health() {
        const report = {corrections, jumps, worstDriftMs: Math.round(worst * 1000 * 10) / 10};
        corrections = 0; jumps = 0; worst = 0;
        return report;
      },
      destroy() {
        if (typeof audio.removeEventListener === 'function') for (const name of EVENTS) audio.removeEventListener(name, interrupt);
      }
    };
  }

  return Object.freeze({create, JUMP_SECONDS, PULL});
});
