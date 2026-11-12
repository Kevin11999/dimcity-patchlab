import { openDemo } from '../lib.mjs';
// For every switch port: what the screens show (PortPlan.swPorts: Switches tab, Patch board, PDF, stickers) is what Network config sends (wantSwitch).
export default { name:'switch ports: screen = what is sent (also after hand-made settings)', async run(t){
  const { page } = t; await openDemo(t);
  const compare = () => page.evaluate(() => {
    const NC = window.NetConfig, PP = window.PortPlan, out = { sw:0, ports:0, diffs:[] };
    for(const it of NC.planItems().filter(i => i.kind === 'sw')){
      out.sw++; const sp = PP.swPorts(it.dc, it.s), w = NC.wantSwitch(it);
      for(const p of sp){
        out.ports++; const id = `${it.s.label}#${p.n}`, wp = w.ports.find(x => x.port === p.n), gotTrunk = w.fibre.includes(p.n);
        if(!!p.trunk !== gotTrunk) out.diffs.push(`${id}: screen trunk=${!!p.trunk}, send trunk=${gotTrunk}`);
        else if(!p.trunk && (p.vid ?? null) !== ((wp ? wp.vid : null) ?? null)) out.diffs.push(`${id}: screen VLAN ${p.vid}, send VLAN ${wp?.vid}`);
        const send = wp ? String(wp.legend || '').slice(0, 16) : '', scr = String(p.name || '').slice(0, 16);
        if(!p.link && p.kind !== 'sfp' && send !== scr) out.diffs.push(`${id}: screen name "${scr}", send "${send}"`);
        if(p.poe && (wp?.poe || '') !== p.poe) out.diffs.push(`${id}: PoE ${p.poe} / ${wp?.poe}`);
        if(p.speed && (wp?.speed || '') !== p.speed) out.diffs.push(`${id}: speed ${p.speed} / ${wp?.speed}`);
      }
    }
    return out;
  });
  let r = await compare(); t.ok(r.sw >= 6 && r.ports >= 100, `${r.sw} switches, ${r.ports} ports compared`); t.ok(r.diffs.length === 0, 'baseline: no differences ' + r.diffs.slice(0, 3).join('; '));
  await page.evaluate(() => {
    const M = window.LKApp.getMODEL(), st = (M.networkDevices.portPlans ||= {});
    for(const it of window.NetConfig.planItems().filter(i => i.kind === 'sw')){ const p = ((st[`sw:${it.dc}|${it.s.label}`] ||= { ports:{} }).ports);
      p[2] = { ...(p[2] || {}), vid:300 }; p[3] = { ...(p[3] || {}), trunk:true }; p[4] = { ...(p[4] || {}), name:'Test Poort 4', poe:'off' }; p[5] = { ...(p[5] || {}), vid:400, speed:'100mbps fdx' }; }
  });
  r = await compare(); t.ok(r.diffs.length === 0, 'after VLAN / trunk / name / PoE / speed by hand: no differences ' + r.diffs.slice(0, 3).join('; '));
} };
