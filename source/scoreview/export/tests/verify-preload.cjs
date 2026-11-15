'use strict';
// For the verify window only: read a local file's bytes (the check reads the video and the song).
const fs = require('node:fs');
window.readBytes = file => { const data = fs.readFileSync(file); return new Uint8Array(data.buffer, data.byteOffset, data.byteLength); };
