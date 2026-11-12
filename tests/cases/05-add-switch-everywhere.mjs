import { openDemo, netTab } from '../lib.mjs';
// A switch added in Network > Switches is found everywhere: lists, Patch board, Addresses, Network config (link + IP), PDF and stickers.
export default { name:'add a switch: it shows up in every list, the PDF and Network config', async run(t){
  const { page } = t; await openDemo(t); await netTab(t, 'switches');
  const before = await page.evaluate(() => window.NetSwitches.list('DB01').length), sec = page.locator('[data-dcsec="DB01"]');
  await sec.locator('#dimAddSwitch').click(); await page.waitForTimeout(700);
  const list = await page.evaluate(() => window.NetSwitches.list('DB01').map(s => s.label)); const label = list[list.length - 1];
  t.ok(list.length === before + 1, `Switches list: ${before} → ${list.length} (${label})`);
  const ip = sec.locator(`.network-instance:has(b:text-is("${label}")) [data-field="ip"]`); t.ok(await ip.count() === 1, 'IP and subnet fields are there');
  await ip.fill('10.90.101.9'); await ip.blur(); await page.waitForTimeout(500);
  const v = await page.evaluate(async lab => {
    const NC = window.NetConfig, it = NC.planItems().find(i => i.kind === 'sw' && i.s.label === lab), P = window.PdfExport, L = P.layoutFromSettings ? P.layoutFromSettings() : P.defaultLayout();
    const d = await P.renderDocument({ kind:'nodes', dcs:['DB01'], layout:L, preview:false, isStale:false, title:'t' }), st = window.Labels.docHtml({ dc:'DB01', variant:'switches', ports:true, preview:false, images:{} });
    return { plan:!!it, ip:it ? NC.wantSwitch(it).ip?.address : null, pdf:d.html.includes(lab), pdfIp:d.html.includes('10.90.101.9'), stickers:!!st && st.html.includes(lab) };
  }, label);
  t.ok(v.plan, 'Network config can link a found device to it'); t.ok(v.ip === '10.90.101.9', 'Network config sends its IP address');
  t.ok(v.pdf && v.pdfIp, 'PDF shows the switch and its IP'); t.ok(v.stickers, 'the switch stickers include it');
  const text = tab => page.evaluate(() => document.body.innerText + ' ' + [...document.querySelectorAll('input')].map(i => i.value).join(' ') + ' ' + document.body.innerHTML.replace(/<[^>]*>/g, ' '));
  await netTab(t, 'addr'); const a = await text(); t.ok(a.includes(label) && a.includes('10.90.101.9'), 'Addresses tab lists it with its IP');
  await netTab(t, 'patch'); t.ok(await page.evaluate(l => !!document.querySelector(`[data-pbkey="${l}"]`), label), 'Patch board draws it');
  await netTab(t, 'fibers'); t.ok(await page.evaluate(l => document.body.innerText.includes(l), label), 'Fibres tab knows it');
} };
