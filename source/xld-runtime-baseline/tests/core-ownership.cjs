'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const core=require('../core/analysis-service.cjs');
assert.equal(require('../../fusion-runtime-baseline/desktop/xld-analysis-service.cjs'),core,'XML must call the XLD service without a second implementation');
assert.equal(require('../../shared-analysis/derived-assets.cjs'),require('../core/derived-assets.cjs'));
const service=fs.readFileSync(require.resolve('../core/analysis-service.cjs'),'utf8');
assert(!service.includes('fusion-runtime-baseline'),'XLD execution must not depend on XML');
for(const name of ['analysis-midi','analysis-separation']) {
 assert(fs.readFileSync(path.join(__dirname,'..',name,'runner.py'),'utf8').includes('def main()'));
 // XML's September forwarding scripts were removed by audit fix 1 (2026-11-15): nothing called them.
 assert(!fs.existsSync(path.join(__dirname,'../../fusion-runtime-baseline',name,'runner.py')),'XML keeps no runner of its own for '+name);
}
console.log('XLD core ownership: PASS (XML adapter, shared reader, native XLD runners only)');
