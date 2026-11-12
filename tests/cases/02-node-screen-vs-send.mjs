import { openDemo, discover } from '../lib.mjs';
// For every DMX port of a node: universe, name, protocol and direction on screen (PortPlan.ndPorts) = what Network config sends (wantNode).
export default { name:'node DMX ports: screen = what is sent (also after hand-made settings)', async run(t){
  const { page } = t; await openDemo(t); await discover(t);          // discovering loads the API module that wantNode needs
  const compare = () => page.evaluate(() => {
    const NC = window.NetConfig, PP = window.PortPlan, out = { nodes:0, ports:0, diffs:[] };
    for(const it of NC.planItems().filter(i => i.kind === 'nd')){
      out.nodes++; const np = PP.ndPorts(it.dc, it.inst, it.i), w = NC.wantNode(it);
      np.forEach((p, j) => { out.ports++; const q = w.ports[j], id = `${it.inst.id}.${j + 1}`;
        if(p.uni == null){ if(q) out.diffs.push(`${id}: no universe on screen, but sent ${JSON.stringify(q)}`); return; }
        if(!q){ out.diffs.push(`${id}: universe ${p.uni} on screen, nothing sent`); return; }
        if(Number(q.universe) !== Number(p.uni)) out.diffs.push(`${id}: universe ${p.uni} / ${q.universe}`);
        if(String(q.name) !== String(p.name)) out.diffs.push(`${id}: name "${p.name}" / "${q.name}"`);
        if((q.klass || '') !== (p.klass || '')) out.diffs.push(`${id}: protocol ${p.klass} / ${q.klass}`);
        if((q.dir || '') !== (p.dir || '')) out.diffs.push(`${id}: direction ${p.dir} / ${q.dir}`); });
    }
    return out;
  });
  let r = await compare(); t.ok(r.nodes >= 8 && r.ports >= 80, `${r.nodes} nodes, ${r.ports} ports compared`); t.ok(r.diffs.length === 0, 'baseline: no differences ' + r.diffs.slice(0, 3).join('; '));
  await page.evaluate(() => {
    const st = (window.LKApp.getMODEL().networkDevices.portPlans ||= {});
    for(const it of window.NetConfig.planItems().filter(i => i.kind === 'nd')){ const p = ((st[window.PortPlan.ndKey(it.dc, it.inst, it.i)] ||= { ports:{} }).ports);
      p[1] = { ...(p[1] || {}), name:'Smoke Left', klass:'artnet', dir:'input' }; p[2] = { ...(p[2] || {}), dir:'idle' }; p[3] = { ...(p[3] || {}), klass:'sacn', dir:'output', name:'X'.repeat(70) }; window.PortPlan.setNodeUniverse(it.inst, 4, 77); }
  });
  r = await compare(); t.ok(r.diffs.length === 0, 'after direction / protocol / name / universe by hand: no differences ' + r.diffs.slice(0, 3).join('; '));
} };
