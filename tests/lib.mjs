// tests/lib.mjs — shared helpers of the simulator tests: a static server for the app, Playwright lookup, and the steps every test repeats.
// Nothing here touches real devices: the app runs in a browser against the simulated LumiNodes / GigaCores of core/luminex-sim.js.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.woff2':'font/woff2', '.ico':'image/x-icon', '.md':'text/plain' };

// the app is plain static files: serve the repository on a free port (no python / no leftover server to restart)
export function startServer(){
  return new Promise(resolve => {
    const srv = http.createServer((req, rsp) => {
      try {
        const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname), file = path.resolve(ROOT, '.' + (rel.endsWith('/') ? rel + 'index.html' : rel));
        if(!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()){ rsp.writeHead(404); return rsp.end('not found'); }
        rsp.writeHead(200, { 'Content-Type':MIME[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(rsp);
      } catch { rsp.writeHead(500); rsp.end('error'); }
    });
    srv.listen(0, '127.0.0.1', () => resolve({ url:`http://127.0.0.1:${srv.address().port}`, close:() => new Promise(r => srv.close(r)) }));
  });
}

// Playwright is installed outside the repository in the cloud image; the repository may also have it
export async function loadPlaywright(){
  const tries = [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node-tools/node_modules/playwright/index.js'].filter(Boolean);
  for(const t of tries){ try { const m = await import(t.startsWith('/') ? pathToFileURL(t).href : t); return m.default || m; } catch {} }
  throw new Error('Playwright not found. Set PLAYWRIGHT_PATH to the playwright package (cloud image: /opt/node-tools/node_modules/playwright/index.js).');
}

// ---- steps ----
export async function openDemo(t, { advanced = true } = {}){
  const { page, url } = t;
  await page.goto(url + '/index.html');
  await page.waitForFunction(() => window.LKApp && window.Demo && window.NetConfig, null, { timeout:30000 });
  await page.click('[data-w=demo]'); await page.waitForTimeout(1800);
  await page.evaluate(adv => { document.querySelectorAll('.welcome').forEach(x => x.remove()); if(adv) window.AdvNet.setAll(true); }, advanced);
}
export async function openEmpty(t){
  const { page, url } = t;
  await page.goto(url + '/index.html'); await page.waitForFunction(() => window.LKApp && window.Setup, null, { timeout:30000 });
  await page.evaluate(() => document.querySelector('[data-w=new],[data-w=empty]')?.click()); await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelectorAll('.welcome').forEach(x => x.remove()));
}
// open Network config and let it find the simulated devices
export async function discover(t){
  const { page } = t;
  await page.evaluate(() => window.LKApp.navigate('NETCONFIG')); await page.waitForTimeout(600);
  await page.click('#ncDisc'); await page.waitForFunction(() => !window.NetConfig.state.busy, null, { timeout:90000 }); await page.waitForTimeout(3000);
}
// after a send: answer the "Send including IP addresses" question when it comes, wait for the result window, close it
export async function finishSend(t, promiseName = '__send', ms = 240000){
  const { page } = t, t0 = Date.now();
  while(Date.now() - t0 < ms){
    const btn = page.getByRole('button', { name:/Send including IP addresses/ });
    if(await btn.count()) await btn.click().catch(() => {});
    if(await page.locator('.modal-backdrop [data-a=ok]').count()) break;
    await page.waitForTimeout(250);
  }
  await page.evaluate(async n => { await window[n]; }, promiseName);
  await page.locator('.modal-backdrop [data-a=ok]').first().click({ timeout:5000 }).catch(() => {}); await page.waitForTimeout(300);
}
// a tab of the Network page (patch | nodes | switches | addr | fibers | overview)
export async function netTab(t, tab){
  await t.page.evaluate(() => window.LKApp.navigate('NET')); await t.page.waitForTimeout(700);
  await t.page.evaluate(x => document.querySelector(`[data-tab=${x}]`)?.click(), tab); await t.page.waitForTimeout(700);
}
