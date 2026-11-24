// Measures the owner home first load on slow 4G (400 kbps, 400 ms) through CDP, served gzipped like GitHub Pages.
// Usage: node tools/measure-load.mjs [h1|plain]   default: HTTP/2 + gzip (what GitHub Pages serves); h1 = HTTP/1.1 + gzip (6 connections); plain = HTTP/1.1, no gzip.
import http from 'node:http';
import http2 from 'node:http2';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { chromium } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');
const mode = process.argv[2] || 'h2'; const plain = mode === 'plain';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json' };
const handler = (req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  const ext = path.extname(p); let body = fs.readFileSync(p); const h = { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'max-age=600' };
  if (!plain && ['.html', '.js', '.css', '.svg', '.json'].includes(ext)) { body = zlib.gzipSync(body); h['content-encoding'] = 'gzip'; }
  res.writeHead(200, h); res.end(body);
};
let server;
if (mode === 'h2') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cert-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${dir}/k.pem`, '-out', `${dir}/c.pem`, '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
  server = http2.createSecureServer({ key: fs.readFileSync(`${dir}/k.pem`), cert: fs.readFileSync(`${dir}/c.pem`) }, handler).listen(0);
} else server = http.createServer(handler).listen(0);
await new Promise((r) => server.once('listening', r));
const port = server.address().port;

const browser = await chromium.launch();
const runs = [];
for (let i = 0; i < 3; i++) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8 });
  let bytes = 0;
  cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; });
  const t0 = Date.now();
  await page.goto(`${mode === 'h2' ? 'https' : 'http'}://localhost:${port}/index.html#/owner`, { waitUntil: 'commit' });
  await page.waitForSelector('[data-bar]', { timeout: 60000 });
  const bar = Date.now() - t0;
  await page.waitForLoadState('load');
  runs.push({ barMs: bar, loadMs: Date.now() - t0, kb: Math.round(bytes / 1024) });
  await ctx.close();
}
await browser.close(); server.close();
runs.sort((a, b) => a.barMs - b.barMs);
console.log(mode, JSON.stringify(runs), 'median bar visible', runs[1].barMs, 'ms');
