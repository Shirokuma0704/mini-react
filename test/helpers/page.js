// Loads index.html into jsdom and (optionally) mounts the app on it.
// jsdom does not run <script type="module">, so the test imports src/app.js and calls mountApp itself —
// the same call src/main.js makes in a real browser.
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { mountApp } from '../../src/app.js';

const INDEX = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

export function loadPage({ mount = false } = {}) {
  const dom = new JSDOM(INDEX, { url: 'http://localhost/' });
  const doc = dom.window.document;
  const app = mount ? mountApp(doc) : null;
  return { dom, doc, win: dom.window, app };
}
