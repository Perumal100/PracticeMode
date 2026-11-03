/**
 * Static server for the test fixtures.
 *
 *   npm run fixtures          → http://localhost:4317/  (index of all fixtures)
 *
 * localhost counts as a local test fixture, so automatic navigation is
 * allowed there without a consent prompt. React for test03 is served from
 * node_modules at /vendor/.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(here, 'fixtures');
const NODE_MODULES = path.join(here, '..', 'node_modules');
const VENDOR = {
  '/vendor/react.development.js': path.join(NODE_MODULES, 'react/umd/react.development.js'),
  '/vendor/react-dom.development.js': path.join(NODE_MODULES, 'react-dom/umd/react-dom.development.js'),
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };

export function startServer(port = 0) {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = VENDOR[urlPath] || path.join(FIXTURES, urlPath === '/' ? 'index.html' : urlPath);
    if (!VENDOR[urlPath] && !file.startsWith(FIXTURES)) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404).end('Not found');
        return;
      }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4317);
  startServer(port).then(() => console.log(`PracticeMode fixtures: http://localhost:${port}/`));
}
