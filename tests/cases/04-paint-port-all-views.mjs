import { openDemo, netTab } from '../lib.mjs';
// Paint a VLAN and a trunk on switch ports in Network > Switches: the Patch board, the PDF and Network config show / send the same.
export default { name:'paint a switch port: Switches tab, Patch board, PDF and Network config agree', async run(t){
  const { page } = t; await openDemo(t); const SW = 'DB01-SW1';
  await netTab(t, 'switches');
  await page.click('[data-ppb="vid"][data-vid="300"]'); await page.click(`[data-ppsw="${SW}"][data-pport="1"]`); await page.waitForTimeout(300);
  await page.click('[data-ppb="trunk"]'); await page.click(`[data-ppsw="${SW}"][data-pport="2"]`); await page.waitForTimeout(300);
  const tile = sel => page.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent + ' ' + e.title + ' ' + e.className : ''; }, sel);
  t.ok(/300/.test(await tile(`[data-ppsw="${SW}"][data-pport="1"]`)), 'Switches tab: port 1 = VLAN 300'); t.ok(/T|runk/.test(await tile(`[data-ppsw="${SW}"][data-pport="2"]`)), 'Switches tab: port 2 = trunk');
  await netTab(t, 'patch');
  t.ok(/300/.test(await tile(`[data-pbsw="${SW}"][data-pbport="1"]`)), 'Patch board: port 1 = VLAN 300'); t.ok(/T|runk/.test(await tile(`[data-pbsw="${SW}"][data-pbport="2"]`)), 'Patch board: port 2 = trunk');
  const x = await page.evaluate(async () => {
    const NC = window.NetConfig, it = NC.planItems().find(i => i.kind === 'sw' && i.s.label === 'DB01-SW1'), w = NC.wantSwitch(it), P = window.PdfExport, L = P.layoutFromSettings ? P.layoutFromSettings() : P.defaultLayout();
    const d = await P.renderDocument({ kind:'nodes', dcs:[it.dc], layout:L, preview:false, isStale:false, title:'t' }), doc = new DOMParser().parseFromString(d.html, 'text/html');
    const card = [...doc.querySelectorAll('.card')].find(c => c.querySelector('.card-h span')?.textContent.trim() === 'DB01-SW1' && c.querySelector('table th')?.textContent === 'Port');
    const row = n => [...card.querySelectorAll('table tbody tr')].find(r => r.children[0].textContent.trim() === String(n))?.textContent || '';
    return { vid1:w.ports.find(p => p.port === 1)?.vid, trunk2:w.fibre.includes(2), pdf1:row(1), pdf2:row(2), warn:(window.IpPlan.check() || []).some(i => i.dc === 'DB01' && i.code === 'TRUNK') };
  });
  t.ok(x.vid1 === 300, 'Network config sends VLAN 300 on port 1'); t.ok(x.trunk2, 'Network config sends port 2 as a trunk port');
  t.ok(/300/.test(x.pdf1), 'PDF: port 1 shows VLAN 300'); t.ok(/Trunk/.test(x.pdf2), 'PDF: port 2 shows Trunk');
  t.ok(x.warn, 'a VLAN on a port that carries a node with two VLANs gives the "not a trunk" warning');
} };
