// core/rack-advisor.js — the best setup for a DimCity, worked out from its LKs, Veams and universes, using only the
// device types in the Device Builder: block modes, LK / Veam4 panels (or loose spiders), nodes, splitters, and the rack.
// advise(dc) -> { summary, blocks, items, totalU, rack, notes, ok }    apply(dc) puts the proposal in the DimCity as a rack.
(function(){
  'use strict';
  const App = new Proxy({}, { get: (_, k) => window.LKApp?.[k] });
  const M = () => App.getMODEL();
  const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  const name = t => [t?.brand, t?.name].filter(Boolean).join(' ') || t?.id || '';
  const nd = () => M().networkDevices || {};
  const HEIGHTS = [1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 42];

  // what the show asks for in this DimCity
  function needs(dc){
    const D = window.RackEngine.demand(M(), dc);
    const lk = D.lkNeeds.filter(n => n.lines.length || n.slotUsed.some(Boolean));
    const ve = D.veNeeds.filter(n => n.lines.length);
    const lines = [...lk, ...ve].reduce((n, x) => n + x.lines.length, 0) + D.loose.length;
    const all = [...lk.flatMap(x => x.lines), ...ve.flatMap(x => x.lines), ...D.loose];
    const perUni = new Map(); for(const l of all) perUni.set(l.universe, (perUni.get(l.universe) || 0) + 1);
    // Veam4 positions that are free next to the LKs (3 per LK, minus the slots the LK uses itself)
    const freeNextToLk = lk.reduce((n, x) => n + x.slotUsed.filter(u => !u).length, 0);
    return { lk, ve, lines, universes:perUni.size, perUni, loose:D.loose.length, freeNextToLk };
  }

  // panels: cheapest (fewest U, then fewest panels) combination of up to two panel types that gives enough sockets
  function pickPanels(N){
    const types = (nd().panelTypes || []).filter(p => num(p.lkCount) > 0 || num(p.vimCount) > 0);
    const need = { lk:N.lk.length, ve:N.ve.length };
    let best = null;
    const cover = (combo) => {
      const lkS = combo.reduce((n, c) => n + c.count * num(c.type.lkCount), 0);
      const shared = combo.reduce((n, c) => n + c.count * Math.min(num(c.type.vimCount), num(c.type.lkCount) * 3), 0);
      const solo = combo.reduce((n, c) => n + c.count * Math.max(0, num(c.type.vimCount) - Math.min(num(c.type.vimCount), num(c.type.lkCount) * 3)), 0);
      const veS = Math.min(shared, N.freeNextToLk) + solo;
      const u = combo.reduce((n, c) => n + c.count * num(c.type.heightU, 1), 0);
      const panels = combo.reduce((n, c) => n + c.count, 0);
      return { lkS, veS, u, panels, spareLk:lkS - need.lk, spareVe:veS - need.ve };
    };
    const tryCombo = combo => {
      combo = combo.filter(c => c.count > 0); if(!combo.length) return;
      const r = cover(combo);
      const missLk = Math.max(0, need.lk - r.lkS), missVe = Math.max(0, need.ve - r.veS);
      // missing sockets become loose spiders (no rack space, but extra cables): that costs more than a few spare sockets
      const score = r.u * 10 + r.panels + missLk * 40 + missVe * 12 + Math.max(0, r.spareLk) * 1.5 + Math.max(0, r.spareVe) * .8;
      if(!best || score < best.score) best = { combo, ...r, missLk, missVe, score };
    };
    if(!need.lk && !need.ve) return { combo:[], lkS:0, veS:0, u:0, panels:0, missLk:0, missVe:0, spareLk:0, spareVe:0 };
    for(let i = 0; i < types.length; i++){
      for(let a = 0; a <= 8; a++){
        tryCombo([{ type:types[i], count:a }]);
        for(let j = i + 1; j < types.length; j++) for(let b = 1; b <= 6; b++) tryCombo([{ type:types[i], count:a }, { type:types[j], count:b }]);
      }
    }
    return best || { combo:[], lkS:0, veS:0, u:0, panels:0, missLk:need.lk, missVe:need.ve, spareLk:0, spareVe:0 };
  }

  // nodes (and splitters) for the lines
  function pickNodes(N){
    const spare = num(nd().prefs?.nodeSparePorts);
    const nodeTypes = nd().nodeTypes || [], splitTypes = nd().splitterTypes || [];
    if(!N.lines) return { nodes:null, direct:null, withSplit:null };
    const plan = (ports, nodeT) => { const per = Math.max(1, num(nodeT.portCount, 8) - spare), cnt = Math.ceil(ports / per); return { type:nodeT, count:cnt, u:cnt * num(nodeT.heightU, 1), ports:cnt * num(nodeT.portCount, 8) }; };
    const direct = nodeTypes.map(t => plan(N.lines, t)).sort((a, b) => a.u - b.u || a.count - b.count)[0] || null;
    let withSplit = null;
    const multi = [...N.perUni.entries()].filter(([, c]) => c > 1);
    if(multi.length && splitTypes.length){
      const multiLines = multi.reduce((n, [, c]) => n + c, 0), singles = N.lines - multiLines;
      for(const st of splitTypes){
        const outs = Math.max(1, num(st.outputCount, 10)), inputs = st.mode === 'AB' ? 2 : 1;
        const sc = Math.ceil(multiLines / outs);
        const ports = singles + multi.length;        // every shared universe needs one node port to feed the splitter
        for(const nt of nodeTypes){ const n = plan(ports, nt); const total = n.u + sc * num(st.heightU, 1); if(!withSplit || total < withSplit.total) withSplit = { node:n, splitter:{ type:st, count:sc, u:sc * num(st.heightU, 1), inputs }, total, saved:(direct ? direct.u : 0) + 0 }; }
      }
    }
    return { direct, withSplit };
  }

  function advise(dc){
    const m = M(); const N = needs(dc);
    const out = { dc, lk:N.lk.length, veams:N.ve.length, lines:N.lines, universes:N.universes, items:[], blocks:[], notes:[], ok:false, totalU:0 };
    if(!N.lines && !N.lk.length && !N.ve.length){ out.notes.push({ level:'info', text:'No LK, Veam or DMX lines in this DimCity yet.' }); return out; }
    // block modes: what the data asks for
    for(const x of N.lk){
      const lk = m.byLK.get(x.id); if(!lk) continue;
      const ports = x.lines.filter(l => !l.via).length, veams = [1, 2, 3].filter(s => lk.veam?.[s]).length;   // own LK ports only: lines that come through a linked Veam do not count
      const ownSlots = x.slotUsed.filter(Boolean).length;
      let mode, why;
      if(ports > 4){ mode = 'XLR12'; why = `${ports} LK ports carry data → 12× XLR (no Veam on this LK)`; }
      else if(!ports && veams){ mode = 'VEAM_ONLY'; why = `only Veams (${veams}) on this LK → 3× Veam`; }
      else { mode = 'MIXED'; why = `${ports} port${ports === 1 ? '' : 's'} + ${veams} Veam${veams === 1 ? '' : 's'} → mixed (XLR ports + Veam slots)`; }
      const current = App.effectiveBlockType(lk), manual = lk.blockType?.mode === 'Manual';
      out.blocks.push({ id:x.id, mode, label:App.blockTypeLabel(mode), why, current, currentLabel:App.blockTypeLabel(current), manual, differs:current !== mode, ports, veams });
    }
    // panels
    const P = pickPanels(N);
    const items = [];
    for(const c of P.combo) items.push({ kind:'panel', type:c.type, count:c.count, u:c.count * num(c.type.heightU, 1),
      why:`${c.count}× ${name(c.type)}: ${c.count * num(c.type.lkCount)} LK socket${c.count * num(c.type.lkCount) === 1 ? '' : 's'}${num(c.type.vimCount) ? `, ${c.count * num(c.type.vimCount)} Veam4` : ''}` });
    if(P.missLk) out.notes.push({ level:'warn', text:`${P.missLk} LK${P.missLk > 1 ? 's' : ''} get no panel socket → ${P.missLk} loose LK spider${P.missLk > 1 ? 's' : ''}${(nd().panelTypes || []).length ? '' : ' (you have no panel type yet: make one in the Device Builder)'}.`, spiders:{ lk:P.missLk } });
    if(P.missVe) out.notes.push({ level:'info', text:`${P.missVe} Veam${P.missVe > 1 ? 's' : ''} fit${P.missVe > 1 ? '' : 's'} no panel socket → ${P.missVe} loose Veam4 spider${P.missVe > 1 ? 's' : ''} (cheaper than a whole panel for so few).`, spiders:{ vim:P.missVe } });
    if(P.spareLk > 0 || P.spareVe > 2) out.notes.push({ level:'info', text:`Spare on the panels: ${Math.max(0, P.spareLk)} LK socket${P.spareLk === 1 ? '' : 's'}, ${Math.max(0, P.spareVe)} Veam4.` });
    // nodes / splitters
    const NS = pickNodes(N);
    let nodeItem = null, splitItem = null;
    if(!NS.direct) out.notes.push({ level:'warn', text:'You have no node type yet: make one in the Device Builder.' });
    else {
      const useSplit = NS.withSplit && NS.withSplit.total < NS.direct.u;
      if(useSplit){
        nodeItem = { kind:'node', type:NS.withSplit.node.type, count:NS.withSplit.node.count, u:NS.withSplit.node.u, why:`${NS.withSplit.node.count}× ${name(NS.withSplit.node.type)} for ${N.lines - [...N.perUni.values()].filter(c => c > 1).reduce((a, b) => a + b, 0) + [...N.perUni.values()].filter(c => c > 1).length} ports (shared universes go through a splitter)` };
        splitItem = { kind:'splitter', type:NS.withSplit.splitter.type, count:NS.withSplit.splitter.count, u:NS.withSplit.splitter.u, why:`${NS.withSplit.splitter.count}× ${name(NS.withSplit.splitter.type)} for the universes that feed several lines` };
        out.notes.push({ level:'ok', text:`With a splitter the nodes need ${NS.withSplit.total}U instead of ${NS.direct.u}U (direct).` });
      } else {
        nodeItem = { kind:'node', type:NS.direct.type, count:NS.direct.count, u:NS.direct.u, why:`${NS.direct.count}× ${name(NS.direct.type)} = ${NS.direct.ports} ports for ${N.lines} lines${num(nd().prefs?.nodeSparePorts) ? ` (${nd().prefs.nodeSparePorts} spare per node)` : ''}` };
        if(NS.withSplit) out.notes.push({ level:'info', text:`A splitter would need ${NS.withSplit.total}U, direct needs ${NS.direct.u}U — direct is better.` });
      }
    }
    if(nodeItem) items.push(nodeItem); if(splitItem) items.push(splitItem);
    out.items = items;
    out.totalU = items.reduce((n, i) => n + i.u, 0);
    // rack
    const racks = (nd().rackTypes || []).slice().sort((a, b) => num(a.heightU) - num(b.heightU));
    const fit = racks.find(r => num(r.heightU) >= out.totalU);
    out.rackHeight = HEIGHTS.find(h => h >= out.totalU) || out.totalU;
    out.rack = fit ? { existing:true, type:fit } : { existing:false, height:out.rackHeight };
    out.spiders = { lk:P.missLk, vim:P.missVe };
    out.ok = !!nodeItem;
    return out;
  }

  const nextId = (key, prefix) => { const used = new Set((nd()[key] || []).map(x => x.id)); let n = 1; while(used.has(`${prefix}ADV-${n}`)) n++; return `${prefix}ADV-${n}`; };
  // put the proposal in the DimCity: a rack made for it (replaces an earlier proposal), plus loose spiders where no socket is left
  function apply(dc){
    const a = advise(dc); if(!a.ok) return null;
    const net = nd(), plan = App.net.getDimPlan(dc);
    window.PatchHistory?.label?.(`${dc}: advice applied`);
    // remove an earlier proposal
    if(plan.adviceRack){ plan.racks = (plan.racks || []).filter(r => r.iid !== plan.adviceRack.iid); net.rackTypes = (net.rackTypes || []).filter(r => r.id !== plan.adviceRack.typeId || (net.dimCityPlans && Object.values(net.dimCityPlans).some(p => (p.racks || []).some(r => r.rackId === plan.adviceRack.typeId)))); }
    plan.loose = (plan.loose || []).filter(d => !d.advice);
    const items = []; let u = 1, n = 0;
    for(const it of a.items) for(let k = 0; k < it.count; k++){ items.push({ iid:`adv_${Date.now().toString(36)}${n++}`, kind:it.kind, typeId:it.type.id, u }); u += num(it.type.heightU, 1); }
    const height = HEIGHTS.find(h => h >= u - 1) || u - 1;
    const rt = { id:nextId('rackTypes', 'RACK:'), name:`Advice ${dc} (${height}U)`, articleKey:'', heightU:height, items };
    (net.rackTypes ||= []).push(rt);
    const pl = { iid:`rk_${Date.now().toString(36)}`, rackId:rt.id, name:'' };
    (plan.racks ||= []).push(pl);
    plan.adviceRack = { iid:pl.iid, typeId:rt.id };
    for(let k = 0; k < (a.spiders.lk || 0); k++) plan.loose.push({ iid:`ls_${Date.now().toString(36)}${k}l`, kind:'lkSpider', nodeIid:null, advice:true });
    for(let k = 0; k < (a.spiders.vim || 0); k++) plan.loose.push({ iid:`ls_${Date.now().toString(36)}${k}v`, kind:'vimSpider', nodeIid:null, advice:true });
    // block modes that differ from the data: set the ones that are on Auto stay on Auto; manual ones are reported only
    M().ui.dirty = true;
    return a;
  }
  window.RackAdvisor = { advise, apply, needs };
})();
