import { openDemo } from '../lib.mjs';
// The "Nodes & switches" PDF shows the same port settings as the Switches tab (VLAN, Trunk / Access, name, PoE, speed).
export default { name:'PDF switch pages = Switches tab', async run(t){
  const { page } = t; await openDemo(t);
  const check = () => page.evaluate(async () => {
    const P = window.PdfExport, PP = window.PortPlan, NS = window.NetSwitches, L = P.layoutFromSettings ? P.layoutFromSettings() : P.defaultLayout(), out = { cards:0, rows:0, diffs:[] };
    for(const dc of window.LKApp.sortedDims()){
      const d = await P.renderDocument({ kind:'nodes', dcs:[dc], layout:L, preview:false, isStale:false, title:'t' }), doc = new DOMParser().parseFromString(d.html, 'text/html');
      for(const s of NS.list(dc)){
        const card = [...doc.querySelectorAll('.card')].find(c => c.querySelector('.card-h span')?.textContent.trim() === s.label && c.querySelector('table th')?.textContent === 'Port');
        if(!card){ out.diffs.push(`${dc} ${s.label}: no switch card in the PDF`); continue; }
        out.cards++; const sp = PP.swPorts(dc, s);
        for(const tr of card.querySelectorAll('table tbody tr')){
          const td = [...tr.children].map(x => x.textContent.trim()); if(td.length < 7 || /SFP/.test(td[0])) continue;
          const p = sp.find(x => x.kind === 'rj' && x.n === Number(td[0].replace(/\D/g, ''))); if(!p) continue; out.rows++; const id = `${dc} ${s.label}#${p.n}`;
          if(p.trunk && !/Trunk/i.test(td[4] + td[3])) out.diffs.push(`${id}: trunk on screen, PDF "${td[4]}" "${td[3]}"`);
          if(!p.trunk && p.vid != null && !new RegExp('^' + p.vid + '\\b').test(td[3])) out.diffs.push(`${id}: VLAN ${p.vid}, PDF "${td[3]}"`);
          if(!p.trunk && /Trunk/i.test(td[4])) out.diffs.push(`${id}: access on screen, PDF "${td[4]}"`);
          if(p.manualName && td[2] !== p.name) out.diffs.push(`${id}: name "${p.name}", PDF "${td[2]}"`);
          if(p.poe && !new RegExp(p.poe, 'i').test(td[5])) out.diffs.push(`${id}: PoE ${p.poe}, PDF "${td[5]}"`);
        }
      }
    }
    return out;
  });
  let r = await check(); t.ok(r.cards >= 6 && r.rows >= 10, `${r.cards} switch cards, ${r.rows} port rows`); t.ok(r.diffs.length === 0, 'baseline: PDF = screen ' + r.diffs.slice(0, 3).join('; '));
  await page.evaluate(() => { const st = (window.LKApp.getMODEL().networkDevices.portPlans ||= {});
    for(const it of window.NetConfig.planItems().filter(i => i.kind === 'sw')){ const p = ((st[`sw:${it.dc}|${it.s.label}`] ||= { ports:{} }).ports); p[2] = { ...(p[2] || {}), vid:300 }; p[3] = { ...(p[3] || {}), trunk:true }; p[4] = { ...(p[4] || {}), name:'Test Poort 4', poe:'off' }; } });
  r = await check(); t.ok(r.diffs.length === 0, 'after hand-made settings: PDF = screen ' + r.diffs.slice(0, 3).join('; '));
} };
