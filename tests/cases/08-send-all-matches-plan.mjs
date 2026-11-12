import { openDemo, discover, finishSend } from '../lib.mjs';
// Fill from the plan + send to ALL simulated devices (also with hand-made settings, ISL and a new IP): afterwards every device matches the plan and nothing is left to send.
async function run(t, label, mutate){
  const { page } = t; await openDemo(t); await discover(t);
  if(mutate) await page.evaluate(() => {
    const NC0 = window.NetConfig, st = (window.LKApp.getMODEL().networkDevices.portPlans ||= {});
    for(const it of NC0.planItems().filter(i => i.kind === 'sw')){ const p = ((st[`sw:${it.dc}|${it.s.label}`] ||= { ports:{} }).ports); p[9] = { vid:300 }; p[10] = { trunk:true, name:'Uplink test' }; p[11] = { name:'Poort 11', poe:'off', speed:'100mbps fdx' }; p[12] = { vid:400, name:'Desk' }; }
    for(const it of NC0.planItems().filter(i => i.kind === 'nd')){ const p = ((st[window.PortPlan.ndKey(it.dc, it.inst, it.i)] ||= { ports:{} }).ports); p[1] = { name:'Smoke Left', klass:'artnet', dir:'input' }; p[2] = { dir:'idle' }; }
    const sw1 = NC0.planItems().find(i => i.kind === 'sw'); sw1.s.dev.ip = '10.90.101.99'; sw1.s.dev.subnet = '255.255.0.0';
    const nd0 = NC0.planItems().find(i => i.kind === 'nd'); nd0.inst.advIsl = { 1:true, 2:false }; nd0.inst.advPorts = { 1:[1, 200, 300], 2:[300] };
  });
  await page.evaluate(() => { const NC = window.NetConfig, C = NC.state; C.withIp = true; C.withNames = true;
    window.__send = (async () => { const devs = [...C.dev.values()].filter(d => d.kind !== 'unknown' && d.link); for(const d of devs){ if(!d.cur) await NC.readDev(d); NC.fillFromPlan(d); } await NC.applyDevs(devs.filter(d => d.cur), {}); })(); });
  await finishSend(t);
  const res = await page.evaluate(async () => {
    const NC = window.NetConfig, C = NC.state, out = { sw:[], nd:[], pending:[] };
    for(const d of [...C.dev.values()].filter(x => x.kind !== 'unknown' && x.link)){
      const it = NC.planItems().find(i => i.id === d.link); if(!it) continue;
      await NC.readDev(d); const left = NC.opsOf(d).ops.length; if(left) out.pending.push(`${d.name}: ${left} calls still differ`);
      if(it.kind === 'sw'){
        const w = NC.wantSwitch(it), sim = C.simDevs.find(x => x.dev.state.ip?.ip_address === d.ip || x.dev.state.device?.name === w.name)?.dev.state; if(!sim) continue; const diffs = [];
        for(const p of w.ports){ const sp = sim.ports.find(x => x.port_number === p.port); if(!sp) continue;
          if(w.fibre.includes(p.port)){ if(sp.member_of?.type !== 'trunk') diffs.push(`port ${p.port} should be trunk, is ${JSON.stringify(sp.member_of)}`); }
          else if(p.vid != null){ const g = sim.groups.find(x => x.vid === p.vid); if(!g || sp.member_of?.type !== 'group' || sp.member_of.id !== g.group_id) diffs.push(`port ${p.port} should be VLAN ${p.vid}, is ${JSON.stringify(sp.member_of)}`); }
          if(p.legend && sp.legend !== String(p.legend).slice(0, 16)) diffs.push(`port ${p.port} name "${sp.legend}" != "${p.legend}"`); }
        for(const n of w.fibre){ const sp = sim.ports.find(x => x.port_number === n); if(sp && sp.member_of?.type !== 'trunk') diffs.push(`trunk port ${n} is ${JSON.stringify(sp.member_of)}`); }
        if(sim.device?.name !== w.name) diffs.push(`name "${sim.device?.name}" != "${w.name}"`); if(w.ip?.address && sim.ip?.ip_address !== w.ip.address) diffs.push(`ip ${sim.ip?.ip_address} != ${w.ip.address}`);
        out.sw.push({ sw:it.s.label, diffs });
      } else {
        const w = NC.wantNode(it), sim = C.simDevs.find(x => x.dev.state.info?.short_name === w.shortName)?.dev.state; if(!sim){ out.nd.push({ nd:it.inst.id, diffs:['no simulated device ' + w.shortName] }); continue; } const diffs = [];
        w.ports.forEach((q, j) => { if(!q) return; const io = sim.ios.find(x => x.io_class === 'dmx' && (x.port_number === j + 1 || x.id === 100000 + j)); if(io && String(io.name) !== String(q.name).slice(0, 64)) diffs.push(`DMX ${j + 1} name "${io.name}" != "${q.name}"`); });
        out.nd.push({ nd:it.inst.id, diffs });
      }
    }
    return out;
  });
  t.ok(res.sw.length >= 6 && res.nd.length >= 8, `${label}: ${res.sw.length} switches and ${res.nd.length} nodes checked`);
  for(const s of res.sw) t.ok(!s.diffs.length, `${label}: switch ${s.sw} matches the plan ${s.diffs.slice(0, 2).join('; ')}`);
  for(const n of res.nd) t.ok(!n.diffs.length, `${label}: node ${n.nd} matches the plan ${n.diffs.slice(0, 2).join('; ')}`);
  t.ok(!res.pending.length, `${label}: nothing is left to send ${res.pending.slice(0, 2).join('; ')}`);
}
export default { name:'send everything: all simulated devices end up as the plan says', timeout:420000, async run(t){ await run(t, 'plan as is', false); await run(t, 'hand-made settings, ISL, new IP', true); } };
