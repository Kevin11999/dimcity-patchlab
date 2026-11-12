import { openDemo, discover, finishSend } from '../lib.mjs';
// A switch that answers "ok" to assign_ports and does nothing (what the real 20T did), also when it moves to an address this computer cannot reach afterwards:
// every trunk port still ends up in the trunk (the per-port calls are part of the send, and the check runs BEFORE the address changes).
export default { name:'trunk ports arrive even when assign_ports does nothing and the switch moves away', timeout:300000, async run(t){
  const { page } = t; await openDemo(t); await discover(t);
  for(const move of [false, true]){
    const r = await page.evaluate(async move => {
      const NC = window.NetConfig, C = NC.state, d = [...C.dev.values()].find(x => x.kind === 'gigacore');
      d.sim = C.simDevs.find(x => x.dev.state.ip?.ip_address === d.ip); d.sim.dev.state.ignoreAssign = true;
      for(const x of d.sim.dev.state.ports) if(x.member_of?.type === 'trunk') x.member_of = { type:'group', id:1 };
      const it = NC.planItems().find(i => i.kind === 'sw' && NC.wantSwitch(i).fibre.length > 1); for(const x of C.dev.values()) x.link = null; d.link = it.id;
      C.withIp = false; await NC.readDev(d); NC.fillFromPlan(d);
      if(move){ d.dev.ip = '10.200.200.9'; d.dev.mask = '255.255.255.0'; C.simNets = [{ address:d.ip, netmask:'255.255.255.255' }]; }          // this computer has no address in the new range
      const want = NC.wantSwitch(it).fibre.filter(p => d.cur.ports.some(q => q.port_number === p)).sort((a, b) => a - b);
      window.__send = NC.applyDevs([d]); return { want };
    }, move);
    await finishSend(t);
    const after = await page.evaluate(() => { window.NetConfig.state.simNets = null; const d = [...window.NetConfig.state.dev.values()].find(x => x.sim && x.kind === 'gigacore'); return { moved:!!d.moved, trunk:d.sim.dev.state.ports.filter(p => p.member_of?.type === 'trunk').map(p => p.port_number).sort((a, b) => a - b) }; });
    t.ok(r.want.length > 1 && JSON.stringify(after.trunk) === JSON.stringify(r.want), `${move ? 'switch moves out of reach' : 'no address change'}: trunk ports ${after.trunk.join(',')} (wanted ${r.want.join(',')})`);
    if(move) t.ok(after.moved, 'the app knows the switch moved out of reach');
  }
} };
