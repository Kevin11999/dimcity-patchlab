import { openDemo, discover, finishSend } from '../lib.mjs';
// ETH1 / ETH2 tiles on a LumiNode card in Network config, painted with a brush: Trunk ISL (the node's own trunk) or a VLAN.
// A node that is still basic only takes the trunk; a VLAN there changes nothing in it. On an advanced node a VLAN makes the group and allows configuring through it.
export default { name:'Network config: ETH tiles with Trunk ISL / VLAN brush', timeout:300000, async run(t){
  const { page } = t; await openDemo(t); await discover(t);
  const ip = await page.evaluate(async () => { const NC = window.NetConfig, d = [...NC.state.dev.values()].find(x => x.kind === 'lumi' && x.link);
    d.sim = NC.state.simDevs.find(x => x.dev.state.ip?.ipaddress === d.ip); d.sim.dev.state.net.trunks = { 1:{ name:'ISL', groups:[1], untagged_group:1, color:'#999999', editable:true } };
    NC.state.withIp = false; await NC.readDev(d); NC.state.open.add(d.ip); window.LKApp.navigate('NETCONFIG'); window.__ip = d.ip; return d.ip; });
  await page.waitForTimeout(800); const card = page.locator(`.nc-card:has([data-toggle="${ip}"])`);
  t.ok(await card.locator('.nc-port[data-eth]').count() === 2, 'two ETH tiles next to the DMX tiles');
  const info = () => page.evaluate(() => { const NC = window.NetConfig, d = NC.state.dev.get(window.__ip), o = NC.opsOf(d), put = o.ops.find(x => x.method === 'PUT' && x.path === '/api/network_config');
    return { n:o.ops.length, basic:put?.body.is_basic_config, ports:put ? Object.entries(put.body.ports).map(([k, p]) => `${k}:g${p.group}:t${p.trunk}`) : [], groups:put ? Object.entries(put.body.groups).map(([k, g]) => `${k}:${g.vid}:${g.network_settings.allow_config}`) : [], trunks:put ? Object.entries(put.body.trunks).map(([k, x]) => `${k}:${x.groups.join('+')}`) : [] }; });
  await card.locator('[data-brush="vid:200"]').click(); await card.locator('.nc-port[data-eth="2"]').click(); await page.waitForTimeout(300);
  let i = await info(); t.ok(i.n === 0, 'basic node + VLAN 200 on ETH2: nothing is sent'); t.ok(/200/.test(await card.locator('.nc-port[data-eth="2"]').innerText()), 'the tile shows VLAN 200');
  await card.locator('[data-brush="isl"]').click(); await card.locator('.nc-port[data-eth="1"]').click(); await page.waitForTimeout(300);
  i = await info(); t.ok(i.basic === false && i.ports.includes('eth1:gnull:t1'), 'ISL on ETH1 switches the node to advanced and puts ETH1 on trunk 1'); t.ok(i.trunks.length === 1, 'no trunk of its own is made: ' + i.trunks.join(' '));
  await card.locator('.nc-port[data-eth="2"]').click(); await page.waitForTimeout(300);
  i = await info(); t.ok(i.ports.includes('eth1:gnull:t1') && i.ports.includes('eth2:gnull:t1'), 'ISL on both ETH1 and ETH2: ' + i.ports.join(' '));
  await page.evaluate(() => { window.__send = window.NetConfig.applyDevs([window.NetConfig.state.dev.get(window.__ip)], { noIp:true }); }); await finishSend(t);
  const st = await page.evaluate(async () => { const NC = window.NetConfig, d = NC.state.dev.get(window.__ip); await NC.readDev(d); const nc = d.cur.netcfg; return { err:d.err, basic:nc.is_basic_config, ports:Object.entries(nc.ports).map(([k, p]) => `${k}:g${p.group}:t${p.trunk}`), left:NC.opsOf(d).ops.length, ne:d.NE.size }; });
  t.ok(!st.err && st.basic === false && st.ports.every(p => /:t1$/.test(p)), 'after sending: advanced, both ports on the ISL'); t.ok(st.left === 0 && st.ne === 0, 'nothing left to send, the edits are cleared');
  await page.evaluate(() => { window.NetConfig.state.open.add(window.__ip); window.LKApp.navigate('NETCONFIG'); }); await page.waitForTimeout(600);
  await card.locator('[data-brush="vid:200"]').click(); await card.locator('.nc-port[data-eth="2"]').click(); await page.waitForTimeout(300);
  i = await info(); t.ok(i.ports.some(p => /^eth2:g\d+:tnull$/.test(p)) && i.groups.some(g => /:200:true$/.test(g)), 'advanced node: ETH2 on group VLAN 200 with config allowed'); t.ok(i.trunks.some(x => x.split(':')[1].split('+').length === 2), 'the ISL carries the new group too: ' + i.trunks.join(' '));
} };
