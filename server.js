// `npm start`: serve the page over http so the browser can load ES modules (they do not load from file://).
// Node's own http module only, no dependency. Only the page files (ALLOWED below) are served.
//
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

// The only files the pages need: index.html (Phase 1 verification page), hooks.html (Phase 2 check page),
// style.css and the ES modules directly in src/.
const ALLOWED = /^\/(?:index\.html|hooks\.html|style\.css|src\/[A-Za-z0-9_-]+\.js)$/;

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
    if (urlPath === '/') urlPath = '/index.html';

    // Allowlist, not a blocklist: Windows reaches the same folder through many spellings (/NODE_MODULES/,
    // node_modules::$INDEX_ALLOCATION, node_modules.), found by Codex layout r1 and r2. Only the page's own files
    // match this pattern, and none of them can name another folder.
    if (!ALLOWED.test(urlPath)) return send(res, 404, 'not found');
    const file = path.join(ROOT, ...urlPath.slice(1).split('/'));

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
