import { getMigrationPath } from './migrations.js';
import { validatePreset } from './validation.js';
import { CURRENT_ENGINE_VERSION, CURRENT_SCHEMA_VERSION } from './version.js';
const ROOT_FIELDS = Object.freeze([
    'schemaVersion',
    'engineVersion',
    'presetVersion',
    'seed',
    'id',
    'name',
    'description',
    'mappings',
    'envelopes',
    'energyBudget',
    'safety',
    'nodeGraph',
    'shaderPipeline',
    'targetDefaults',
    'metadata'
]);
const MAPPING_FIELDS = Object.freeze([
    'id',
    'sourceId',
    'targetId',
    'enabled',
    'amount',
    'range',
    'curve',
    'attackMs',
    'fallMs',
    'threshold',
    'priority',
    'kind',
    'envelopeId',
    'gateSourceId',
    'gateThreshold',
    'polarity',
    'replaceMode',
    'safetyClamp',
    'probability',
    'ab',
    'modulations'
]);
const PARAMETER_FIELDS = Object.freeze([
    'amount',
    'range',
    'curve',
    'attackMs',
    'fallMs',
    'threshold',
    'priority'
]);
const ENVELOPE_FIELDS = Object.freeze([
    'id',
    'delayMs',
    'attackMs',
    'holdMs',
    'decayMs',
    'sustain',
    'releaseMs',
    'cooldownMs',
    'retriggerMode'
]);
const ENERGY_FIELDS = Object.freeze([
    'enabled',
    'budget',
    'weights',
    'eventVoiceLimit',
    'globalEventPolicy',
    'experimentalQueueEnabled'
]);
const SAFETY_FIELDS = Object.freeze([
    'whiteoutProtection',
    'blackoutProtection',
    'feedbackRunawayProtection'
]);
const NODE_FIELDS = Object.freeze([
    'id',
    'kind',
    'label',
    'enabled',
    'busMode',
    'mathOperation',
    'shaperMode',
    'logicOperation',
    'lfoWaveform',
    'sampleMode',
    'value',
    'minimum',
    'maximum',
    'curve',
    'threshold',
    'frequencyHz',
    'phaseOffset',
    'amplitude',
    'offset'
]);
const EDGE_FIELDS = Object.freeze([
    'id',
    'sourceId',
    'targetNodeId',
    'targetPort'
]);
const MODULATION_FIELDS = Object.freeze([
    'id',
    'sourceId',
    'targetParameter',
    'depth',
    'enabled'
]);
const SHADER_PIPELINE_FIELDS = Object.freeze([
    'passOrder',
    'customPass',
    'uniformRegistry'
]);
const SHADER_PASS_FIELDS = Object.freeze([
    'enabled',
    'label',
    'source'
]);
const SHADER_UNIFORM_FIELDS = Object.freeze([
    'name',
    'type',
    'range',
    'default',
    'label',
    'impactWeight',
    'impactCategory'
]);
const TARGET_STATE_FIELDS = Object.freeze(['id', 'enabled', 'values']);
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function joinPath(base, key) {
    return base.length > 0 ? `${base}.${key}` : key;
}
function inspectUnknownKeys(value, path, allowedFields, add) {
    if (!isRecord(value))
        return;
    const allowed = new Set(allowedFields);
    for (const key of Object.keys(value)) {
        if (!allowed.has(key)) {
            add(joinPath(path, key), 'No migration rule or runtime schema field exists; the value is ' +
                'preserved in source JSON but ignored by the current engine.');
        }
    }
}
function inspectParameterSet(value, path, add) {
    inspectUnknownKeys(value, path, PARAMETER_FIELDS, add);
}
function inspectUnknownPresetFields(input) {
    if (!isRecord(input))
        return Object.freeze([]);
    const fields = new Map();
    const add = (path, reason) => {
        if (!fields.has(path))
            fields.set(path, reason);
    };
    inspectUnknownKeys(input, '', ROOT_FIELDS, add);
    if (Array.isArray(input.mappings)) {
        input.mappings.forEach((mapping, index) => {
            const path = `mappings[${index}]`;
            inspectUnknownKeys(mapping, path, MAPPING_FIELDS, add);
            if (!isRecord(mapping))
                return;
            if (isRecord(mapping.ab)) {
                inspectUnknownKeys(mapping.ab, `${path}.ab`, ['active', 'a', 'b'], add);
                inspectParameterSet(mapping.ab.a, `${path}.ab.a`, add);
                inspectParameterSet(mapping.ab.b, `${path}.ab.b`, add);
            }
            if (Array.isArray(mapping.modulations)) {
                mapping.modulations.forEach((modulation, modulationIndex) => {
                    inspectUnknownKeys(modulation, `${path}.modulations[${modulationIndex}]`, MODULATION_FIELDS, add);
                });
            }
        });
    }
    if (Array.isArray(input.envelopes)) {
        input.envelopes.forEach((envelope, index) => {
            inspectUnknownKeys(envelope, `envelopes[${index}]`, ENVELOPE_FIELDS, add);
        });
    }
    inspectUnknownKeys(input.energyBudget, 'energyBudget', ENERGY_FIELDS, add);
    inspectUnknownKeys(input.safety, 'safety', SAFETY_FIELDS, add);
    inspectUnknownKeys(input.targetDefaults, 'targetDefaults', TARGET_STATE_FIELDS, add);
    if (isRecord(input.nodeGraph)) {
        inspectUnknownKeys(input.nodeGraph, 'nodeGraph', ['nodes', 'edges'], add);
        if (Array.isArray(input.nodeGraph.nodes)) {
            input.nodeGraph.nodes.forEach((node, index) => {
                inspectUnknownKeys(node, `nodeGraph.nodes[${index}]`, NODE_FIELDS, add);
            });
        }
        if (Array.isArray(input.nodeGraph.edges)) {
            input.nodeGraph.edges.forEach((edge, index) => {
                inspectUnknownKeys(edge, `nodeGraph.edges[${index}]`, EDGE_FIELDS, add);
            });
        }
    }
    if (isRecord(input.shaderPipeline)) {
        inspectUnknownKeys(input.shaderPipeline, 'shaderPipeline', SHADER_PIPELINE_FIELDS, add);
        inspectUnknownKeys(input.shaderPipeline.customPass, 'shaderPipeline.customPass', SHADER_PASS_FIELDS, add);
        if (Array.isArray(input.shaderPipeline.uniformRegistry)) {
            input.shaderPipeline.uniformRegistry.forEach((uniform, index) => {
                inspectUnknownKeys(uniform, `shaderPipeline.uniformRegistry[${index}]`, SHADER_UNIFORM_FIELDS, add);
            });
        }
    }
    return Object.freeze([...fields].map(([path, reason]) => Object.freeze({ path, reason })));
}
function readPath(value, path) {
    let current = value;
    for (const key of path.split('.')) {
        if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, key)) {
            return { exists: false, value: undefined };
        }
        current = current[key];
    }
    return { exists: true, value: current };
}
function fieldResolutions(source, resolved, migration, field) {
    const arrayMatch = /^([^.[]+)\[\]\.(.+)$/.exec(field.path);
    if (!arrayMatch) {
        const before = readPath(source, field.path);
        const after = readPath(resolved, field.path);
        if (!after.exists)
            return Object.freeze([]);
        return Object.freeze([Object.freeze({
                path: field.path,
                action: before.exists ? 'preserved' : 'defaulted',
                description: field.description,
                from: migration.from,
                to: migration.to
            })]);
    }
    const collectionName = arrayMatch[1] ?? '';
    const nestedPath = arrayMatch[2] ?? '';
    const beforeCollection = source[collectionName];
    const afterCollection = resolved[collectionName];
    if (!Array.isArray(afterCollection))
        return Object.freeze([]);
    return Object.freeze(afterCollection.flatMap((item, index) => {
        const beforeItem = Array.isArray(beforeCollection)
            ? beforeCollection[index]
            : undefined;
        const before = readPath(beforeItem, nestedPath);
        const after = readPath(item, nestedPath);
        return after.exists
            ? [Object.freeze({
                    path: `${collectionName}[${index}].${nestedPath}`,
                    action: before.exists ? 'preserved' : 'defaulted',
                    description: field.description,
                    from: migration.from,
                    to: migration.to
                })]
            : [];
    }));
}
function warningFromIssue(issue) {
    return Object.freeze({
        path: issue.path,
        reason: issue.message
    });
}
export function buildPresetCompatibilityReport(input, context = {}) {
    const validation = validatePreset(input, context);
    const source = isRecord(input) ? input : {};
    const sourceEngineVersion = typeof source.engineVersion === 'string'
        ? source.engineVersion
        : null;
    let path = Object.freeze([]);
    if (validation.sourceSchemaVersion !== null) {
        try {
            path = getMigrationPath(validation.sourceSchemaVersion);
        }
        catch {
            path = Object.freeze([]);
        }
    }
    const nonMigrated = new Map();
    for (const field of inspectUnknownPresetFields(input)) {
        nonMigrated.set(field.path, field.reason);
    }
    for (const issue of validation.issues) {
        if (issue.severity === 'error' && !nonMigrated.has(issue.path)) {
            nonMigrated.set(issue.path, issue.message);
        }
    }
    const appliedMigrations = Object.freeze(path.map(migration => Object.freeze({
        from: migration.from,
        to: migration.to,
        label: migration.label ?? `Schema ${migration.from} to ${migration.to}`
    })));
    const migratedFields = validation.preset
        ? Object.freeze(path.flatMap(migration => (migration.fields ?? []).flatMap(field => fieldResolutions(source, validation.preset, migration, field))))
        : Object.freeze([]);
    const nonMigratedFields = Object.freeze([...nonMigrated].map(([fieldPath, reason]) => Object.freeze({
        path: fieldPath,
        reason
    })));
    const warnings = Object.freeze(validation.issues
        .filter(issue => issue.severity === 'warning' && issue.code !== 'SCHEMA_MIGRATED')
        .map(warningFromIssue));
    const status = !validation.valid
        ? 'incompatible'
        : nonMigratedFields.length > 0
            ? 'partial'
            : validation.migrated
                ? 'migrated'
                : 'current';
    return Object.freeze({
        status,
        compatible: validation.valid,
        fullyCompatible: validation.valid &&
            nonMigratedFields.length === 0 &&
            warnings.length === 0,
        sourceSchemaVersion: validation.sourceSchemaVersion,
        targetSchemaVersion: CURRENT_SCHEMA_VERSION,
        sourceEngineVersion,
        targetEngineVersion: CURRENT_ENGINE_VERSION,
        appliedMigrations,
        migratedFields,
        nonMigratedFields,
        warnings,
        validation,
        ...(validation.preset ? { preset: validation.preset } : {})
    });
}
//# sourceMappingURL=compatibility.js.map