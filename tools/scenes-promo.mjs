// The first-look film: about two minutes, no step by step, a quick tour of the whole app with a title card at the start and the end.
// Recorded at 2560x1440 with a soft music bed (tools/make-music.mjs). Unlike the tool guides, the two title cards do have text.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { POWER_SAMPLE } from './scenes-common.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOGO = fs.readFileSync(path.join(HERE, '..', 'assets', 'dimcity-patchlab-logo.svg'), 'utf8').replace(/<\?xml[^>]*\?>/, '');

// a full-screen title card that fades in and out over the app
const showCard = (k, title, line) => k.ev(({ logo, title, line }) => {
  document.getElementById('pcard')?.remove();
  const d = document.createElement('div'); d.id = 'pcard';
  d.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;background:radial-gradient(ellipse at 50% 40%,#1d2a44 0%,#0a0e16 70%);color:#fff;font-family:Inter,Arial,sans-serif;opacity:0;transition:opacity 1.1s ease';
  d.innerHTML = `<div style="width:130px;height:130px">${logo}</div><div style="font-size:78px;font-weight:700;letter-spacing:-1px">${title}</div><div style="height:5px;width:120px;border-radius:3px;background:#ff6a13"></div><div style="font-size:30px;color:#a9b8d0;letter-spacing:.5px">${line}</div>`;
  const svg = d.querySelector('svg'); if (svg) { svg.setAttribute('width', '130'); svg.setAttribute('height', '130'); }
  document.body.appendChild(d); requestAnimationFrame(() => requestAnimationFrame(() => { d.style.opacity = '1'; }));
}, { logo: LOGO, title, line });
const hideCard = async k => { await k.ev(() => { const d = document.getElementById('pcard'); if (d) { d.style.opacity = '0'; setTimeout(() => d.remove(), 1200); } }); await k.wait(1200); };

export const PROMO = { id: 'promo-first-look', title: 'DimCity PatchLab — a first look', desc: 'Two minutes: the whole show, from patch to printed paperwork.', start: 'demo', hq: true, music: path.join(HERE, 'video-assets', 'promo-bed.opus'), steps: [
  { say: 'Dim City Patch Lab. Everything between the lighting desk and the lamp, planned in one place.', do: async k => { await showCard(k, 'DimCity PatchLab', 'Plan it. Patch it. Print it.'); await k.wait(3200); await hideCard(k); } },
  { say: 'Import your patch, and the whole show builds itself: every D B, every L K and Veam, every universe.', do: async k => { await k.go('HOME'); await k.wait(1200); await k.scrollMain(380); await k.wait(1500); await k.scrollMain(0); } },
  { say: 'Build your racks and place them in the D B\'s. Every cable finds its socket and its node port by itself.', do: async k => { await k.go('RACKS'); await k.wait(900); await k.ev(() => document.querySelector('[data-dc]')?.click()); await k.wait(1200); await k.scrollMain(520); await k.wait(1400); } },
  { say: 'Nodes, switches and V L A N\'s are planned down to the last port.', do: async k => { await k.go('NET'); await k.wait(1000); await k.click('#netTabs [data-tab=vlan]'); await k.wait(1300); await k.click('#netTabs [data-tab=fibers]'); await k.wait(1000); } },
  { say: 'Follow every universe through the signal flow, from the rack all the way to the lamp.', do: async k => { await k.go('FLOW'); await k.wait(1400); await k.hover('.fl-uni:nth-child(3)'); await k.wait(900); await k.click('.fl-uni:nth-child(3)'); await k.wait(1800); } },
  { say: 'A clear plan always shows what is done and what comes next, so nobody on the team gets lost.', do: async k => { await k.go('TASKS'); await k.wait(1000); await k.hover('.tk-next'); await k.wait(1200); await k.hover('.tk-matrix'); await k.wait(1500); } },
  { say: 'New: power distribution. Socapex cables, circuits and phases, with the amps worked out for you.', do: async k => {
      await k.ev(() => { window.LKApp.getMODEL().power = null; });
      await k.go('POWER'); await k.wait(500); await k.page.setInputFiles('#pwFile', POWER_SAMPLE); await k.wait(1000);
      await k.ev(() => { const PW = window.Power.core(), p = window.LKApp.getMODEL().power, ds = PW.allDims(p, window.LKApp.sortedDims());
        PW.SAMPLE_TYPES.forEach(x => p.types.push(JSON.parse(JSON.stringify(x))));
        p.feeds.push({ id:'f1', dc:ds[0], name:`${ds[0]}.1 PWL250 Run`, kind:'Powerlock', max:250, upstream:'' });
        p.pds.push({ id:'PD1.1', dc:ds[0], typeId:'PDT:soca12', feedId:'f1', cables:[], manual:{} }, { id:'PD1.2', dc:ds[0], typeId:'PDT:soca12', feedId:'f1', cables:[], manual:{} });
        PW.autoAssign(p, ds[0], ds); });
      await k.click('[data-tab=overview]'); await k.wait(1500); await k.click('[data-pd]'); await k.wait(1800); await k.scrollMain(420); await k.wait(1200); } },
  { say: 'Then go live. Find every Lumi Node and Giga Core on the network, make them blink, and send the whole configuration at once.', do: async k => {
      await k.ev(async () => { await window.NetConfig.discover(); for (const d of window.NetConfig.state.dev.values()) d.link = null; });
      await k.ev(() => window.Align.open({ phase:'align' })); await k.wait(1800); await k.hover('.al-now'); await k.wait(700);
      await k.click('.al-item.guess'); await k.wait(1100); await k.click('.al-item.guess'); await k.wait(900);
      await k.ev(() => { for (const d of window.NetConfig.state.dev.values()) if (!d.link) { const it = window.NetConfig.planItems().find(x => x.kind === (d.kind === 'gigacore' ? 'sw' : 'nd') && x.ip === d.ip); if (it) d.link = it.id; } });
      await k.click('[data-alphase=send]'); await k.wait(600); await k.click('#alFill'); await k.wait(2500); await k.hover('#alSend'); await k.wait(1500); await k.click('#alStop'); } },
  { say: 'And when it is done, the paperwork writes itself: reports, booklets, Q R codes and stickers for every cable.', do: async k => { await k.click('#fileExportPdf'); await k.wait(3200); await k.closeDialog(); await k.click('#tbStickers'); await k.wait(3000); await k.closeDialog(); } },
  { say: 'It speaks English and Dutch, and has a handbook and video guides built in, always one click away.', do: async k => { await k.ev(() => window.LKApp.runCommand('help')); await k.wait(3800); await k.page.keyboard.press('Escape'); await k.wait(600); } },
  { say: 'Dim City Patch Lab. Plan it. Patch it. Print it.', do: async k => { await showCard(k, 'DimCity PatchLab', 'Plan it. Patch it. Print it.'); await k.wait(3600); } }
] };
