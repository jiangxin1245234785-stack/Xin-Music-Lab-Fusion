import type { ResolvedPreset } from '../schema/types.js';
import {
  validatePreset,
  type PresetValidationContext,
  type PresetValidationReport
} from './validation.js';

export interface StagedPresetJsonResult {
  readonly applied: false;
  readonly valid: boolean;
  readonly log: string;
  readonly report?: PresetValidationReport;
  readonly preset?: ResolvedPreset;
}

export function stagePresetJson(
  serialized: string,
  context: PresetValidationContext = {}
): StagedPresetJsonResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    return Object.freeze({
      applied: false,
      valid: false,
      log: error instanceof Error
        ? `JSON parse failed: ${error.message}`
        : 'JSON parse failed.'
    });
  }
  const report = validatePreset(parsed, context);
  const firstError = report.issues.find(issue => issue.severity === 'error');
  return Object.freeze({
    applied: false,
    valid: report.valid,
    log: firstError
      ? `${firstError.code} at ${firstError.path}: ${firstError.message}`
      : `Schema ${report.targetSchemaVersion} validation passed.`,
    report,
    ...(report.valid && report.preset ? { preset: report.preset } : {})
  });
}
