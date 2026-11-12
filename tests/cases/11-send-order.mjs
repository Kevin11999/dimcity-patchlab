import { openDemo, discover, finishSend } from '../lib.mjs';
// The order of the calls to a device: port settings → names → trunk (ISL) → addresses (switch); DMX ports + engines → name → network config → addresses (node).
const rank = (m, p, b) => /^\/api\/groups\/group$/.test(p) && m === 'POST' ? 0 : /\/member_of$/.test(p) && !/"trunk"/.test(b) ? 1 : /\/poe\/|\/link_speed\//.test(p) ? 1 : /\/legend$|\/device\/name$|\/groups\/group\/\d+\/(name|color)$/.test(p) ? 2 : /\/trunks\/|\/member_of$/.test(p) ? 3 : /\/ip_settings\//.test(p) ? 9 : 4;
export default { name:'send order: ports → names → trunk → IP (switch), ports → name → network → IP (node)', timeout:300000, async run(t){
  const { page } = t; await openDemo(t); await discover(t);
  await page.evaluate(async () => {
    const NC = window.NetConfig, C = NC.state; window.__log = [];
    const sw = [...C.dev.values()].find(d => d.kind === 'gigacore' && d.link), nd = [...C.dev.values()].find(d => d.kind === 'lumi' && d.link);
    for(const d of [sw, nd]){ await NC.readDev(d); NC.fillFromPlan(d); d.sim = C.simDevs.find(x => x.dev.state.ip?.ip_address === d.ip || x.dev.state.ip?.ipaddress === d.ip); const h0 = d.sim.dev.h; const tag = d.kind; d.sim.dev.h = async (m, p, b) => { if(m !== 'GET') window.__log.push({ tag, m, p, b:b === undefined ? '' : JSON.stringify(b) }); return h0(m, p, b); }; }
    const e = sw.E.get(1) || {}; e.speed = '100mbps fdx'; e.poe = false; sw.E.set(1, e); sw.dev.ip = '10.90.101.77'; sw.dev.mask = '255.255.0.0'; C.withIp = true;
    window.__send = NC.applyDevs([sw, nd], {});
  });
  await finishSend(t);
  const log = await page.evaluate(() => window.__log), sw = log.filter(l => l.tag === 'gigacore'), nd = log.filter(l => l.tag === 'lumi');
  const rs = sw.map(l => rank(l.m, l.p, l.b)); t.ok(sw.length > 10, `${sw.length} calls to the switch`);
  t.ok(rs.every((r, i) => i === 0 || r >= rs[i - 1]), 'switch: the calls never go back to an earlier step (' + [...new Set(rs)].join(' → ') + ')');
  t.ok(rs.includes(1) && rs.includes(2) && rs.includes(3) && rs.includes(9), 'switch: VLAN/PoE/speed, names, trunk and IP calls are all there');
  const iName = nd.findIndex(l => /\/api\/deviceinfo$/.test(l.p)), iNet = nd.findIndex(l => /network_config$/.test(l.p) && l.m === 'PUT'), lastIo = nd.map((l, i) => /\/api\/(IO|processblock)/.test(l.p) ? i : -1).filter(i => i >= 0);
  t.ok(iName < 0 || nd.slice(0, iName).some(l => /\/api\/(IO|processblock)/.test(l.p)), 'node: DMX ports and engines come before the name');
  t.ok(iNet < 0 || iName < iNet || iName < 0, 'node: the name comes before the network configuration');
} };
