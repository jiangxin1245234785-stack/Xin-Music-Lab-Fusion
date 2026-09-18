import { SHADER_PIPELINE_DEFAULTS } from '../schema/defaults.js';
import { buildPresetCompatibilityReport } from './compatibility.js';
import { loadValidatedPreset } from './validation.js';
export const PRODUCT_PRESET_JSON_CONTRACT = 'xin.glitch-product-preset-json/1';
export const PRODUCT_PRESET_JSON_VERSION = '5.3.0-product-json';
function freezeResult(result) {
    return Object.freeze(result);
}
function shaderPipelineIsRuntimeSafe(preset) {
    return JSON.stringify(preset.shaderPipeline) ===
        JSON.stringify(SHADER_PIPELINE_DEFAULTS);
}
export function exportProductPresetJson(input) {
    return `${JSON.stringify(loadValidatedPreset(input), null, 2)}\n`;
}
export function createProductPresetFileName(input) {
    const preset = loadValidatedPreset(input);
    const label = String(preset.id || preset.name || 'preset')
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'preset';
    return `Xin-Glitch-${label}-schema${preset.schemaVersion}.json`;
}
export function stageProductPresetJson(serialized, options = {}) {
    let parsed;
    try {
        parsed = JSON.parse(serialized);
    }
    catch (error) {
        return freezeResult({
            contract: PRODUCT_PRESET_JSON_CONTRACT,
            version: PRODUCT_PRESET_JSON_VERSION,
            applied: false,
            valid: false,
            code: 'PRESET_JSON_PARSE_FAILED',
            log: error instanceof Error
                ? `JSON parse failed: ${error.message}`
                : 'JSON parse failed.'
        });
    }
    const compatibility = buildPresetCompatibilityReport(parsed, options.validationContext ?? {});
    if (!compatibility.compatible || !compatibility.preset) {
        const first = compatibility.nonMigratedFields[0];
        return freezeResult({
            contract: PRODUCT_PRESET_JSON_CONTRACT,
            version: PRODUCT_PRESET_JSON_VERSION,
            applied: false,
            valid: false,
            code: 'PRESET_INCOMPATIBLE',
            log: first
                ? `${first.path}: ${first.reason}`
                : 'Preset is incompatible with the current engine.',
            compatibility
        });
    }
    if (compatibility.status === 'partial' &&
        options.allowPartial !== true) {
        return freezeResult({
            contract: PRODUCT_PRESET_JSON_CONTRACT,
            version: PRODUCT_PRESET_JSON_VERSION,
            applied: false,
            valid: false,
            code: 'PRESET_PARTIAL_REQUIRES_EDITOR',
            log: 'Preset contains fields that cannot be migrated without loss.',
            compatibility
        });
    }
    if (options.allowShaderPipelineChanges !== true &&
        !shaderPipelineIsRuntimeSafe(compatibility.preset)) {
        return freezeResult({
            contract: PRODUCT_PRESET_JSON_CONTRACT,
            version: PRODUCT_PRESET_JSON_VERSION,
            applied: false,
            valid: false,
            code: 'PRESET_SHADER_PIPELINE_REQUIRES_EDITOR',
            log: 'Custom shader pipeline changes require the Generator editor.',
            compatibility
        });
    }
    return freezeResult({
        contract: PRODUCT_PRESET_JSON_CONTRACT,
        version: PRODUCT_PRESET_JSON_VERSION,
        applied: false,
        valid: true,
        code: compatibility.status === 'migrated'
            ? 'PRESET_MIGRATED'
            : 'PRESET_READY',
        log: compatibility.status === 'migrated'
            ? `Migrated schema ${compatibility.sourceSchemaVersion} to ` +
                `${compatibility.targetSchemaVersion}.`
            : `Schema ${compatibility.targetSchemaVersion} validation passed.`,
        compatibility,
        preset: compatibility.preset
    });
}
//# sourceMappingURL=product-json.js.map