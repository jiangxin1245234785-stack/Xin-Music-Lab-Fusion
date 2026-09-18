import { validatePreset } from './validation.js';
export function stagePresetJson(serialized, context = {}) {
    let parsed;
    try {
        parsed = JSON.parse(serialized);
    }
    catch (error) {
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
//# sourceMappingURL=staged-json.js.map