// `npm start`: serve this folder over http so the browser can load ES modules (they do not load from file://).
// Node's own http module only, no dependency. Only files under this folder are served; node_modules and dot-folders
// (.git) are refused.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

export function createServer() {
  return http.createServer(async (req, res) => {
    let urlPath;
    try {
      urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch {
      return send(res, 400, 'bad request');
    }
    if (urlPath.endsWith('/')) urlPath += 'index.html';

    const file = path.resolve(ROOT, '.' + urlPath);
    const rel = path.relative(ROOT, file);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return send(res, 403, 'forbidden');
    // Lower-cased: Windows file names ignore case, so /NODE_MODULES/ reaches the same folder (Codex layout r1).
    const parts = rel.toLowerCase().split(path.sep);
    if (parts.some((p) => p === 'node_modules' || p.startsWith('.'))) return send(res, 403, 'forbidden');

    try {
      const body = await readFile(file);
      send(res, 200, body, TYPES[path.extname(file)] ?? 'application/octet-stream');
    } catch {
      send(res, 404, 'not found');
    }
  });
}

// Started directly (`node server.js`), not imported by a test.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 5173;
  createServer().listen(port, '127.0.0.1', () => {
    console.log(`mini-react 검증 페이지: http://localhost:${port}/`);
  });
}
