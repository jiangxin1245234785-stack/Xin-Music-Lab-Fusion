import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ABSOLUTE_BRIGHTNESS_MAX,
  ABSOLUTE_FLASH_STRENGTH_MAX,
  MIN_FLASH_INTERVAL_MS,
  PhysicalSafetyLimiter,
  VISUAL_TARGETS
} from '../dist/index.js';
import {
  DYNAMIC_SURFACE_TRANSLATIONS,
  EN_US_MESSAGES,
  SURFACE_TRANSLATIONS,
  ZH_CN_MESSAGES,
  createLocaleController,
  translateSurfaceText
} from '../dist/ui/i18n/index.js';
import {
  OPERATION_DESCRIPTOR_CATALOGS,
  SOURCE_DESCRIPTORS,
  STATIC_TARGET_DESCRIPTORS,
  buildSemanticCoverageReport,
  resolveOperationDescriptor,
  resolveSourceDescriptor,
  resolveTargetDescriptor
} from '../dist/ui/semantics/index.js';
import { buildI18nStep1Audit } from './support/i18n-step1-audit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEMO_HTML = path.join(ROOT, 'demo', 'index.html');
const UI_DEBUG_SOURCE = path.join(
  ROOT,
  'src',
  'ui-debug',
  'phase1-demo.ts'
);

const PLACEHOLDER_PATTERN = /\{([A-Za-z0-9_.-]+)\}/g;
const ENGLISH_WORD = /[A-Za-z]{2,}/;
const VISIBLE_TS_CONTEXT = /^(?:graphNode|runDiscrete|registerDiscreteControl|createTechnicalDetails|uniformMetadataItem|updateHistoryControls|set.*(?:Status|Message|State)|render.*)$/i;

const TECHNICAL_SINGLETONS = new Set([
  'WebGL2',
  'GLSL',
  'FBO',
  'RGB',
  'JSON',
  'DAG',
  'LFO',
  'FX Rack',
  'TargetMixer',
  'MappingCard',
  'NodeGraph',
  'EnergyBudget',
  'Clamp',
  'amount',
  'saved',
  'snapshot-restore',
  'idle',
  'ready',
  'error',
  'ok',
  'live',
  'offline',
  'staged',
  'accepted',
  'rejected',
  'warning',
  'pending',
  'working',
  'valid',
  'applied',
  'transparent',
  'none',
  'boolean',
  'number',
  'string',
  'continuous',
  'event',
  'multiply',
  'add',
  'max',
  'min',
  'replace',
  'restart',
  'accumulate',
  'up',
  'down'
]);

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function placeholders(value) {
  return sorted(new Set(
    [...value.matchAll(PLACEHOLDER_PATTERN)].map(match => match[1])
  ));
}

function assertResolvedDescriptor(descriptor, expected, context) {
  assert.equal(descriptor.id, expected.id, `${context}: id`);
  assert.equal(descriptor.labelKey, expected.labelKey, `${context}: labelKey`);
  assert.equal(
    descriptor.descriptionKey,
    expected.descriptionKey,
    `${context}: descriptionKey`
  );
  for (const [field, value] of [
    ['label', descriptor.label],
    ['description', descriptor.description]
  ]) {
    assert.equal(typeof value, 'string', `${context}: ${field} type`);
    assert.ok(value.trim().length > 0, `${context}: empty ${field}`);
    assert.doesNotMatch(value, /^\[[^\]]+\]$/, `${context}: missing ${field}`);
    assert.doesNotMatch(value, /\{[A-Za-z0-9_.-]+\}/, `${context}: ${field}`);
  }
}

function decodeHtmlEntities(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replace(/&#(\d+);/g, (_match, codePoint) =>
      String.fromCodePoint(Number(codePoint))
    );
}

/**
 * Convert a source template to a representative runtime-shaped sample.
 * A conditional interpolation is treated as an empty plural suffix; every
 * other interpolation receives a deterministic numeric token so the existing
 * surface-pattern registry can be exercised without evaluating UI code.
 */
function materializeTemplate(value) {
  const body = value.startsWith('`') && value.endsWith('`')
    ? value.slice(1, -1)
    : value;
  return body
    .replace(/\$\{([^{}]*)\}/g, (_match, expression) =>
      expression.includes("'up'") ? 'up' : expression.includes('?') ? '' : '2'
    )
    .replaceAll('\\n', ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isTechnicalOnly(value) {
  const normalized = value.trim();
  if (!normalized) return true;
  if (TECHNICAL_SINGLETONS.has(normalized)) return true;
  if (/^[#.\[]/.test(normalized)) return true;
  if (/^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/.test(normalized)) return true;
  if (/^(?:https?:|file:|image\/)/i.test(normalized)) return true;
  if (/^(?:E_|GL_|RUNTIME_)[A-Z0-9_]+$/.test(normalized)) return true;
  if (/^(?:audio|state|event|confidence|harmony|visual|glsl|node|mapping|envelope|energyBudget|session|custom)[.:][A-Za-z0-9_.:-]+$/i.test(normalized)) {
    return true;
  }

  const stripped = normalized
    .replace(/\b(?:WebGL2|GLSL|FBO|RGB|JSON|DAG|LFO|KiB|Hz|ms)\b/gi, '')
    .replace(/\b(?:[A-Za-z][A-Za-z0-9_-]*[.:])+[A-Za-z0-9_.:-]+\b/g, '')
    .replace(/\b\d+(?:\.\d+)?\b/g, '')
    .replace(/[\s%+\-.,:[\]()/Â··→⇢]+/g, '');
  return !/[A-Za-z]/.test(stripped);
}

function descriptorEnglishValues() {
  const controller = createLocaleController({ hostLocale: 'en-US' });
  const output = new Set();
  const add = (resolved, raw) => {
    output.add(resolved.label);
    output.add(resolved.description);
    if (raw.technicalAlias) output.add(raw.technicalAlias);
  };
  for (const descriptor of SOURCE_DESCRIPTORS) {
    add(resolveSourceDescriptor(descriptor.id, controller), descriptor);
  }
  for (const descriptor of STATIC_TARGET_DESCRIPTORS) {
    add(resolveTargetDescriptor(descriptor.id, controller), descriptor);
  }
  for (const [domain, catalog] of Object.entries(
    OPERATION_DESCRIPTOR_CATALOGS
  )) {
    for (const descriptor of Object.values(catalog)) {
      add(
        resolveOperationDescriptor(domain, descriptor.id, controller),
        descriptor
      );
    }
  }
  return output;
}

function isCatalogedOrTechnical(value, descriptorValues) {
  if (!ENGLISH_WORD.test(value)) return true;
  if (descriptorValues.has(value)) return true;
  if (Object.prototype.hasOwnProperty.call(SURFACE_TRANSLATIONS, value)) {
    return true;
  }
  if (Object.prototype.hasOwnProperty.call(
    DYNAMIC_SURFACE_TRANSLATIONS,
    value
  )) {
    return true;
  }
  if (translateSurfaceText('zh-CN', value) !== value) return true;
  return isTechnicalOnly(value);
}

function isAuditedUiCandidate(candidate) {
  if (candidate.file === 'demo/index.html') {
    return candidate.classification === 'direct-ui';
  }
  if (candidate.file !== 'src/ui-debug/phase1-demo.ts') return false;
  if (candidate.classification === 'direct-ui') return true;
  return (
    candidate.classification === 'dynamic-ui-candidate' &&
    VISIBLE_TS_CONTEXT.test(candidate.context ?? '')
  );
}

function localeStateCases() {
  const localChinese = createLocaleController();
  localChinese.setLocalLocale('zh-CN');
  const localEnglish = createLocaleController();
  localEnglish.setLocalLocale('en-US');
  const hostChinese = createLocaleController();
  hostChinese.setLocalLocale('en-US');
  hostChinese.setHostLocale('zh-CN');
  const hostEnglish = createLocaleController();
  hostEnglish.setLocalLocale('zh-CN');
  hostEnglish.setHostLocale('en-US');
  return [
    ['local/zh-CN', localChinese],
    ['local/en-US', localEnglish],
    ['host/zh-CN', hostChinese],
    ['host/en-US', hostEnglish]
  ];
}

function runUnsafeSafetySequence(localeController) {
  assert.ok(localeController.getState().source === 'local' ||
    localeController.getState().source === 'host');
  const limiter = new PhysicalSafetyLimiter({
    whiteoutProtection: false,
    blackoutProtection: false,
    feedbackRunawayProtection: false
  });
  const firstFlashMs = Math.ceil(MIN_FLASH_INTERVAL_MS) + 1;
  const sequence = [
    [0, 0, 0],
    [1, firstFlashMs, 99],
    [2, firstFlashMs + 50, 0],
    [3, firstFlashMs + 100, 99],
    [4, firstFlashMs + 150, 0],
    [5, firstFlashMs + Math.ceil(MIN_FLASH_INTERVAL_MS) + 1, 99]
  ];
  let previousNowMs = 0;
  return sequence.map(([frameIndex, nowMs, flashStrength]) => {
    const targets = limiter.apply({
      values: {
        [VISUAL_TARGETS.colorBrightness]: 99,
        [VISUAL_TARGETS.colorFlashStrength]: flashStrength
      }
    }, {
      frameIndex,
      nowMs,
      deltaMs: frameIndex === 0 ? 0 : nowMs - previousNowMs
    });
    previousNowMs = nowMs;
    return structuredClone({
      targets,
      report: limiter.getLastReport()
    });
  });
}

test('Step 6 zh/en catalogs have identical keys and interpolation contracts', () => {
  const englishKeys = sorted(Object.keys(EN_US_MESSAGES));
  const chineseKeys = sorted(Object.keys(ZH_CN_MESSAGES));
  assert.deepEqual(chineseKeys, englishKeys);

  for (const key of englishKeys) {
    const english = EN_US_MESSAGES[key];
    const chinese = ZH_CN_MESSAGES[key];
    assert.equal(typeof english, 'string', `${key}: en-US`);
    assert.equal(typeof chinese, 'string', `${key}: zh-CN`);
    assert.ok(english.trim().length > 0, `${key}: empty en-US`);
    assert.ok(chinese.trim().length > 0, `${key}: empty zh-CN`);
    assert.deepEqual(
      placeholders(chinese),
      placeholders(english),
      `${key}: interpolation placeholders`
    );
  }
});

test('Step 6 nested history labels localize without changing technical evidence', () => {
  assert.equal(
    translateSurfaceText('zh-CN', 'UNDO · Change amount'),
    '撤销 · 更改作用量'
  );
  assert.equal(
    translateSurfaceText('zh-CN', 'REDO · Reorder shader passes'),
    '重做 · 调整画面算法阶段顺序'
  );
  assert.equal(
    translateSurfaceText('zh-CN', 'UNDO · mapping:bass-to-zoom'),
    '撤销 · mapping:bass-to-zoom'
  );

  const html = readFileSync(DEMO_HTML, 'utf8');
  for (const id of [
    'mappingIntentRawIds',
    'mappingDebugReason',
    'targetDebugReason',
    'mappingRawReasonCodes',
    'shaderCompileLog',
    'rawJsonLog'
  ]) {
    assert.match(
      html,
      new RegExp(`id=["']${id}["'][^>]*data-i18n-raw`),
      `${id}: raw evidence boundary`
    );
  }
});

test('Step 6 every registered Source, Target and Operation descriptor resolves in both locales', () => {
  const coverage = buildSemanticCoverageReport();
  assert.equal(coverage.complete, true, JSON.stringify(coverage, null, 2));

  for (const locale of ['zh-CN', 'en-US']) {
    const controller = createLocaleController({ hostLocale: locale });
    for (const descriptor of SOURCE_DESCRIPTORS) {
      assertResolvedDescriptor(
        resolveSourceDescriptor(descriptor.id, controller),
        descriptor,
        `${locale}:source:${descriptor.id}`
      );
    }
    for (const descriptor of STATIC_TARGET_DESCRIPTORS) {
      assertResolvedDescriptor(
        resolveTargetDescriptor(descriptor.id, controller),
        descriptor,
        `${locale}:target:${descriptor.id}`
      );
    }
    for (const [domain, catalog] of Object.entries(
      OPERATION_DESCRIPTOR_CATALOGS
    )) {
      for (const descriptor of Object.values(catalog)) {
        assertResolvedDescriptor(
          resolveOperationDescriptor(
            domain,
            descriptor.id,
            controller
          ),
          descriptor,
          `${locale}:operation:${domain}:${descriptor.id}`
        );
      }
    }
  }
});

test('Step 6 demo and ui-debug visible English is cataloged, semantic or explicitly technical', async () => {
  const audit = await buildI18nStep1Audit(ROOT);
  const descriptors = descriptorEnglishValues();
  const violations = audit.candidates
    .filter(isAuditedUiCandidate)
    .map(candidate => {
      const decoded = decodeHtmlEntities(candidate.text);
      return {
        ...candidate,
        auditedText: candidate.kind === 'ts-template'
          ? materializeTemplate(decoded)
          : decoded
      };
    })
    .filter(candidate => ENGLISH_WORD.test(candidate.auditedText))
    .filter(candidate => !isCatalogedOrTechnical(
      candidate.auditedText,
      descriptors
    ))
    .map(candidate =>
      `${candidate.file}:${candidate.line} ` +
      `[${candidate.kind}/${candidate.context ?? '-'}] ` +
      `${candidate.auditedText}`
    );

  assert.deepEqual(
    violations,
    [],
    `unregistered user-visible English:\n${violations.join('\n')}`
  );
  assert.deepEqual(audit.mojibake.findings, []);
});

test('Step 6 physical safety output and interventions are locale-invariant', () => {
  const results = localeStateCases().map(([name, controller]) => ({
    name,
    state: controller.getState(),
    frames: runUnsafeSafetySequence(controller)
  }));
  const reference = results[0].frames;
  for (const result of results.slice(1)) {
    assert.deepEqual(
      result.frames,
      reference,
      `${result.name} changed physical limiter output`
    );
  }

  const [, first, , tooSoon, , afterInterval] = reference;
  assert.equal(first.targets.values[VISUAL_TARGETS.colorBrightness],
    ABSOLUTE_BRIGHTNESS_MAX);
  assert.equal(first.targets.values[VISUAL_TARGETS.colorFlashStrength],
    ABSOLUTE_FLASH_STRENGTH_MAX);
  assert.equal(first.report.interventions.brightnessCapped, true);
  assert.equal(first.report.interventions.flashStrengthCapped, true);
  assert.equal(tooSoon.targets.values[VISUAL_TARGETS.colorFlashStrength], 0);
  assert.equal(tooSoon.report.interventions.flashFrequencySuppressed, true);
  assert.equal(
    afterInterval.targets.values[VISUAL_TARGETS.colorFlashStrength],
    ABSOLUTE_FLASH_STRENGTH_MAX
  );
  assert.equal(
    afterInterval.report.interventions.flashFrequencySuppressed,
    false
  );
  for (const result of results) {
    assert.equal(result.frames.every(frame =>
      frame.report.physicalCapActive === true
    ), true, `${result.name}: physical cap inactive`);
  }
});

test('Step 6 UI exposes soft-protection toggles but no physical-cap bypass control', () => {
  const html = readFileSync(DEMO_HTML, 'utf8');
  const uiSource = readFileSync(UI_DEBUG_SOURCE, 'utf8');
  const controls = [...html.matchAll(
    /<(?:input|select|button)\b[^>]*\bid=["']([^"']+)["'][^>]*>/gi
  )].map(match => ({ id: match[1], markup: match[0] }));
  const safetyControls = controls
    .filter(control => /safety|physical|absolute|brightness|flash/i.test(
      control.id
    ));

  assert.deepEqual(
    safetyControls.map(control => control.id).sort(),
    [
      'mappingSafetyClamp',
      'safetyBlackout',
      'safetyFeedbackRunaway',
      'safetyWhiteout'
    ]
  );
  assert.equal(
    safetyControls.some(control =>
      /physical|absolute|brightness.*cap|flash.*(?:cap|frequency)/i.test(
        control.id
      )
    ),
    false
  );
  assert.match(html, /class=["']physical-cap-lock["']/i);
  assert.match(html, /PHYSICAL CAP[^<]*LOCKED/i);
  assert.match(uiSource, /const safety = new PhysicalSafetyLimiter\(\)/);
  assert.match(uiSource, /\(\) => safety\.apply\(/);
  assert.doesNotMatch(
    uiSource,
    /(?:physical|absolute)(?:Safety|Cap|Brightness|Flash)(?:Enabled|Toggle|Input)/i
  );
});
