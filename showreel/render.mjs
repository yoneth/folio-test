// Renders reel.html frame-by-frame in headless Chromium.
//   node render.mjs                 -> all 900 frames into frames/
//   node render.mjs 0.6 3.2 8.3     -> stills at those times into stills/
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');

const dir = path.dirname(fileURLToPath(import.meta.url));
const FPS = 60, DUR = 15, TOTAL = FPS * DUR;
const WORKERS = Number(process.env.WORKERS || 4);
const SAMPLES = Number(process.env.SAMPLES || 6);
const stills = process.argv.slice(2).map(Number);

const types = { '.html': 'text/html', '.woff2': 'font/woff2', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  const f = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(dir) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/reel.html?render`;

const outDir = path.join(dir, stills.length ? 'stills' : 'frames');
fs.mkdirSync(outDir, { recursive: true });
const jobs = stills.length ? stills.map(t => ({ fi: Math.round(t * FPS), name: `t${t.toFixed(2)}.png` }))
  : [...Array(TOTAL).keys()].map(fi => ({ fi, name: `f${String(fi).padStart(4, '0')}.png` }));

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const t0 = Date.now();
let done = 0;
await Promise.all([...Array(Math.min(WORKERS, jobs.length)).keys()].map(async w => {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', e => console.error('pageerror', e));
  await page.goto(url);
  await page.evaluate(() => window.READY);
  for (let j = w; j < jobs.length; j += WORKERS) {
    const { fi, name } = jobs[j];
    const b64 = await page.evaluate(([fi, s]) => { window.renderFrame(fi, s); return document.getElementById('c').toDataURL('image/png').slice(22); }, [fi, SAMPLES]);
    fs.writeFileSync(path.join(outDir, name), Buffer.from(b64, 'base64'));
    if (++done % 60 === 0) console.log(`${done}/${jobs.length}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
}));
await browser.close();
server.close();
console.log(`rendered ${done} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${outDir}`);
