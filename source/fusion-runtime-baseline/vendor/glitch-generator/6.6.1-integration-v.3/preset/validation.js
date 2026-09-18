import { GENERATOR_MAPPING_SOURCE_IDS } from '../runtime/control-source-registry.js';
import { findNodeGraphCycle } from '../nodegraph/node-graph.js';
import { nodeOutputSourceId } from '../nodegraph/node-sources.js';
import { VISUAL_TARGET_BY_ID, VISUAL_TARGET_REGISTRY, VISUAL_TARGETS } from '../render/visual-targets.js';
import { glslUniformTargetId, inspectGlslUniformImpact, resolveGlslUniformMetadata } from '../render/glsl-uniform-target-registry.js';
import { loadPreset, migratePreset } from './migrations.js';
import { CURRENT_ENGINE_VERSION, CURRENT_SCHEMA_VERSION } from './version.js';
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const RENDER_DEFAULT_BOUNDS = new Map([
    [VISUAL_TARGETS.brightness, { min: 0, max: 1 }],
    [VISUAL_TARGETS.scale, { min: 0.25, max: 2 }],
    [VISUAL_TARGETS.alpha, { min: 0, max: 1 }]
]);
function validateNumber(value, path, add, options = {}) {
    if (value === undefined)
        return;
    if (!isFiniteNumber(value) ||
        (options.integer === true && !Number.isInteger(value)) ||
        (options.minimum !== undefined && value < options.minimum) ||
        (options.maximum !== undefined && value > options.maximum)) {
        const constraints = [
            options.integer === true ? 'integer' : 'finite number',
            options.minimum !== undefined ? `>= ${options.minimum}` : '',
            options.maximum !== undefined ? `<= ${options.maximum}` : ''
        ].filter(Boolean).join(', ');
        add('error', 'INVALID_NUMBER', path, `Expected ${constraints}.`);
    }
}
function validateRange(value, path, add) {
    if (value === undefined)
        return;
    if (!Array.isArray(value) ||
        value.length !== 2 ||
        !isFiniteNumber(value[0]) ||
        !isFiniteNumber(value[1])) {
        add('error', 'INVALID_RANGE', path, 'Expected a two-item array of finite numbers.');
    }
}
function validateParameterSet(value, path, add) {
    if (value === undefined)
        return;
    if (!isRecord(value)) {
        add('error', 'INVALID_PARAMETER_SET', path, 'Expected an object.');
        return;
    }
    validateNumber(value.amount, `${path}.amount`, add);
    validateRange(value.range, `${path}.range`, add);
    validateNumber(value.curve, `${path}.curve`, add, { minimum: 0.000001 });
    validateNumber(value.attackMs, `${path}.attackMs`, add, { minimum: 0 });
    validateNumber(value.fallMs, `${path}.fallMs`, add, { minimum: 0 });
    validateNumber(value.threshold, `${path}.threshold`, add, {
        minimum: 0,
        maximum: 1
    });
    validateNumber(value.priority, `${path}.priority`, add);
}
export function validatePreset(input, context = {}) {
    const issues = [];
    const add = (severity, code, path, message) => {
        issues.push(Object.freeze({ severity, code, path, message }));
    };
    if (!isRecord(input)) {
        add('error', 'PRESET_NOT_OBJECT', '$', 'Preset must be a JSON object.');
        return Object.freeze({
            valid: false,
            sourceSchemaVersion: null,
            targetSchemaVersion: CURRENT_SCHEMA_VERSION,
            migrated: false,
            issues: Object.freeze(issues)
        });
    }
    const rawVersion = input.schemaVersion;
    const sourceSchemaVersion = rawVersion === undefined ? 0 : rawVersion;
    if (!Number.isInteger(sourceSchemaVersion) ||
        Number(sourceSchemaVersion) < 0) {
        add('error', 'INVALID_SCHEMA_VERSION', 'schemaVersion', 'schemaVersion must be a non-negative integer.');
        return Object.freeze({
            valid: false,
            sourceSchemaVersion: null,
            targetSchemaVersion: CURRENT_SCHEMA_VERSION,
            migrated: false,
            issues: Object.freeze(issues)
        });
    }
    const numericSourceVersion = Number(sourceSchemaVersion);
    if (numericSourceVersion > CURRENT_SCHEMA_VERSION) {
        add('error', 'UNSUPPORTED_SCHEMA_VERSION', 'schemaVersion', `Schema ${numericSourceVersion} is newer than supported schema ` +
            `${CURRENT_SCHEMA_VERSION}.`);
        return Object.freeze({
            valid: false,
            sourceSchemaVersion: numericSourceVersion,
            targetSchemaVersion: CURRENT_SCHEMA_VERSION,
            migrated: false,
            issues: Object.freeze(issues)
        });
    }
    let migratedInput;
    try {
        migratedInput = migratePreset(input);
    }
    catch (error) {
        add('error', 'MIGRATION_FAILED', 'schemaVersion', error instanceof Error ? error.message : 'Preset migration failed.');
        return Object.freeze({
            valid: false,
            sourceSchemaVersion: numericSourceVersion,
            targetSchemaVersion: CURRENT_SCHEMA_VERSION,
            migrated: false,
            issues: Object.freeze(issues)
        });
    }
    const migrated = numericSourceVersion !== CURRENT_SCHEMA_VERSION;
    if (migrated) {
        add('warning', 'SCHEMA_MIGRATED', 'schemaVersion', `Migrated schema ${numericSourceVersion} to ${CURRENT_SCHEMA_VERSION}.`);
    }
    const preset = migratedInput;
    if (preset.engineVersion !== undefined &&
        preset.engineVersion !== CURRENT_ENGINE_VERSION) {
        add('warning', 'ENGINE_VERSION_MISMATCH', 'engineVersion', `Preset engine ${String(preset.engineVersion)} differs from ` +
            `${CURRENT_ENGINE_VERSION}; schema validation still applies.`);
    }
    const declaredNodeSources = (isRecord(preset.nodeGraph) &&
        Array.isArray(preset.nodeGraph.nodes))
        ? preset.nodeGraph.nodes.flatMap(candidate => isRecord(candidate) && isNonEmptyString(candidate.id)
            ? [nodeOutputSourceId(candidate.id)]
            : [])
        : [];
    const knownSources = new Set([
        ...(context.knownSourceIds ?? GENERATOR_MAPPING_SOURCE_IDS),
        ...declaredNodeSources
    ]);
    const availableSources = new Set([
        ...(context.availableSourceIds ?? [...knownSources]),
        ...declaredNodeSources
    ]);
    const unavailableFallback = context.unavailableSourceFallback === 'hold-last'
        ? 'hold-last'
        : 'zero';
    const shaderTargetBounds = new Map();
    if (preset.shaderPipeline !== undefined) {
        if (!isRecord(preset.shaderPipeline)) {
            add('error', 'INVALID_SHADER_PIPELINE', 'shaderPipeline', 'Expected an object.');
        }
        else {
            const pipeline = preset.shaderPipeline;
            if (pipeline.passOrder !== undefined) {
                const allowed = new Set(['builtin-feedback', 'custom-glsl']);
                if (!Array.isArray(pipeline.passOrder) ||
                    pipeline.passOrder.length !== 2 ||
                    new Set(pipeline.passOrder).size !== 2 ||
                    pipeline.passOrder.some(passId => !allowed.has(String(passId)))) {
                    add('error', 'INVALID_SHADER_PASS_ORDER', 'shaderPipeline.passOrder', 'Expected builtin-feedback and custom-glsl exactly once.');
                }
            }
            if (pipeline.customPass !== undefined) {
                if (!isRecord(pipeline.customPass)) {
                    add('error', 'INVALID_SHADER_PASS', 'shaderPipeline.customPass', 'Expected an object.');
                }
                else {
                    if (pipeline.customPass.enabled !== undefined &&
                        typeof pipeline.customPass.enabled !== 'boolean') {
                        add('error', 'INVALID_SHADER_PASS', 'shaderPipeline.customPass.enabled', 'Expected a boolean.');
                    }
                    if (pipeline.customPass.label !== undefined &&
                        !isNonEmptyString(pipeline.customPass.label)) {
                        add('error', 'INVALID_SHADER_PASS', 'shaderPipeline.customPass.label', 'Expected a non-empty string.');
                    }
                    if (pipeline.customPass.source !== undefined &&
                        typeof pipeline.customPass.source !== 'string') {
                        add('error', 'INVALID_SHADER_PASS', 'shaderPipeline.customPass.source', 'Expected a string.');
                    }
                }
            }
            if (pipeline.uniformRegistry !== undefined &&
                !Array.isArray(pipeline.uniformRegistry)) {
                add('error', 'INVALID_GLSL_UNIFORM_REGISTRY', 'shaderPipeline.uniformRegistry', 'Expected an array.');
            }
            else if (Array.isArray(pipeline.uniformRegistry)) {
                const names = new Set();
                pipeline.uniformRegistry.forEach((candidate, index) => {
                    const path = `shaderPipeline.uniformRegistry[${index}]`;
                    if (!isRecord(candidate)) {
                        add('error', 'INVALID_GLSL_UNIFORM', path, 'Expected an object.');
                        return;
                    }
                    try {
                        const metadata = resolveGlslUniformMetadata(candidate);
                        if (names.has(metadata.name)) {
                            add('error', 'DUPLICATE_ID', `${path}.name`, `Duplicate GLSL uniform "${metadata.name}".`);
                            return;
                        }
                        names.add(metadata.name);
                        shaderTargetBounds.set(glslUniformTargetId(metadata.name), {
                            min: metadata.range[0],
                            max: metadata.range[1]
                        });
                        for (const warning of inspectGlslUniformImpact(metadata)) {
                            add('warning', warning.code, `${path}.impactWeight`, warning.message);
                        }
                    }
                    catch (error) {
                        add('error', 'INVALID_GLSL_UNIFORM', path, error instanceof Error ? error.message : String(error));
                    }
                });
            }
        }
    }
    const targetIds = new Set([
        ...VISUAL_TARGET_REGISTRY.map(target => target.id),
        ...shaderTargetBounds.keys()
    ]);
    const envelopeIds = new Set();
    const mappingIds = new Set();
    const envelopes = preset.envelopes;
    if (envelopes !== undefined && !Array.isArray(envelopes)) {
        add('error', 'INVALID_ENVELOPES', 'envelopes', 'Expected an array.');
    }
    else if (Array.isArray(envelopes)) {
        envelopes.forEach((candidate, index) => {
            const path = `envelopes[${index}]`;
            if (!isRecord(candidate)) {
                add('error', 'INVALID_ENVELOPE', path, 'Expected an object.');
                return;
            }
            if (!isNonEmptyString(candidate.id)) {
                add('error', 'MISSING_REQUIRED', `${path}.id`, 'Event envelope id is required.');
            }
            else if (envelopeIds.has(candidate.id)) {
                add('error', 'DUPLICATE_ID', `${path}.id`, `Duplicate event envelope id "${candidate.id}".`);
            }
            else {
                envelopeIds.add(candidate.id);
            }
            for (const field of [
                'delayMs',
                'attackMs',
                'holdMs',
                'decayMs',
                'releaseMs',
                'cooldownMs'
            ]) {
                validateNumber(candidate[field], `${path}.${field}`, add, {
                    minimum: 0
                });
            }
            validateNumber(candidate.sustain, `${path}.sustain`, add, {
                minimum: 0,
                maximum: 1
            });
            if (candidate.retriggerMode !== undefined &&
                ![
                    'restart',
                    'ignore-until-release',
                    'accumulate'
                ].includes(String(candidate.retriggerMode))) {
                add('error', 'INVALID_ENVELOPE', `${path}.retriggerMode`, 'Expected restart, ignore-until-release, or accumulate.');
            }
        });
    }
    const mappings = preset.mappings;
    if (mappings !== undefined && !Array.isArray(mappings)) {
        add('error', 'INVALID_MAPPINGS', 'mappings', 'Expected an array.');
    }
    else if (Array.isArray(mappings)) {
        mappings.forEach((candidate, index) => {
            const path = `mappings[${index}]`;
            if (!isRecord(candidate)) {
                add('error', 'INVALID_MAPPING', path, 'Expected an object.');
                return;
            }
            if (isNonEmptyString(candidate.id)) {
                if (mappingIds.has(candidate.id)) {
                    add('error', 'DUPLICATE_ID', `${path}.id`, `Duplicate mapping id "${candidate.id}".`);
                }
                else {
                    mappingIds.add(candidate.id);
                }
            }
            if (!isNonEmptyString(candidate.sourceId)) {
                add('error', 'MISSING_REQUIRED', `${path}.sourceId`, 'Mapping sourceId is required.');
            }
            else if (!knownSources.has(candidate.sourceId)) {
                add('error', 'UNKNOWN_SOURCE', `${path}.sourceId`, `Unknown mapping source "${candidate.sourceId}".`);
            }
            else if (!availableSources.has(candidate.sourceId)) {
                add('warning', 'SOURCE_UNAVAILABLE', `${path}.sourceId`, `Source "${candidate.sourceId}" is unavailable; runtime fallback ` +
                    `is "${unavailableFallback}".`);
            }
            if (!isNonEmptyString(candidate.targetId)) {
                add('error', 'MISSING_REQUIRED', `${path}.targetId`, 'Mapping targetId is required.');
            }
            else if (!targetIds.has(candidate.targetId)) {
                add('error', 'UNKNOWN_TARGET', `${path}.targetId`, `Unknown visual target "${candidate.targetId}".`);
            }
            if (candidate.kind !== undefined &&
                candidate.kind !== 'continuous' &&
                candidate.kind !== 'event') {
                add('error', 'INVALID_MAPPING_KIND', `${path}.kind`, 'Expected continuous or event.');
            }
            if (candidate.enabled !== undefined &&
                typeof candidate.enabled !== 'boolean') {
                add('error', 'INVALID_MAPPING', `${path}.enabled`, 'Expected a boolean.');
            }
            if (candidate.polarity !== undefined &&
                candidate.polarity !== 'normal' &&
                candidate.polarity !== 'inverted') {
                add('error', 'INVALID_MAPPING', `${path}.polarity`, 'Expected normal or inverted.');
            }
            if (candidate.replaceMode !== undefined &&
                !['multiply', 'add', 'max', 'min', 'replace'].includes(String(candidate.replaceMode))) {
                add('error', 'INVALID_MAPPING', `${path}.replaceMode`, 'Expected multiply, add, max, min, or replace.');
            }
            if (candidate.safetyClamp !== undefined &&
                typeof candidate.safetyClamp !== 'boolean') {
                add('error', 'INVALID_MAPPING', `${path}.safetyClamp`, 'Expected a boolean.');
            }
            if (candidate.kind === 'event') {
                if (!isNonEmptyString(candidate.envelopeId)) {
                    add('error', 'MISSING_REQUIRED', `${path}.envelopeId`, 'Event mapping envelopeId is required.');
                }
                else if (!envelopeIds.has(candidate.envelopeId)) {
                    add('error', 'UNKNOWN_ENVELOPE', `${path}.envelopeId`, `Unknown event envelope "${candidate.envelopeId}".`);
                }
            }
            validateParameterSet(candidate, path, add);
            validateNumber(candidate.gateThreshold, `${path}.gateThreshold`, add, {
                minimum: 0,
                maximum: 1
            });
            validateNumber(candidate.probability, `${path}.probability`, add, {
                minimum: 0,
                maximum: 1
            });
            if (candidate.gateSourceId !== undefined &&
                candidate.gateSourceId !== '') {
                if (!isNonEmptyString(candidate.gateSourceId) ||
                    !knownSources.has(candidate.gateSourceId)) {
                    add('error', 'UNKNOWN_SOURCE', `${path}.gateSourceId`, `Unknown gate source "${String(candidate.gateSourceId)}".`);
                }
                else if (!availableSources.has(candidate.gateSourceId)) {
                    add('warning', 'SOURCE_UNAVAILABLE', `${path}.gateSourceId`, `Gate source "${candidate.gateSourceId}" is unavailable; ` +
                        `runtime fallback is "${unavailableFallback}".`);
                }
            }
            if (candidate.modulations !== undefined &&
                !Array.isArray(candidate.modulations)) {
                add('error', 'INVALID_MAPPING_MODULATIONS', `${path}.modulations`, 'Expected an array.');
            }
            else if (Array.isArray(candidate.modulations)) {
                const modulationIds = new Set();
                candidate.modulations.forEach((modulation, modulationIndex) => {
                    const modulationPath = `${path}.modulations[${modulationIndex}]`;
                    if (!isRecord(modulation)) {
                        add('error', 'INVALID_MAPPING_MODULATION', modulationPath, 'Expected an object.');
                        return;
                    }
                    if (isNonEmptyString(modulation.id)) {
                        if (modulationIds.has(modulation.id)) {
                            add('error', 'DUPLICATE_ID', `${modulationPath}.id`, `Duplicate modulation id "${modulation.id}".`);
                        }
                        else {
                            modulationIds.add(modulation.id);
                        }
                    }
                    if (!isNonEmptyString(modulation.sourceId)) {
                        add('error', 'MISSING_REQUIRED', `${modulationPath}.sourceId`, 'Modulation sourceId is required.');
                    }
                    else if (!knownSources.has(modulation.sourceId)) {
                        add('error', 'UNKNOWN_SOURCE', `${modulationPath}.sourceId`, `Unknown modulation source "${modulation.sourceId}".`);
                    }
                    else if (!availableSources.has(modulation.sourceId)) {
                        add('warning', 'SOURCE_UNAVAILABLE', `${modulationPath}.sourceId`, `Modulation source "${modulation.sourceId}" is unavailable; ` +
                            `runtime fallback is "${unavailableFallback}".`);
                    }
                    if (modulation.targetParameter !== undefined &&
                        !['amount', 'threshold', 'fallMs', 'probability'].includes(String(modulation.targetParameter))) {
                        add('error', 'INVALID_MAPPING_MODULATION', `${modulationPath}.targetParameter`, 'Expected amount, threshold, fallMs, or probability.');
                    }
                    validateNumber(modulation.depth, `${modulationPath}.depth`, add);
                    if (modulation.enabled !== undefined &&
                        typeof modulation.enabled !== 'boolean') {
                        add('error', 'INVALID_MAPPING_MODULATION', `${modulationPath}.enabled`, 'Expected a boolean.');
                    }
                });
            }
            if (candidate.safetyClamp === false) {
                add('warning', 'UNSAFE_CONFIGURATION', `${path}.safetyClamp`, 'Per-mapping target clamp is disabled; final physical caps remain active.');
            }
            if (candidate.ab !== undefined) {
                if (!isRecord(candidate.ab)) {
                    add('error', 'INVALID_AB_STATE', `${path}.ab`, 'Expected an object.');
                }
                else {
                    if (candidate.ab.active !== undefined &&
                        candidate.ab.active !== 'A' &&
                        candidate.ab.active !== 'B') {
                        add('error', 'INVALID_AB_STATE', `${path}.ab.active`, 'Expected A or B.');
                    }
                    validateParameterSet(candidate.ab.a, `${path}.ab.a`, add);
                    validateParameterSet(candidate.ab.b, `${path}.ab.b`, add);
                }
            }
        });
    }
    if (preset.targetDefaults !== undefined) {
        if (!isRecord(preset.targetDefaults)) {
            add('error', 'INVALID_TARGET_DEFAULTS', 'targetDefaults', 'Expected an object.');
        }
        else {
            if (preset.targetDefaults.enabled !== undefined &&
                typeof preset.targetDefaults.enabled !== 'boolean') {
                add('error', 'INVALID_TARGET_DEFAULTS', 'targetDefaults.enabled', 'Expected a boolean.');
            }
            if (preset.targetDefaults.values !== undefined &&
                !isRecord(preset.targetDefaults.values)) {
                add('error', 'INVALID_TARGET_DEFAULTS', 'targetDefaults.values', 'Expected an object of target values.');
            }
            else if (isRecord(preset.targetDefaults.values)) {
                for (const [targetId, value] of Object.entries(preset.targetDefaults.values)) {
                    const path = `targetDefaults.values.${targetId}`;
                    const target = VISUAL_TARGET_BY_ID.get(targetId) ??
                        RENDER_DEFAULT_BOUNDS.get(targetId) ??
                        shaderTargetBounds.get(targetId);
                    if (!target) {
                        add('error', 'UNKNOWN_TARGET', path, `Unknown visual target "${targetId}".`);
                    }
                    else {
                        validateNumber(value, path, add, {
                            minimum: target.min,
                            maximum: target.max
                        });
                    }
                }
            }
        }
    }
    if (preset.energyBudget !== undefined) {
        if (!isRecord(preset.energyBudget)) {
            add('error', 'INVALID_ENERGY_BUDGET', 'energyBudget', 'Expected an object.');
        }
        else {
            if (preset.energyBudget.enabled !== undefined &&
                typeof preset.energyBudget.enabled !== 'boolean') {
                add('error', 'INVALID_ENERGY_BUDGET', 'energyBudget.enabled', 'Expected a boolean.');
            }
            if (preset.energyBudget.experimentalQueueEnabled !== undefined &&
                typeof preset.energyBudget.experimentalQueueEnabled !== 'boolean') {
                add('error', 'INVALID_ENERGY_BUDGET', 'energyBudget.experimentalQueueEnabled', 'Expected a boolean.');
            }
            validateNumber(preset.energyBudget.budget, 'energyBudget.budget', add, {
                minimum: 0.01,
                maximum: 100
            });
            validateNumber(preset.energyBudget.eventVoiceLimit, 'energyBudget.eventVoiceLimit', add, { minimum: 0, maximum: 64, integer: true });
            if (preset.energyBudget.globalEventPolicy !== undefined &&
                preset.energyBudget.globalEventPolicy !== 'drop-low-priority' &&
                preset.energyBudget.globalEventPolicy !== 'queue') {
                add('error', 'INVALID_EVENT_POLICY', 'energyBudget.globalEventPolicy', 'Expected drop-low-priority or queue.');
            }
            if (preset.energyBudget.globalEventPolicy === 'queue' &&
                preset.energyBudget.experimentalQueueEnabled === true) {
                add('warning', 'EXPERIMENTAL_CONFIGURATION', 'energyBudget.experimentalQueueEnabled', 'Experimental event queue is enabled.');
            }
            if (preset.energyBudget.weights !== undefined) {
                if (!isRecord(preset.energyBudget.weights)) {
                    add('error', 'INVALID_ENERGY_WEIGHTS', 'energyBudget.weights', 'Expected an object of target weights.');
                }
                else {
                    for (const [targetId, value] of Object.entries(preset.energyBudget.weights)) {
                        const path = `energyBudget.weights.${targetId}`;
                        if (!targetIds.has(targetId)) {
                            add('error', 'UNKNOWN_TARGET', path, `Unknown energy target "${targetId}".`);
                        }
                        else {
                            validateNumber(value, path, add, { minimum: 0 });
                        }
                    }
                }
            }
        }
    }
    if (preset.safety !== undefined) {
        if (!isRecord(preset.safety)) {
            add('error', 'INVALID_SAFETY', 'safety', 'Expected an object.');
        }
        else {
            for (const field of [
                'whiteoutProtection',
                'blackoutProtection',
                'feedbackRunawayProtection'
            ]) {
                const value = preset.safety[field];
                if (value !== undefined && typeof value !== 'boolean') {
                    add('error', 'INVALID_SAFETY', `safety.${field}`, 'Expected a boolean.');
                }
                else if (value === false) {
                    add('warning', 'UNSAFE_CONFIGURATION', `safety.${field}`, 'Soft safety is disabled; non-disableable physical caps remain active.');
                }
            }
        }
    }
    if (preset.visualClock !== undefined) {
        if (!isRecord(preset.visualClock)) {
            add('error', 'INVALID_VISUAL_CLOCK', 'visualClock', 'Expected an object.');
        }
        else {
            const config = preset.visualClock;
            if (config.enabled !== undefined &&
                typeof config.enabled !== 'boolean') {
                add('error', 'INVALID_VISUAL_CLOCK', 'visualClock.enabled', 'Expected a boolean.');
            }
            if (config.mode !== undefined &&
                !['auto', 'onset', 'rhythm-phase', 'adaptive']
                    .includes(String(config.mode))) {
                add('error', 'INVALID_VISUAL_CLOCK', 'visualClock.mode', 'Expected auto, onset, rhythm-phase, or adaptive.');
            }
            validateNumber(config.minimumConfidence, 'visualClock.minimumConfidence', add, { minimum: 0, maximum: 1 });
            validateNumber(config.refractoryMs, 'visualClock.refractoryMs', add, { minimum: 0 });
            validateNumber(config.sectionBoundaryConfidence, 'visualClock.sectionBoundaryConfidence', add, { minimum: 0, maximum: 1 });
            if (config.resetOnSectionBoundary !== undefined &&
                typeof config.resetOnSectionBoundary !== 'boolean') {
                add('error', 'INVALID_VISUAL_CLOCK', 'visualClock.resetOnSectionBoundary', 'Expected a boolean.');
            }
            if (config.divisions !== undefined) {
                if (!Array.isArray(config.divisions) ||
                    config.divisions.length === 0 ||
                    config.divisions.some(value => !Number.isInteger(value) || ![2, 4, 8, 16].includes(value)) ||
                    new Set(config.divisions).size !== config.divisions.length) {
                    add('error', 'INVALID_VISUAL_CLOCK', 'visualClock.divisions', 'Expected unique divisions selected from 2, 4, 8, and 16.');
                }
            }
        }
    }
    if (preset.nodeGraph !== undefined) {
        const graphIssueStart = issues.length;
        if (!isRecord(preset.nodeGraph)) {
            add('error', 'INVALID_NODE_GRAPH', 'nodeGraph', 'Expected an object.');
        }
        else {
            const nodeIds = new Set();
            const edgeIds = new Set();
            if (preset.nodeGraph.nodes !== undefined &&
                !Array.isArray(preset.nodeGraph.nodes)) {
                add('error', 'INVALID_NODE_GRAPH', 'nodeGraph.nodes', 'Expected an array.');
            }
            else if (Array.isArray(preset.nodeGraph.nodes)) {
                preset.nodeGraph.nodes.forEach((candidate, index) => {
                    const path = `nodeGraph.nodes[${index}]`;
                    if (!isRecord(candidate)) {
                        add('error', 'INVALID_NODE', path, 'Expected an object.');
                        return;
                    }
                    if (!isNonEmptyString(candidate.id)) {
                        add('error', 'MISSING_REQUIRED', `${path}.id`, 'Node id is required.');
                    }
                    else if (nodeIds.has(candidate.id)) {
                        add('error', 'DUPLICATE_ID', `${path}.id`, `Duplicate node id "${candidate.id}".`);
                    }
                    else {
                        nodeIds.add(candidate.id);
                    }
                    if (candidate.kind !== undefined &&
                        ![
                            'bus',
                            'math',
                            'shaper',
                            'logic',
                            'lfo',
                            'sample-hold'
                        ].includes(String(candidate.kind))) {
                        add('error', 'INVALID_NODE_KIND', `${path}.kind`, 'Expected bus, math, shaper, logic, lfo, or sample-hold.');
                    }
                    if (candidate.enabled !== undefined &&
                        typeof candidate.enabled !== 'boolean') {
                        add('error', 'INVALID_NODE', `${path}.enabled`, 'Expected a boolean.');
                    }
                    const enums = [
                        ['busMode', ['sum', 'average', 'max', 'min']],
                        [
                            'mathOperation',
                            ['add', 'subtract', 'multiply', 'divide']
                        ],
                        ['shaperMode', ['clamp', 'power', 'smoothstep']],
                        ['logicOperation', ['greater', 'less', 'and', 'or', 'not']],
                        ['lfoWaveform', ['sine', 'triangle', 'square', 'saw']],
                        ['sampleMode', ['random', 'input']]
                    ];
                    for (const [field, allowed] of enums) {
                        if (candidate[field] !== undefined &&
                            !allowed.includes(String(candidate[field]))) {
                            add('error', 'INVALID_NODE_PARAMETER', `${path}.${field}`, `Expected one of: ${allowed.join(', ')}.`);
                        }
                    }
                    for (const field of [
                        'value',
                        'minimum',
                        'maximum',
                        'phaseOffset',
                        'amplitude',
                        'offset'
                    ]) {
                        validateNumber(candidate[field], `${path}.${field}`, add);
                    }
                    validateNumber(candidate.curve, `${path}.curve`, add, {
                        minimum: 0.000001
                    });
                    validateNumber(candidate.threshold, `${path}.threshold`, add, {
                        minimum: 0,
                        maximum: 1
                    });
                    validateNumber(candidate.frequencyHz, `${path}.frequencyHz`, add, { minimum: 0, maximum: 100 });
                });
            }
            if (preset.nodeGraph.edges !== undefined &&
                !Array.isArray(preset.nodeGraph.edges)) {
                add('error', 'INVALID_NODE_GRAPH', 'nodeGraph.edges', 'Expected an array.');
            }
            else if (Array.isArray(preset.nodeGraph.edges)) {
                preset.nodeGraph.edges.forEach((candidate, index) => {
                    const path = `nodeGraph.edges[${index}]`;
                    if (!isRecord(candidate)) {
                        add('error', 'INVALID_NODE_EDGE', path, 'Expected an object.');
                        return;
                    }
                    if (isNonEmptyString(candidate.id)) {
                        if (edgeIds.has(candidate.id)) {
                            add('error', 'DUPLICATE_ID', `${path}.id`, `Duplicate node edge id "${candidate.id}".`);
                        }
                        else {
                            edgeIds.add(candidate.id);
                        }
                    }
                    if (!isNonEmptyString(candidate.sourceId)) {
                        add('error', 'MISSING_REQUIRED', `${path}.sourceId`, 'Node edge sourceId is required.');
                    }
                    else {
                        const rawSource = candidate.sourceId.startsWith('node:')
                            ? candidate.sourceId.slice('node:'.length)
                            : candidate.sourceId;
                        if (!nodeIds.has(rawSource) &&
                            !knownSources.has(candidate.sourceId)) {
                            add('error', 'UNKNOWN_SOURCE', `${path}.sourceId`, `Unknown node edge source "${candidate.sourceId}".`);
                        }
                        else if (!nodeIds.has(rawSource) &&
                            !availableSources.has(candidate.sourceId)) {
                            add('warning', 'SOURCE_UNAVAILABLE', `${path}.sourceId`, `Node edge source "${candidate.sourceId}" is unavailable; ` +
                                `runtime fallback is "${unavailableFallback}".`);
                        }
                    }
                    if (!isNonEmptyString(candidate.targetNodeId)) {
                        add('error', 'MISSING_REQUIRED', `${path}.targetNodeId`, 'Node edge targetNodeId is required.');
                    }
                    else if (!nodeIds.has(candidate.targetNodeId)) {
                        add('error', 'UNKNOWN_NODE', `${path}.targetNodeId`, `Unknown target node "${candidate.targetNodeId}".`);
                    }
                    if (candidate.targetPort !== undefined &&
                        !isNonEmptyString(candidate.targetPort)) {
                        add('error', 'INVALID_NODE_EDGE', `${path}.targetPort`, 'targetPort must be a non-empty string.');
                    }
                });
            }
            if (issues.slice(graphIssueStart).every(issue => issue.severity !== 'error')) {
                const cycle = findNodeGraphCycle(preset.nodeGraph);
                if (cycle) {
                    add('error', 'NODE_GRAPH_CYCLE', 'nodeGraph.edges', `NodeGraph must be acyclic; cycle: ${cycle.join(' -> ')}.`);
                }
            }
        }
    }
    const valid = !issues.some(issue => issue.severity === 'error');
    let resolvedPreset;
    if (valid) {
        try {
            resolvedPreset = loadPreset(migratedInput);
        }
        catch (error) {
            add('error', 'DEFAULT_RESOLUTION_FAILED', '$', error instanceof Error ? error.message : 'Preset resolution failed.');
        }
    }
    const finalValid = !issues.some(issue => issue.severity === 'error');
    return Object.freeze({
        valid: finalValid,
        sourceSchemaVersion: numericSourceVersion,
        targetSchemaVersion: CURRENT_SCHEMA_VERSION,
        migrated,
        issues: Object.freeze(issues),
        ...(finalValid && resolvedPreset ? { preset: resolvedPreset } : {})
    });
}
export class PresetValidationError extends Error {
    report;
    constructor(report) {
        const issue = report.issues.find(candidate => candidate.severity === 'error');
        super(issue
            ? `Preset validation failed at ${issue.path}: ${issue.message}`
            : 'Preset validation failed.');
        this.name = 'PresetValidationError';
        this.report = report;
    }
}
export function loadValidatedPreset(input, context = {}) {
    const report = validatePreset(input, context);
    if (!report.valid || !report.preset) {
        throw new PresetValidationError(report);
    }
    return report.preset;
}
//# sourceMappingURL=validation.js.map