import { openDemo, netTab } from '../lib.mjs';
// The PDF node card shows how the ports are set up (direction + protocol, names, what every ETH carries), and an advanced node's addresses carry the ETH the planner chose.
export default { name:'PDF node card: port modes, names, ETH; address labels follow the planner', async run(t){
  const { page } = t; await openDemo(t);
  const r = await page.evaluate(async () => {
    const M = window.LKApp.getMODEL(), P = window.PdfExport, L = P.layoutFromSettings ? P.layoutFromSettings() : P.defaultLayout(), nd0 = window.LKApp.net.getDimPlan('DB01').nodes[0];
    const eth0 = window.Fent.ifaces(nd0, 2).map(x => `${x.role}:ETH${x.eth}`);                // the demo default: the cable goes to ETH2
    nd0.advIsl = { 1:true, 2:false }; nd0.advPorts = { 1:[1, 200, 300, 400], 2:[300] };
    const st = (M.networkDevices.portPlans ||= {}), key = window.PortPlan.ndKey('DB01', nd0, 0); (st[key] ||= { ports:{} }).ports[1] = { name:'Smoke Left', klass:'artnet', dir:'input' }; st[key].ports[2] = { dir:'idle' };
    const d = await P.renderDocument({ kind:'nodes', dcs:['DB01'], layout:L, preview:false, isStale:false, title:'t' }), card = new DOMParser().parseFromString(d.html, 'text/html').querySelector('.card.node');
    return { eth0, text:card.textContent.replace(/\s+/g, ' '), modes:[...card.querySelectorAll('.port .mode')].map(m => m.textContent), eth1:window.Fent.ifaces(nd0, 2).map(x => `${x.role}:ETH${x.eth}`) };
  });
  t.ok(r.modes[0] === 'in Art-Net' && r.modes[1] === 'off sACN', 'port 1 "in Art-Net", port 2 "off" (' + r.modes.slice(0, 3).join(' / ') + ')');
  t.ok(/ETH1 Trunk ISL/.test(r.text) && /ETH2 VLAN 300/.test(r.text), 'ETH1 = Trunk ISL, ETH2 = VLAN 300 on the card'); t.ok(/1 Smoke Left/.test(r.text), 'the port name is printed');
  t.ok(r.eth0.every(x => /ETH2$/.test(x)), 'default advanced node: both addresses on ETH2 (' + r.eth0.join(' ') + ')'); t.ok(r.eth1.every(x => /ETH1$/.test(x)), 'after painting ISL on ETH1 the addresses are on ETH1 (' + r.eth1.join(' ') + ')');
  await page.evaluate(() => { const nd = window.LKApp.net.getDimPlan('DB01').nodes[0]; nd.advIsl = { 1:false, 2:true }; nd.advPorts = { 1:[], 2:[1, 200] }; });
  await netTab(t, 'addr'); const row = await page.evaluate(() => [...document.querySelectorAll('tr,[class*=ad-]')].filter(x => /ID:01/.test(x.textContent) && x.textContent.length < 400).map(x => x.textContent.replace(/\s+/g, ' ')).join(' | '));
  t.ok(!/ETH1/.test(row) && /ETH2/.test(row), 'Addresses tab: ID:01 shows ETH2 and no ETH1 (' + row.slice(0, 120) + ')');
} };
