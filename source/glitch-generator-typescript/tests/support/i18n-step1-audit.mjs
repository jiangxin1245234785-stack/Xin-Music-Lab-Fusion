import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const DISPLAY_ATTRIBUTES = new Set([
  'aria-label',
  'aria-description',
  'title',
  'placeholder',
  'alt'
]);

const DIRECT_UI_PROPERTIES = new Set([
  'textContent',
  'innerText',
  'innerHTML',
  'value',
  'title',
  'placeholder',
  'ariaLabel'
]);

const TECHNICAL_PROPERTY_NAMES = new Set([
  'code',
  'contract',
  'format',
  'id',
  'kind',
  'module',
  'path',
  'sourceId',
  'state',
  'targetId',
  'type',
  'version'
]);

const MOJIBAKE_PATTERNS = Object.freeze([
  { id: 'latin1-middle-dot', value: '\u00c2\u00b7' },
  { id: 'utf8-arrow', value: '\u00e2\u2020\u2019' },
  { id: 'utf8-em-dash', value: '\u00e2\u20ac\u201d' },
  { id: 'utf8-en-dash', value: '\u00e2\u20ac\u201c' },
  { id: 'utf8-left-quote', value: '\u00e2\u20ac\u0153' },
  { id: 'utf8-right-quote', value: '\u00e2\u20ac\u009d' },
  { id: 'replacement-character', value: '\ufffd' }
]);

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function lineAt(source, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (source.charCodeAt(index) === 10) line += 1;
  }
  return line;
}

function relative(root, filePath) {
  return path.relative(root, filePath).replaceAll('\\', '/');
}

function listFiles(directory, predicate) {
  const output = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...listFiles(resolved, predicate));
    else if (predicate(resolved)) output.push(resolved);
  }
  return output.sort((left, right) => left.localeCompare(right));
}

function maskEmbeddedCode(source) {
  return source.replace(
    /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,
    match => match.replace(/[^\r\n]/g, ' ')
  );
}

function extractHtmlCandidates(root, filePath) {
  const source = readFileSync(filePath, 'utf8');
  const masked = maskEmbeddedCode(source);
  const candidates = [];
  const textPattern = />([^<]+)</g;
  for (const match of masked.matchAll(textPattern)) {
    const text = normalizeWhitespace(match[1] ?? '');
    if (!text) continue;
    candidates.push({
      file: relative(root, filePath),
      line: lineAt(source, (match.index ?? 0) + 1),
      kind: 'html-text',
      classification: 'direct-ui',
      text
    });
  }
  const attributePattern = /\b([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g;
  for (const match of masked.matchAll(attributePattern)) {
    const attribute = String(match[1] ?? '').toLowerCase();
    if (!DISPLAY_ATTRIBUTES.has(attribute)) continue;
    const text = normalizeWhitespace(match[3] ?? '');
    if (!text) continue;
    candidates.push({
      file: relative(root, filePath),
      line: lineAt(source, match.index ?? 0),
      kind: 'html-attribute',
      attribute,
      classification: 'direct-ui',
      text
    });
  }
  return candidates;
}

function propertyName(node) {
  if (!node) return '';
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) return node.text;
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  return '';
}

function ancestor(node, predicate, maximumDepth = 8) {
  let current = node.parent;
  for (let depth = 0; current && depth < maximumDepth; depth += 1) {
    if (predicate(current)) return current;
    current = current.parent;
  }
  return null;
}

function callName(node) {
  const call = ancestor(node, ts.isCallExpression, 5);
  if (!call) return '';
  return propertyName(call.expression);
}

function classifyTsString(node, filePath) {
  const parent = node.parent;
  if (
    (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) &&
    parent.moduleSpecifier === node
  ) return 'technical';
  if (ts.isLiteralTypeNode(parent)) return 'technical';
  if (
    ts.isPropertyAssignment(parent) &&
    parent.name === node
  ) return 'technical';
  if (
    ts.isPropertyAssignment(parent) &&
    TECHNICAL_PROPERTY_NAMES.has(propertyName(parent.name))
  ) return 'technical';
  if (
    ancestor(node, candidate =>
      ts.isNewExpression(candidate) &&
      propertyName(candidate.expression) === 'Error', 4)
  ) return 'technical-error';
  if (
    ts.isPropertyAssignment(parent) &&
    ['message', 'explanation', 'warning'].includes(propertyName(parent.name))
  ) return 'technical-error';
  const assignment = ancestor(node, ts.isBinaryExpression, 3);
  if (
    assignment &&
    assignment.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    DIRECT_UI_PROPERTIES.has(propertyName(assignment.left))
  ) return 'direct-ui';
  const invoked = callName(node);
  if (
    /status|message|notice|toast|empty|render|graph|warning|error|log/i
      .test(invoked)
  ) return 'dynamic-ui-candidate';
  if (
    filePath.includes(`${path.sep}ui-debug${path.sep}`) &&
    /[A-Za-z]{3,}[\s.:!?/·→-]/.test(node.getText())
  ) return 'dynamic-ui-candidate';
  return 'technical-or-unknown';
}

function extractTsCandidates(root, filePath) {
  const sourceText = readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const candidates = [];
  const visit = node => {
    if (
      ts.isStringLiteralLike(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateExpression(node)
    ) {
      const raw = ts.isTemplateExpression(node)
        ? node.getText(sourceFile)
        : node.text;
      const text = normalizeWhitespace(raw);
      if (text) {
        const location = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(sourceFile)
        );
        candidates.push({
          file: relative(root, filePath),
          line: location.line + 1,
          kind: ts.isTemplateExpression(node) ? 'ts-template' : 'ts-string',
          classification: classifyTsString(node, filePath),
          context: callName(node) || propertyName(node.parent?.name),
          text
        });
      }
      if (ts.isTemplateExpression(node)) return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return candidates;
}

function scanMojibake(root, files) {
  const findings = [];
  for (const filePath of files) {
    const source = readFileSync(filePath, 'utf8');
    for (const pattern of MOJIBAKE_PATTERNS) {
      let offset = source.indexOf(pattern.value);
      while (offset >= 0) {
        findings.push({
          file: relative(root, filePath),
          line: lineAt(source, offset),
          pattern: pattern.id,
          text: pattern.value
        });
        offset = source.indexOf(pattern.value, offset + pattern.value.length);
      }
    }
  }
  return findings;
}

function summarizeCandidates(candidates) {
  const byClassification = {};
  const byKind = {};
  const byFile = {};
  for (const candidate of candidates) {
    byClassification[candidate.classification] =
      (byClassification[candidate.classification] ?? 0) + 1;
    byKind[candidate.kind] = (byKind[candidate.kind] ?? 0) + 1;
    byFile[candidate.file] = (byFile[candidate.file] ?? 0) + 1;
  }
  return {
    total: candidates.length,
    byClassification,
    byKind,
    byFile
  };
}

async function buildRegistryAudit(root) {
  const moduleUrl = pathToFileURL(path.join(root, 'dist', 'index.js')).href;
  const runtime = await import(`${moduleUrl}?i18n-step1-audit`);
  const coreSourceIds = [...runtime.CORE_MAPPING_SOURCE_IDS].sort();
  const runtimeSourceIds = [...runtime.RUNTIME_SOURCE_IDS].sort();
  const coreSet = new Set(coreSourceIds);
  const runtimeSet = new Set(runtimeSourceIds);
  const formalTargetIds = runtime.VISUAL_TARGET_REGISTRY
    .map(definition => definition.id)
    .sort();
  const allStaticTargetIds = Object.values(runtime.VISUAL_TARGETS).sort();
  const formalSet = new Set(formalTargetIds);
  return {
    sourceRegistry: {
      coreCount: coreSourceIds.length,
      runtimeCount: runtimeSourceIds.length,
      exactSetMatch:
        coreSourceIds.length === runtimeSourceIds.length &&
        coreSourceIds.every((id, index) => id === runtimeSourceIds[index]),
      onlyInCore: coreSourceIds.filter(id => !runtimeSet.has(id)),
      onlyInRuntime: runtimeSourceIds.filter(id => !coreSet.has(id)),
      ids: runtimeSourceIds
    },
    targetRegistry: {
      formalCount: formalTargetIds.length,
      staticConstantCount: allStaticTargetIds.length,
      formalIds: formalTargetIds,
      legacyOrFallbackIds: allStaticTargetIds.filter(id => !formalSet.has(id)),
      dynamicTargetPrefix: 'glsl:'
    },
    unifiedFeatureIds: [...runtime.UNIFIED_MUSIC_FEATURE_IDS],
    mixerPipeline: [...runtime.TARGET_MIXER_STEPS]
  };
}

export async function buildI18nStep1Audit(root) {
  const htmlFiles = listFiles(
    path.join(root, 'demo'),
    filePath => filePath.endsWith('.html')
  );
  const tsFiles = listFiles(
    path.join(root, 'src'),
    filePath => filePath.endsWith('.ts')
  );
  const scanFiles = [
    ...tsFiles,
    ...listFiles(
      path.join(root, 'demo'),
      filePath => /\.(html|css|js|ts)$/.test(filePath)
    )
  ];
  const candidates = [
    ...htmlFiles.flatMap(filePath => extractHtmlCandidates(root, filePath)),
    ...tsFiles.flatMap(filePath => extractTsCandidates(root, filePath))
  ].sort((left, right) =>
    left.file.localeCompare(right.file) ||
    left.line - right.line ||
    left.text.localeCompare(right.text)
  );
  return {
    format: 'xin.glitch-generator.i18n-step1-audit/1',
    scope: {
      htmlFiles: htmlFiles.map(filePath => relative(root, filePath)),
      typescriptFileCount: tsFiles.length,
      scanRoots: ['demo/', 'src/']
    },
    summary: summarizeCandidates(candidates),
    candidates,
    mojibake: {
      patterns: MOJIBAKE_PATTERNS.map(pattern => pattern.id),
      findings: scanMojibake(root, scanFiles)
    },
    registry: await buildRegistryAudit(root)
  };
}

export function renderI18nStep1AuditMarkdown(audit) {
  const lines = [
    '# Step 1 UI 文本与注册表盘点',
    '',
    `- 候选文本总数：${audit.summary.total}`,
    `- HTML 文件：${audit.scope.htmlFiles.length}`,
    `- TypeScript 文件：${audit.scope.typescriptFileCount}`,
    `- 已确认乱码：${audit.mojibake.findings.length}`,
    `- Runtime Source：${audit.registry.sourceRegistry.runtimeCount}`,
    `- 正式 Visual Target：${audit.registry.targetRegistry.formalCount}`,
    `- Source 集合一致：${audit.registry.sourceRegistry.exactSetMatch ? '是' : '否'}`,
    '',
    '## 分类统计',
    '',
    '| 分类 | 数量 |',
    '|---|---:|',
    ...Object.entries(audit.summary.byClassification)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `| ${key} | ${value} |`),
    '',
    '## 乱码扫描',
    '',
    ...(audit.mojibake.findings.length === 0
      ? ['当前 `demo/` 与 `src/` 未发现已登记的乱码序列。']
      : audit.mojibake.findings.map(finding =>
          `- ${finding.file}:${finding.line} · ${finding.pattern} · ${finding.text}`
        )),
    '',
    '## Registry 边界',
    '',
    `- Core/Runtime Source 集合一致：${audit.registry.sourceRegistry.exactSetMatch}`,
    `- Legacy/Fallback Target：${audit.registry.targetRegistry.legacyOrFallbackIds.join(', ') || '无'}`,
    `- 动态 GLSL Target 前缀：${audit.registry.targetRegistry.dynamicTargetPrefix}`,
    '',
    '## 自动遗漏检查方法',
    '',
    '1. 重新运行 `pnpm step1:capture` 生成最新 JSON/Markdown。',
    '2. `i18n-step1-audit.test.mjs` 检查扫描确定性、Source 集合一致和乱码回归。',
    '3. 后续 Step 2–4 以本清单为迁移输入，而不是批量搜索替换。',
    '4. 原始技术错误保留英文；只在 UI presenter 中提供中文摘要。',
    ''
  ];
  return `${lines.join('\n')}\n`;
}
