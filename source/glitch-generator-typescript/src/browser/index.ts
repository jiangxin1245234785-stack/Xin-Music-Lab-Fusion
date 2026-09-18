/**
 * Stable, side-effect-free browser distribution entry.
 *
 * XML will eventually import this ESM entry from a versioned vendor directory.
 * Keep Demo DOM bootstrapping outside this module tree.
 */
export const GLITCH_GENERATOR_BROWSER_ENTRY_ID =
  '@xins-music-lab/glitch-mapping-generator/browser' as const;
export const GLITCH_GENERATOR_BROWSER_API_VERSION = 1 as const;
export const GLITCH_GENERATOR_PACKAGE_VERSION =
  '6.6.1-integration-v.3' as const;

export * from '../index.js';
