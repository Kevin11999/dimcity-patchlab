#!/usr/bin/env node
// tests/run.mjs — runs the simulator tests of PatchLab: node tests/run.mjs [--only text] [--list] [--verbose]
// Starts its own web server, opens one fresh browser page per test, prints a short summary and exits 1 when something fails.
// Everything runs against the simulated devices. Nothing here proves how a real LumiNode / GigaCore, Mac or Windows behaves.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, startServer, loadPlaywright } from './lib.mjs';

const args = process.argv.slice(2), only = args.includes('--only') ? args[args.indexOf('--only') + 1] : '', verbose = args.includes('--verbose');
const dir = path.join(ROOT, 'tests', 'cases');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.mjs')).sort().filter(f => !only || f.includes(only));
const cases = []; for(const f of files){ const m = (await import(pathToFileURL(path.join(dir, f)).href)).default; cases.push({ file:f, ...m }); }
if(args.includes('--list')){ for(const c of cases) console.log(`${c.file.padEnd(44)} ${c.name}`); process.exit(0); }
if(!cases.length){ console.log('no tests match'); process.exit(1); }

const server = await startServer();
const needBrowser = cases.some(c => c.kind !== 'node');
const pw = needBrowser ? await loadPlaywright() : null, browser = pw ? await pw.chromium.launch() : null;
let failed = 0, passed = 0; const t0 = Date.now();
for(const c of cases){
  const checks = [], t = { url:server.url, checks, ok:(cond, msg) => { checks.push({ pass:!!cond, msg }); return !!cond; }, info:msg => { if(verbose) console.log('   · ' + msg); } };
  const s0 = Date.now(); let ctx = null;
  try {
    if(c.kind !== 'node'){ ctx = await browser.newContext({ viewport:{ width:1500, height:1300 } }); t.page = await ctx.newPage(); t.page.on('pageerror', e => checks.push({ pass:false, msg:'page error: ' + String(e.message).slice(0, 200) })); }
    await Promise.race([c.run(t), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), c.timeout || 240000))]);
  } catch(e){ checks.push({ pass:false, msg:'crashed: ' + String(e.message || e).split('\n')[0].slice(0, 240) }); }
  finally { try { await ctx?.close(); } catch {} }
  const bad = checks.filter(x => !x.pass); bad.length ? failed++ : passed++;
  console.log(`${bad.length ? 'FAIL' : 'PASS'}  ${c.file.replace(/\.mjs$/, '').padEnd(40)} ${checks.length - bad.length}/${checks.length} checks  ${((Date.now() - s0) / 1000).toFixed(0)}s`);
  for(const x of (verbose ? checks : bad)) console.log(`      ${x.pass ? '✓' : '✗'} ${x.msg}`);
}
await browser?.close(); await server.close();
console.log(`\n${failed ? 'FAILED' : 'ALL OK'}: ${passed} passed, ${failed} failed, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
process.exit(failed ? 1 : 0);
