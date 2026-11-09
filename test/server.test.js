// Tests for goal rule "npm start serves the folder with a tiny Node http server (no new dependency)".
// ES modules do not load from file://, so the page must come over http with a JavaScript MIME type.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createServer } from '../server.js';

let server;
let base;

before(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

test('GET / serves index.html as HTML', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^text\/html/);
  assert.match(await res.text(), /<script type="module" src="\.\/src\/main\.js"><\/script>/);
});

test('ES module files are served with a JavaScript MIME type', async () => {
  for (const path of ['/src/main.js', '/src/app.js', '/src/render.js', '/src/domToVdom.js']) {
    const res = await fetch(`${base}${path}`);
    assert.equal(res.status, 200, path);
    assert.match(res.headers.get('content-type'), /^text\/javascript/, path);
  }
});

test('the stylesheet is served as CSS', async () => {
  const res = await fetch(`${base}/style.css`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^text\/css/);
});

test('a missing file is 404', async () => {
  const res = await fetch(`${base}/nope.js`);
  assert.equal(res.status, 404);
});

// spec-draft.md exists only in the parent folder (Week11~12/), so any 200 here means the server left its folder.
// Raw http.get, because fetch() would clean up "/../" before sending it.
function rawGet(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: server.address().port, path }, (res) => {
      res.resume();
      resolve(res.statusCode);
    }).on('error', reject);
  });
}

test('paths outside the folder are refused', async () => {
  for (const path of ['/../spec-draft.md', '/..%2fspec-draft.md', '/%2e%2e/spec-draft.md', '/src/..%2f..%2fspec-draft.md', '/..%5cspec-draft.md']) {
    const status = await rawGet(path);
    assert.ok(status === 400 || status === 403 || status === 404, `${path} -> ${status}`);
  }
});

test('node_modules and .git are not served', async () => {
  // Windows file names ignore case, so the upper-case spellings must be refused too (Codex layout r1).
  for (const path of ['/node_modules/jsdom/package.json', '/NODE_MODULES/jsdom/package.json', '/Node_Modules/jsdom/package.json', '/.git/HEAD', '/.GIT/HEAD']) {
    const res = await fetch(`${base}${path}`);
    assert.ok(res.status === 403 || res.status === 404, `${path} -> ${res.status}`);
  }
});
