import { createPreset } from '../schema/defaults.js';
import { CURRENT_SCHEMA_VERSION } from './version.js';
function cloneMappingParameterSet(parameters) {
    if (parameters === undefined)
        return undefined;
    const clone = { ...parameters };
    if (parameters.range !== undefined) {
        clone.range = [parameters.range[0], parameters.range[1]];
    }
    return clone;
}
function cloneMappingABState(ab) {
    if (ab === undefined)
        return undefined;
    const clone = { ...ab };
    const a = cloneMappingParameterSet(ab.a);
    const b = cloneMappingParameterSet(ab.b);
    if (a !== undefined)
        clone.a = a;
    if (b !== undefined)
        clone.b = b;
    return clone;
}
function cloneMapping(mapping) {
    const clone = { ...mapping };
    if (mapping.range !== undefined) {
        clone.range = [mapping.range[0], mapping.range[1]];
    }
    const ab = cloneMappingABState(mapping.ab);
    if (ab !== undefined)
        clone.ab = ab;
    if (mapping.modulations !== undefined) {
        clone.modulations = mapping.modulations.map(modulation => ({
            ...modulation
        }));
    }
    return clone;
}
function cloneTargetState(target) {
    const clone = { ...target };
    if (target.values !== undefined)
        clone.values = { ...target.values };
    return clone;
}
function clonePresetInput(preset) {
    const clone = { ...preset };
    if (preset.mappings !== undefined)
        clone.mappings = preset.mappings.map(cloneMapping);
    if (preset.envelopes !== undefined) {
        clone.envelopes = preset.envelopes.map(envelope => ({ ...envelope }));
    }
    if (preset.energyBudget !== undefined) {
        clone.energyBudget = {
            ...preset.energyBudget,
            ...(preset.energyBudget.weights !== undefined
                ? { weights: { ...preset.energyBudget.weights } }
                : {})
        };
    }
    if (preset.safety !== undefined) {
        clone.safety = { ...preset.safety };
    }
    if (preset.nodeGraph !== undefined) {
        clone.nodeGraph = {
            ...(preset.nodeGraph.nodes !== undefined
                ? { nodes: preset.nodeGraph.nodes.map(node => ({ ...node })) }
                : {}),
            ...(preset.nodeGraph.edges !== undefined
                ? { edges: preset.nodeGraph.edges.map(edge => ({ ...edge })) }
                : {})
        };
    }
    if (preset.shaderPipeline !== undefined) {
        clone.shaderPipeline = {
            ...(preset.shaderPipeline.passOrder !== undefined
                ? { passOrder: [...preset.shaderPipeline.passOrder] }
                : {}),
            ...(preset.shaderPipeline.customPass !== undefined
                ? { customPass: { ...preset.shaderPipeline.customPass } }
                : {}),
            ...(preset.shaderPipeline.uniformRegistry !== undefined
                ? {
                    uniformRegistry: preset.shaderPipeline.uniformRegistry.map(uniform => ({
                        ...uniform,
                        ...(uniform.range !== undefined
                            ? { range: [uniform.range[0], uniform.range[1]] }
                            : {})
                    }))
                }
                : {})
        };
    }
    if (preset.targetDefaults !== undefined) {
        clone.targetDefaults = cloneTargetState(preset.targetDefaults);
    }
    if (preset.metadata !== undefined)
        clone.metadata = { ...preset.metadata };
    return clone;
}
const V1_BASELINE_MIGRATION = Object.freeze({
    from: 0,
    to: 1,
    migrate: clonePresetInput,
    label: 'Baseline preset identity',
    fields: Object.freeze([
        { path: 'schemaVersion', description: 'Assign schema identity.' },
        { path: 'engineVersion', description: 'Record engine compatibility.' },
        { path: 'presetVersion', description: 'Assign preset format identity.' }
    ])
});
const V2_SEED_MIGRATION = Object.freeze({
    from: 1,
    to: 2,
    migrate: clonePresetInput,
    label: 'Deterministic seed',
    fields: Object.freeze([
        { path: 'seed', description: 'Default deterministic preset seed.' }
    ])
});
const V3_CONTINUOUS_MAPPING_MIGRATION = Object.freeze({
    from: 2,
    to: 3,
    migrate: clonePresetInput,
    label: 'Continuous MappingCard parameters',
    fields: Object.freeze([
        { path: 'mappings[].enabled', description: 'Default mapping enabled state.' },
        { path: 'mappings[].amount', description: 'Default mapping amount.' },
        { path: 'mappings[].range', description: 'Default mapping output range.' },
        { path: 'mappings[].curve', description: 'Default response curve.' },
        { path: 'mappings[].attackMs', description: 'Default attack time.' },
        { path: 'mappings[].fallMs', description: 'Default fall time.' },
        { path: 'mappings[].threshold', description: 'Default source threshold.' },
        { path: 'mappings[].priority', description: 'Default deterministic priority.' }
    ])
});
const V4_EVENT_PATH_MIGRATION = Object.freeze({
    from: 3,
    to: 4,
    migrate: clonePresetInput,
    label: 'Event mapping and envelope path',
    fields: Object.freeze([
        { path: 'mappings[].kind', description: 'Distinguish continuous and event mappings.' },
        { path: 'mappings[].envelopeId', description: 'Link event mappings to envelopes.' },
        { path: 'envelopes', description: 'Default the event envelope collection.' }
    ])
});
const V5_SNAPSHOT_STACK_MIGRATION = Object.freeze({
    from: 4,
    to: 5,
    migrate: clonePresetInput,
    label: 'Snapshot Stack compatibility',
    fields: Object.freeze([])
});
const V6_MAPPING_AB_MIGRATION = Object.freeze({
    from: 5,
    to: 6,
    migrate: clonePresetInput,
    label: 'Independent Mapping A/B state',
    fields: Object.freeze([
        { path: 'mappings[].ab', description: 'Resolve independent A/B parameter sets.' }
    ])
});
const V7_SECOND_BATCH_FEATURES_MIGRATION = Object.freeze({
    from: 6,
    to: 7,
    migrate: clonePresetInput,
    label: 'Extended audio feature source catalog',
    fields: Object.freeze([])
});
const V8_STRUCTURE_SIGNALS_MIGRATION = Object.freeze({
    from: 7,
    to: 8,
    migrate: clonePresetInput,
    label: 'Structure signal gates',
    fields: Object.freeze([
        { path: 'mappings[].gateSourceId', description: 'Default optional gate source.' },
        { path: 'mappings[].gateThreshold', description: 'Default gate threshold.' }
    ])
});
const V9_COMPLETE_MAPPING_CARD_MIGRATION = Object.freeze({
    from: 8,
    to: 9,
    migrate: clonePresetInput,
    label: 'Complete MappingCard controls',
    fields: Object.freeze([
        { path: 'mappings[].polarity', description: 'Default mapping polarity.' },
        { path: 'mappings[].replaceMode', description: 'Default TargetMixer layer.' },
        { path: 'mappings[].safetyClamp', description: 'Default card safety clamp.' },
        { path: 'mappings[].probability', description: 'Default deterministic probability.' }
    ])
});
const V10_ACTIVE_ENERGY_BUDGET_MIGRATION = Object.freeze({
    from: 9,
    to: 10,
    migrate: clonePresetInput,
    label: 'Global Energy Budget',
    fields: Object.freeze([
        { path: 'energyBudget.enabled', description: 'Default budget activation.' },
        { path: 'energyBudget.budget', description: 'Default global energy ceiling.' },
        { path: 'energyBudget.weights', description: 'Default per-target weights.' },
        { path: 'energyBudget.eventVoiceLimit', description: 'Default event voice limit.' },
        { path: 'energyBudget.globalEventPolicy', description: 'Default event overflow policy.' },
        { path: 'energyBudget.experimentalQueueEnabled', description: 'Default experimental queue switch.' }
    ])
});
const V11_COMPLETE_SAFETY_MIGRATION = Object.freeze({
    from: 10,
    to: 11,
    migrate: clonePresetInput,
    label: 'Complete SafetyLimiter controls',
    fields: Object.freeze([
        { path: 'safety.whiteoutProtection', description: 'Default whiteout protection.' },
        { path: 'safety.blackoutProtection', description: 'Default blackout protection.' },
        { path: 'safety.feedbackRunawayProtection', description: 'Default feedback runaway protection.' }
    ])
});
const V12_NODE_GRAPH_CORE_MIGRATION = Object.freeze({
    from: 11,
    to: 12,
    migrate: clonePresetInput,
    label: 'NodeGraph core',
    fields: Object.freeze([
        { path: 'nodeGraph.nodes', description: 'Default NodeGraph node collection.' },
        { path: 'nodeGraph.edges', description: 'Default NodeGraph edge collection.' }
    ])
});
const V13_SECOND_ORDER_MODULATION_MIGRATION = Object.freeze({
    from: 12,
    to: 13,
    migrate: clonePresetInput,
    label: 'Second-order mapping modulation',
    fields: Object.freeze([
        { path: 'mappings[].modulations', description: 'Default mapping modulation collection.' }
    ])
});
const V14_SHADER_PIPELINE_MIGRATION = Object.freeze({
    from: 13,
    to: 14,
    migrate: clonePresetInput,
    label: 'Shader pipeline and custom uniforms',
    fields: Object.freeze([
        { path: 'shaderPipeline.passOrder', description: 'Default render pass order.' },
        { path: 'shaderPipeline.customPass', description: 'Default staged custom GLSL pass.' },
        { path: 'shaderPipeline.uniformRegistry', description: 'Default custom uniform registry.' }
    ])
});
export const MIGRATIONS = Object.freeze([
    V1_BASELINE_MIGRATION,
    V2_SEED_MIGRATION,
    V3_CONTINUOUS_MAPPING_MIGRATION,
    V4_EVENT_PATH_MIGRATION,
    V5_SNAPSHOT_STACK_MIGRATION,
    V6_MAPPING_AB_MIGRATION,
    V7_SECOND_BATCH_FEATURES_MIGRATION,
    V8_STRUCTURE_SIGNALS_MIGRATION,
    V9_COMPLETE_MAPPING_CARD_MIGRATION,
    V10_ACTIVE_ENERGY_BUDGET_MIGRATION,
    V11_COMPLETE_SAFETY_MIGRATION,
    V12_NODE_GRAPH_CORE_MIGRATION,
    V13_SECOND_ORDER_MODULATION_MIGRATION,
    V14_SHADER_PIPELINE_MIGRATION
]);
function assertMigrationRegistry() {
    let expectedFrom = 0;
    for (const migration of MIGRATIONS) {
        if (migration.from !== expectedFrom || migration.to !== migration.from + 1) {
            throw new Error(`Invalid migration registry entry ${migration.from}->${migration.to}; expected ${expectedFrom}->${expectedFrom + 1}`);
        }
        expectedFrom = migration.to;
    }
    if (expectedFrom !== CURRENT_SCHEMA_VERSION) {
        throw new Error(`Migration registry ends at schema ${expectedFrom}, current schema is ${CURRENT_SCHEMA_VERSION}`);
    }
}
assertMigrationRegistry();
function readSourceVersion(preset) {
    if (preset.schemaVersion === undefined)
        return 0;
    if (!Number.isInteger(preset.schemaVersion) || preset.schemaVersion < 0) {
        throw new Error(`Invalid schemaVersion: ${String(preset.schemaVersion)}`);
    }
    return preset.schemaVersion;
}
export function getMigrationPath(sourceVersion) {
    if (!Number.isInteger(sourceVersion) || sourceVersion < 0) {
        throw new Error(`Invalid source schemaVersion: ${String(sourceVersion)}`);
    }
    if (sourceVersion > CURRENT_SCHEMA_VERSION) {
        throw new Error(`Preset schema ${sourceVersion} is newer than supported schema ${CURRENT_SCHEMA_VERSION}`);
    }
    const path = [];
    let version = sourceVersion;
    while (version < CURRENT_SCHEMA_VERSION) {
        const migration = MIGRATIONS.find(entry => entry.from === version);
        if (!migration)
            throw new Error(`Missing migration from schemaVersion ${version}`);
        path.push(migration);
        version = migration.to;
    }
    return path;
}
export function migratePreset(input) {
    let migrated = clonePresetInput(input);
    const sourceVersion = readSourceVersion(migrated);
    for (const migration of getMigrationPath(sourceVersion)) {
        migrated = migration.migrate(migrated);
        migrated.schemaVersion = migration.to;
    }
    return migrated;
}
export function loadPreset(input) {
    return createPreset(migratePreset(input));
}
//# sourceMappingURL=migrations.js.map