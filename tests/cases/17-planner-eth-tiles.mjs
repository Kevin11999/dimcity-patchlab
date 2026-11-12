import { openDemo, discover } from '../lib.mjs';
// The planner (Network > Nodes, Advanced on): ETH1 / ETH2 tiles with a brush. Stored in the project, shown in the port plan, and "Fill from the plan" puts it on the node
// (a node gets only its own groups, not all 20; the tile of the node card shows what is waiting to be sent).
export default { name:'planner ETH tiles: stored, port plan, Fill from the plan', timeout:200000, async run(t){
  const { page } = t; await openDemo(t);
  await page.evaluate(() => window.LKApp.navigate('NET')); await page.waitForTimeout(900); await page.getByRole('button', { name:'Nodes', exact:true }).first().click(); await page.waitForTimeout(1000);
  const idx = await page.evaluate(() => { const b = [...document.querySelectorAll('[data-advnode]')].find(x => x.querySelectorAll('[data-aveth]').length === 2); return b ? b.dataset.advnode : null; });
  t.ok(idx != null, 'a node box with ETH1 and ETH2 tiles'); const box = () => page.locator(`[data-advnode="${idx}"]`);
  const inst = () => page.evaluate(i => { const n = window.LKApp.net.getDimPlan('DB01').nodes[Number(i)]; return { isl:JSON.stringify(n.advIsl), p1:(n.advPorts[1] || []).length, p2:n.advPorts[2] || [] }; }, idx);
  t.ok(await page.locator('[data-avtrunk],[data-avvlan]').count() === 0, 'the old trunk checkboxes / lists are gone');
  const b0 = JSON.stringify(await inst()); await box().locator('[data-aveth="1"]').click(); await page.waitForTimeout(300); t.ok(JSON.stringify(await inst()) === b0, 'a click without a brush changes nothing');
  await box().locator('[data-avbrush="isl"]').click(); await page.waitForTimeout(300); await box().locator('[data-aveth="1"]').click(); await page.waitForTimeout(300);
  let s = await inst(); t.ok(JSON.parse(s.isl)[1] === true && s.p1 >= 2, 'ETH1 = Trunk ISL (all groups)');
  await box().locator('[data-avbrush="vid:300"]').click(); await page.waitForTimeout(300); await box().locator('[data-aveth="2"]').click(); await page.waitForTimeout(300);
  s = await inst(); t.ok(JSON.parse(s.isl)[2] === false && JSON.stringify(s.p2) === '[300]', 'ETH2 = VLAN 300 only');
  t.ok(/Trunk ISL/.test(await box().locator('[data-aveth="1"]').innerText()) && /300/.test(await box().locator('[data-aveth="2"]').innerText()), 'the tiles show it');
  const rows = await page.evaluate(i => { const n = window.LKApp.net.getDimPlan('DB01').nodes[Number(i)]; return window.FentUI.portPlan('DB01').rows.filter(r => r.device === (n.id || n.name)).map(r => `ETH${r.eth}:${r.mode}`); }, idx); t.ok(rows.includes('ETH1:trunk'), 'the port plan has ETH1 as trunk');
  await discover(t);
  const nc = await page.evaluate(async () => { const NC = window.NetConfig, d = [...NC.state.dev.values()].find(x => x.kind === 'lumi' && x.link); d.sim = NC.state.simDevs.find(x => x.dev.state.ip?.ipaddress === d.ip); d.sim.dev.state.net.trunks = { 1:{ name:'ISL', groups:[1], untagged_group:1, color:'#999999', editable:true } };
    NC.state.withIp = false; await NC.readDev(d); NC.fillFromPlan(d); const put = NC.opsOf(d).ops.find(o => o.method === 'PUT' && o.path === '/api/network_config'); NC.state.open.add(d.ip); window.__ip = d.ip;
    return { groups:put ? Object.values(put.body.groups).map(g => g.vid) : null, ports:put ? Object.entries(put.body.ports).map(([k, p]) => `${k}:g${p.group}:t${p.trunk}`) : [] }; });
  t.ok(nc.groups && nc.groups.length <= 4, 'Fill from the plan: the node gets only its own groups (' + (nc.groups || []).join(',') + ')'); t.ok(nc.ports.includes('eth1:gnull:t1') && nc.ports.includes('eth2:g3:tnull'), 'ETH1 on the node trunk, ETH2 on group 3 (VLAN 300): ' + nc.ports.join(' '));
  await page.evaluate(() => window.LKApp.navigate('NETCONFIG')); await page.waitForTimeout(800);
  const tile = await page.locator(`.nc-card:has([data-toggle="${await page.evaluate(() => window.__ip)}"]) [data-eth="2"]`).innerText(); t.ok(/300/.test(tile), 'the ETH2 tile on the node card shows the VLAN that is waiting to be sent (' + tile.replace(/\s+/g, ' ') + ')');
} };
