import { createReadStream, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT) || 4173;
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  let filename = path.resolve(root, relative || 'demo/index.html');
  if (!filename.startsWith(`${root}${path.sep}`) && filename !== root) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  try {
    if (statSync(filename).isDirectory()) filename = path.join(filename, 'index.html');
    const type = contentTypes[path.extname(filename)] ?? 'application/octet-stream';
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': type
    });
    createReadStream(filename).pipe(response);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Glitch Mapping Generator demo: http://127.0.0.1:${port}/demo/`);
});

