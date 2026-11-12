import { openDemo, discover, finishSend } from '../lib.mjs';
// ISL painted in the planner: the node gets only its own groups and its ETH goes on the node's own trunk; "Apply" with nothing changed sends again without changing anything.
export default { name:'node ISL: own groups only, ETH on the trunk; Apply without changes sends again', timeout:300000, async run(t){
  const { page } = t; await openDemo(t); await discover(t);
  const r = await page.evaluate(async () => {
    const NC = window.NetConfig, C = NC.state, it = NC.planItems().find(i => i.kind === 'nd'); it.inst.advIsl = { 1:true, 2:false }; it.inst.advPorts = { 1:[1, 200, 300, 400, 500], 2:[300] };
    const d = [...C.dev.values()].find(x => x.link === it.id); d.sim = C.simDevs.find(x => x.dev.state.ip?.ipaddress === d.ip); d.sim.dev.state.net.trunks = { 1:{ name:'ISL', groups:[1], untagged_group:1, color:'#999999', editable:true } };
    C.withIp = false; await NC.readDev(d); NC.fillFromPlan(d); const put = NC.opsOf(d).ops.find(o => o.method === 'PUT' && o.path === '/api/network_config');
    window.__ip = d.ip; window.__send = NC.applyDevs([d], { noIp:true });
    return { groups:Object.values(put.body.groups).map(g => g.vid), ports:Object.entries(put.body.ports).map(([k, p]) => `${k}:g${p.group}:t${p.trunk}`) };
  });
  t.ok(r.groups.length <= 3 && !r.groups.includes(1000), 'only the node\'s own groups are sent (' + r.groups.join(',') + '), not all 20');
  t.ok(r.ports.includes('eth1:gnull:t1'), 'ETH1 goes on the node trunk (' + r.ports.join(' ') + ')');
  await finishSend(t);
  const f = await page.evaluate(async () => { const NC = window.NetConfig, d = NC.state.dev.get(window.__ip), st = d.sim.dev.state.net; return { basic:st.is_basic_config, ports:Object.entries(st.ports).map(([k, p]) => `${k}:g${p.group}:t${p.trunk}`), left:NC.opsOf(d).ops.length, forced:NC.opsOf(d, true).ops.length, err:d.err }; });
  t.ok(f.basic === false && f.ports.includes('eth1:gnull:t1') && !f.err, 'after sending: advanced, ETH1 on the ISL, no error'); t.ok(f.left === 0, 'nothing is left to send'); t.ok(f.forced > 0, '"send again" has calls of its own (' + f.forced + ')');
  const before = await page.evaluate(() => { const d = window.NetConfig.state.dev.get(window.__ip); window.__send = window.NetConfig.applyDevs([d], { noIp:true, resend:true }); return JSON.stringify(d.sim.dev.state.net.ports); });
  await finishSend(t);
  const after = await page.evaluate(() => JSON.stringify(window.NetConfig.state.dev.get(window.__ip).sim.dev.state.net.ports)); t.ok(after === before, 'Apply without changes leaves the node as it was');
} };
