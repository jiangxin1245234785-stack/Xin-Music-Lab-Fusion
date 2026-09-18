import { createVisualTargetState } from '../schema/defaults.js';
import type {
  MappingCard,
  ResolvedAudioFeatureFrame,
  ResolvedVisualTargetState,
  VisualTargetState
} from '../schema/types.js';

export type MappingSourceValues = Readonly<Record<string, number>>;

export const CORE_MAPPING_SOURCE_IDS = Object.freeze([
  'audio.loudness',
  'audio.bass',
  'audio.mid',
  'audio.treble',
  'audio.dynamicRange',
  'audio.spectralDensity',
  'audio.buildEnergy',
  'audio.sectionDrive',
  'audio.rhythmPhase',
  'audio.flux',
  'audio.flatness',
  'audio.sharpness',
  'audio.chordConfidence',
  'state.silence',
  'event.onset',
  'event.bassPeak',
  'event.sectionBoundary',
  'event.dropEnter',
  'event.climaxEnter',
  'event.chordChange',
  'state.inBuild',
  'state.inDrop',
  'state.inClimax',
  'confidence.sectionBoundary',
  'confidence.chord',
  'confidence.climax',
  'harmony.chordHue'
] as const);

export function coreFeatureSourceValues(
  frame: ResolvedAudioFeatureFrame
): MappingSourceValues {
  return {
    'audio.loudness': frame.loudness,
    'audio.bass': frame.bass,
    'audio.mid': frame.mid,
    'audio.treble': frame.treble,
    'audio.dynamicRange': frame.dynamicRange,
    'audio.spectralDensity': frame.spectralDensity,
    'audio.buildEnergy': frame.buildEnergy,
    'audio.sectionDrive': frame.sectionDrive,
    'audio.rhythmPhase': frame.rhythmPhase,
    'audio.flux': frame.flux,
    'audio.flatness': frame.flatness,
    'audio.sharpness': frame.sharpness,
    'event.onset': frame.onset,
    'event.bassPeak': frame.bassPeak,
    'event.sectionBoundary': frame.sectionBoundary,
    'event.dropEnter': frame.dropEnter,
    'event.climaxEnter': frame.climaxEnter,
    'state.inBuild': frame.inBuild,
    'state.inDrop': frame.inDrop,
    'state.inClimax': frame.inClimax
  };
}

export function evaluateMappingCards(
  mappings: readonly MappingCard[],
  sourceValues: MappingSourceValues,
  baseState: VisualTargetState = {}
): ResolvedVisualTargetState {
  const state = createVisualTargetState(baseState);
  const values: Record<string, number> = { ...state.values };
  const assignedTargets = new Set<string>();

  for (const mapping of mappings) {
    if (mapping.enabled === false) continue;
    const sourceId = mapping.sourceId ?? '';
    const targetId = mapping.targetId ?? '';
    if (!sourceId || !targetId) continue;
    if (assignedTargets.has(targetId)) {
      throw new Error(
        `Phase 0 minimal mapper accepts only one active MappingCard per target: ${targetId}`
      );
    }

    const source = Number(sourceValues[sourceId] ?? 0);
    const amount = Number(mapping.amount ?? 1);
    values[targetId] =
      (Number.isFinite(source) ? source : 0) *
      (Number.isFinite(amount) ? amount : 0);
    assignedTargets.add(targetId);
  }

  return {
    ...state,
    values
  };
}
