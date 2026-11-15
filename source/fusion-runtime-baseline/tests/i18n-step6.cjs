'use strict';

const assert = require('node:assert/strict');
const { runAudit } = require('../scripts/i18n-release-audit.cjs');

const report = runAudit();
assert.equal(report.ok, true, JSON.stringify(report.details, null, 2));
// The floor is what the catalog holds now (455 on 2026-11-14), so a key that goes missing is noticed.
// It was 450, then lowered to 400 when the calibration panel went; 400 would let 55 keys vanish unseen.
assert.ok(report.counts.catalog >= 455, `expected broad catalog coverage, got ${report.counts.catalog}`);
assert.ok(report.counts.staticBindings >= 100, `expected at least 100 static bindings, got ${report.counts.staticBindings}`);
// 114 before 2026-11-13; the spectrum calibration panel's 27 keys went with the panel.
// 2026-11-14: 87 → 73 with the cat panel's 14 keys (removed) (common.restoreDefault stays, the Glitch panel uses it).
assert.ok(report.counts.dynamicManifestKeys >= 73, `expected broad dynamic coverage, got ${report.counts.dynamicManifestKeys}`);
assert.deepEqual(report.locales, ['zh-CN', 'en-US']);

console.log(
  `XML i18n Step 6: PASS (${report.counts.staticBindings} bindings / ` +
  `${report.counts.requiredKeys} resolved keys)`
);
