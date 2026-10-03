// Records the tutorial videos: a screen recording of the app (720p) with a female English voice and subtitles.
//   node tools/make-videos.mjs [part ...]        (all parts when none is named)
// Needs: playwright, ffmpeg, python3 with kokoro-onnx (tools/tts.py), and a static server in the repo root:
//   python3 -m http.server 8765 --bind 127.0.0.1
// Output: assets/videos/<part>.webm (VP9 + Opus) and assets/videos/index.json
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright/index.js'); }
const { chromium } = pw;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'assets', 'videos');
const TMP = path.join(process.env.VIDEO_TMP || '/tmp', 'dcpl-video-tmp');
const W = 1280, H = 720;
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(TMP, { recursive: true });
const { PARTS, OVERLAY } = await import('./video-scenes.mjs');
const sha = t => crypto.createHash('sha1').update(t).digest('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 1. the voice: one clip per sentence
const want = process.argv.slice(2).filter(a => !a.startsWith('-'));
const parts = want.length ? PARTS.filter(p => want.includes(p.id)) : PARTS;
const lines = [...new Set(parts.flatMap(p => p.steps.map(s => s.say)))];
const AUD = path.join(TMP, 'audio');
fs.writeFileSync(path.join(TMP, 'lines.json'), JSON.stringify(lines));
console.log('voice:', lines.length, 'sentences');
execFileSync('python3', [path.join(ROOT, 'tools', 'tts.py'), path.join(TMP, 'lines.json'), AUD], { stdio: 'inherit' });
const dur = f => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());

async function record(part){
  const dir = path.join(TMP, part.id); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(OVERLAY);
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('  PAGEERROR', e.message));
  await page.goto('http://127.0.0.1:8765/index.html');
  await page.waitForFunction(() => window.LKApp && window.Demo && window.Setup && window.RackAdvisor);
  await page.evaluate(() => window.I18n.setLanguage('en'));
  await page.evaluate(async () => { await window.Demo.open({ silent: true, tutorial: true }); });
  await page.waitForTimeout(800);
  const k = helpers(page);
  await part.prep?.(k);
  await page.waitForTimeout(500);
  // 2. screencast frames (JPEG, high quality) with their own clock, so audio and picture stay in step
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', async f => {
    const n = frames.length; fs.writeFileSync(path.join(dir, `f${String(n).padStart(5, '0')}.jpg`), Buffer.from(f.data, 'base64'));
    frames.push(f.metadata.timestamp);
    try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch {}
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  await page.evaluate(([t]) => { const c = document.getElementById('vttl'); c.textContent = t; c.style.display = 'block'; }, [part.title]);
  while(!frames.length) await sleep(50);
  const t0 = frames[0];
  const audio = [];
  await sleep(700);
  let si = 0;
  for(const step of part.steps){ si++;
    const wav = path.join(AUD, sha(step.say) + '.wav'), d = dur(wav);
    await page.evaluate(([x]) => { const c = document.getElementById('vcap'); c.textContent = x; c.classList.remove('off'); }, [step.say]);
    audio.push({ wav, at: Date.now() / 1000 - t0 });
    await Promise.all([step.do ? step.do(k).catch(e => console.log(`  step ${si} failed:`, e.message.split('\n').slice(0, 2).join(' '))) : null, sleep(d * 1000 + 450)]);
  }
  await page.evaluate(() => document.getElementById('vcap')?.classList.add('off'));
  await sleep(900);
  const tEnd = Date.now() / 1000;
  await cdp.send('Page.stopScreencast'); await sleep(200);
  await ctx.close(); await browser.close();
  // 3. encode: frames with their durations, then the voice on top
  const list = [];
  frames.forEach((ts, i) => { const next = i + 1 < frames.length ? frames[i + 1] : tEnd; list.push(`file 'f${String(i).padStart(5, '0')}.jpg'`, `duration ${Math.max(0.02, next - ts).toFixed(3)}`); });
  list.push(`file 'f${String(frames.length - 1).padStart(5, '0')}.jpg'`);
  fs.writeFileSync(path.join(dir, 'list.txt'), list.join('\n'));
  const inputs = audio.flatMap(a => ['-i', a.wav]);
  const filt = audio.map((a, i) => `[${i + 1}:a]adelay=${Math.round(a.at * 1000)}:all=1[a${i}]`).join(';') + `;${audio.map((_, i) => `[a${i}]`).join('')}amix=inputs=${audio.length}:normalize=0[aout]`;
  const outFile = path.join(OUT, `${part.id}.webm`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'), ...inputs,
    '-filter_complex', filt, '-map', '0:v', '-map', '[aout]',
    '-vf', 'fps=25,scale=1280:720:flags=lanczos', '-c:v', 'libvpx-vp9', '-crf', '33', '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '3',
    '-c:a', 'libopus', '-b:a', '56k', '-shortest', outFile], { stdio: 'inherit' });
  console.log('  ', path.basename(outFile), (fs.statSync(outFile).size / 1048576).toFixed(2), 'MB', frames.length, 'frames');
}

function helpers(page){
  const q = s => page.locator(s).first();
  const k = {
    page, wait: ms => page.waitForTimeout(ms),
    async move(sel){ const b = await q(sel).boundingBox(); if(!b) throw new Error('no box ' + sel); await page.mouse.move(b.x + b.width / 2, b.y + Math.min(b.height / 2, 24), { steps: 24 }); },
    async click(sel){ await q(sel).waitFor({ state: 'visible', timeout: 5000 }); await k.move(sel); await page.waitForTimeout(300); await q(sel).click(); await page.waitForTimeout(600); },
    async hover(sel){ await q(sel).waitFor({ state: 'visible', timeout: 5000 }); await k.move(sel); await page.waitForTimeout(500); },
    async select(sel, value){ await q(sel).waitFor({ state: 'visible', timeout: 5000 }); await k.move(sel); await page.waitForTimeout(350); await q(sel).selectOption(value); await page.waitForTimeout(700); },
    async fill(sel, text){ await q(sel).waitFor({ state: 'visible', timeout: 5000 }); await k.move(sel); await q(sel).fill(text); await q(sel).dispatchEvent('change'); await page.waitForTimeout(700); },
    async go(view){ await k.click(`.nav-item[data-view="${view}"]`); await page.waitForTimeout(400); },
    async openDim(dc){ await page.evaluate(d => window.LKApp.openEntity('DIM', d), dc); await page.waitForTimeout(800); },
    async scrollMain(y){ await page.evaluate(v => { const s = document.getElementById('mainScroll'); if(s) s.scrollTo({ top: v, behavior: 'smooth' }); }, y); await page.waitForTimeout(900); },
    async scrollTo(sel){ await page.evaluate(s => document.querySelector(s)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), sel); await page.waitForTimeout(1000); },
    async closeDialog(){
      const done = await page.evaluate(() => { const bs = [...document.querySelectorAll('.modal-backdrop button, .modal button, dialog button')].filter(x => x.offsetParent !== null).reverse(); const b = bs.find(x => /^(cancel|close|done|annuleren|sluiten)$/i.test(x.textContent.trim())); if(b){ b.click(); return true; } return false; });
      if(!done) await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    },
    ev: (fn, arg) => page.evaluate(fn, arg)
  };
  return k;
}

for(const p of parts){ console.log('recording', p.id); await record(p); }
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(PARTS.map(p => ({ id: p.id, title: p.title })), null, 1));
