// Records the tutorial videos: a screen recording of the whole app window (1080p) with a female English voice.
// No text is burned into the picture; the subtitles come as a separate WebVTT file (assets/videos/<id>.vtt) the player can switch on.
//   node tools/make-videos.mjs [part ...]        (all parts when none is named)
// Needs: playwright, ffmpeg, python3 with kokoro-onnx (tools/tts.py), and a static server in the repo root:
//   python3 -m http.server 8765 --bind 127.0.0.1
// Output: assets/videos/<part>.webm (VP9 + Opus), <part>.vtt and assets/videos/index.json
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
const VW = 1680, VH = 945, DSF = 1920 / 1680, OW = 1920, OH = 1080;     // the whole window with the toolbar labels (wider than 1640px), recorded at 1920x1080
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(TMP, { recursive: true });
const { SERIES, PARTS, OVERLAY } = await import('./video-scenes.mjs');
const sha = t => crypto.createHash('sha1').update(t).digest('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));
// the voice text has spaced letters ("D B", "P D F"); the subtitles do not
const subtitle = t => t.replace(/\b([A-Z])((?: [A-Z])+)\b/g, (m, a, b) => a + b.replace(/ /g, ''));

function writeIndex(){
const cuesOf = id => { try { return JSON.parse(fs.readFileSync(path.join(OUT, `${id}.cues.json`), 'utf8')); } catch { return []; } };
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(SERIES.map(sr => ({ id: sr.id, title: sr.title, parts: sr.parts.filter(p => fs.existsSync(path.join(OUT, `${p.id}.webm`))).map(p => ({ id: p.id, title: p.title, desc: p.desc || '', cues: cuesOf(p.id) })) })).filter(sr => sr.parts.length)));
}
if(process.argv.includes('--index')){ writeIndex(); console.log('index.json written'); process.exit(0); }

// 1. the voice: one clip per sentence
const CHECK = process.argv.includes('--check');        // run the steps without voice and video; save a picture after every step to /tmp/vf/check-*.jpg
const want = process.argv.slice(2).filter(a => !a.startsWith('-'));
const parts = want.length ? PARTS.filter(p => want.includes(p.id)) : PARTS;
const lines = [...new Set(parts.flatMap(p => p.steps.map(s => s.say)))];
const AUD = path.join(TMP, 'audio');
fs.writeFileSync(path.join(TMP, 'lines.json'), JSON.stringify(lines));
console.log('voice:', lines.length, 'sentences');
if(!CHECK) execFileSync('python3', [path.join(ROOT, 'tools', 'tts.py'), path.join(TMP, 'lines.json'), AUD], { stdio: 'inherit' });
const dur = f => CHECK ? 0.2 : Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());

async function record(part){
  const dir = path.join(TMP, part.id); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  const dsf = part.hq ? 2560 / VW : DSF, ow = part.hq ? 2560 : OW, oh = part.hq ? 1440 : OH;      // the first-look film is recorded at 2560x1440
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: dsf });
  await ctx.addInitScript(OVERLAY);
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('  PAGEERROR', e.message));
  await page.goto('http://127.0.0.1:8765/index.html');
  await page.waitForFunction(() => window.LKApp && window.Demo && window.Setup && window.RackAdvisor);
  await page.evaluate(() => window.I18n.setLanguage('en'));
  const start = part.start || 'tutorial';      // blank: an empty project · tutorial: the patch is imported · demo: the finished demo show
  await page.evaluate(async s => { await window.Demo.open(s === 'demo' ? { silent: true } : s === 'blank' ? { silent: true, blank: true } : { silent: true, tutorial: true }); }, start);
  await page.waitForTimeout(800);
  const k = helpers(page);
  await part.prep?.(k);
  await page.waitForTimeout(500);
  if(CHECK){
    fs.mkdirSync('/tmp/vf', { recursive: true }); let n = 0;
    for(const step of part.steps){ n++;
      try { await step.do?.(k); } catch(e) { console.log(`  step ${n} FAILED:`, e.message.split('\n').slice(0, 2).join(' ')); }
      await page.waitForTimeout(300);
      await page.screenshot({ path: `/tmp/vf/check-${part.id}-${String(n).padStart(2, '0')}.jpg`, type: 'jpeg', quality: 70, scale: 'css' });
    }
    await ctx.close(); await browser.close(); return;
  }
  // 2. screencast frames (JPEG, high quality) with their own clock, so audio and picture stay in step
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', async f => {
    const n = frames.length; fs.writeFileSync(path.join(dir, `f${String(n).padStart(5, '0')}.jpg`), Buffer.from(f.data, 'base64'));
    frames.push(f.metadata.timestamp);
    try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch {}
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: Math.round(VW * dsf), maxHeight: Math.round(VH * dsf), everyNthFrame: 1 });
  while(!frames.length) await sleep(50);
  const t0 = frames[0];
  const audio = [];
  await sleep(700);
  let si = 0;
  for(const step of part.steps){ si++;
    const wav = path.join(AUD, sha(step.say) + '.wav'), d = dur(wav);
    audio.push({ wav, at: Date.now() / 1000 - t0, dur: d, text: subtitle(step.sub || step.say) });
    await Promise.all([step.do ? step.do(k).catch(e => console.log(`  step ${si} failed:`, e.message.split('\n').slice(0, 2).join(' '))) : null, sleep(d * 1000 + 450)]);
  }
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
  const music = part.music && fs.existsSync(part.music) ? part.music : null;
  if(music) inputs.push('-i', music);
  const nA = audio.length, total = (tEnd - t0) + 1;
  const voice = audio.map((a, i) => `[${i + 1}:a]adelay=${Math.round(a.at * 1000)}:all=1[a${i}]`).join(';') + `;${audio.map((_, i) => `[a${i}]`).join('')}amix=inputs=${nA}:normalize=0[voice]`;
  const filt = music ? `${voice};[${nA + 1}:a]volume=0.2,atrim=0:${total.toFixed(1)},afade=t=in:d=2,afade=t=out:st=${Math.max(0, total - 4).toFixed(1)}:d=4[mus];[voice][mus]amix=inputs=2:normalize=0:duration=first[aout]` : `${voice.replace('[voice]', '[aout]')}`;
  const outFile = path.join(OUT, `${part.id}.webm`);
  const hqv = part.hq ? ['-crf', '23', '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2'] : ['-crf', '35', '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '3'];
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'), ...inputs,
    '-filter_complex', filt, '-map', '0:v', '-map', '[aout]',
    '-vf', `fps=${part.hq ? 30 : 25},scale=${ow}:${oh}:flags=lanczos`, '-c:v', 'libvpx-vp9', ...hqv,
    '-c:a', 'libopus', '-b:a', part.hq ? '128k' : '56k', '-shortest', outFile], { stdio: 'inherit' });
  // subtitles as a separate track (WebVTT)
  const ts = x => { const h = Math.floor(x / 3600), m = Math.floor(x % 3600 / 60), sec = (x % 60).toFixed(3).padStart(6, '0'); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${sec}`; };
  fs.writeFileSync(path.join(OUT, `${part.id}.vtt`), 'WEBVTT\n\n' + audio.map((a, i) => `${i + 1}\n${ts(a.at)} --> ${ts(a.at + a.dur + 0.2)}\n${a.text}\n`).join('\n'));
  fs.writeFileSync(path.join(OUT, `${part.id}.cues.json`), JSON.stringify(audio.map(a => [+a.at.toFixed(2), +(a.at + a.dur + 0.2).toFixed(2), a.text])));
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

for(const p of parts){ console.log(CHECK ? 'checking' : 'recording', p.id); await record(p); }
writeIndex();
