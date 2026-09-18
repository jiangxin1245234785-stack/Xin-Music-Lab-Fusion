export const CORE_TEST_SUITE = Object.freeze([
  Object.freeze({
    domain: 'TargetMixer',
    file: 'phase1a-target-mixer.test.mjs',
    marker: 'TargetMixer exposes the fixed seven-step pipeline'
  }),
  Object.freeze({
    domain: 'EventEnvelope',
    file: 'phase1c-event.test.mjs',
    marker: 'restart and ignore-until-release'
  }),
  Object.freeze({
    domain: 'Preset validation',
    file: 'phase3-preset-validation.test.mjs',
    marker: 'broken preset reports exact field paths and causes'
  }),
  Object.freeze({
    domain: 'NodeGraph cycle detection',
    file: 'phase4-nodegraph-core.test.mjs',
    marker: 'rejects a cycle without mutating live graph'
  }),
  Object.freeze({
    domain: 'SafetyLimiter',
    file: 'phase3-safety-limiter.test.mjs',
    marker: 'physical 3 Hz limit'
  }),
  Object.freeze({
    domain: 'Schema migration',
    file: 'preset-migrations.test.mjs',
    marker: 'loading an unversioned preset'
  }),
  Object.freeze({
    domain: 'Determinism',
    file: 'mapping-determinism.test.mjs',
    marker: 'same offline buffer, preset and seed'
  }),
  Object.freeze({
    domain: 'Seeded PRNG',
    file: 'clock-random.test.mjs',
    marker: 'seeded PRNG is repeatable'
  }),
  Object.freeze({
    domain: 'Energy budget',
    file: 'phase3-energy-budget.test.mjs',
    marker: 'weighted budget'
  }),
  Object.freeze({
    domain: 'Visual regression',
    file: 'phase6-visual-regression.test.mjs',
    marker: 'visual target timeline and renderer contract match'
  }),
  Object.freeze({
    domain: 'Debug bundle',
    file: 'phase6-debug-bundle.test.mjs',
    marker: 'debug bundle contains every Phase 6.2 reproduction artifact'
  }),
  Object.freeze({
    domain: 'Performance profiler',
    file: 'phase6-performance-profiler.test.mjs',
    marker: 'over-budget frame identifies conditioning as the dominant stage'
  }),
  Object.freeze({
    domain: 'Autosave recovery',
    file: 'phase6-autosave-recovery.test.mjs',
    marker: 'simulated crash recovers the latest deterministic autosave'
  }),
  Object.freeze({
    domain: 'Preset compatibility',
    file: 'phase6-preset-compatibility.test.mjs',
    marker: 'old preset reports every applied migration and resolved field'
  })
]);
