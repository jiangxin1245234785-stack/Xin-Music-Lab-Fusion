import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeSurfaceText,
  translateSurfaceText
} from '../dist/ui/i18n/index.js';
import {
  SURFACE_TRANSLATION_COUNT,
  SURFACE_TRANSLATIONS
} from '../dist/ui/i18n/surface-catalog.js';

const FIVE_PAGE_TERMS = Object.freeze([
  ['Perform', '实时预览'],
  ['Map', '映射关系'],
  ['Visual', '画面参数'],
  ['Shader', '画面算法'],
  ['Advanced', '系统与诊断']
]);

const FIVE_PAGE_ARIA_TERMS = Object.freeze([
  ['Generator pages', '生成器页面'],
  ['Perform page', '实时预览页面'],
  ['Map page', '映射关系页面'],
  ['Visual page', '画面参数页面'],
  ['Shader page', '画面算法页面'],
  ['Advanced page', '系统与诊断页面'],
  ['Audio input', '音频输入'],
  ['Mapping operations', '映射操作'],
  ['Visual target', '画面效果'],
  ['Shader compile report', '着色器编译报告'],
  ['Performance profiler', '性能分析器']
]);

test('Step 4 static surface catalog is normalized and bilingual', () => {
  const entries = Object.entries(SURFACE_TRANSLATIONS);
  assert.equal(SURFACE_TRANSLATION_COUNT, entries.length);
  assert.ok(
    entries.length >= 400,
    `expected broad five-page coverage; received ${entries.length} entries`
  );

  for (const [english, chinese] of entries) {
    assert.equal(english, normalizeSurfaceText(english), english);
    assert.ok(chinese.trim().length > 0, english);
    if (chinese === english) {
      assert.match(
        english,
        /^\d+(?:\.\d+)? ms$/,
        `${english} may remain identical only when it is a unit value`
      );
    }
  }
});

test('Step 4 exposes Chinese-first terminology for all five pages', () => {
  for (const [english, chinese] of FIVE_PAGE_TERMS) {
    assert.equal(translateSurfaceText('zh-CN', english), chinese);
    assert.equal(translateSurfaceText('en-US', english), english);
  }
});

test('Step 4 localizes representative aria and workflow copy on every page', () => {
  for (const [english, chinese] of FIVE_PAGE_ARIA_TERMS) {
    assert.equal(translateSurfaceText('zh-CN', english), chinese);
    assert.equal(translateSurfaceText('en-US', english), english);
  }

  assert.equal(
    translateSurfaceText('zh-CN', '12 MAPPINGS · 3 CORE NODES'),
    '12 条映射 · 3 个核心节点'
  );
  assert.equal(
    translateSurfaceText('zh-CN', 'REVISION 7'),
    '修订 7'
  );
  assert.equal(
    translateSurfaceText('zh-CN', 'OFFLINE DETERMINISTIC'),
    '离线确定性播放'
  );
  assert.equal(
    translateSurfaceText('zh-CN', 'PRESET SAVED'),
    '预设已保存'
  );
  assert.equal(
    translateSurfaceText(
      'zh-CN',
      'Show original code, path and message'
    ),
    '展开原始代码、路径和消息'
  );
});

test('Step 4 never translates technical IDs, JSON keys or raw error codes', () => {
  const rawValues = [
    'audio.bass',
    'state.inClimax',
    'event.sectionBoundary',
    'visual.feedback.zoom',
    'glsl:custom.u_corruptionAmount',
    'u_corruptionAmount',
    'schemaVersion',
    'E_SHADER_COMPILE_001',
    'GL_INVALID_OPERATION',
    'RUNTIME_CLOCK_MISMATCH',
    'mapping:bass-to-zoom',
    '[E_SHADER_COMPILE_001] ERROR: 0:17: unexpected token "}"'
  ];

  for (const value of rawValues) {
    assert.equal(translateSurfaceText('zh-CN', value), value, value);
    assert.equal(translateSurfaceText('en-US', value), value, value);
    assert.equal(
      Object.prototype.hasOwnProperty.call(SURFACE_TRANSLATIONS, value),
      false,
      `${value} must remain outside the presentation catalog`
    );
  }
});
