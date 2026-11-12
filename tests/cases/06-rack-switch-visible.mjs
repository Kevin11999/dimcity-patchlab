import { openDemo, netTab } from '../lib.mjs';
// A switch placed in a rack of a DimCity (not added in the Network tab) is found in the same places.
// KNOWN WEAK SPOTS (not asserted, see docs/TESTING.md): it is called R-SW1 (no DimCity in the name), comes without IP / name, and that name goes to the device.
export default { name:'a switch in a rack shows up in lists, the PDF and Network config', async run(t){
  const { page } = t; await openDemo(t);
  const r = await page.evaluate(async () => {
    const M = window.LKApp.getMODEL(), NS = window.NetSwitches, R = window.RackEngine.computeRackPlan(M, 'DB01').racks[0], out = {};
    const rt = (M.networkDevices.rackTypes || []).find(x => x.id === R.rack.id), sty = (M.networkDevices.switchTypes || [])[0];
    rt.items = [...(rt.items || []), { kind:'switch', typeId:sty.id, iid:'testsw1' }];
    const rs = NS.list('DB01').find(s => s.source === 'rack'); out.found = !!rs; out.label = rs?.label; if(!rs) return out;
    rs.dev.ip = '10.90.101.20';
    out.netconfig = window.NetConfig.planItems().some(i => i.kind === 'sw' && i.s.label === rs.label);
    const P = window.PdfExport, L = P.layoutFromSettings ? P.layoutFromSettings() : P.defaultLayout(), d = await P.renderDocument({ kind:'nodes', dcs:['DB01'], layout:L, preview:false, isStale:false, title:'t' });
    out.pdf = d.html.includes(rs.label) && d.html.includes('10.90.101.20'); out.setup = window.Setup.status('network').done; return out;
  });
  t.ok(r.found, 'the rack switch is in NetSwitches.list (' + r.label + ')'); t.ok(r.netconfig, 'Network config knows it'); t.ok(r.pdf, 'PDF shows it with its IP');
  await netTab(t, 'switches'); t.ok(await page.evaluate(l => document.body.innerHTML.includes(l), r.label), 'Switches tab shows it');
  await netTab(t, 'patch'); t.ok(await page.evaluate(l => document.body.innerHTML.includes(l), r.label), 'Patch board shows it');
} };
