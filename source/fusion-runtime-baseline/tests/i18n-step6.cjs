'use strict';

const assert = require('node:assert/strict');
const { runAudit } = require('../scripts/i18n-release-audit.cjs');

const report = runAudit();
assert.equal(report.ok, true, JSON.stringify(report.details, null, 2));
assert.ok(report.counts.catalog >= 450, `expected broad catalog coverage, got ${report.counts.catalog}`);
assert.ok(report.counts.staticBindings >= 100, `expected at least 100 static bindings, got ${report.counts.staticBindings}`);
assert.ok(report.counts.dynamicManifestKeys >= 100, `expected broad dynamic coverage, got ${report.counts.dynamicManifestKeys}`);
assert.deepEqual(report.locales, ['zh-CN', 'en-US']);

console.log(
  `XML i18n Step 6: PASS (${report.counts.staticBindings} bindings / ` +
  `${report.counts.requiredKeys} resolved keys)`
);
