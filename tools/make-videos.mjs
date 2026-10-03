// Records the tutorial videos (screen recording + subtitles, no voice).
// Usage: node tools/make-videos.mjs [part ...]   (needs: playwright, ffmpeg, python3 static server on :8765)
//   python3 -m http.server 8765 --bind 127.0.0.1   (run in the repo root)
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright/index.js'); }
const { chromium } = pw;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'assets', 'videos');
const TMP = path.join(process.env.VIDEO_TMP || '/tmp', 'dcpl-video-tmp');
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(TMP, { recursive: true });
const W = 1280, H = 720;

const OVERLAY = `(() => {
  const mk = () => {
    if (document.getElementById('vcap')) return;
    const st = document.createElement('style');
    st.textContent = '#vcap{position:fixed;left:50%;bottom:44px;transform:translateX(-50%);max-width:78%;z-index:2147483646;background:rgba(8,10,14,.88);color:#fff;font:600 21px/1.35 system-ui,sans-serif;padding:12px 22px;border-radius:12px;text-align:center;box-shadow:0 6px 28px rgba(0,0,0,.5);transition:opacity .25s;pointer-events:none}#vcap.off{opacity:0}#vttl{position:fixed;top:58px;right:16px;z-index:2147483646;background:#ff8200;color:#1a0f00;font:700 14px system-ui;padding:6px 14px;border-radius:20px;pointer-events:none;letter-spacing:.3px}#vcur{position:fixed;z-index:2147483647;width:22px;height:22px;margin:-4px 0 0 -4px;pointer-events:none;transition:transform .08s}#vcur svg{filter:drop-shadow(0 2px 3px rgba(0,0,0,.6))}.vring{position:fixed;z-index:2147483645;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:3px solid #ff8200;pointer-events:none;animation:vr .5s ease-out forwards}@keyframes vr{to{transform:scale(3.2);opacity:0}}';
    document.head.appendChild(st);
    const c = document.createElement('div'); c.id = 'vcap'; c.className = 'off'; document.body.appendChild(c);
    const t = document.createElement('div'); t.id = 'vttl'; t.style.display = 'none'; document.body.appendChild(t);
    const cur = document.createElement('div'); cur.id = 'vcur'; cur.style.left = '-50px'; cur.style.top = '-50px';
    cur.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l16 9-7 2-3 7z" fill="#fff" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    document.body.appendChild(cur);
    document.addEventListener('mousemove', e => { cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px'; }, true);
    document.addEventListener('mousedown', e => { const r = document.createElement('div'); r.className = 'vring'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; document.body.appendChild(r); setTimeout(() => r.remove(), 600); }, true);
  };
  if (document.body) mk(); else document.addEventListener('DOMContentLoaded', mk);
  setInterval(mk, 500);
})();`;

// ---------- the scenes ----------
// Each scene gets a helper kit `k`: say(en,nl,[extraMs]), click(sel), go(view), eval(fn,arg), wait(ms), hover(sel)
const PARTS = [
  { id: 'import', title: { en: '1 · Import', nl: '1 · Importeren' }, run: async k => {
    await k.say('Every project starts with a patch list (CSV). Here is the demo show.', 'Elk project begint met een patchlijst (CSV). Dit is de demo-show.', 600);
    await k.go('TABLE');
    await k.say('Import reads LK rows, Veam rows and — new — C rows for network cables (C101 + port).', 'Importeren leest LK-regels, Veam-regels en — nieuw — C-regels voor netwerkkabels (C101 + poort).', 800);
    await k.click('#tbEditRows');
    await k.say('Rows can also be edited here, directly in the app.', 'Regels kun je hier ook direct in de app aanpassen.', 600);
    await k.wait(400); await k.closeDialog();
    await k.go('ISSUES');
    await k.say('Validation shows what is still wrong — missing ports, double addresses, unlinked LKs.', 'Validatie laat zien wat er nog niet klopt — ontbrekende poorten, dubbele adressen, niet gekoppelde LK’s.', 800);
    await k.click('#tbSetup');
    await k.say('After an import, open Setup: the app walks you through the next steps in order.', 'Na een import open je Setup: de app loopt de volgende stappen in volgorde met je door.', 1200);
    await k.click('#suStop');
  } },
  { id: 'network', title: { en: '2 · Network', nl: '2 · Netwerk' }, run: async k => {
    await k.go('NET');
    await k.say('The Network page holds everything about the network, per DimCity.', 'De Netwerk-pagina bevat alles over het netwerk, per DimCity.', 600);
    await k.click('[data-tab="ports"]');
    await k.say('Switches & ports: nodes take ports in node-number order, then the Cat cables (C rows).', 'Switches & poorten: nodes pakken poorten op volgorde van nodenummer, daarna de Cat-kabels (C-regels).', 1800);
    await k.scrollMain(500);
    await k.say('Every port shows its VLAN colour. A port with two VLANs becomes a trunk.', 'Elke poort toont de VLAN-kleur. Een poort met twee VLAN’s wordt een trunk.', 1200);
    await k.scrollMain(0);
    await k.click('[data-tab="vlan"]');
    await k.say('VLAN & addresses: choose Luminex numbering (1, 200, 300…) or FENT (1090, 1040…).', 'VLAN & adressen: kies Luminex-nummering (1, 200, 300…) of FENT (1090, 1040…).', 1800);
    await k.click('[data-tab="overview"]');
    await k.say('Overview: per DimCity the switches, ports used, Cat lines, fibres and status.', 'Overzicht: per DimCity de switches, gebruikte poorten, Cat-lijnen, fibers en status.', 1500);
  } },
  { id: 'racks', title: { en: '3 · Racks', nl: '3 · Racks' }, run: async k => {
    await k.say('Racks are planned per DimCity. The app proposes how nodes and dimmers fit in racks.', 'Racks plan je per DimCity. De app stelt voor hoe nodes en dimmers in racks passen.', 800);
    await k.openDim('DB01');
    await k.say('Here is DB01. Scroll to the rack plan.', 'Dit is DB01. Scroll naar het rackplan.', 600);
    await k.scrollToCard('racks');
    await k.say('Racks are drawn as in the Device Builder: dimmers, nodes and the network switch.', 'Racks zijn getekend zoals in de Device Builder: dimmers, nodes en de netwerkswitch.', 1800);
    await k.click('#tbSetup'); await k.click('[data-go="racks"]');
    await k.say('In Setup you place racks or loose devices and apply the rack to the network plan.', 'In Setup plaats je racks of losse apparaten en pas je het rack toe op het netwerkplan.', 1800);
    await k.click('#suStop');
  } },
  { id: 'lks', title: { en: '4 · Couple LKs', nl: '4 · LK’s koppelen' }, run: async k => {
    await k.say('Next, couple every LK to a place in the racks.', 'Daarna koppel je elke LK aan een plek in de racks.', 600);
    await k.openDim('DB01');
    await k.scrollToCard('lk');
    await k.say('Each LK links to a dimmer or Veam port. Unlinked ones show a warning.', 'Elke LK koppel je aan een dimmer- of Veam-poort. Niet gekoppelde krijgen een waarschuwing.', 1800);
    await k.click('#tbSetup'); await k.click('[data-go="lks"]');
    await k.say('Setup counts how many LKs are fully patched per DimCity.', 'Setup telt hoeveel LK’s per DimCity volledig gepatcht zijn.', 1800);
    await k.click('#suStop');
    await k.go('FLOW');
    await k.say('The Signal Flow shows the result: LK → rack → node, drawn as one block per rack.', 'De Signaalstroom laat het resultaat zien: LK → rack → node, één blok per rack.', 2000);
  } },
  { id: 'fibers', title: { en: '5 · Fibres', nl: '5 · Fibers' }, run: async k => {
    await k.say('Fibres connect switches of different DimCities. You couple them once, on the Network page.', 'Fibers verbinden switches van verschillende DimCities. Je koppelt ze één keer, op de Netwerk-pagina.', 800);
    await k.go('NET'); await k.click('[data-tab="fibers"]');
    await k.say('Pick the cable type (OpticalCon, FiberFox, 4-core, single-mode, SFP) and the two ends.', 'Kies het kabeltype (OpticalCon, FiberFox, 4-core, single-mode, SFP) en de twee uiteinden.', 2000);
    await k.scrollMain(450);
    await k.say('The matrix shows which SFP ports are used. Fibre stickers can be printed from here.', 'De matrix toont welke SFP-poorten bezet zijn. Fiber-stickers print je vanaf hier.', 1800);
    await k.go('FLOW');
    await k.say('In the Signal Flow the fibres are displayed — but only coupled on the Network page.', 'In de Signaalstroom worden fibers alleen getoond — koppelen doe je op de Netwerk-pagina.', 800);
    await k.click('#flLayer [data-layer="net"], #flLayer button:nth-of-type(3)').catch(() => {});
    await k.say('Use the Show switch to see only the network layer.', 'Met de schakelaar Toon zie je alleen de netwerklaag.', 2000);
  } },
  { id: 'pdf', title: { en: '6 · PDF', nl: '6 · PDF' }, run: async k => {
    await k.say('Export PDF builds the printable show documents.', 'Export PDF maakt de afdrukbare showdocumenten.', 600);
    await k.click('#fileExportPdf');
    await k.say('Choose sections: patch, racks, Signal Flow, network, switch ports and fibre links.', 'Kies secties: patch, racks, Signaalstroom, netwerk, switchpoorten en fiberverbindingen.', 2400);
    await k.say('A live preview shows each page before you export.', 'Een live voorbeeld toont elke pagina vóór het exporteren.', 1600);
    await k.closeDialog();
  } },
  { id: 'stickers', title: { en: '7 · Stickers', nl: '7 · Stickers' }, run: async k => {
    await k.say('Print cables, strips, node ports, devices, switch ports and fibres on Herma label sheets.', 'Print kabels, strips, nodepoorten, apparaten, switchpoorten en fibers op Herma-etikettenvellen.', 800);
    await k.click('#tbStickers');
    await k.say('Pick the Herma sheet, the DimCity and what to print — the preview matches the sheet exactly.', 'Kies het Herma-vel, de DimCity en wat je print — het voorbeeld klopt exact met het vel.', 2400);
    await k.say('Laser-printer sheets are supported; a calibration sheet checks your printer.', 'Vellen voor laserprinters worden ondersteund; een kalibratievel controleert je printer.', 1800);
    await k.closeDialog();
  } },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function record(part, L) {
  const dir = path.join(TMP, `${part.id}-${L}`); fs.rmSync(dir, { recursive: true, force: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir, size: { width: W, height: H } } });
  await ctx.addInitScript(OVERLAY);
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('  PAGEERROR', e.message));
  await page.goto('http://127.0.0.1:8765/index.html');
  await page.waitForFunction(() => window.LKApp && window.Demo && window.Setup);
  await page.evaluate(l => window.I18n.setLanguage(l), L);
  await page.waitForTimeout(300);
  let mx = 640, my = 360;
  const q = s => page.locator(s).first();
  const k = {
    wait: ms => page.waitForTimeout(ms),
    async say(en, nl, extra = 0) {
      const txt = L === 'nl' ? nl : en;
      await page.evaluate(([x]) => { const c = document.getElementById('vcap'); c.textContent = x; c.classList.remove('off'); }, [txt]);
      await page.waitForTimeout(900 + txt.length * 55 + extra);
    },
    async move(sel) {
      const b = await q(sel).boundingBox(); if (!b) throw new Error('no box ' + sel);
      const tx = b.x + b.width / 2, ty = b.y + Math.min(b.height / 2, 30);
      await page.mouse.move(tx, ty, { steps: 22 }); mx = tx; my = ty;
    },
    async click(sel) {
      try { await q(sel).waitFor({ state: 'visible', timeout: 4000 }); await k.move(sel); await page.waitForTimeout(350); await q(sel).click(); await page.waitForTimeout(700); }
      catch (e) { console.log('  click failed', sel, e.message.split('\n')[0]); }
    },
    async go(view) { await k.click(`.nav-item[data-view="${view}"]`); await page.waitForTimeout(500); },
    async closeDialog() {
      const done = await page.evaluate(() => { const bs = [...document.querySelectorAll('.modal-backdrop button, .modal button, dialog button')]; const b = bs.find(x => /^(cancel|close|annuleren|sluiten)$/i.test(x.textContent.trim())); if (b) { b.click(); return true; } return false; });
      if (!done) await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    },
    async key(x) { await page.keyboard.press(x); await page.waitForTimeout(300); },
    async scrollMain(y) { await page.evaluate(v => { const s = document.getElementById('mainScroll'); if (s) s.scrollTo({ top: v, behavior: 'smooth' }); }, y); await page.waitForTimeout(900); },
    async scrollToCard(key) { await page.evaluate(kk => { const c = document.querySelector(`[data-card*="${kk}"]`) || document.querySelector('.card'); c?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, key); await page.waitForTimeout(1000); },
    async openDim(dc) { await page.evaluate(d => window.LKApp.openEntity('DIM', d), dc); await page.waitForTimeout(800); },
  };
  await page.click('[data-w=demo]');
  await page.waitForTimeout(2200);
  // title
  await page.evaluate(([e]) => { const t = document.getElementById('vttl'); t.textContent = e; t.style.display = 'block'; }, [part.title[L]]);
  await page.waitForTimeout(500);
  await part.run(k);
  await k.wait(900);
  await page.evaluate(() => document.getElementById('vcap')?.classList.add('off'));
  await k.wait(400);
  await ctx.close(); await browser.close();
  const webm = fs.readdirSync(dir).find(f => f.endsWith('.webm'));
  const mp4 = path.join(OUT, `${part.id}-${L}.mp4`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(dir, webm), '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-pix_fmt', 'yuv420p', '-r', '20', '-vf', 'scale=1280:720', '-an', '-movflags', '+faststart', mp4]);
  console.log('  ', path.basename(mp4), (fs.statSync(mp4).size / 1048576).toFixed(2), 'MB');
  return mp4;
}

const want = process.argv.slice(2).filter(a => !a.startsWith('-'));
const only = want.length ? PARTS.filter(p => want.includes(p.id)) : PARTS;
for (const L of (process.env.VIDEO_LANGS || 'en,nl').split(',')) for (const p of only) { console.log('recording', p.id, L); await record(p, L); }

// The 'complete tour' is not a separate file: the Help panel plays the parts one after another.
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(PARTS.map(p => ({ id: p.id, title: p.title })), null, 1));
